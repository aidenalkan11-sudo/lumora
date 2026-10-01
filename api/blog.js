export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const expected = process.env.AGENT_BLOG_TOKEN;
  if (!expected || auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';

  if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
  if (title.length > 140 || content.length > 30000 || excerpt.length > 300) {
    return res.status(400).json({ error: 'Content exceeds limits' });
  }

  const slug = (body.slug || title)
    .toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  if (!slug) return res.status(400).json({ error: 'Invalid slug' });

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.BLOG_REPO || 'aidenalkan11-sudo/lumora';
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Lumora-Blog-Agent'
  };
  const apiBase = `https://api.github.com/repos/${repo}/contents/blog/posts.json`;

  const get = await fetch(apiBase, { headers });
  if (!get.ok) return res.status(502).json({ error: 'Could not read blog store from GitHub' });
  const file = await get.json();

  let posts = [];
  try { posts = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); } catch {
    return res.status(500).json({ error: 'Blog store is invalid' });
  }

  if (!Array.isArray(posts)) return res.status(500).json({ error: 'Blog store must be an array' });
  if (posts.some(p => p.slug === slug)) return res.status(409).json({ error: 'A post with this slug already exists' });

  const post = {
    slug,
    title,
    excerpt: excerpt || content.replace(/[#*_>-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180),
    category: category || 'Insights',
    date: new Date().toISOString(),
    content
  };

  posts.unshift(post);
  const encoded = Buffer.from(JSON.stringify(posts, null, 2) + '\n').toString('base64');
  const put = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Publish blog post: ${title}`,
      content: encoded,
      sha: file.sha,
      branch: 'main'
    })
  });

  if (!put.ok) return res.status(502).json({ error: 'Could not publish post to GitHub' });
  const result = await put.json();
  return res.status(201).json({ success: true, post, commit: result.commit?.sha || null });
}
