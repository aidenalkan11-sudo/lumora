export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const repo = process.env.BLOG_REPO || 'aidenalkan11-sudo/lumora';
  const branch = 'main';
  const token = process.env.GITHUB_TOKEN;
  const adminToken = process.env.WAITLIST_ADMIN_TOKEN || process.env.AGENT_BLOG_TOKEN;
  const admin = ['GET', 'PATCH', 'DELETE'].includes(req.method);
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });
  if (admin && (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`)) return res.status(401).json({ error: 'Unauthorized' });
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const readStore = async () => {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/data/waitlist.json?ref=${branch}`, { headers });
    if (r.status === 404) return { entries: [], sha: null };
    if (!r.ok) throw new Error('Could not read waitlist store');
    const data = await r.json();
    return { entries: JSON.parse(Buffer.from(data.content.replace(/\\n/g, ''), 'base64').toString('utf8')), sha: data.sha };
  };
  const writeStore = async (entries, sha) => {
    const body = { message: 'Update waitlist client records', content: Buffer.from(JSON.stringify(entries, null, 2)).toString('base64'), branch };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/data/waitlist.json`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Could not save waitlist changes');
  };
  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      for (const key of ['name','businessName']) if (!String(b[key] || '').trim()) return res.status(400).json({ error: `Missing ${key}` });
      const preference = ['text','email','phone'].includes(String(b.contactPreference || 'text')) ? String(b.contactPreference || 'text') : 'text';
      if (preference !== 'email' && !String(b.phone || '').trim()) return res.status(400).json({ error: 'A phone number is required for your selected contact method' });
      if (preference === 'email' && !String(b.email || '').trim()) return res.status(400).json({ error: 'An email address is required for email contact' });
      if (String(b.website || '').trim()) return res.status(400).json({ error: 'Invalid submission' });
      const { entries, sha } = await readStore();
      entries.unshift({ id: crypto.randomUUID(), submittedAt: new Date().toISOString(), name: String(b.name).trim().slice(0,120), businessName: String(b.businessName).trim().slice(0,160), contactPreference: preference, phone: String(b.phone || '').trim().slice(0,50), email: String(b.email || '').trim().slice(0,160), checked: false, notes: String(b.notes || '').trim().slice(0,4000) });
      await writeStore(entries, sha);

      // Send a Telegram alert after the lead is safely saved. Notification failures
      // must not make a successful form submission appear to fail.
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      const telegramChatId = process.env.TELEGRAM_CHAT_ID;
      let telegramNotified = false;
      const notificationConfigured = Boolean(telegramToken && telegramChatId);
      if (notificationConfigured) {
        const lead = entries[0];
        const message = [
          'New Lumora website enquiry',
          '',
          `Name: ${lead.name}`,
          `Business: ${lead.businessName}`,
          `Preferred contact: ${lead.contactPreference}`,
          `Phone: ${lead.phone || 'Not provided'}`,
          `Email: ${lead.email || 'Not provided'}`,
          lead.notes ? `Details: ${lead.notes}` : ''
        ].filter(Boolean).join('\n').slice(0, 4000);
        try {
          const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: telegramChatId, text: message })
          });
          const telegramResult = await telegramResponse.json().catch(() => ({}));
          telegramNotified = telegramResponse.ok && telegramResult.ok === true;
          if (!telegramNotified) console.error('Telegram notification failed:', telegramResult.description || telegramResponse.statusText);
        } catch (telegramError) {
          console.error('Telegram notification failed:', telegramError?.message || telegramError);
        }
      } else {
        console.warn('Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing');
      }

      return res.status(201).json({ success: true, notificationConfigured, telegramNotified });
    }
    if (req.method === 'GET') {
      const { entries } = await readStore();
      return res.status(200).json(entries);
    }
    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!b.id || (typeof b.checked !== 'boolean' && typeof b.notes !== 'string')) return res.status(400).json({ error: 'Provide an id and a checked or notes value' });
      if (typeof b.notes === 'string' && b.notes.length > 4000) return res.status(400).json({ error: 'Notes must be 4000 characters or fewer' });
      const { entries, sha } = await readStore();
      const entry = entries.find(x => x.id === String(b.id));
      if (!entry) return res.status(404).json({ error: 'Client not found' });
      if (typeof b.checked === 'boolean') entry.checked = b.checked;
      if (typeof b.notes === 'string') entry.notes = b.notes;
      await writeStore(entries, sha);
      return res.status(200).json({ success: true });
    }
    if (req.method === 'DELETE') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Client id is required' });
      const { entries, sha } = await readStore();
      const next = entries.filter(x => x.id !== String(b.id));
      if (next.length === entries.length) return res.status(404).json({ error: 'Client not found' });
      await writeStore(next, sha);
      return res.status(200).json({ success: true });
    }
    res.setHeader('Allow','GET, POST, PATCH, DELETE, OPTIONS');
    return res.status(405).json({ error:'Method not allowed' });
  } catch (e) { console.error(e); return res.status(500).json({ error:e.message || 'Server error' }); }
}