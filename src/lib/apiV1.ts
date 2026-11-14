// The public, read-only data API (/api/v1, server/apiV1.ts) — the pure parts (tests/apiV1.test.ts):
// key format, per-key rate limit, the sources' attribution and licence notes, the shapes each
// endpoint answers with (only fields that are safe to re-expose: no seller names or phones, no
// player data), and the OpenAPI 3 document describing it all.
import { createHash, randomBytes } from "node:crypto";
import type { Cinema, Film } from "./cinema";
import type { Deal, DivarArea, Menu, TorobPlace, Vendor, Week } from "./localData";
import type { ProductHit } from "./productSearch";
import type { CountrySource } from "./region";

// ---------------------------------------------------------------- keys
export const KEY_PREFIX = "sq_live_";
/** A new key: `sq_live_` + 32 url-safe characters. Shown once; only its hash is kept. */
export const newKey = (bytes: Buffer = randomBytes(24)) => KEY_PREFIX + bytes.toString("base64url");
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
/** The readable start of a key kept beside its hash, so a player can tell their keys apart. */
export const keyHint = (key: string) => key.slice(0, KEY_PREFIX.length + 4);
export const looksLikeKey = (s: string) => /^sq_live_[A-Za-z0-9_-]{32}$/.test(s);
/** The key a request carries: `Authorization: Bearer <key>` or `X-API-Key: <key>` (never the URL, which ends up in logs). */
export function keyOf(h: { get(name: string): string | null }): string | null {
  const auth = h.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? h.get("x-api-key")?.trim() ?? "";
  return looksLikeKey(auth) ? auth : null;
}
export const DEFAULT_PER_MINUTE = 60, MAX_PER_MINUTE = 6000, MAX_KEYS_PER_PLAYER = 5;

// ---------------------------------------------------------------- rate limit
export type Window = { start: number; n: number };
/** A fixed one-minute window per key (per server process, like the site pacers in lib/pace.ts). */
export function take(windows: Map<string, Window>, id: string, perMinute: number, now: number): { ok: boolean; limit: number; remaining: number; resetS: number } {
  let w = windows.get(id);
  if (!w || now - w.start >= 60_000) {
    w = { start: now, n: 0 };
    windows.set(id, w);
    if (windows.size > 5000) for (const [k, v] of windows) if (now - v.start >= 60_000) windows.delete(k);
  }
  const resetS = Math.max(1, Math.ceil((w.start + 60_000 - now) / 1000));
  if (w.n >= perMinute) return { ok: false, limit: perMinute, remaining: 0, resetS };
  w.n++;
  return { ok: true, limit: perMinute, remaining: perMinute - w.n, resetS };
}

// ---------------------------------------------------------------- sources
export type SourceInfo = { id: string; name: string; url: string; country: string; licence: string };
const NOTE_SITE = "Data belongs to the site named here. Shown for information with attribution and a link back; do not bulk-copy or resell it. Prices are as that site listed them at the time of fetching.";
export const SOURCES: Record<string, SourceInfo> = {
  osm: { id: "osm", name: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", country: "*", licence: "ODbL 1.0 — attribute “© OpenStreetMap contributors”." },
  snappfood: { id: "snappfood", name: "Snappfood", url: "https://snappfood.ir", country: "IR", licence: NOTE_SITE },
  yemeksepeti: { id: "yemeksepeti", name: "Yemeksepeti", url: "https://www.yemeksepeti.com", country: "TR", licence: NOTE_SITE },
  torob: { id: "torob", name: "Torob", url: "https://torob.com", country: "IR", licence: NOTE_SITE },
  takhfifan: { id: "takhfifan", name: "Takhfifan", url: "https://takhfifan.com", country: "IR", licence: NOTE_SITE },
  divar: { id: "divar", name: "Divar", url: "https://divar.ir", country: "IR", licence: NOTE_SITE + " Sellers' names and phone numbers are never included." },
  cinematicket: { id: "cinematicket", name: "Cinematicket", url: "https://cinematicket.org", country: "IR", licence: NOTE_SITE },
  basalam: { id: "basalam", name: "Basalam", url: "https://basalam.com", country: "IR", licence: NOTE_SITE },
  iett: { id: "iett", name: "IETT (İBB Open Data)", url: "https://data.ibb.gov.tr", country: "TR", licence: "İBB Open Data Licence — attribute “İstanbul Büyükşehir Belediyesi”." },
};
export const sourcesFor = (...ids: string[]) => ids.filter((i) => SOURCES[i]).map((i) => SOURCES[i]);
/** The one-country sources, as region.ts names them (the API asks each only where it answers). */
export const COUNTRY_OF = (id: string): CountrySource | null => (["snappfood", "torob", "divar", "takhfifan", "cinematicket", "basalam", "yemeksepeti", "iett"].includes(id) ? (id as CountrySource) : null);

export type Envelope<T> = { data: T; meta: { api: "v1"; cached: true; sources: SourceInfo[]; note?: string } };
export const envelope = <T>(data: T, sources: SourceInfo[], note?: string): Envelope<T> => ({ data, meta: { api: "v1", cached: true, sources, ...(note ? { note } : {}) } });

// ---------------------------------------------------------------- shapes
const r1 = (n: number) => Math.round(n * 10) / 10;
const dist = (d?: number) => (d == null ? {} : { distanceM: Math.round(d) });
export type OpenHours = { week: [number, number][][] | null; text?: string };
/** Hours: for each day (Saturday = 0 … Friday = 6) its [open, close] spans in minutes after midnight. */
export const hoursOf = (w: Week | null | undefined): OpenHours["week"] => (w && w.length === 7 ? w : null);

export function storeOf(v: Vendor, source: "snappfood" | "yemeksepeti", d?: number) {
  return { id: v.code, source, name: v.title, kind: v.kind, lat: v.lat, lng: v.lng, ...dist(d), rating: v.rating, open: v.open, about: v.about, logo: v.logo, url: v.url, currency: source === "yemeksepeti" ? "TRY" : "IRT" };
}
export function walkInOf(p: TorobPlace, d?: number) {
  return { id: `torob-${p.id}`, source: "torob" as const, name: p.name, kind: "walk-in", lat: p.lat, lng: p.lng, ...dist(d), city: p.city, address: p.address, photo: p.photo, sells: p.sells, hours: hoursOf(p.week), url: `https://torob.com/shop/${p.id}/` };
}
/** A store's menu, hours and reviews summary (the menu itself, cut to `maxItems` items per section). */
export function menuOf(m: Menu, maxItems = 40) {
  const currency = m.currency === "TRY" ? "TRY" : "IRT";
  return {
    id: m.vendor.code, source: m.source ?? "snappfood", name: m.vendor.title, kind: m.vendor.kind, lat: m.vendor.lat, lng: m.vendor.lng, address: m.address, area: m.area ?? "", cover: m.cover, url: m.vendor.url,
    open: m.vendor.open, hours: hoursOf(m.week), rating: m.vendor.rating,
    reviews: { count: m.reviews ?? 0, stars: m.stars ?? null },
    delivery: { minOrder: m.minOrder ?? null, fee: m.deliveryFee ?? null }, currency,
    sections: m.sections.map((s) => ({ title: s.title, items: s.items.slice(0, maxItems).map((i) => ({ id: i.id, title: i.title, about: i.about, price: i.priceNow || i.price, was: i.priceNow && i.price > i.priceNow ? i.price : null, photo: i.photo })) })),
    fetchedAt: m.fetchedAt,
  };
}
export function dealOut(d: Deal, dm?: number) {
  return { id: d.id, name: d.name, lat: d.lat, lng: d.lng, ...dist(dm), district: d.district, category: d.category, rating: d.rating, reviews: d.reviews, off: d.off, cashback: d.cashback, photos: d.photos, items: d.items.map((i) => ({ name: i.name, price: i.price, retail: i.retail, off: i.off, ends: i.ends })), url: d.url };
}
export function cinemaOut(c: Cinema, dm?: number) {
  return { id: c.id, name: c.name, lat: c.lat, lng: c.lng, ...dist(dm), address: c.address, rating: r1(c.rate), ratings: c.rates, photo: c.photo, url: `https://cinematicket.org/cinema/detail/${c.id}` };
}
export const filmOut = (f: Film) => ({ id: f.id, name: f.name, poster: f.poster, showings: f.showings.map((s) => ({ at: s.at, hall: s.hall, price: s.toman, vip: s.vip })) });
/** Divar neighbourhoods and their latest ads — each ad is its title, price text, time, a note, a photo and its Divar link; nothing about the seller. */
export function adsOut(a: DivarArea) {
  return { id: a.id, city: a.city, name: a.name, lat: a.lat, lng: a.lng, distanceM: Math.round(a.distanceM), ads: a.posts.map((p) => ({ token: p.token, title: p.title, price: p.price, when: p.when, note: p.note, photo: p.photo, url: p.url })) };
}
export function productOut(h: ProductHit) {
  return { id: h.id, source: h.source, title: h.title, about: h.about ?? "", price: h.price, was: h.was ?? null, from: !!h.from, currency: h.currency ?? "IRT", photo: h.photo, store: h.store, storeId: h.code ?? null, lat: h.lat ?? null, lng: h.lng ?? null, ...dist(h.dist), rating: h.rating ?? 0, url: h.url ?? null };
}

// ---------------------------------------------------------------- openapi
const q = (name: string, description: string, schema: object, required = false) => ({ name, in: "query", required, description, schema });
const LAT = q("lat", "Latitude of the point.", { type: "number", minimum: -90, maximum: 90 }, true);
const LNG = q("lng", "Longitude of the point.", { type: "number", minimum: -180, maximum: 180 }, true);
const RADIUS = (def: number, max: number) => q("radius", `Metres around the point (default ${def}, at most ${max}).`, { type: "integer", minimum: 100, maximum: max, default: def });
const LIMIT = q("limit", "At most this many rows (default 50, at most 100).", { type: "integer", minimum: 1, maximum: 100, default: 50 });
const ok = (description: string) => ({ "200": { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } }, "401": { $ref: "#/components/responses/Unauthorized" }, "429": { $ref: "#/components/responses/RateLimited" } });
const get = (summary: string, description: string, parameters: object[]) => ({ get: { summary, description, security: [{ ApiKey: [] }, { Bearer: [] }], parameters, responses: ok(summary) } });

export const API_PATHS = ["/stores", "/stores/{id}", "/deals", "/cinemas", "/cinemas/{id}/sessions", "/ads", "/products", "/transit/stops", "/transit/stops/{id}", "/transit/buses", "/metro/{city}"] as const;

export function openApi(origin: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "StreetQuest data API",
      version: "1.0.0",
      description:
        "Read-only access to the store, deal, cinema, ad and product data StreetQuest has cached from its sources. It is answered from our cache (it may trigger the normal, paced free fetch of a source, never a paid lookup), " +
        "so it can be a few hours old — each answer says which sources it came from, with their licence notes (`meta.sources`). Sources that only know one country are asked only there (Iran, Turkey). Personal data (sellers, phone numbers) is never included. " +
        "Create a key on the /developers page; send it as `Authorization: Bearer <key>` or `X-API-Key`. Each key has a per-minute limit (default 60); over it the answer is 429 with `Retry-After`. GET and CORS preflight only.",
    },
    servers: [{ url: `${origin}/api/v1` }],
    paths: {
      "/stores": get("Stores near a point", "Delivery restaurants and shops (Snappfood in Iran, Yemeksepeti in Turkey) and Torob's walk-in stores, nearest first.", [LAT, LNG, RADIUS(1500, 5000), LIMIT]),
      "/stores/{id}": get("One store: menu, hours, review summary", "`id` is a store id from /stores (a Snappfood or Yemeksepeti vendor code). Walk-in Torob stores (`torob-<n>`) answer with their listing.", [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/deals": get("Deals and cashback near a point (Takhfifan)", "Iran only.", [LAT, LNG, RADIUS(5000, 15000), LIMIT]),
      "/cinemas": get("Cinemas near a point", "Iran: Cinematicket's (with sessions). Turkey: the open map's (`site` is the cinema's own page; no sessions).", [LAT, LNG, RADIUS(20000, 60000), LIMIT]),
      "/cinemas/{id}/sessions": get("Films and sessions at a cinema, today and tomorrow", "Prices in toman.", [{ name: "id", in: "path", required: true, schema: { type: "integer" } }]),
      "/ads": get("Latest Divar ads in the neighbourhoods around a point", "Iran only. Titles, price text, photo and link; never sellers or phone numbers.", [LAT, LNG, LIMIT]),
      "/products": get("Product search", "Dishes on cached menus nearby, deals, Torob and Basalam products. Only cached menus are read.", [
        LAT, LNG, q("q", "Words to look for (2–60 characters).", { type: "string", minLength: 2, maxLength: 60 }, true),
        q("min", "Lowest price.", { type: "integer" }), q("max", "Highest price.", { type: "integer" }), q("sort", "Order.", { type: "string", enum: ["match", "cheap", "dear", "near", "rating", "off"] }), LIMIT,
      ]),
      "/transit/stops": get("Bus stops near a point", "Tehran and Istanbul: each stop with the lines calling there (OpenStreetMap).", [LAT, LNG, RADIUS(700, 2000), LIMIT]),
      "/transit/stops/{id}": get("When each line's next bus comes to a stop", "Live in Istanbul when IETT answers (minutes estimated from the nearest bus of the line), else each line's usual frequency. Needs the stop's lat/lng.", [{ name: "id", in: "path", required: true, schema: { type: "string" } }, LAT, LNG]),
      "/transit/buses": get("Istanbul's buses live near a point", "IETT's positions (refreshed every 20 s). Empty outside Istanbul or when the feed isn't reachable.", [LAT, LNG, RADIUS(2500, 5000), LIMIT]),
      "/metro/{city}": get("A city's metro: lines in order, stations, usual frequency and hours", "`city`: tehran or istanbul. From OpenStreetMap; times are estimates (`mapped`: from the map, else the city's usual).", [{ name: "city", in: "path", required: true, schema: { type: "string", enum: ["tehran", "istanbul"] } }]),
    },
    components: {
      securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" }, Bearer: { type: "http", scheme: "bearer" } },
      responses: {
        Unauthorized: { description: "Missing, wrong or revoked key.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        RateLimited: { description: "Over the key's per-minute limit.", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "string" } } },
        Source: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, url: { type: "string" }, country: { type: "string" }, licence: { type: "string" } } },
        Envelope: {
          type: "object",
          properties: { data: {}, meta: { type: "object", properties: { api: { type: "string", enum: ["v1"] }, cached: { type: "boolean" }, note: { type: "string" }, sources: { type: "array", items: { $ref: "#/components/schemas/Source" } } } } },
        },
      },
    },
  };
}
