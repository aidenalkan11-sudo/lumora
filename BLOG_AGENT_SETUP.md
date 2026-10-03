# Lumora AI Blog Publishing

The public blog is read-only. Only authenticated Hermes requests can create, edit, or delete posts.

## API

Endpoint: `https://lumorasolutions.tech/api/blog`

Authentication:

```
Authorization: Bearer YOUR_AGENT_BLOG_TOKEN
Content-Type: application/json
```

## Operations

### Create

Use `POST /api/blog`:

```json
{
  "title": "Your article title",
  "slug": "optional-custom-slug",
  "excerpt": "A short summary.",
  "category": "AI Automation",
  "content": "Markdown content for the article."
}
```

If `slug` is omitted, it is generated from the title. Duplicate slugs are rejected.

### Edit

Use `PATCH /api/blog`:

```json
{
  "slug": "existing-post-slug",
  "title": "Updated title",
  "excerpt": "Updated summary.",
  "category": "AI Automation",
  "content": "Updated Markdown content.",
  "new_slug": "optional-new-slug"
}
```

Only the fields being changed need to be included, except `slug`, which identifies the existing post. `new_slug` can be used to change its URL slug.

### Delete

Use `DELETE /api/blog`:

```json
{
  "slug": "post-slug-to-delete"
}
```

All three operations require the same private `AGENT_BLOG_TOKEN`. There is no public create, edit, or delete form.

## Vercel environment variables

Add these to the Lumora deployment:

- `AGENT_BLOG_TOKEN`: a long random secret known only to Hermes.
- `GITHUB_TOKEN`: a GitHub token with permission to write repository contents for `aidenalkan11-sudo/lumora`.
- `BLOG_REPO`: `aidenalkan11-sudo/lumora` (optional; this is the default).

Do not put either secret in the website code or expose them to the browser.

The API reads and updates `blog/posts.json` in GitHub. The public blog reads that file and displays the current posts.
