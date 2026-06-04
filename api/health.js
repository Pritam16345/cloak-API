// Direct runtime state check using Hugging Face Spaces API
export default async function handler(req, res) {
    const SPACE_API_URL = "https://huggingface.co/api/spaces/pritu16345/cloak-api";
    try {
        const apiRes = await fetch(SPACE_API_URL, { signal: AbortSignal.timeout(5000) });
        if (!apiRes.ok) {
            return res.status(502).json({ error: "Failed to fetch space metadata from Hugging Face" });
        }
        
        const spaceData = await apiRes.json();
        const stage = spaceData.runtime ? spaceData.runtime.stage : "";
        
        if (stage === "RUNNING") {
            return res.status(200).json({ status: "System Online", stage: stage });
        } else {
            return res.status(503).json({ status: "System Offline", stage: stage });
        }
    } catch (e) {
        return res.status(502).json({ error: `Health check failed: ${e.message}` });
    }
}
