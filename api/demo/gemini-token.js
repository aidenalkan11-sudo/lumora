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
  const requestedVoice = req.body?.voice === 'male' ? 'Fenrir' : 'Aoede';
  const systemInstruction = [
    'You are a friendly, professional AI receptionist for MKA Electrical in Melbourne, Australia.',
    'Speak naturally in Australian English with a clear Australian accent. Keep replies concise.',
    'Collect the caller’s name, mobile number, job details, suburb/address, and preferred time.',
    'Never claim a booking is confirmed. Say you will pass on a request for Mohammed to follow up.',
    'Do not invent availability, prices, or confirmed appointments.',
    'If urgent, collect the caller’s name, phone, and suburb, then say you will flag it for a callback.',
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
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: 'models/gemini-3.8-live',
          config: {
            responseModalities: ['AUDIO'],
            sessionResumption: {},
            systemInstruction: { parts: [{ text: systemInstruction }] },
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: requestedVoice } } },
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        }
      }),
    });
    const data = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !data.name) {
      console.error('Gemini ephemeral token request failed:', tokenResponse.status, data.error?.message || 'Unknown error');
      return res.status(502).json({ error: 'Gemini could not issue a session token. Check the API key and Live API access.' });
    }
    return res.status(200).json({ token: data.name });
  } catch (error) {
    console.error('Gemini token endpoint error:', error);
    return res.status(502).json({ error: 'Could not create a secure Gemini session.' });
  }
}
