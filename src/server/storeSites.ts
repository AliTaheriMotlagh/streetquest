// The store directories, deal and ad sites, and Basalam (lib/stores/directory.ts reads what they
// send). Each site is cached per ~1 km cell in ExtCache, so players standing near each other share
// one request, and every site can go through the Iran relay or be turned off (relayUrl.ts):
//
//   BILBOOARD_URL / IRANGAAH_URL / OKALA_URL / NETBARG_URL / SHEYPOOR_URL / BASALAM_URL = "off" | <base>
//
// A site that is slow never holds the map up: `around` waits STORE_WAIT_MS and returns what has
// come back, the rest keeps loading into the cache (`pending` tells the map to ask again).
import { after } from "next/server";
import { distanceM, type LatLng } from "../lib/geo";
import { siteBase } from "../lib/relayUrl";
import { mergePhones, phonesFrom, type StorePhone } from "../lib/localData";
import {
  adAreas, bboxAround, bilbooardCity, detailFromLd, findTwin, fromBasalam, fromBilbooard, fromIrangaah, fromNetbargDeal, fromOkala,
  mergeStores, nearestCity, netbargDealLinks, sheypoorListings, type AdArea, type AdItem, type DirDetail, type DirStore, type MapSite, type Product,
} from "../lib/stores/directory";
import { cached, divarCities, divarDistricts, phonesFor, type DivarPlace } from "./localData";

const HOUR = 3600_000;
const CELL = 0.01;
/** Each cell asks for this much round its centre (a cell is ~1.1 km, so neighbours overlap a little). */
const CELL_REACH_M = 1300;
const WAIT_MS = Number(process.env.STORE_WAIT_MS ?? 9000);
const TIMEOUT_MS = 10_000;
/** Irangaah's whole-city index (Tehran ~14 MB) gets longer. */
const INDEX_TIMEOUT_MS = 45_000;
const UA = () => `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;

const base = {
  bilbooard: () => siteBase("bilbooard", process.env.BILBOOARD_URL, "https://bilbooard.ir"),
  irangaah: () => siteBase("irangaah", process.env.IRANGAAH_URL, "https://irangaah.ir"),
  okala: () => siteBase("okala", process.env.OKALA_URL, "https://apigateway.okala.com/api"),
  netbarg: () => siteBase("netbarg", process.env.NETBARG_URL, "https://netbarg.com"),
  sheypoor: () => siteBase("sheypoor", process.env.SHEYPOOR_URL, "https://www.sheypoor.com"),
  basalam: () => siteBase("basalam", process.env.BASALAM_URL, "https://search.basalam.com"),
};
/** Which sites answer here (the rest are "off"): the map filter shows only these. */
export const sitesOn = () => Object.fromEntries(Object.entries(base).map(([k, f]) => [k, !!f()])) as Record<keyof typeof base, boolean>;

/** One GET: the body as text (or JSON), null on any failure. Never retried: the cache keeps the last good copy. */
async function fetchText(url: string, timeoutMs = TIMEOUT_MS, accept = "text/html,application/json"): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA(), accept }, signal: ctl.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchJson<T>(url: string, timeoutMs?: number): Promise<T | null> {
  const s = await fetchText(url, timeoutMs, "application/json");
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
/** At most `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}
/** Keep loading after the response on serverless hosts. */
function keepAlive(p: Promise<unknown>) {
  try {
    after(() => p.catch(() => {}));
  } catch {
    void p.catch(() => {});
  }
}
/**
 * The cells this server read lately, in memory: a cell's stores are up to ~1,500 rows, and the map
 * reads 9 cells per site every time it asks — from the database that would be megabytes a request.
 */
const MEMO_MS = 10 * 60_000, MEMO_MAX = 400;
const memo = new Map<string, { at: number; v: DirStore[] }>();
async function memoCell(key: string, load: () => Promise<DirStore[]>): Promise<DirStore[]> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.v;
  const v = await load();
  if (v.length) {
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
    memo.set(key, { at: Date.now(), v });
  }
  return v;
}
const cellOf = (at: LatLng) => ({ lat: Math.round(at.lat / CELL) * CELL, lng: Math.round(at.lng / CELL) * CELL });
const cellKey = (c: LatLng) => `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;

// ---------------------------------------------------------------- cities
type IgCities = { c: [string, string, string, number, number][] };
const igCities = () => cached<IgCities>("ig:cities", 7 * 24 * HOUR, async () => {
  const root = base.irangaah();
  return root ? fetchJson<IgCities>(`${root}/data/cities.json`) : null;
});
/** The city (Irangaah's slug, which Bilbooard shares) a point is in. */
export async function cityAt(at: LatLng): Promise<string | null> {
  return nearestCity(await igCities().catch(() => null), at);
}

// ---------------------------------------------------------------- Bilbooard
async function bilbooardCell(c: LatLng, city: string): Promise<DirStore[]> {
  const root = base.bilbooard();
  if (!root) return [];
  return memoCell(`bb:${cellKey(c)}`, () => bilbooardCellDb(c, city, root));
}
async function bilbooardCellDb(c: LatLng, city: string, root: string): Promise<DirStore[]> {
  const out = await cached<DirStore[]>(`bb:cell:${cellKey(c)}`, 24 * HOUR, async () => {
    const b = bboxAround(c, CELL_REACH_M);
    const q = new URLSearchParams({ sw_lat: b.s.toFixed(5), sw_lng: b.w.toFixed(5), ne_lat: b.n.toFixed(5), ne_lng: b.e.toFixed(5) });
    const json = await fetchJson<unknown>(`${root}/${city}/businesses/map?${q}`);
    return json ? fromBilbooard(json) : null;
  });
  return out ?? [];
}

// ---------------------------------------------------------------- Irangaah
type IgManifest = { places?: { search?: { dir?: string } } };
type IgRows = unknown[];
/** A city's index, kept in memory for a day (it's ~14 MB for Tehran: read once per server, not per cell). */
const igIndex = new Map<string, { at: number; rows: Promise<IgRows | null> }>();
function irangaahIndex(city: string): Promise<IgRows | null> {
  const hit = igIndex.get(city);
  if (hit && Date.now() - hit.at < 24 * HOUR) return hit.rows;
  const rows = (async () => {
    const root = base.irangaah();
    if (!root) return null;
    const m = await cached<IgManifest>("ig:manifest", 12 * HOUR, () => fetchJson<IgManifest>(`${root}/map-data/manifest.json`));
    const dir = m?.places?.search?.dir;
    if (!dir || !/^[\w.-]+\/$/.test(dir)) return null;
    return fetchJson<IgRows>(`${root}/map-data/${dir}${encodeURIComponent(city)}.json`, INDEX_TIMEOUT_MS);
  })();
  igIndex.set(city, { at: Date.now(), rows });
  void rows.then((r) => r || igIndex.delete(city));
  return rows;
}
async function irangaahCell(c: LatLng, city: string): Promise<DirStore[]> {
  if (!base.irangaah()) return [];
  return memoCell(`ig:${city}:${cellKey(c)}`, async () => {
    const out = await cached<DirStore[]>(`ig:cell:${city}:${cellKey(c)}`, 24 * HOUR, async () => {
      const rows = await irangaahIndex(city);
      return rows ? fromIrangaah(rows, bboxAround(c, CELL_REACH_M), 2500) : null;
    });
    return out ?? [];
  });
}

// ---------------------------------------------------------------- Okala
type OkalaNearby = { data?: { stores?: Record<string, unknown>[] } };
type OkalaDetail = { data?: Record<string, unknown> };
const okalaDetail = (id: number, at: LatLng) =>
  cached<Record<string, unknown>>(`ok:store:${id}`, 24 * HOUR, async () => {
    const root = base.okala();
    if (!root) return null;
    const r = await fetchJson<OkalaDetail>(`${root}/opex/v2/stores/details?Latitude=${at.lat.toFixed(5)}&longitude=${at.lng.toFixed(5)}&StoreId=${id}`);
    return r?.data ?? null;
  });
async function okalaCell(c: LatLng): Promise<DirStore[]> {
  const root = base.okala();
  if (!root) return [];
  const out = await cached<DirStore[]>(`ok:cell:${cellKey(c)}`, 6 * HOUR, async () => {
    const r = await fetchJson<OkalaNearby>(`${root}/opex/v4/stores/nearby?Latitude=${c.lat.toFixed(5)}&Longitude=${c.lng.toFixed(5)}`);
    const rows = r?.data?.stores;
    if (!rows) return null;
    const stores = await pool(rows.slice(0, 15), 3, async (row) => fromOkala(row, await okalaDetail(Number(row.storeId), c).catch(() => null)));
    return stores.filter((s): s is DirStore => !!s);
  });
  return out ?? [];
}

// ---------------------------------------------------------------- the city's neighbourhoods (Divar's list)
async function districtsNear(at: LatLng, maxM: number, max: number): Promise<{ city: DivarPlace; near: (DivarPlace & { m: number })[] } | null> {
  const cities = (await divarCities().catch(() => null)) ?? [];
  const city = cities.map((c) => ({ c, d: distanceM(at, c) })).filter((x) => x.d <= Math.max(x.c.r, 5000) + 5000).sort((a, b) => a.d - b.d)[0]?.c;
  if (!city) return null;
  const all = ((await divarDistricts(city.id).catch(() => null)) ?? []).map((d) => ({ ...d, m: distanceM(at, d) })).sort((a, b) => a.m - b.m);
  return { city, near: all.filter((d, i) => i === 0 || d.m <= maxM).slice(0, max) };
}

// ---------------------------------------------------------------- Netbarg
const NB_AREAS = 3, NB_PER_AREA = 8;
type NbDeal = { store: DirStore; detail: DirDetail };
const netbargDeal = (link: { id: number; cat: string; url: string }, area: LatLng) =>
  cached<NbDeal | { gone: true }>(`nb:deal2:${link.id}`, 24 * HOUR, async () => {
    const html = await fetchText(link.url.replace("https://netbarg.com", base.netbarg() ?? "https://netbarg.com"));
    if (!html) return null;
    // An ended deal with no pin: remembered for a day. On sale but no position known yet: asked again next time.
    return fromNetbargDeal(html, link, area) ?? (/InStock/.test(html) ? null : { gone: true });
  });
async function netbargAround(at: LatLng): Promise<DirStore[]> {
  const root = base.netbarg();
  if (!root) return [];
  const where = await districtsNear(at, 2500, NB_AREAS);
  if (!where) return [];
  const lists = await Promise.all(
    where.near.map(async (d) => {
      const links = await cached<{ id: number; cat: string; url: string }[]>(`nb:area:${d.name}`, 6 * HOUR, async () => {
        const html = await fetchText(`${root}/area/${encodeURIComponent(d.name)}/`);
        return html ? netbargDealLinks(html) : null;
      });
      const deals = await pool((links ?? []).slice(0, NB_PER_AREA), 3, (l) => netbargDeal(l, d).catch(() => null));
      return deals.flatMap((x) => (x && "store" in x ? [x.store] : []));
    }),
  );
  return lists.flat();
}
/** One Netbarg deal's page, from the cache the map filled. */
async function netbargDetail(id: string, url: string): Promise<DirDetail | null> {
  const m = /\/d\/c:([a-z-]+)\/(\d+)\//.exec(url);
  if (!m || m[2] !== id) return null;
  const r = await netbargDeal({ id: Number(id), cat: m[1], url }, { lat: NaN, lng: NaN }).catch(() => null);
  return r && "detail" in r ? r.detail : null;
}

// ---------------------------------------------------------------- the map layer
/** Stores this far from the point, at most PER_SITE from each site. */
const REACH_M = 2200, PER_SITE = 700;
export type StoresAround = { stores: DirStore[]; ads: AdArea[]; city: string | null; pending: boolean };
/** Promise.race against the wait: what came back by then (the rest keeps going into the cache). */
async function within<T>(p: Promise<T>, empty: T, ms = WAIT_MS): Promise<{ v: T; late: boolean }> {
  keepAlive(p);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ v: T; late: boolean }>((r) => (timer = setTimeout(() => r({ v: empty, late: true }), ms)));
  try {
    return await Promise.race([p.then((v) => ({ v, late: false }), () => ({ v: empty, late: false })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Every directory store round a point (the 3×3 cells round it) from the sites asked for, merged and nearest first. */
export async function storesAround(at: LatLng, sites: MapSite[], wantAds: boolean): Promise<StoresAround> {
  const city = await cityAt(at);
  const bbCity = bilbooardCity(city);
  const c = cellOf(at);
  const cells = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ lat: c.lat + dy * CELL, lng: c.lng + dx * CELL })));
  const jobs: Promise<DirStore[]>[] = [];
  if (sites.includes("bilbooard") && bbCity) jobs.push(...cells.map((x) => bilbooardCell(x, bbCity).catch(() => [])));
  if (sites.includes("irangaah") && city) jobs.push(...cells.map((x) => irangaahCell(x, city).catch(() => [])));
  if (sites.includes("okala")) jobs.push(okalaCell(c).catch(() => []));
  if (sites.includes("netbarg")) jobs.push(netbargAround(at).catch(() => []));
  const [got, ads] = await Promise.all([
    Promise.all(jobs.map((j) => within(j, [] as DirStore[]))),
    wantAds ? within(sheypoorAround(at).catch(() => []), [] as AdArea[]) : Promise.resolve({ v: [] as AdArea[], late: false }),
  ]);
  // Neighbouring cells overlap: each store once (by id) before matching stores across sites.
  const seen = new Set<string>();
  const near = got.flatMap((g) => g.v).filter((s) => !seen.has(s.id) && !!seen.add(s.id) && distanceM(at, s) <= REACH_M);
  // Each site keeps its nearest PER_SITE, so one big directory never crowds the others off the map.
  const per = new Map<MapSite, DirStore[]>();
  for (const s of near) per.set(s.site, [...(per.get(s.site) ?? []), s]);
  const capped = [...per.values()].flatMap((l) => l.map((s) => ({ s, m: distanceM(at, s) })).sort((a, b) => a.m - b.m).slice(0, PER_SITE).map((x) => x.s));
  const stores = mergeStores(capped).map((s) => ({ s, m: distanceM(at, s) })).sort((a, b) => a.m - b.m).map((x) => x.s);
  return { stores, ads: ads.v, city, pending: got.some((g) => g.late) || ads.late };
}

// ---------------------------------------------------------------- Sheypoor
/** The pages read per city: everything, then the busiest sections (each a page of ~20 newest ads). */
const SH_SECTIONS = ["", "/home", "/real-estate", "/jobs"];
async function sheypoorCity(slug: string): Promise<AdItem[]> {
  const root = base.sheypoor();
  if (!root || !/^[a-z-]+$/.test(slug)) return [];
  const pages = await Promise.all(
    SH_SECTIONS.map((sec) =>
      cached<AdItem[]>(`sh:${slug}${sec}`, 15 * 60_000, async () => {
        const html = await fetchText(`${root}/s/${slug}${sec}`);
        return html ? sheypoorListings(html) : null;
      }).catch(() => null),
    ),
  );
  const seen = new Set<string>();
  return pages.flatMap((p) => p ?? []).filter((a) => !seen.has(a.id) && !!seen.add(a.id));
}
/** Sheypoor's newest ads in the neighbourhoods round a point, each pinned on its neighbourhood. */
export async function sheypoorAround(at: LatLng): Promise<AdArea[]> {
  // A page of newest ads is spread over the whole city: pin them on every district in it (the map draws what is in view).
  const where = await districtsNear(at, 25_000, 600);
  if (!where?.city.slug) return [];
  const ads = await sheypoorCity(where.city.slug);
  return adAreas(ads, where.near.map((d) => ({ id: String(d.id), name: d.name, lat: d.lat, lng: d.lng })));
}

// ---------------------------------------------------------------- Basalam
export async function basalamSearch(q: string, city?: string): Promise<Product[]> {
  const root = base.basalam();
  const query = q.trim().slice(0, 60);
  if (!root || query.length < 2) return [];
  const list = await cached<Product[]>(`ba:q:${query}`, 6 * HOUR, async () => {
    const json = await fetchJson<unknown>(`${root}/ai-engine/api/v2.0/product/search?size=24&from=0&q=${encodeURIComponent(query)}`);
    return json ? fromBasalam(json) : null;
  });
  const out = list ?? [];
  // Sellers from the player's own city first.
  return city ? [...out].sort((a, b) => Number(b.city === city) - Number(a.city === city)) : out;
}

// ---------------------------------------------------------------- one store's page
type OkalaReviews = { data?: { items?: { reviewerName?: string; vendorRate?: number; comment?: string; submittedAt?: string }[] } };
/** The card's page for a directory store: its site's page read in full (and Okala's reviews). */
export async function storeDetail(id: string, url: string, at?: LatLng): Promise<DirDetail | null> {
  const [site, key] = id.split(":") as [MapSite, string];
  if (site === "netbarg") return netbargDetail(key, url);
  if (site === "okala") {
    const n = Number(key);
    if (!Number.isFinite(n) || !base.okala()) return null;
    const [d, rv] = await Promise.all([
      okalaDetail(n, at ?? { lat: 35.7, lng: 51.4 }).catch(() => null),
      cached<OkalaReviews>(`ok:reviews:${n}`, HOUR, () => fetchJson<OkalaReviews>(`${base.okala()}/review/v1/stores/${n}/reviews?Page=1&PageSize=10`)).catch(() => null),
    ]);
    const s = d ? fromOkala(d, d) : null;
    if (!s || !d) return null;
    const eta = typeof (d.earliestSlot as Record<string, unknown> | undefined)?.caption === "string" ? String((d.earliestSlot as Record<string, unknown>).caption) : "";
    const min = Math.round(Number(d.minimumOrder ?? 0) / 10);
    return {
      id, site, name: s.name, url: s.url, lat: s.lat, lng: s.lng, description: String(d.storeStatusMessage ?? ""), photos: [String(d.headerImageUrl ?? ""), s.img ?? ""].filter((u) => /^https:\/\//.test(u)),
      address: String(d.storeAddress ?? ""), week: null, phones: [], rating: s.rating, ratingCount: Number(d.csatCount ?? 0) || 0, links: [],
      eta,
      minOrder: min,
      reviews: (rv?.data?.items ?? []).filter((r) => r.comment).map((r) => ({ name: r.reviewerName ?? "", rate: Number(r.vendorRate ?? 0), text: String(r.comment).slice(0, 600), at: r.submittedAt ?? "" })),
    };
  }
  const root = site === "bilbooard" ? base.bilbooard() : site === "irangaah" ? base.irangaah() : null;
  const origin = site === "bilbooard" ? "https://bilbooard.ir" : "https://irangaah.ir";
  if (!root || !url.startsWith(`${origin}/`)) return null;
  return cached<DirDetail>(`dir:page:${id}`, 24 * HOUR, async () => {
    const html = await fetchText(root + url.slice(origin.length));
    return html ? detailFromLd(html, { id, site, url }) : null;
  });
}

// ---------------------------------------------------------------- a store card's other sites
/**
 * The directories that list this store (a 2D or 3D store card, a Snappfood vendor): their pages
 * as links and their phone numbers, from the cells the map already cached. Never waits long — a
 * cold cell is skipped this time and loads for the next card.
 */
export async function directoryTwins(store: { name: string; lat: number; lng: number }, waitMs = 2500): Promise<{ links: { site: MapSite; url: string }[]; phones: StorePhone[] }> {
  const city = await within(cityAt(store), null, waitMs);
  const c = cellOf(store);
  const bbCity = bilbooardCity(city.v);
  const [bb, ig] = await Promise.all([
    bbCity ? within(bilbooardCell(c, bbCity).catch(() => []), [] as DirStore[], waitMs) : { v: [] as DirStore[] },
    city.v ? within(irangaahCell(c, city.v).catch(() => []), [] as DirStore[], waitMs) : { v: [] as DirStore[] },
  ]);
  const twins = [findTwin(bb.v, store), findTwin(ig.v, store)].filter((x): x is DirStore => !!x);
  return { links: twins.map((s) => ({ site: s.site, url: s.url })), phones: mergePhones(...twins.map((s) => phonesFrom(s.site === "irangaah" ? "irangaah" : "map", s.phone))) };
}

/** A directory store's numbers: its own, else Balad's / the map's for the same name and place. */
export async function phonesOf(d: DirDetail, at: LatLng): Promise<StorePhone[]> {
  return mergePhones(d.phones, d.phones.length ? [] : await phonesFor({ name: d.name, lat: d.lat ?? at.lat, lng: d.lng ?? at.lng }).catch(() => []));
}

// ---------------------------------------------------------------- health
/** /api/health?ext=1: can this server reach each store site (a cheap request to each)? */
export async function storeSitesHealth() {
  const probe = async (url: string | null) => {
    if (!url) return { ok: false, status: "off" };
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": "StreetQuest/1.0 health" }, signal: AbortSignal.timeout(8000) });
      return { ok: res.ok, status: String(res.status), ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, status: (e as Error).name, ms: Date.now() - t0 };
    }
  };
  const b = Object.fromEntries(Object.entries(base).map(([k, f]) => [k, f()])) as Record<keyof typeof base, string | null>;
  const [bilbooard, irangaah, okala, netbarg, sheypoor, basalam] = await Promise.all([
    probe(b.bilbooard && `${b.bilbooard}/api/v1/categories/tree?max_depth=1`),
    probe(b.irangaah && `${b.irangaah}/map-data/manifest.json`),
    probe(b.okala && `${b.okala}/opex/v4/stores/nearby?Latitude=35.6997&Longitude=51.338`),
    probe(b.netbarg && `${b.netbarg}/`),
    probe(b.sheypoor && `${b.sheypoor}/api/v10.0.0/categories/compact`),
    probe(b.basalam && `${b.basalam}/ai-engine/api/v2.0/product/search?size=1&from=0&q=test`),
  ]);
  return { bilbooard, irangaah, okala, netbarg, sheypoor, basalam };
}
