const base = (process.env.BASE_URL || "https://lumorasolutions.tech").replace(/\/$/, "");

async function check(name, fn) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name, "-", error.message);
    process.exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, headers = {}) {
  return fetch(base + path, { headers, redirect: "manual" });
}

await check("normal homepage remains HTML", async () => {
  const r = await get("/");
  const body = await r.text();
  assert(r.status === 200, "expected 200, got " + r.status);
  assert((r.headers.get("content-type") || "").includes("text/html"), "homepage is not HTML");
  assert(body.includes('type="application/ld+json"'), "missing JSON-LD");
  assert(body.includes('rel="canonical"'), "missing canonical");
  assert(body.includes('property="og:image"'), "missing og:image");
  assert(body.includes('property="og:type"'), "missing og:type");
});

await check("homepage negotiates Markdown", async () => {
  const r = await get("/", { Accept: "text/markdown" });
  const body = await r.text();
  assert(r.status === 200, "expected 200, got " + r.status);
  assert((r.headers.get("content-type") || "").includes("text/markdown"), "missing Markdown content type");
  assert((r.headers.get("vary") || "").toLowerCase().includes("accept"), "missing Vary: Accept");
  assert(body.length >= 20, "Markdown body is too short");
  assert(body.includes("# Lumora Solutions"), "Markdown body lacks brand heading");
});

await check("missing Markdown path returns 404 Markdown", async () => {
  const r = await get("/agent-readiness-missing-page-404", { Accept: "text/markdown" });
  const body = await r.text();
  assert(r.status === 404, "expected 404, got " + r.status);
  assert((r.headers.get("content-type") || "").includes("text/markdown"), "missing Markdown content type");
  assert((r.headers.get("vary") || "").toLowerCase().includes("accept"), "missing Vary: Accept");
  assert(body.length >= 20, "404 Markdown body is too short");
  assert(body.includes("llms.txt"), "404 Markdown body lacks machine-readable guidance link");
});

await check("sitemap is served", async () => {
  const r = await get("/sitemap.xml");
  const body = await r.text();
  assert(r.status === 200, "expected 200, got " + r.status);
  assert(body.includes("<urlset"), "missing urlset");
  assert(body.includes("https://lumorasolutions.tech/"), "missing homepage URL");
});

for (const path of ["/about.html", "/contact.html", "/privacy.html"]) {
  await check(path + " has trust content", async () => {
    const r = await get(path);
    const body = await r.text();
    const visible = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    assert(r.status === 200, "expected 200, got " + r.status);
    assert(visible.length >= 500, "page has less than 500 characters of visible text");
  });
}

await check("llms.txt contains agent guidance", async () => {
  const r = await get("/llms.txt");
  const body = await r.text();
  assert(r.status === 200, "expected 200, got " + r.status);
  assert(body.includes("When to use Lumora Solutions"), "missing agent use guidance");
});
