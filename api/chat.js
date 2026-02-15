// This file runs on Vercel's Serverless Backend (Node.js)
// It protects your keys and orchestrates the security pipeline.

export default async function handler(req, res) {
    // 1. CORS & Method Check
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { text } = req.body;
    
    // Configuration
    const CLOAK_BASE_URL = "https://pritu16345-cloak-api.hf.space";
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Securely loaded from Vercel

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server Configuration Error: Gemini Key Missing" });
    }

    try {
        // --- STEP A: CALL CLOAK API (Sanitize PII) ---
        const formData = new FormData();
        formData.append("prompt", text);

        const cloakResponse = await fetch(`${CLOAK_BASE_URL}/anonymize`, {
            method: 'POST',
            body: formData
        });

        if (!cloakResponse.ok) {
            const err = await cloakResponse.text();
            throw new Error(`Cloak Security Engine (Anonymize) Failed: ${err}`);
        }

        const cloakData = await cloakResponse.json();
        const safePrompt = cloakData.safe_prompt;
        const sessionId = cloakData.session_id; // IMPORTANT: We need this for Step C

        // --- STEP B: CALL GEMINI API (Get AI Response) ---
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "You are a helpful corporate assistant. " + safePrompt }] }]
            })
        });

        const geminiData = await geminiResponse.json();
        
        if (!geminiData.candidates || geminiData.candidates.length === 0) {
            throw new Error("AI Provider blocked the response or returned empty data.");
        }

        const aiRawReply = geminiData.candidates[0].content.parts[0].text;

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
        // We return the restored response for the user, but keep safePrompt for the Inspector
        res.status(200).json({
            response: finalRestoredResponse, // Restored for the user
            redacted_input: safePrompt,      // Used for "PII_REDACTED" log
            raw_ai_response: aiRawReply      // NEW: Added for "AI_RESPONSE" log
        });

    } catch (error) {
        console.error("Middleware Error:", error);
        res.status(500).json({ 
            error: error.message || "Internal Server Error" 
        });
    }
}