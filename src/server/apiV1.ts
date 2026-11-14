// The public read-only data API: /api/v1/* (the shapes, key rules and OpenAPI document are lib/apiV1.ts).
// Everything is answered from what we already cache (ExtCache / the database): a source's normal
// paced free fetch may run to fill a gap, but nothing paid (Google Places) is ever asked, and a
// source that only knows one country is asked only there (lib/region.ts). One catch-all route so
// CORS, keys and rate limits live in one place.
import { z } from "zod";
import { distanceM } from "../lib/geo";
import { S } from "../lib/settings";
import { cinemaOut, adsOut, dealOut, envelope, filmOut, keyOf, menuOf, openApi, productOut, SOURCES, sourcesFor, storeOf, take, walkInOf, type Window, type Envelope } from "../lib/apiV1";
import { deliveryAt, sourceAt } from "../lib/region";
import { PRODUCT_SORT_KEYS, productSourcesAt } from "../lib/productSearch";
import { isYsCode, VENDOR_CODE } from "../lib/yemeksepeti";
import { authenticate, noteUse } from "./apiKeys";
import { cinemaShows, cinemasNear } from "./cinema";
import { dealsAround, divarAround, torobPlaceInfo, torobPlacesAround, vendorMenu, vendorsAround } from "./localData";
import { searchProducts } from "./productSearch";
import { arrivals, busesAround, stopsAround } from "./transit";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "authorization, x-api-key, content-type", "access-control-expose-headers": "x-ratelimit-limit, x-ratelimit-remaining, retry-after", "access-control-max-age": "86400" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...CORS, "cache-control": "private, max-age=30", ...extra } });
const fail = (status: number, error: string, extra?: Record<string, string>) => json({ error }, status, extra);

export const preflight = () => new Response(null, { status: 204, headers: CORS });

const windows = new Map<string, Window>();
const num = z.coerce.number().finite();
const Point = z.object({ lat: num.min(-90).max(90), lng: num.min(-180).max(180) });
const lim = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);
const rad = (def: number, max: number) => z.coerce.number().int().min(100).max(max).default(def);
const NO_SOURCE = "No source of this data answers in this country.";

type Out = Envelope<unknown>;
const empty = (sources: string[]): Out => envelope([], sourcesFor(...sources), NO_SOURCE);

async function stores(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ radius: rad(1500, 5000), limit: lim(100, 50) }).parse(Object.fromEntries(sp));
  const here = { lat: q.lat, lng: q.lng };
  const food = deliveryAt(here), walk = sourceAt("torob", here);
  if (!food && !walk) return empty(["snappfood", "yemeksepeti", "torob"]);
  const [vendors, torob] = await Promise.all([food ? vendorsAround(here, q.radius).catch(() => []) : [], walk ? torobPlacesAround(here, q.radius).catch(() => null) : null]);
  const rows = [
    ...vendors.map((v) => ({ d: distanceM(here, v), o: storeOf(v, food!, distanceM(here, v)) })),
    ...(torob?.shops ?? []).map((p) => ({ d: distanceM(here, p), o: walkInOf(p, distanceM(here, p)) })),
  ].filter((x) => x.d <= q.radius).sort((a, b) => a.d - b.d).slice(0, q.limit);
  return envelope(rows.map((x) => x.o), sourcesFor(...(food ? [food] : []), ...(walk ? ["torob"] : []), "osm"));
}

async function store(id: string): Promise<Out | null> {
  const torob = id.match(/^torob-(\d{1,9})$/);
  if (torob) {
    const info = await torobPlaceInfo(Number(torob[1]));
    return info ? envelope({ id, source: "torob", name: info.name, logo: info.logo, photos: info.photos, address: info.address, city: info.city, url: info.url }, sourcesFor("torob")) : null;
  }
  if (!VENDOR_CODE.test(id)) return null;
  const m = await vendorMenu(id);
  return m ? envelope(menuOf(m), sourcesFor(isYsCode(id) ? "yemeksepeti" : "snappfood")) : null;
}

async function deals(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ radius: rad(5000, 15000), limit: lim(100, 50) }).parse(Object.fromEntries(sp));
  const here = { lat: q.lat, lng: q.lng };
  if (!sourceAt("takhfifan", here)) return empty(["takhfifan"]);
  const list = (await dealsAround(here)).map((d) => ({ d, m: distanceM(here, d) })).filter((x) => x.m <= q.radius).sort((a, b) => a.m - b.m).slice(0, q.limit);
  return envelope(list.map((x) => dealOut(x.d, x.m)), sourcesFor("takhfifan"));
}

async function cinemas(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ radius: rad(20000, 60000), limit: lim(100, 50) }).parse(Object.fromEntries(sp));
  const here = { lat: q.lat, lng: q.lng };
  // Iran: Cinematicket's; Turkey: the open map's (cinemasNear picks).
  const src = sourceAt("cinematicket", here) ? "cinematicket" : sourceAt("sinema", here) ? "osm" : null;
  if (!src) return empty(["cinematicket"]);
  return envelope((await cinemasNear(here, q.radius, q.limit)).map((c) => ({ ...cinemaOut(c, distanceM(here, c)), ...(c.site ? { site: c.site } : {}) })), sourcesFor(src));
}

// ---- public transport (server/transit.ts, lib/transit/*)
async function busStops(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ radius: rad(700, 2000), limit: lim(100, 50) }).parse(Object.fromEntries(sp));
  const r = await stopsAround(q, q.radius, q.limit);
  if (!r.city) return empty(["osm"]);
  return envelope({ city: r.city, stops: r.stops, lines: r.lines }, sourcesFor("osm"));
}
async function busArrivals(id: string, sp: URLSearchParams): Promise<Out | null> {
  if (!/^b\d{1,15}$/.test(id)) return null;
  const q = Point.parse(Object.fromEntries(sp));
  const r = await arrivals(id, q);
  return r.stop ? envelope(r, sourcesFor("osm", ...(r.live ? ["iett"] : []))) : null;
}
async function liveBuses(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ radius: rad(2500, 5000), limit: lim(100, 80) }).parse(Object.fromEntries(sp));
  const r = await busesAround(q, q.radius, q.limit);
  return envelope(r.buses, sourcesFor("iett"), r.live ? undefined : "IETT's live feed isn't reachable (or the point isn't in Istanbul).");
}
async function metro(city: string): Promise<Out | null> {
  if (city !== "tehran" && city !== "istanbul") return null;
  const net = await (city === "tehran" ? import("@/data/transit/tehran-metro.json") : import("@/data/transit/istanbul-metro.json")).then((m) => m.default);
  return envelope(net, sourcesFor("osm"));
}

async function sessions(id: number): Promise<Out | null> {
  const s = await cinemaShows(id);
  if (!s.cinema) return null;
  return envelope({ cinema: cinemaOut(s.cinema), films: s.films.map(filmOut), fetchedAt: s.fetchedAt, currency: "IRT" }, sourcesFor("cinematicket"));
}

async function ads(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ limit: lim(20, 10) }).parse(Object.fromEntries(sp));
  if (!sourceAt("divar", q)) return empty(["divar"]);
  return envelope((await divarAround(q)).slice(0, q.limit).map(adsOut), sourcesFor("divar"));
}

async function products(sp: URLSearchParams): Promise<Out> {
  const q = Point.extend({ q: z.string().trim().min(2).max(60), min: z.coerce.number().int().min(0).optional(), max: z.coerce.number().int().min(0).optional(), sort: z.enum(PRODUCT_SORT_KEYS).default("match"), limit: lim(100, 50) }).parse(Object.fromEntries(sp));
  const here = { lat: q.lat, lng: q.lng };
  const srcs = productSourcesAt(here);
  if (!srcs.length) return empty(["snappfood", "torob", "basalam"]);
  // read: false — only menus already cached are searched; nothing is fetched on a key's behalf.
  const a = await searchProducts(here, { q: q.q, min: q.min, max: q.max, sort: q.sort, limit: q.limit, read: false });
  const used = new Set<string>(srcs.map((s) => (s === "food" ? deliveryAt(here) ?? "snappfood" : s === "deal" ? "takhfifan" : s)));
  return envelope(a.hits.slice(0, q.limit).map(productOut), sourcesFor(...used), a.failed.length ? `Some sources did not answer: ${a.failed.join(", ")}.` : undefined);
}

/** One request to /api/v1/<path>. */
export async function handleV1(req: Request, path: string[]): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  const [a, b, c] = path;
  // The API's own description and the list of sources need no key.
  if (a === "openapi.json" && !b) return json(openApi(new URL(req.url).origin), 200, { "cache-control": "public, max-age=300" });
  if (a === "sources" && !b) return json(envelope(Object.values(SOURCES), Object.values(SOURCES)), 200, { "cache-control": "public, max-age=300" });

  const k = keyOf(req.headers);
  const auth = k ? await authenticate(k).catch(() => null) : null;
  if (!auth) return fail(401, "Missing or invalid API key. Send it as `Authorization: Bearer <key>` or `X-API-Key`; make one at /developers.");
  const lim_ = take(windows, auth.id, auth.perMinute, Date.now());
  const rl = { "x-ratelimit-limit": String(lim_.limit), "x-ratelimit-remaining": String(lim_.remaining) };
  if (!lim_.ok) return fail(429, `Rate limit of ${lim_.limit} requests a minute reached.`, { ...rl, "retry-after": String(lim_.resetS) });
  void noteUse(auth.id);
  // The admin's switch (Game settings): off, nothing is asked of other sites, so there is nothing to serve.
  if (!S.localDataEnabled) return fail(503, "Store data is switched off on this server.", rl);

  try {
    const sp = new URL(req.url).searchParams;
    let out: Out | null | undefined;
    if (a === "stores" && !b) out = await stores(sp);
    else if (a === "stores" && b && !c) out = await store(decodeURIComponent(b));
    else if (a === "deals" && !b) out = await deals(sp);
    else if (a === "cinemas" && !b) out = await cinemas(sp);
    else if (a === "cinemas" && b && c === "sessions" && path.length === 3) out = /^\d{1,7}$/.test(b) ? await sessions(Number(b)) : null;
    else if (a === "ads" && !b) out = await ads(sp);
    else if (a === "products" && !b) out = await products(sp);
    else if (a === "transit" && b === "stops" && !c) out = await busStops(sp);
    else if (a === "transit" && b === "stops" && c && path.length === 3) out = await busArrivals(decodeURIComponent(c), sp);
    else if (a === "transit" && b === "buses" && !c) out = await liveBuses(sp);
    else if (a === "metro" && b && !c) out = await metro(b);
    else return fail(404, "No such endpoint. See /api/v1/openapi.json.", rl);
    return out ? json(out, 200, rl) : fail(404, "Not found.", rl);
  } catch (e) {
    if (e instanceof z.ZodError) return fail(400, `Bad parameter: ${e.issues[0]?.path.join(".") || "?"} — ${e.issues[0]?.message ?? "invalid"}.`, rl);
    console.error(e);
    return fail(500, "Server error.", rl);
  }
}
