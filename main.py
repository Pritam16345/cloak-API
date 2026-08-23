from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider
from sqlalchemy.orm import Session
from database import init_db, SessionLocal, AuditLog, PrivacySession
import re
import uuid
import json
import io
from pypdf import PdfReader 

# Initialize Database
init_db()

app = FastAPI(title="Cloak-API: Enterprise Edition")

@app.get("/")
def health_check():
    return {"status": "System Online"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- SECURITY CONFIGURATION ---
configuration = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_trf"}],
}

print("Loading Security Models...")
try:
    provider = NlpEngineProvider(nlp_configuration=configuration)
    nlp_engine = provider.create_engine()
    analyzer = AnalyzerEngine(nlp_engine=nlp_engine)
    print("Security Models Loaded Successfully!")
except Exception as e:
    print(f"CRITICAL ERROR LOADING SPACY MODEL: {e}")
    # Fallback to basic english if TRF fails
    analyzer = AnalyzerEngine()

# --- AGGRESSIVE RECOGNIZERS (Score = 1.0 means "Always Redact") ---

# 1. Email (Stricter & Higher Score)
email_pattern = Pattern(name="email_pattern", regex=r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="EMAIL_ADDRESS", patterns=[email_pattern]))

# 2. Phone Number (Catch +91, 000-000, etc.)
phone_pattern = Pattern(name="phone_pattern", regex=r"(\+?(\d{1,3})?[- .]?\(?\d{3}\)?[- .]?\d{3}[- .]?\d{4})|(\+91[\-\s]?[6-9]\d{9})", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="PHONE_NUMBER", patterns=[phone_pattern]))

# 3. LinkedIn & GitHub URLs (Resume Leaks)
link_pattern = Pattern(name="link_pattern", regex=r"((linkedin\.com\/in\/|github\.com\/)[\w\-\_]+)", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="PROFESSIONAL_LINK", patterns=[link_pattern]))

# 4. "Context" Name Recognition (e.g., "Name: Rahul")
# Catches lines starting with Name:, Candidate:, etc.
label_name_pattern = Pattern(name="label_name", regex=r"(?i)(Name|Candidate|Employee|Student)(\s*[:\-]\s*)([A-Z][a-z]+ [A-Z][a-z]+)", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="PERSON", patterns=[label_name_pattern]))

# 5. Indian Documents
pan_pattern = Pattern(name="pan_pattern", regex=r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="IN_PAN_CARD", patterns=[pan_pattern]))

aadhaar_pattern = Pattern(name="aadhaar_pattern", regex=r"\b[2-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="IN_AADHAAR", patterns=[aadhaar_pattern]))

voter_pattern = Pattern(name="voter_pattern", regex=r"\b[A-Z]{3}[0-9]{7}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="IN_VOTER_ID", patterns=[voter_pattern]))

passport_pattern = Pattern(name="passport_pattern", regex=r"\b[A-Z][0-9]{7}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="IN_PASSPORT", patterns=[passport_pattern]))

# 6. Developer Secrets, Tokens & API Keys (DevSecOps)
aws_key_pattern = Pattern(name="aws_key_pattern", regex=r"\bAKIA[0-9A-Z]{16}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="DEV_SECRET", patterns=[aws_key_pattern]))

github_token_pattern = Pattern(name="github_token_pattern", regex=r"\b(gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="DEV_SECRET", patterns=[github_token_pattern]))

gemini_key_pattern = Pattern(name="gemini_key_pattern", regex=r"\bAIzaSy[A-Za-z0-9\-_]{33}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="DEV_SECRET", patterns=[gemini_key_pattern]))

generic_api_key_pattern = Pattern(name="generic_api_key_pattern", regex=r"\b(?:sk|gsk|sk-ant|key)-[A-Za-z0-9\-_]{20,}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="DEV_SECRET", patterns=[generic_api_key_pattern]))

jwt_token_pattern = Pattern(name="jwt_token_pattern", regex=r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b", score=1.0)
analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="DEV_SECRET", patterns=[jwt_token_pattern]))

# --- HELPER FUNCTIONS ---
def get_canonical_value(val):
    val = val.strip().lower()
    prefixes = ["name:", "candidate:", "employee:", "student:", "employer:"]
    for prefix in prefixes:
        if val.startswith(prefix):
            val = val[len(prefix):].strip()
    return val.strip(":- ")

def resolve_overlaps(results):
    # Sort by score (highest first), then length
    results.sort(key=lambda x: (x.score, x.end - x.start), reverse=True)
    final_results = []
    taken_indices = set()
    for res in results:
        new_indices = set(range(res.start, res.end))
        if not new_indices.intersection(taken_indices):
            final_results.append(res)
            taken_indices.update(new_indices)
    return final_results

# --- API MODELS ---
class UnmaskRequest(BaseModel):
    session_id: str
    ai_response_text: str

# --- ENDPOINTS ---

@app.post("/anonymize")
async def anonymize_data(
    prompt: str = Form(None),
    file: UploadFile = File(None),
    session_id: str = Form(None),
    history: str = Form(None),
    db: Session = Depends(get_db)
):
    final_text = prompt or ""
    
    # PDF EXTRACTION
    if file:
        try:
            content = await file.read()
            if file.content_type == "application/pdf" or file.filename.endswith(".pdf"):
                pdf_reader = PdfReader(io.BytesIO(content))
                pdf_text = ""
                for page in pdf_reader.pages:
                    text = page.extract_text()
                    if text:
                        # Normalize spaces to help AI recognize words
                        pdf_text += text.replace('\xa0', ' ') + "\n"
                
                final_text += f"\n\n[FILE CONTENT START]\n{pdf_text}\n[FILE CONTENT END]"
            else:
                final_text += f"\n\n[FILE CONTENT]\n{content.decode('utf-8', errors='ignore')}"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")

    if not final_text.strip():
        raise HTTPException(status_code=400, detail="No text or file provided")

    # Check if there is an existing session and load mapping
    entity_mapping = {}
    if session_id:
        existing_session = db.query(PrivacySession).filter(PrivacySession.session_id == session_id).first()
        if existing_session:
            try:
                entity_mapping = json.loads(existing_session.entity_mapping)
            except Exception:
                pass

    # Pre-mask known session entities in the prompt
    if entity_mapping:
        replacements = []
        for placeholder, real_val in entity_mapping.items():
            if "PERSON" in placeholder:
                parts = [p.strip() for p in re.split(r'\s+', real_val) if len(p.strip()) > 2]
                for p in parts:
                    replacements.append((p, placeholder))
            else:
                if len(real_val) > 4:
                    replacements.append((real_val, placeholder))
        
        # Sort replacements by length descending to prevent substring overlap
        replacements.sort(key=lambda x: len(x[0]), reverse=True)
        for word, placeholder in replacements:
            esc_word = re.escape(word)
            prefix = r'\b' if word[0].isalnum() else r''
            suffix = r'\b' if word[-1].isalnum() else r''
            pattern = re.compile(prefix + esc_word + suffix, re.IGNORECASE)
            final_text = pattern.sub(placeholder, final_text)

    # --- AGGRESSIVE SCANNING ---
    raw_results = analyzer.analyze(
        text=final_text,
        entities=[
            "PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD",
            "IN_PAN_CARD", "IN_AADHAAR", "IN_VOTER_ID", "IN_PASSPORT", "IP_ADDRESS", 
            "PROFESSIONAL_LINK", "URL", "DEV_SECRET"
        ],
        language="en",
        score_threshold=0.25 # Extremely low threshold: Catch everything suspicious
    )
    
    analysis_results = resolve_overlaps(raw_results)

    # Masking
    results_sorted = sorted(analysis_results, key=lambda x: x.start, reverse=True)
    safe_prompt = final_text
    counters = {}
    detected_list = []
    
    # Track assigned placeholders to reuse them for identical values (case-insensitive deduplication)
    value_to_placeholder = {}
    
    # Pre-populate counters and mappings from existing session
    for placeholder, real_val in entity_mapping.items():
        inner_tag = placeholder.strip("[]")
        if "_" in inner_tag:
            parts = inner_tag.rsplit("_", 1)
            ent_type = parts[0]
            try:
                cnt = int(parts[1])
                counters[ent_type] = max(counters.get(ent_type, 0), cnt)
                value_to_placeholder[(get_canonical_value(real_val), ent_type)] = placeholder
            except (ValueError, IndexError):
                pass

    for result in results_sorted:
        entity_type = result.entity_type
        # Simplify custom tags (e.g. PROFESSIONAL_LINK -> URL)
        if entity_type == "PROFESSIONAL_LINK": entity_type = "URL"
        
        real_value = final_text[result.start:result.end]
        val_key = get_canonical_value(real_value)
        mapping_key = (val_key, entity_type)
        
        if mapping_key in value_to_placeholder:
            placeholder = value_to_placeholder[mapping_key]
        else:
            counters[entity_type] = counters.get(entity_type, 0) + 1
            placeholder = f"[{entity_type}_{counters[entity_type]}]"
            value_to_placeholder[mapping_key] = placeholder
            
        entity_mapping[placeholder] = real_value
        
        if placeholder not in detected_list:
            detected_list.append(placeholder)
        
        safe_prompt = safe_prompt[:result.start] + placeholder + safe_prompt[result.end:]

    # Save Session
    if session_id:
        existing_session = db.query(PrivacySession).filter(PrivacySession.session_id == session_id).first()
        if existing_session:
            existing_session.entity_mapping = json.dumps(entity_mapping)
            db.commit()
        else:
            session_id = str(uuid.uuid4())
            privacy_session = PrivacySession(session_id=session_id, entity_mapping=json.dumps(entity_mapping))
            db.add(privacy_session)
            db.commit()
    else:
        session_id = str(uuid.uuid4())
        privacy_session = PrivacySession(session_id=session_id, entity_mapping=json.dumps(entity_mapping))
        db.add(privacy_session)
        db.commit()
    
    # Audit Log
    try:
        detected_types = ", ".join(list(counters.keys())) if counters else "None"
        log_entry = AuditLog(
            original_prompt_length=len(final_text),
            threats_detected=len(analysis_results),
            threat_types=detected_types
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"Audit Log Error: {e}")

    return {
        "status": "secure",
        "session_id": session_id,
        "safe_prompt": safe_prompt,
        "threats_detected": len(analysis_results) > 0,
        "detected_entities": detected_list,
        "history": history
    }

@app.post("/deanonymize")
def deanonymize_data(request: UnmaskRequest, db: Session = Depends(get_db)):
    session_data = db.query(PrivacySession).filter(PrivacySession.session_id == request.session_id).first()
    
    if not session_data:
        raise HTTPException(status_code=404, detail="Session ID not found or expired.")
    
    entity_mapping = json.loads(session_data.entity_mapping)
    final_text = request.ai_response_text
    
    # Sort mappings by placeholder length descending to prevent substring collisions
    sorted_mappings = sorted(entity_mapping.items(), key=lambda x: len(x[0]), reverse=True)
    for placeholder, real_value in sorted_mappings:
        inner_tag = placeholder.strip("[]")
        # Match tag with or without surrounding square brackets, ensuring it is not followed by a digit
        pattern = re.compile(r"\[?" + re.escape(inner_tag) + r"\]?(?!\d)", re.IGNORECASE)
        final_text = pattern.sub(lambda m, val=real_value: val, final_text)
        
    return {
        "status": "restored",
        "final_restored_response": final_text
    }