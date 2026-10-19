export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Vary", "Origin");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin;
  if (!origin) return res.status(403).json({ error: "Origin required" });

  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const allowedHosts = new Set(["lumorasolutions.tech", "www.lumorasolutions.tech", "localhost"]);
  if (process.env.VERCEL_URL) allowedHosts.add(process.env.VERCEL_URL);
  if (!allowedHosts.has(host)) return res.status(403).json({ error: "Origin not allowed" });

  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  globalThis.__elevenSignedUrlRequests ||= new Map();
  const requests = globalThis.__elevenSignedUrlRequests;
  const recent = (requests.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 30) {
    return res.status(429).json({ error: "Too many connection attempts. Please wait a few minutes." });
  }
  recent.push(now);
  requests.set(ip, recent);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "ELEVENLABS_API_KEY is not configured in Vercel." });
  }

  const agentId = typeof req.body?.agentId === "string" ? req.body.agentId.trim() : "";
  if (!/^agent_[A-Za-z0-9_-]+$/.test(agentId)) {
    return res.status(400).json({ error: "A valid receptionist agent ID is required." });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
        cache: "no-store",
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok || typeof data.signed_url !== "string") {
      const message = String(data.detail?.message || data.detail || data.error || "ElevenLabs could not create a signed session URL").slice(0, 300);
      console.error("ElevenLabs signed URL request failed:", response.status, message);
      return res.status(502).json({ error: "Could not securely connect to the receptionist. Please try again." });
    }

    return res.status(200).json({ signedUrl: data.signed_url });
  } catch (error) {
    console.error("ElevenLabs signed URL endpoint error:", error);
    return res.status(502).json({ error: "Could not create a secure receptionist session." });
  }
}
