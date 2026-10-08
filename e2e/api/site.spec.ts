// Public site: health check, SEO surface, security headers. These are what search
// engines, link previews and uptime monitors see.
import { expect, test } from "@playwright/test";

test.describe("site & SEO", () => {
  test("health check reports a working database and schema", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    const h = await r.json();
    expect(h).toMatchObject({ ok: true, database: "ok", schema: "ok" });
  });

  test("landing page is server-rendered with title, canonical and JSON-LD", async ({ request }) => {
    const r = await request.get("/");
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/<title>[^<]*StreetQuest[^<]*<\/title>/);
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('"@type":"VideoGame"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toMatch(/<meta property="og:title"/);
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
    expect(html).toContain('href="/play"');
  });

  test("robots, sitemap and manifest are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/Sitemap:/i);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const m = await manifest.json();
    expect(m.name).toBeTruthy();
    expect(m.icons?.length).toBeGreaterThan(0);
    expect(m.start_url).toBeTruthy();
  });

  test("open graph image renders", async ({ request }) => {
    const r = await request.get("/opengraph-image");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/");
  });

  test("security headers on pages, no-store on the API", async ({ request }) => {
    const page = await request.get("/");
    const h = page.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["permissions-policy"]).toContain("geolocation=(self)");
    expect(h["x-powered-by"]).toBeUndefined();

    const api = await request.get("/api/health");
    expect(api.headers()["cache-control"]).toContain("no-store");
  });

  test("service worker is never cached and offline page works", async ({ request }) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-store");
    expect((await request.get("/offline")).status()).toBe(200);
  });

  test("marketing attribution cookies are set from ?ref and UTM params", async ({ request }) => {
    const r = await request.get("/?ref=FRIEND1&utm_source=tiktok&utm_campaign=launch", { maxRedirects: 0 });
    const cookies = r.headersArray().filter((x) => x.name.toLowerCase() === "set-cookie").map((x) => x.value);
    expect(cookies.some((c) => c.startsWith("sq_ref=FRIEND1"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("sq_utm="))).toBe(true);
  });
});
