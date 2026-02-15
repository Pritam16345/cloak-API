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

# --- HELPER FUNCTIONS ---
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
            return {"error": f"Failed to process file: {str(e)}"}

    if not final_text.strip():
        return {"error": "No text or file provided"}

    # --- AGGRESSIVE SCANNING ---
    raw_results = analyzer.analyze(
        text=final_text,
        entities=[
            "PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD",
            "IN_PAN_CARD", "IN_AADHAAR", "IN_VOTER_ID", "IP_ADDRESS", 
            "PROFESSIONAL_LINK", "URL"
        ],
        language="en",
        score_threshold=0.25 # Extremely low threshold: Catch everything suspicious
    )
    
    analysis_results = resolve_overlaps(raw_results)
    
    # Masking
    results_sorted = sorted(analysis_results, key=lambda x: x.start, reverse=True)
    safe_prompt = final_text
    entity_mapping = {}
    counters = {}
    detected_list = []

    for result in results_sorted:
        entity_type = result.entity_type
        # Simplify custom tags (e.g. PROFESSIONAL_LINK -> URL)
        if entity_type == "PROFESSIONAL_LINK": entity_type = "URL"
        
        counters[entity_type] = counters.get(entity_type, 0) + 1
        placeholder = f"[{entity_type}_{counters[entity_type]}]"
        
        real_value = final_text[result.start:result.end]
        entity_mapping[placeholder] = real_value
        
        if placeholder not in detected_list:
            detected_list.append(placeholder)
        
        safe_prompt = safe_prompt[:result.start] + placeholder + safe_prompt[result.end:]

    # Save Session
    session_id = str(uuid.uuid4())
    privacy_session = PrivacySession(session_id=session_id, entity_mapping=json.dumps(entity_mapping))
    db.add(privacy_session)
    
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
        "detected_entities": detected_list
    }

@app.post("/deanonymize")
def deanonymize_data(request: UnmaskRequest, db: Session = Depends(get_db)):
    session_data = db.query(PrivacySession).filter(PrivacySession.session_id == request.session_id).first()
    
    if not session_data:
        raise HTTPException(status_code=404, detail="Session ID not found or expired.")
    
    entity_mapping = json.loads(session_data.entity_mapping)
    final_text = request.ai_response_text
    
    for placeholder, real_value in entity_mapping.items():
        pattern = re.compile(re.escape(placeholder), re.IGNORECASE)
        final_text = pattern.sub(real_value, final_text)
        
    return {
        "status": "restored",
        "final_restored_response": final_text
    }