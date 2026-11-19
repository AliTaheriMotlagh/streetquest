// Search engines and link previews (pure — server pages, the sitemap and tests/seo.test.ts).
//
// One URL serves every language (cookie → browser language → country), but a crawler has no cookie and asks in
// English, so without help only the English page is ever indexed. Each page therefore names its language versions:
// `?lang=en|fa|tr` (the middleware serves that language and remembers it) with hreflang, the plain URL as x-default,
// and a canonical that is always the explicit-language URL of the language being shown — so /?lang=fa is its own
// page, not a duplicate of /.
import { LOCALES, type Locale } from "./i18n";

/** A page path in one language: "/events" → "/events?lang=fa" (keeps any other query). */
export function langPath(path: string, l: Locale): string {
  const [p, q = ""] = path.split("?");
  const qs = new URLSearchParams(q);
  qs.set("lang", l);
  return `${p}?${qs.toString()}`;
}

/**
 * Next.js `alternates` for a page shown in `locale`: canonical + every language + x-default. `base`: absolute URLs
 * (the home page needs them — Next.js resolves a relative "/?lang=fa" to the bare origin, dropping the language).
 */
export function pageAlternates(path: string, locale: Locale, base = "") {
  const languages: Record<string, string> = Object.fromEntries(LOCALES.map((l) => [hreflang(l), base + langPath(path, l)]));
  languages["x-default"] = base + path;
  return { canonical: base + langPath(path, locale), languages };
}

/** hreflang codes: Persian pages are for Iran, Turkish for Türkiye, English for everyone. */
export const hreflang = (l: Locale) => (l === "fa" ? "fa-IR" : l === "tr" ? "tr-TR" : "en");

/** A sitemap row with its language versions (absolute URLs). */
export function sitemapEntry(base: string, path: string, o: { lastModified?: Date; changeFrequency?: "hourly" | "daily" | "weekly" | "monthly"; priority?: number } = {}) {
  return {
    url: `${base}${path}`,
    ...o,
    alternates: { languages: Object.fromEntries([...LOCALES.map((l) => [hreflang(l), `${base}${langPath(path, l)}`]), ["x-default", `${base}${path}`]]) },
  };
}

/**
 * JSON-LD for a <script type="application/ld+json">: user text (an event or shop name) must not be able to close the
 * script tag or open a comment, so <, >, & and the JS line separators are escaped (JSON parsers read them back as is).
 */
export const ldJson = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

/** A description for a meta tag: one line, cut on a word near `max` characters, with an ellipsis. */
export function metaDescription(text: string, max = 160): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:،؛-]+$/, "")}…`;
}

/** schema.org Offer price for a toman price: in IRR (1 toman = 10 rials), as schema wants an ISO currency. */
export const tomanOffer = (toman: number) => ({ price: String(toman * 10), priceCurrency: "IRR" });

export type LdShop = { id: string; name: string; about: string; address: string; lat: number; lng: number; coverId: string | null };
export type LdProduct = { id: string; title: string; description: string; currency: "coins" | "toman"; priceNow: number; stock: number; photos: string[]; over: boolean };

/**
 * schema.org for a player's shop page: a Store at its spot, with its toman products as Offers (in IRR). Coin products
 * are left out: a game currency isn't a price search engines can show (and a Product without an offer is an error).
 */
export function shopLd(base: string, s: LdShop, products: LdProduct[]) {
  const url = `${base}/s/${s.id}`;
  const offers = products
    .filter((p) => p.currency === "toman" && p.priceNow > 0 && !p.over)
    .slice(0, 50)
    .map((p) => ({
      "@type": "Offer",
      url: `${url}#p-${p.id}`,
      ...tomanOffer(p.priceNow),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemOffered: { "@type": "Product", name: p.title, ...(p.description ? { description: metaDescription(p.description, 300) } : {}), ...(p.photos[0] ? { image: `${base}/shop-img/${p.photos[0]}` } : {}) },
    }));
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": url,
    name: s.name,
    url,
    ...(s.about ? { description: metaDescription(s.about, 300) } : {}),
    ...(s.coverId ? { image: `${base}/shop-img/${s.coverId}` } : {}),
    ...(s.address ? { address: s.address } : {}),
    geo: { "@type": "GeoCoordinates", latitude: Number(s.lat.toFixed(5)), longitude: Number(s.lng.toFixed(5)) },
    ...(offers.length ? { makesOffer: offers } : {}),
  };
}

/**
 * Other names people search the game by: Persian speakers type the brand in Persian letters, which the Latin name
 * never matches. Goes into the Organization / WebSite / VideoGame data as `alternateName`.
 */
export const ALT_NAMES = ["استریت کوئست", "استریت‌کوئست", "Street Quest"];

/** schema.org BreadcrumbList from [name, path] pairs (absolute URLs; the last item is the page itself). */
export function breadcrumbLd(base: string, items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${base}${path}` })),
  };
}

/** schema.org FAQPage from [question, answer] pairs (already translated). */
export const faqLd = (qa: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});

/**
 * Search-engine ownership tags from the environment (each optional): Google (besides the public/ file), Bing Webmaster
 * Tools (`msvalidate.01` — Bing also feeds DuckDuckGo and Yahoo) and Yandex Webmaster. Unset → no tag.
 */
export function siteVerification(env: Record<string, string | undefined>) {
  const v = (k: string) => env[k]?.trim() || undefined;
  const google = v("NEXT_PUBLIC_GOOGLE_VERIFICATION");
  const yandex = v("NEXT_PUBLIC_YANDEX_VERIFICATION");
  const bing = v("NEXT_PUBLIC_BING_VERIFICATION");
  if (!google && !yandex && !bing) return undefined;
  return { ...(google ? { google } : {}), ...(yandex ? { yandex } : {}), ...(bing ? { other: { "msvalidate.01": bing } } : {}) };
}

// ---------------------------------------------------------------- IndexNow
// Bing, Yandex, Seznam and Naver crawl a new page within minutes when told about it (https://www.indexnow.org); Google
// ignores IndexNow and reads the sitemap. The key is INDEXNOW_KEY (8–128 of a-z A-Z 0-9 -), served at /indexnow.txt.

/** The key, if it's a valid IndexNow key; else null (IndexNow off). */
export const indexNowKey = (k: string | undefined | null) => (k && /^[a-zA-Z0-9-]{8,128}$/.test(k.trim()) ? k.trim() : null);

/** The POST body for api.indexnow.org: the site's own pages only, absolute, deduped, at most 10,000. */
export function indexNowBody(base: string, key: string, paths: string[]) {
  const host = new URL(base).host;
  const urlList = [...new Set(paths.filter((p) => p.startsWith("/") && !p.startsWith("//")).map((p) => `${base}${p}`))].slice(0, 10_000);
  return { host, key, keyLocation: `${base}/indexnow.txt`, urlList };
}

/** Every language version of a page (IndexNow takes URLs, and each ?lang= page is its own URL). */
export const allLangPaths = (path: string) => [path, ...LOCALES.map((l) => langPath(path, l))];
