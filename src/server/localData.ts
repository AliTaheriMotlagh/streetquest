// What other sites know about a real store: Snappfood menus and catalogs (restaurants,
// cafés, bakeries, supermarkets — with their real position, so they go on the map),
// Torob listings and prices, and the latest Divar ads in each neighbourhood. None has
// an official public API, so this stays polite:
//  - everything is cached in ExtCache (vendors per ~1 km cell and name searches for 12 h,
//    a menu for 6 h, a Torob search or shop for 12 h, Divar's neighbourhoods for a week
//    and their ads for 15 min), so a busy map costs them one request per area;
//  - each key is fetched once at a time (deduped per instance, at most three requests at
//    once, honest User-Agent), and a failed refresh serves the stale copy;
//  - SNAPPFOOD_URL / TOROB_URL / DIVAR_URL point at the sites ("off" disables them — the
//    e2e tests point them at a local stub instead).
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import {
  DIVAR_CATS, divarLink, isFoodCat, LINK_CHECKS, nameScore, normName, rialToToman, sameName, sellsOnSnappfood, snappfoodCode, torobLink, torobShopId, vendorKind,
  type DivarArea, type DivarCat, type DivarPost, type Menu, type StoreData, type StoreLink, type TorobItem, type TorobShop, type Vendor,
} from "../lib/localData";
import { t } from "../lib/i18n";

const base = (env: string | undefined, fallback: string) => (env === "off" ? null : (env || fallback).replace(/\/$/, ""));
const snappBase = () => base(process.env.SNAPPFOOD_URL, "https://snappfood.ir");
const torobBase = () => base(process.env.TOROB_URL, "https://api.torob.com");
const divarBase = () => base(process.env.DIVAR_URL, "https://api.divar.ir");

const HOUR = 3600_000;
const VENDORS_TTL = 12 * HOUR;
const MENU_TTL = 6 * HOUR;
const TOROB_TTL = 12 * HOUR;
const DIVAR_PLACES_TTL = 7 * 24 * HOUR;
const DIVAR_POSTS_TTL = 15 * 60_000;
/** Vendor lists are cached per cell of this many degrees (~1 km). */
const CELL = 0.01;
/**
 * The list is every vendor delivering to a point (≈1,200 in central Tehran), nearest not
 * first: read all of it in pages this big, up to MAX_VENDORS.
 */
const PAGE_SIZE = 400;
const MAX_VENDORS = 2400;
/** A store and a Snappfood vendor this close, with a similar name, are the same place. */
const MATCH_M = 150;
/** …and this close when the names match word for word (the two sites often place a store a block apart). */
const MATCH_SAME_NAME_M = 400;
/** Search hits whose position is checked (one menu fetch each) when a store isn't in the cell's list. */
const SEARCH_CHECKS = 3;
/** Divar neighbourhoods whose centre is this close are "around" the player (the nearest always is). */
const DIVAR_NEAR_M = 2500;
const DIVAR_MAX_AREAS = 5;
/** …unless even the nearest is this far: then the player isn't in a neighbourhood Divar knows. */
const DIVAR_NEAREST_MAX_M = 6000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PARALLEL = 3;

let running = 0;
const queue: (() => void)[] = [];
async function getJson<T>(url: string, post?: unknown): Promise<T | null> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
  running++;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const ua = `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;
    const headers: Record<string, string> = { "user-agent": ua, accept: "application/json" };
    const init: RequestInit = post === undefined ? { headers } : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(post) };
    const res = await fetch(url, { ...init, signal: ctl.signal });
    return res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    running--;
    queue.shift()?.();
  }
}

const inflight = new Map<string, Promise<unknown>>();
/** The cached copy while it's fresh; otherwise fetch once (shared by concurrent callers), falling back to the stale copy. */
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T | null>): Promise<T | null> {
  const row = await prisma.extCache.findUnique({ where: { key } });
  if (row && Date.now() - row.fetchedAt.getTime() < ttlMs) return row.data as T;
  let p = inflight.get(key) as Promise<T | null> | undefined;
  if (!p) {
    p = load()
      .then(async (data) => {
        if (data == null) return null;
        const json = data as unknown as Prisma.InputJsonValue;
        await prisma.extCache.upsert({ where: { key }, create: { key, data: json }, update: { data: json, fetchedAt: new Date() } });
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return (await p) ?? ((row?.data as T | undefined) ?? null);
}

// ---------------------------------------------------------------- Snappfood
const snappQuery = (at: LatLng) => `lat=${at.lat.toFixed(6)}&long=${at.lng.toFixed(6)}&optionalClient=WEBSITE&client=WEBSITE&deviceType=WEBSITE&appVersion=8.1.1`;

type RawVendor = { vendorCode?: string; title?: string; childType?: string; vendorType?: string; lat?: number; lon?: number; rating?: number; logo?: string; menuUrl?: string; shareLink?: string; isOpen?: boolean; description?: string };
function toVendor(v: RawVendor): Vendor | null {
  if (!v.vendorCode || !v.title || typeof v.lat !== "number" || typeof v.lon !== "number") return null;
  return {
    code: v.vendorCode,
    title: v.title,
    kind: vendorKind(v.childType || v.vendorType || ""),
    lat: v.lat,
    lng: v.lon,
    rating: Math.round((v.rating ?? 0) * 10) / 10,
    logo: v.logo ?? "",
    url: v.menuUrl || v.shareLink || `https://snappfood.ir/restaurant/menu/${v.vendorCode}`,
    open: !!v.isOpen,
    about: (v.description ?? "").replace(/\s*,\s*/g, "، ").trim(),
  };
}

const cellOf = (p: LatLng) => ({ y: Math.round(p.lat / CELL), x: Math.round(p.lng / CELL) });

type RawVendorList = { data?: { count?: number; finalResult?: { type: string; data: RawVendor }[] } };

/** Every Snappfood vendor delivering to a cell (it lists them all, in pages). */
function vendorsInCell(c: { x: number; y: number }) {
  return cached<Vendor[]>(`sf:cell2:${c.y}:${c.x}`, VENDORS_TTL, async () => {
    const root = snappBase();
    if (!root) return null;
    const at = { lat: c.y * CELL, lng: c.x * CELL };
    const page = (n: number) => getJson<RawVendorList>(`${root}/mobile/v3/restaurant/vendors-list?${snappQuery(at)}&page=${n}&page_size=${PAGE_SIZE}`);
    const first = await page(0);
    if (!first?.data) return null;
    // The first page says how many there are; the rest come in parallel (getJson queues them).
    const total = Math.min(MAX_VENDORS, first.data.count ?? 0);
    const more = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) }, (_, i) => page(i + 1)));
    const out = new Map<string, Vendor>();
    for (const p of [first, ...more]) for (const r of p?.data?.finalResult ?? []) if (r.type === "VENDOR") {
      const v = toVendor(r.data);
      if (v) out.set(v.code, v);
    }
    return [...out.values()];
  });
}

/** Snappfood vendors around a point, nearest first (for the map layer). */
export async function vendorsAround(here: LatLng, radiusM = 2000): Promise<Vendor[]> {
  const list = (await vendorsInCell(cellOf(here))) ?? [];
  return list
    .map((v) => ({ v, d: distanceM(here, v) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.v);
}

type RawSearch = { data?: { vendor?: { items?: { code?: string; title?: string }[] } } };

/** Snappfood's own search for a store name. Its hits carry no position (and may be in another city). */
function searchVendors(name: string, at: LatLng) {
  const c = cellOf(at);
  return cached<{ code: string; title: string }[]>(`sf:q:${c.y}:${c.x}:${normName(name)}`, VENDORS_TTL, async () => {
    const root = snappBase();
    if (!root) return null;
    const r = await getJson<RawSearch>(`${root}/search/api/v1/desktop/search?${snappQuery(at)}&query=${encodeURIComponent(name)}`);
    if (!r?.data) return null;
    return (r.data.vendor?.items ?? []).filter((v) => v.code && v.title).map((v) => ({ code: v.code!, title: v.title! }));
  });
}

/**
 * How sure we are a vendor `d` metres away is this store (≥ 0.5: it is). Right on top of
 * it, half the name is enough; next door needs a clear match; a block away, every word.
 */
const matchScore = (name: string, v: Vendor, d: number) => {
  if (d > MATCH_SAME_NAME_M) return 0;
  const s = nameScore(name, v.title);
  if (d > MATCH_M) return s >= 1 ? 0.6 : 0;
  return s - (d > 40 ? 0.15 : 0);
};

/** The Snappfood vendor that is this store: near it, with a similar name. */
export async function matchVendor(store: { name: string; lat: number; lng: number; cat: string }): Promise<Vendor | null> {
  const list = (await vendorsInCell(cellOf(store))) ?? [];
  let best: { v: Vendor; score: number } | null = null;
  for (const v of list) {
    const score = matchScore(store.name, v, distanceM(store, v));
    if (score >= 0.5 && (!best || score > best.score)) best = { v, score };
  }
  if (best || !sellsOnSnappfood(store.cat)) return best?.v ?? null;
  // The cell's list is only the first pages of thousands: search the name, and check where
  // the best few really are (their menu, which the card needs anyway, has the position).
  const hits = ((await searchVendors(store.name, store)) ?? [])
    .map((h) => ({ ...h, score: nameScore(store.name, h.title) }))
    .filter((h) => h.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_CHECKS);
  for (const h of hits) {
    const v = (await vendorMenu(h.code, store).catch(() => null))?.vendor;
    if (v && matchScore(store.name, v, distanceM(store, v)) >= 0.5) return v;
  }
  return null;
}

type RawProduct = { id?: number; title?: string; description?: string; price?: number; discount?: number; images?: { imageThumbnailSrc?: string; imageSrc?: string }[] };
type RawMenu = { data?: { vendor?: RawVendor & { coverPath?: string; address?: string }; menus?: { category?: string; products?: RawProduct[] }[] } };

/** A vendor's menu (restaurants) or catalog (supermarkets, bakeries…), prices in toman. */
export function vendorMenu(code: string, near?: LatLng): Promise<Menu | null> {
  return cached<Menu>(`sf:menu:${code}`, MENU_TTL, async () => {
    const root = snappBase();
    if (!root) return null;
    const at = near ?? { lat: 35.6997, lng: 51.338 };
    const r = await getJson<RawMenu>(`${root}/mobile/v2/restaurant/details/dynamic?${snappQuery(at)}&UDID=streetquest&vendorCode=${encodeURIComponent(code)}&show_party=1&fetch-static-data=1`);
    const v = r?.data?.vendor ? toVendor({ ...r.data.vendor, vendorCode: r.data.vendor.vendorCode ?? code }) : null;
    if (!v || !r?.data) return null;
    return {
      vendor: v,
      cover: r.data.vendor?.coverPath ?? "",
      address: r.data.vendor?.address ?? "",
      fetchedAt: new Date().toISOString(),
      sections: (r.data.menus ?? [])
        .map((m) => ({
          title: m.category ?? "",
          items: (m.products ?? []).filter((p) => p.title && typeof p.price === "number").slice(0, 60).map((p) => ({
            id: String(p.id ?? p.title),
            title: p.title!,
            about: (p.description ?? "").trim(),
            price: rialToToman(p.price!),
            priceNow: rialToToman(p.price! - (p.discount ?? 0)),
            photo: p.images?.[0]?.imageThumbnailSrc ?? p.images?.[0]?.imageSrc ?? "",
          })),
        }))
        .filter((s) => s.items.length)
        .slice(0, 40),
    };
  });
}

// ---------------------------------------------------------------- Torob
type RawShop = { shop_id?: number; name?: string; logo_512?: string; num_bases?: number };
type RawTorob = {
  results?: { name1?: string; price?: number; price_prefix?: string; shop_text?: string; image_url?: string; web_client_absolute_url?: string }[];
  /** When the query is a shop's name: that shop. */
  business_profile_result?: { internet_shops?: RawShop[] } | null;
};

const torobUrl = (root: string, q: string, shopId?: number) =>
  `${root}/v4/base-product/search/?q=${encodeURIComponent(q)}${shopId ? `&shop_id=${shopId}` : ""}&page=0&size=24`;
const toShop = (s: RawShop): TorobShop | null =>
  s.shop_id && s.name ? { id: s.shop_id, name: s.name, logo: s.logo_512 ?? "", url: `https://torob.com/shop/${s.shop_id}/`, count: s.num_bases ?? 0 } : null;

/**
 * Torob's listings for a search — all of Torob, or one shop's catalog (`shopId`, where an
 * empty query lists it all). Prices are toman; `from` when it's the cheapest of several shops.
 */
export async function torobSearch(q: string, shopId?: number): Promise<TorobItem[]> {
  const query = q.trim().slice(0, 60);
  if (query.length < 2 && !shopId) return [];
  const out = await cached<TorobItem[]>(`tr:${shopId ?? ""}:${query.toLowerCase()}`, TOROB_TTL, async () => {
    const root = torobBase();
    if (!root) return null;
    const r = await getJson<RawTorob>(torobUrl(root, query, shopId));
    if (!r?.results) return null;
    return r.results
      .filter((x) => x.name1 && x.web_client_absolute_url)
      .map((x) => ({
        title: x.name1!,
        price: x.price ?? 0,
        from: x.price_prefix === "cheapest",
        shop: (x.shop_text ?? "").replace(/^در\s+/, "").trim(),
        photo: x.image_url ?? "",
        url: `https://torob.com${x.web_client_absolute_url}`,
      }));
  });
  return out ?? [];
}

/** The Torob shop with this store's name (Torob answers a shop's name with its profile). */
export async function torobShop(name: string): Promise<TorobShop | null> {
  const query = name.trim().slice(0, 60);
  if (query.length < 2) return null;
  const out = await cached<{ shop: TorobShop | null }>(`tr:shop:${normName(query)}`, TOROB_TTL, async () => {
    const root = torobBase();
    if (!root) return null;
    const r = await getJson<RawTorob>(`${root}/v4/base-product/search/?q=${encodeURIComponent(query)}&page=0&size=1`);
    if (!r) return null;
    const hit = (r.business_profile_result?.internet_shops ?? []).find((s) => s.name && sameName(s.name, query));
    return { shop: hit ? toShop(hit) : null };
  });
  return out?.shop ?? null;
}

type RawShopDetails = { id?: number; name?: string; logo_512?: string };
/** A shop by its id, from an owner's torob.com/shop/<id>/ link. */
async function torobShopById(id: number): Promise<TorobShop | null> {
  const out = await cached<{ shop: TorobShop | null }>(`tr:shop:#${id}`, TOROB_TTL, async () => {
    const root = torobBase();
    if (!root) return null;
    const r = await getJson<RawShopDetails>(`${root}/v4/internet-shop/details/?id=${id}`);
    if (!r) return null;
    return { shop: r.id && r.name ? toShop({ shop_id: r.id, name: r.name, logo_512: r.logo_512 }) : null };
  });
  return out?.shop ?? null;
}

// ---------------------------------------------------------------- Divar
type RawPlace = { id?: number; name?: string; slug?: string; centroid?: { latitude?: number; longitude?: number }; radius?: number };
type DivarPlace = { id: number; name: string; slug: string; lat: number; lng: number; r: number };
const toPlace = (p: RawPlace): DivarPlace | null =>
  p.id && p.name && typeof p.centroid?.latitude === "number" && typeof p.centroid.longitude === "number"
    ? { id: p.id, name: p.name, slug: p.slug ?? "", lat: p.centroid.latitude, lng: p.centroid.longitude, r: p.radius ?? 0 }
    : null;

/** Divar's cities, with their centre and radius (a week: they hardly change). */
function divarCities() {
  return cached<DivarPlace[]>("dv:cities2", DIVAR_PLACES_TTL, async () => {
    const root = divarBase();
    if (!root) return null;
    const r = await getJson<{ cities?: RawPlace[] }>(`${root}/v8/places/cities`);
    return r?.cities ? r.cities.map(toPlace).filter((c): c is DivarPlace => !!c) : null;
  });
}

/** A city's neighbourhoods (Divar's "districts"), with their centres. */
function divarDistricts(cityId: number) {
  return cached<DivarPlace[]>(`dv:districts:${cityId}`, DIVAR_PLACES_TTL, async () => {
    const root = divarBase();
    if (!root) return null;
    const r = await getJson<{ districts?: RawPlace[] }>(`${root}/v8/places/cities/${cityId}/districts`);
    return r?.districts ? r.districts.map(toPlace).filter((d): d is DivarPlace => !!d) : null;
  });
}

type RawPostRow = {
  widget_type?: string;
  data?: { title?: string; token?: string; image_url?: string; middle_description_text?: string; bottom_description_text?: string; top_description_text?: string; red_text?: string };
};

/** The latest ads in one neighbourhood (or the whole city: `districtId` 0), newest first. */
export async function divarPosts(cityId: number, districtId: number, cat: DivarCat = "all"): Promise<DivarPost[]> {
  const out = await cached<DivarPost[]>(`dv:posts:${cityId}:${districtId}:${cat}`, DIVAR_POSTS_TTL, async () => {
    const root = divarBase();
    if (!root) return null;
    const data = { category: { str: { value: DIVAR_CATS[cat].slug } }, ...(districtId ? { districts: { repeated_string: { value: [String(districtId)] } } } : {}) };
    const r = await getJson<{ list_widgets?: RawPostRow[] }>(`${root}/v8/postlist/w/search`, { city_ids: [String(cityId)], search_data: { form_data: { data } } });
    if (!r?.list_widgets) return null;
    return r.list_widgets
      .filter((w) => w.widget_type === "POST_ROW" && w.data?.token && w.data.title)
      .map((w) => ({
        token: w.data!.token!,
        title: w.data!.title!,
        price: w.data!.middle_description_text ?? "",
        // "Half an hour ago in Tehranpars": Divar's own words, in Persian.
        when: w.data!.bottom_description_text ?? "",
        note: w.data!.red_text || w.data!.top_description_text || "",
        photo: w.data!.image_url ?? "",
        url: `https://divar.ir/v/${encodeURIComponent(w.data!.token!)}`,
      }));
  });
  return out ?? [];
}

/**
 * Divar around a point: the city it's in, the nearest few neighbourhoods (by their
 * centre) and the latest ads in each — what the map pins on each neighbourhood.
 */
export async function divarAround(here: LatLng): Promise<DivarArea[]> {
  const cities = (await divarCities()) ?? [];
  const city = cities
    .map((c) => ({ c, d: distanceM(here, c) }))
    .filter((x) => x.d <= Math.max(x.c.r, 5000) + 5000)
    .sort((a, b) => a.d - b.d)[0]?.c;
  if (!city) return [];
  const list = (await divarDistricts(city.id)) ?? [];
  // Small towns have no neighbourhoods on Divar: the town itself is the one area (id 0).
  if (!list.length) {
    const m = distanceM(here, city);
    if (m > Math.max(city.r, DIVAR_NEAREST_MAX_M)) return [];
    const posts = await divarPosts(city.id, 0).catch(() => []);
    return posts.length ? [{ city: city.id, citySlug: city.slug, id: 0, name: city.name, lat: city.lat, lng: city.lng, distanceM: Math.round(m), posts }] : [];
  }
  const districts = list.map((d) => ({ d, m: distanceM(here, d) })).sort((a, b) => a.m - b.m);
  const near = districts.filter((x, i) => x.m <= DIVAR_NEAR_M || (i === 0 && x.m <= DIVAR_NEAREST_MAX_M)).slice(0, DIVAR_MAX_AREAS);
  const areas = await Promise.all(
    near.map(async ({ d, m }) => ({ city: city.id, citySlug: city.slug, id: d.id, name: d.name, lat: d.lat, lng: d.lng, distanceM: Math.round(m), posts: await divarPosts(city.id, d.id).catch(() => []) })),
  );
  return areas.filter((a) => a.posts.length);
}

// ---------------------------------------------------------------- one store
/** The owner's links in the Business center and Market shop forms (empty = guess from the map). */
export const OwnerLinks = {
  snappfood: z.string().trim().max(300).refine(LINK_CHECKS.snappfood, "Paste your Snappfood menu link (snappfood.ir/…)").default(""),
  torob: z.string().trim().max(300).refine(LINK_CHECKS.torob, "Paste a link to your shop on torob.com").default(""),
  divar: z.string().trim().max(300).refine(LINK_CHECKS.divar, "Paste a link to your ad on divar.ir").default(""),
};

export type StoreInfo = {
  name: string;
  lat: number;
  lng: number;
  cat: string;
  snappfood?: string;
  torob?: string;
  divar?: string;
  website?: string | null;
  phone?: string | null;
  /** From the map (OpenStreetMap tags): Instagram handle, opening hours, address, a photo. */
  instagram?: string;
  hours?: string;
  address?: string | null;
  photo?: string;
};

const siteIcon = (web: string | null | undefined) => {
  try {
    return web ? `${new URL(web).origin}/favicon.ico` : "";
  } catch {
    return "";
  }
};

/** Everything the store card shows from other sites: menu or catalog, Torob listings, links. */
export async function storeData(s: StoreInfo): Promise<StoreData> {
  const owned = s.snappfood ? snappfoodCode(s.snappfood) : null;
  const code = owned ?? (await matchVendor(s).catch(() => null))?.code ?? null;
  const menu = code ? await vendorMenu(code, s).catch(() => null) : null;
  // Torob lists online shops: this store's own shop there (the owner's link, else one with
  // exactly its name) and its catalog; failing that, listings only this store sells.
  const food = isFoodCat(s.cat);
  const tl = s.torob ? torobLink(s.torob) : null;
  const ownShop = tl ? torobShopId(tl) : null;
  const shop = food ? null : await (ownShop ? torobShopById(ownShop) : torobShop(s.name)).catch(() => null);
  const torob = food
    ? []
    : shop
      ? await torobSearch("", shop.id).catch(() => [])
      : (await torobSearch(s.name).catch(() => [])).filter((x) => x.shop && nameScore(x.shop, s.name) >= 1);
  const links: StoreLink[] = [];
  if (menu) links.push({ kind: "snappfood", url: menu.vendor.url, label: t("Order on Snappfood") });
  else if (owned) links.push({ kind: "snappfood", url: `https://snappfood.ir/restaurant/menu/${owned}`, label: t("Order on Snappfood") });
  if (tl || shop) links.push({ kind: "torob", url: tl ?? shop!.url, label: t("Shop on Torob") });
  const dl = s.divar ? divarLink(s.divar) : null;
  if (dl) links.push({ kind: "divar", url: dl, label: t("See the ad on Divar") });
  if (s.website && /^https?:\/\//i.test(s.website)) links.push({ kind: "website", url: s.website, label: t("Website") });
  if (s.instagram) links.push({ kind: "instagram", url: `https://instagram.com/${encodeURIComponent(s.instagram)}`, label: `@${s.instagram}` });
  if (s.phone) links.push({ kind: "phone", url: `tel:${s.phone.replace(/[^\d+]/g, "")}`, label: s.phone });
  const about = {
    photo: menu?.cover || s.photo || shop?.logo || "",
    // Last resort: the store's own website icon.
    logo: menu?.vendor.logo || shop?.logo || siteIcon(s.website) || "",
    address: s.address || menu?.address || "",
    hours: s.hours ?? "",
  };
  return { menu, torob: torob.slice(0, 12), torobQuery: food ? "" : s.name, torobShop: shop, links, about };
}
