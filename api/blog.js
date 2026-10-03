export default async function handler(req, res) {
  const allowed = 'POST, PATCH, DELETE';
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', allowed);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const expected = process.env.AGENT_BLOG_TOKEN;
  if (!expected || auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const action = typeof body.action === 'string' ? body.action.toLowerCase().trim() : '';

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

  // POST creates a new post. PATCH edits an existing post. DELETE removes a post.
  const methodAction = req.method === 'POST' ? (action || 'create') :
    req.method === 'PATCH' ? 'update' : 'delete';

  if (methodAction === 'create') {
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
    const encoded = Buffer.from(JSON.stringify(posts, null, 2) + '\\n').toString('base64');
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
    return res.status(201).json({ success: true, action: 'created', post, commit: result.commit?.sha || null });
  }

  const slug = typeof body.slug === 'string' ? body.slug.toLowerCase().trim() : '';
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  const index = posts.findIndex(p => p.slug === slug);
  if (index === -1) return res.status(404).json({ error: 'Post not found' });

  if (methodAction === 'update') {
    const current = posts[index];
    const title = body.title === undefined ? current.title :
      (typeof body.title === 'string' ? body.title.trim() : '');
    const content = body.content === undefined ? current.content :
      (typeof body.content === 'string' ? body.content.trim() : '');
    const excerpt = body.excerpt === undefined ? current.excerpt :
      (typeof body.excerpt === 'string' ? body.excerpt.trim() : '');
    const category = body.category === undefined ? current.category :
      (typeof body.category === 'string' ? body.category.trim() : '');

    if (!title || !content) return res.status(400).json({ error: 'title and content cannot be empty' });
    if (title.length > 140 || content.length > 30000 || excerpt.length > 300) {
      return res.status(400).json({ error: 'Content exceeds limits' });
    }

    let newSlug = body.new_slug === undefined ? current.slug :
      String(body.new_slug).toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
    if (!newSlug) return res.status(400).json({ error: 'Invalid new_slug' });
    if (newSlug !== current.slug && posts.some(p => p.slug === newSlug)) {
      return res.status(409).json({ error: 'A post with this slug already exists' });
    }

    posts[index] = {
      ...current,
      slug: newSlug,
      title,
      excerpt: excerpt || content.replace(/[#*_>-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180),
      category,
      content,
      updated_at: new Date().toISOString()
    };

    const encoded = Buffer.from(JSON.stringify(posts, null, 2) + '\\n').toString('base64');
    const put = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update blog post: ${title}`,
        content: encoded,
        sha: file.sha,
        branch: 'main'
      })
    });
    if (!put.ok) return res.status(502).json({ error: 'Could not update post on GitHub' });
    const result = await put.json();
    return res.status(200).json({ success: true, action: 'updated', post: posts[index], commit: result.commit?.sha || null });
  }

  if (methodAction === 'delete') {
    const [deleted] = posts.splice(index, 1);
    const encoded = Buffer.from(JSON.stringify(posts, null, 2) + '\\n').toString('base64');
    const put = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Delete blog post: ${deleted.title}`,
        content: encoded,
        sha: file.sha,
        branch: 'main'
      })
    });
    if (!put.ok) return res.status(502).json({ error: 'Could not delete post from GitHub' });
    const result = await put.json();
    return res.status(200).json({ success: true, action: 'deleted', post: deleted, commit: result.commit?.sha || null });
  }

  return res.status(400).json({ error: 'Unknown action. Use create, update, or delete.' });
}
