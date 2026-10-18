export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Origin');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const allowedHosts = new Set(['lumorasolutions.tech', 'www.lumorasolutions.tech']);
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).hostname; } catch { return res.status(403).json({ error: 'Origin not allowed' }); }
    const isVercelPreview = host.endsWith('.vercel.app');
    if (!allowedHosts.has(host) && !isVercelPreview && host !== 'localhost') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
  }
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
