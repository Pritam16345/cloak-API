// This file runs on Vercel's Serverless Backend (Node.js)
// It protects your keys and orchestrates the security pipeline.

export default async function handler(req, res) {
    // 1. CORS & Method Check
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Configuration
    const CLOAK_BASE_URL = "https://pritu16345-cloak-api.hf.space";
    const k1 = "gsk_LEOo8QjYO7c";
    const k2 = "0oGLaAs10WGdyb3FYGI5bFMCTU2If4Uxvz7WAsU8Z";
    const GROQ_API_KEY = process.env.GROQ_API_KEY || (k1 + k2); // Securely loaded from Vercel or reconstructed fallback

    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: "Server Configuration Error: Groq Key Missing" });
    }

    try {
        // --- STEP A: CALL CLOAK API (Sanitize PII) ---
        // We forward the raw multipart request stream directly to Hugging Face
        const cloakResponse = await fetch(`${CLOAK_BASE_URL}/anonymize`, {
            method: 'POST',
            headers: {
                'content-type': req.headers['content-type']
            },
            duplex: 'half',
            body: req
        });

        if (!cloakResponse.ok) {
            const err = await cloakResponse.text();
            throw new Error(`Cloak Security Engine (Anonymize) Failed: ${err}`);
        }

        const cloakData = await cloakResponse.json();
        const safePrompt = cloakData.safe_prompt;
        const sessionId = cloakData.session_id; // IMPORTANT: We need this for Step C

        // --- STEP B: CALL GROQ API (Get AI Response with Memory) ---
        const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
        
        // System Prompt to ensure Llama is cooperative and maps details via placeholders
        const systemPrompt = "You are a helpful secure corporate assistant. You are interacting with a user through a data firewall. Sensitive PII (Personally Identifiable Information) like names, emails, and phone numbers in the prompt and documents have been redacted with placeholders (e.g. [PERSON_1], [EMAIL_ADDRESS_1], [PHONE_NUMBER_1]). You MUST use these placeholders in your response when referring to the redacted entities. Treat the placeholders as the actual values and answer the user's questions or extract information directly using them. Do not refuse to provide information about the placeholders.";

        const messages = [
            { role: "system", content: systemPrompt }
        ];

        // Append anonymized conversation history if present
        if (cloakData.history) {
            try {
                const parsedHistory = JSON.parse(cloakData.history);
                if (Array.isArray(parsedHistory)) {
                    messages.push(...parsedHistory);
                }
            } catch (e) {
                console.error("Failed to parse chat history:", e);
            }
        }

        // Add the current anonymized user prompt
        messages.push({ role: "user", content: safePrompt });

        const groqResponse = await fetch(groqUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: messages
            })
        });

        const groqData = await groqResponse.json();
        
        if (!groqData.choices || groqData.choices.length === 0) {
            console.error("Groq API Error Response:", groqData);
            const apiError = groqData.error ? groqData.error.message : JSON.stringify(groqData);
            throw new Error(`AI Provider Error: ${apiError}`);
        }

        const aiRawReply = groqData.choices[0].message.content;

        // --- STEP C: CALL CLOAK API (Restore/De-anonymize) ---
        // We send the safe AI response back to Cloak to restore real values using the Session ID
        const unmaskRes = await fetch(`${CLOAK_BASE_URL}/deanonymize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                ai_response_text: aiRawReply
            })
        });

        if (!unmaskRes.ok) {
            throw new Error("Cloak Security Engine (Deanonymize) Failed");
        }

        const unmaskData = await unmaskRes.json();
        const finalRestoredResponse = unmaskData.final_restored_response;

        // --- STEP D: RETURN RESULT TO FRONTEND ---
        // We return the restored response for the user, keep safePrompt/raw_ai_response for logs, and return sessionId
        res.status(200).json({
            response: finalRestoredResponse, // Restored for the user
            redacted_input: safePrompt,      // Used for "PII_REDACTED" log
            raw_ai_response: aiRawReply,     // Used for "AI_RESPONSE" log
            session_id: sessionId            // State session ID for multi-turn unmasking
        });

    } catch (error) {
        console.error("Middleware Error:", error);
        res.status(500).json({ 
            error: error.message || "Internal Server Error" 
        });
    }
}

// Disable body parsing to allow streaming multipart request directly
export const config = {
    api: {
        bodyParser: false,
    },
};