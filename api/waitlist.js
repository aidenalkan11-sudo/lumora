export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const repo = process.env.BLOG_REPO || 'aidenalkan11-sudo/lumora';
  const branch = 'main';
  const token = process.env.GITHUB_TOKEN;
  const adminToken = process.env.WAITLIST_ADMIN_TOKEN || process.env.AGENT_BLOG_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const readStore = async () => {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/data/waitlist.json?ref=${branch}`, { headers });
    if (r.status === 404) return { entries: [], sha: null };
    if (!r.ok) throw new Error('Could not read waitlist store');
    const data = await r.json();
    return { entries: JSON.parse(Buffer.from(data.content.replace(/\\n/g, ''), 'base64').toString('utf8')), sha: data.sha };
  };
  const writeStore = async (entries, sha) => {
    const body = { message: 'Update waitlist submissions', content: Buffer.from(JSON.stringify(entries, null, 2) + '\\n').toString('base64'), branch };
    if (sha) body.sha = sha;
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/data/waitlist.json`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Could not save waitlist submission');
  };
  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      for (const key of ['name','businessName','phone','email']) if (!String(b[key] || '').trim()) return res.status(400).json({ error: `Missing ${key}` });
      if (String(b.website || '').trim()) return res.status(400).json({ error: 'Invalid submission' });
      const { entries, sha } = await readStore();
      entries.unshift({
        id: crypto.randomUUID(), submittedAt: new Date().toISOString(),
        name: String(b.name).trim().slice(0,120), businessName: String(b.businessName).trim().slice(0,160),
        phone: String(b.phone).trim().slice(0,50), email: String(b.email).trim().slice(0,160)
      });
      await writeStore(entries, sha);
      return res.status(201).json({ success: true });
    }
    if (req.method === 'GET') {
      if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) return res.status(401).json({ error: 'Unauthorized' });
      const { entries } = await readStore();
      return res.status(200).json(entries);
    }
    res.setHeader('Allow','GET, POST, OPTIONS');
    return res.status(405).json({ error:'Method not allowed' });
  } catch (e) { console.error(e); return res.status(500).json({ error:e.message || 'Server error' }); }
}