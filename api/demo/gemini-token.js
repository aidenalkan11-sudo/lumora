export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Origin');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const origin = req.headers.origin;
  if (!origin) return res.status(403).json({ error: 'Origin required' });
  let host;
  try { host = new URL(origin).hostname; } catch { return res.status(403).json({ error: 'Origin not allowed' }); }
  const allowedHosts = new Set(['lumorasolutions.tech', 'www.lumorasolutions.tech', 'localhost']);
  if (process.env.VERCEL_URL) allowedHosts.add(process.env.VERCEL_URL);
  if (!allowedHosts.has(host)) return res.status(403).json({ error: 'Origin not allowed' });

  // Best-effort per-instance rate limit to reduce accidental repeated token creation.
  const nowForLimit = Date.now();
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  globalThis.__geminiTokenRequests ||= new Map();
  const requests = globalThis.__geminiTokenRequests;
  const recent = (requests.get(ip) || []).filter((t) => nowForLimit - t < 10 * 60 * 1000);
  if (recent.length >= 10) return res.status(429).json({ error: 'Too many session requests. Try again in a few minutes.' });
  recent.push(nowForLimit);
  requests.set(ip, recent);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured in Vercel.' });
  
  const systemInstruction = [
    'You are the AI receptionist in a fictional business demo created by Lumora Solutions. This is not a real business or booking service.',
    'Speak naturally in Australian English with a clear Australian accent. Keep replies concise.',
    'Collect the caller’s name, mobile number, job details, suburb/address, and preferred time.',
    'Never claim a booking is confirmed. Explain that details are only shown in the demo and are not sent to anyone.',
    'Do not invent availability, prices, or confirmed appointments.',
    'If urgent, collect the caller’s name, phone, and suburb, then explain that this is only a demo and no callback will be made.',
    'Use Australia/Melbourne local date and time.'
  ].join(' ');
  try {
    const now = Date.now();
    const tokenResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 15 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString()
      }),
    });
    const data = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !data.name) {
      const googleMessage = String(data.error?.message || 'Google returned an unexpected token response').slice(0, 500);
      console.error('Gemini ephemeral token request failed:', tokenResponse.status, googleMessage);
      return res.status(502).json({ error: `Gemini token request failed (${tokenResponse.status}): ${googleMessage}` });
    }
    return res.status(200).json({ token: data.name });
  } catch (error) {
    console.error('Gemini token endpoint error:', error);
    return res.status(502).json({ error: 'Could not create a secure Gemini session.' });
  }
}
