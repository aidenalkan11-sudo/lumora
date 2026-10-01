# Lumora AI Blog Publishing

The public blog is read-only. Posts can only be published through `POST /api/blog`.

## Vercel environment variables

Add these to the Lumora Vercel project:

- `AGENT_BLOG_TOKEN`: a long random secret known only to Hermes.
- `GITHUB_TOKEN`: a GitHub token with permission to write repository contents for `aidenalkan11-sudo/lumora`.
- `BLOG_REPO`: `aidenalkan11-sudo/lumora` (optional; this is the default).

Do not put either secret in the website code or expose them to the browser.

## Hermes request

Send a POST request to `https://YOUR-DOMAIN/api/blog` with:

```json
{
  "title": "Your article title",
  "excerpt": "A short summary.",
  "category": "AI Automation",
  "content": "Markdown content for the article."
}
```

Use the header:

```
Authorization: Bearer YOUR_AGENT_BLOG_TOKEN
Content-Type: application/json
```

The endpoint validates the request, rejects duplicate slugs, and commits the new post into `blog/posts.json`. The public blog then displays it automatically.

There is intentionally no public create/edit form.
