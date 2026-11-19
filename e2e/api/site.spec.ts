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

  test("every language has its own canonical page and hreflang links; the footer links them for crawlers", async ({ request }) => {
    for (const l of ["en", "fa", "tr"]) {
      for (const path of ["/", "/events"]) {
        const html = await (await request.get(`${path}?lang=${l}`)).text();
        expect(html).toMatch(new RegExp(`<html lang="${l}"`));
        expect(html).toMatch(new RegExp(`rel="canonical" href="[^"]*${path === "/" ? "/" : path}\\?lang=${l}"`));
        for (const h of ["en", "fa-IR", "tr-TR", "x-default"]) expect(html).toMatch(new RegExp(`rel="alternate" hrefLang="${h}"`));
      }
    }
    const fa = await (await request.get("/?lang=fa")).text();
    expect(fa).toContain('href="?lang=tr" hrefLang="tr-TR"');
    expect(fa).toContain('"@type":"Organization"');
  });

  test("Google Search Console verification file is served as is", async ({ request }) => {
    const r = await request.get("/google9dca6b8d6eae63d6.html");
    expect(r.status()).toBe(200);
    expect((await r.text()).trim()).toBe("google-site-verification: google9dca6b8d6eae63d6.html");
  });

  test("feature pages are indexed in every language and listed in the sitemap", async ({ request }) => {
    const list = await request.get("/features?lang=fa");
    expect(list.status()).toBe(200);
    const html = await list.text();
    expect(html).toContain('<html lang="fa"');
    expect(html).toContain('href="/features/3d-city');
    for (const l of ["en", "fa", "tr"]) {
      const r = await request.get(`/features/3d-city?lang=${l}`);
      expect(r.status()).toBe(200);
      const page = await r.text();
      expect(page).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
      expect(page).toMatch(new RegExp(`rel="canonical" href="[^"]*/features/3d-city\\?lang=${l}"`));
    }
    expect((await request.get("/features/no-such-thing")).status()).toBe(404);
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toMatch(/\/features\/street-arena/);
  });

  test("IndexNow key file is served and the Bing/Yandex verification files are there", async ({ request }) => {
    const r = await request.get("/indexnow.txt");
    expect(r.status()).toBe(200);
    expect((await r.text()).trim()).toBe("e2e0indexnow0key");
    expect((await request.get("/BingSiteAuth.xml")).status()).toBe(200);
    expect((await request.get("/yandex_9a8b0718e95bd272.html")).status()).toBe(200);
  });

  test("robots, sitemap and manifest are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/Sitemap:/i);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("<urlset");
    expect(xml).toMatch(/hreflang="fa-IR" href="[^"]*\/events\?lang=fa"/);
    expect(await robots.text()).toMatch(/Disallow: \/api\//);

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const m = await manifest.json();
    expect(m.name).toBeTruthy();
    expect(m.icons?.length).toBeGreaterThan(0);
    expect(m.start_url).toBeTruthy();
  });

  test("open graph cards render in English and Persian", async ({ request }) => {
    const en = await request.get("/og-card?lang=en");
    expect(en.status()).toBe(200);
    expect(en.headers()["content-type"]).toContain("image/");
    // Persian is a pre-rendered picture; the request follows the redirect to it.
    const fa = await request.get("/og-card?lang=fa");
    expect(fa.status()).toBe(200);
    expect(fa.headers()["content-type"]).toContain("image/png");
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
    // Heavy files and the 3D city's street maps are kept on the phone, not downloaded every launch.
    const code = await sw.text();
    for (const kept of ["/api/vt/", "/api/city/detail", "/models/", "/fonts/", "/draco/", "tiles.openfreemap.org"]) expect(code).toContain(kept);
    expect((await request.get("/offline")).status()).toBe(200);
  });

  test("marketing attribution cookies are set from ?ref and UTM params", async ({ request }) => {
    const r = await request.get("/?ref=FRIEND1&utm_source=tiktok&utm_campaign=launch", { maxRedirects: 0 });
    const cookies = r.headersArray().filter((x) => x.name.toLowerCase() === "set-cookie").map((x) => x.value);
    expect(cookies.some((c) => c.startsWith("sq_ref=FRIEND1"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("sq_utm="))).toBe(true);
  });
});
