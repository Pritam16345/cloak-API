// Proxy health check to verify Hugging Face Space availability directly
export default async function handler(req, res) {
    const CLOAK_BASE_URL = "https://pritu16345-cloak-api.hf.space";
    try {
        const hfRes = await fetch(CLOAK_BASE_URL, { signal: AbortSignal.timeout(5000) });
        if (hfRes.ok) {
            const data = await hfRes.json();
            return res.status(200).json(data);
        }
        return res.status(502).json({ error: "Hugging Face Space returned non-OK status" });
    } catch (e) {
        return res.status(502).json({ error: `Hugging Face Space connection failed: ${e.message}` });
    }
}
