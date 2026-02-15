// This file runs on Vercel's Serverless Backend (Node.js)
// It protects your keys and orchestrates the security pipeline.

export default async function handler(req, res) {
    // 1. CORS & Method Check
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { text } = req.body;
    
    // Configuration
    const CLOAK_API_URL = "https://pritu16345-cloak-api.hf.space/anonymize";
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Securely loaded from Vercel

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Server Configuration Error: Gemini Key Missing" });
    }

    try {
        // --- STEP A: CALL CLOAK API (Sanitize PII) ---
        // We use FormData because your Python API expects 'Form' fields
        const formData = new FormData();
        formData.append("prompt", text);

        const cloakResponse = await fetch(CLOAK_API_URL, {
            method: 'POST',
            body: formData
        });

        if (!cloakResponse.ok) {
            const err = await cloakResponse.text();
            throw new Error(`Cloak Security Engine Failed: ${err}`);
        }

        const cloakData = await cloakResponse.json();
        const safePrompt = cloakData.safe_prompt;

        // --- STEP B: CALL GEMINI API (Get AI Response) ---
        // We send the *Sanitized* text to Google
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "You are a helpful corporate assistant. " + safePrompt }] }]
            })
        });

        const geminiData = await geminiResponse.json();
        
        // Check for Gemini errors (like blocking content)
        if (!geminiData.candidates || geminiData.candidates.length === 0) {
            throw new Error("AI Provider blocked the response or returned empty data.");
        }

        const aiReply = geminiData.candidates[0].content.parts[0].text;

        // --- STEP C: RETURN RESULT TO FRONTEND ---
        // We return both the AI answer and the 'redacted_input' so you can show the "Proof" in the UI
        res.status(200).json({
            response: aiReply,
            redacted_input: safePrompt
        });

    } catch (error) {
        console.error("Middleware Error:", error);
        res.status(500).json({ 
            error: error.message || "Internal Server Error" 
        });
    }
}