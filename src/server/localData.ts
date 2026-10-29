// What other sites know about a real store: Snappfood menus and catalogs (restaurants,
// cafés, bakeries, supermarkets — with their real position, so they go on the map), their
// hours and reviews, Torob listings and prices, Torob's walk-in stores (on the map, each
// with its own catalog), and the latest Divar ads in each neighbourhood. None has an
// official public API, so this stays polite:
//  - everything is cached in ExtCache (vendors per ~1 km cell and name searches for 12 h,
//    a menu for 6 h, reviews for an hour, a Torob search or shop for 12 h, the walk-in
//    store map for a day, Divar's neighbourhoods for a week and their ads for 15 min), so
//    a busy map costs them one request per area;
//  - each key is fetched once at a time (deduped per instance, at most three requests at
//    once, honest User-Agent), and a failed refresh serves the stale copy;
//  - SNAPPFOOD_URL / TOROB_URL / DIVAR_URL point at the sites ("off" disables them — the
//    e2e tests point them at a local stub instead).
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import {
  DIVAR_CATS, divarLink, isFoodCat, LINK_CHECKS, nameScore, normName, rialToToman, sameName, sellsOnSnappfood, snappfoodCode, torobLink, torobShopId, vendorKind, weekFromOsm, weekFromSnappfood, weekFromTorob,
  type DivarArea, type DivarCat, type DivarPost, type Menu, type Review, type ReviewPage, type StoreData, type StoreLink, type TorobItem, type TorobPlace, type TorobPlaceInfo, type TorobShop, type Vendor,
} from "../lib/localData";
import { t } from "../lib/i18n";

const base = (env: string | undefined, fallback: string) => (env === "off" ? null : (env || fallback).replace(/\/$/, ""));
const snappBase = () => base(process.env.SNAPPFOOD_URL, "https://snappfood.ir");
const torobBase = () => base(process.env.TOROB_URL, "https://api.torob.com");
const divarBase = () => base(process.env.DIVAR_URL, "https://api.divar.ir");

const HOUR = 3600_000;
const VENDORS_TTL = 12 * HOUR;
const MENU_TTL = 6 * HOUR;
const REVIEWS_TTL = HOUR;
const TOROB_TTL = 12 * HOUR;
/** Torob's walk-in store map is rebuilt once a day (an hour after a failed try). */
const TOROB_MAP_TTL = 24 * HOUR;
/** …and kept per cell of this many degrees (~2 km), so an area reads a handful of rows. */
const TOROB_CELL = 0.02;
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
const SNAPP_CLIENT = "optionalClient=WEBSITE&client=WEBSITE&deviceType=WEBSITE&appVersion=8.1.1";
const snappQuery = (at: LatLng) => `lat=${at.lat.toFixed(6)}&long=${at.lng.toFixed(6)}&${SNAPP_CLIENT}`;

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
type RawStars = { one?: number; two?: number; three?: number; four?: number; five?: number };
type RawMenu = {
  data?: {
    vendor?: RawVendor & {
      coverPath?: string;
      address?: string;
      schedules?: { weekday?: number; allDay?: boolean; startHour?: string; stopHour?: string }[];
      customerPhone?: string;
      area?: string;
      commentCount?: number;
      reviewStars?: RawStars;
      minOrder?: number;
      deliveryFee?: number;
    };
    menus?: { category?: string; products?: RawProduct[] }[];
  };
};
const phoneOf = (s: string | undefined) => (s && /^[\d+\-\s()]{5,20}$/.test(s.trim()) ? s.trim() : "");

/** A vendor's menu (restaurants) or catalog (supermarkets, bakeries…), prices in toman. */
export function vendorMenu(code: string, near?: LatLng): Promise<Menu | null> {
  // "menu2": menus cached before hours, phone and review counts were read are fetched afresh.
  return cached<Menu>(`sf:menu2:${code}`, MENU_TTL, async () => {
    const root = snappBase();
    if (!root) return null;
    const at = near ?? { lat: 35.6997, lng: 51.338 };
    const r = await getJson<RawMenu>(`${root}/mobile/v2/restaurant/details/dynamic?${snappQuery(at)}&UDID=streetquest&vendorCode=${encodeURIComponent(code)}&show_party=1&fetch-static-data=1`);
    const v = r?.data?.vendor ? toVendor({ ...r.data.vendor, vendorCode: r.data.vendor.vendorCode ?? code }) : null;
    if (!v || !r?.data) return null;
    const raw = r.data.vendor!;
    const st = raw.reviewStars;
    return {
      vendor: v,
      cover: raw.coverPath ?? "",
      address: raw.address ?? "",
      week: weekFromSnappfood(raw.schedules),
      phone: phoneOf(raw.customerPhone),
      area: (raw.area ?? "").trim(),
      reviews: raw.commentCount ?? 0,
      ...(st ? { stars: [st.one ?? 0, st.two ?? 0, st.three ?? 0, st.four ?? 0, st.five ?? 0] } : {}),
      ...(raw.minOrder ? { minOrder: rialToToman(raw.minOrder) } : {}),
      ...(raw.deliveryFee != null ? { deliveryFee: rialToToman(raw.deliveryFee) } : {}),
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

type RawComment = { commentId?: number; sender?: string; date?: string; rate?: number; commentText?: string; foods?: { title?: string }[]; replies?: { commentText?: string; text?: string }[] };
/** Snappfood rates 1–10; the card shows 1–5 stars. */
const starsOf = (rate: number | undefined) => Math.max(1, Math.min(5, Math.round((rate ?? 10) / 2)));

/** A vendor's reviews, newest first, ten to a page (with how many there are in all). */
export function vendorReviews(code: string, page = 0): Promise<ReviewPage | null> {
  return cached<ReviewPage>(`sf:rev:${code}:${page}`, REVIEWS_TTL, async () => {
    const root = snappBase();
    if (!root) return null;
    const r = await getJson<{ data?: { count?: number; comments?: RawComment[] } }>(`${root}/mobile/v1/restaurant/vendor-comment?vendorCode=${encodeURIComponent(code)}&page=${page}&${SNAPP_CLIENT}`);
    if (!r?.data) return null;
    const reviews: Review[] = (r.data.comments ?? []).map((c, i) => ({
      id: String(c.commentId ?? `${page}-${i}`),
      who: (c.sender ?? "").trim().slice(0, 40),
      date: c.date ?? "",
      rate: starsOf(c.rate),
      text: (c.commentText ?? "").trim().slice(0, 600),
      foods: (c.foods ?? []).map((f) => f.title?.trim() ?? "").filter(Boolean).slice(0, 6),
      reply: (c.replies?.[0]?.commentText ?? c.replies?.[0]?.text ?? "").trim().slice(0, 600),
    }));
    return { count: r.data.count ?? reviews.length, reviews };
  });
}

// ---------------------------------------------------------------- Torob
type RawShop = { shop_id?: number; name?: string; logo_512?: string; num_bases?: number };
type RawTorob = {
  results?: { name1?: string; price?: number; price_prefix?: string; shop_text?: string; image_url?: string; web_client_absolute_url?: string; random_key?: string }[];
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

type RawShopDetails = { id?: number; name?: string; logo_512?: string; shop_logo?: string; address?: string; phone?: string; second_phone?: string; city?: string; shop_images?: string[] };
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

/** A walk-in Torob shop's own page: full address, phone, logo and photos of the store. */
export async function torobPlaceInfo(id: number): Promise<TorobPlaceInfo | null> {
  const out = await cached<{ info: TorobPlaceInfo | null }>(`tr:info:${id}`, TOROB_TTL, async () => {
    const root = torobBase();
    if (!root) return null;
    const r = await getJson<RawShopDetails>(`${root}/v4/internet-shop/details/?id=${id}`);
    if (!r) return null;
    if (!r.id || !r.name) return { info: null };
    return {
      info: {
        id: r.id,
        name: r.name,
        logo: r.logo_512 || r.shop_logo || "",
        photos: (r.shop_images ?? []).filter((u) => /^https:\/\//.test(u)).slice(0, 6),
        address: (r.address ?? "").trim(),
        phone: phoneOf(r.phone) || phoneOf(r.second_phone),
        city: (r.city ?? "").trim(),
        url: `https://torob.com/shop/${r.id}/`,
      },
    };
  });
  return out?.info ?? null;
}

/**
 * Torob's map of walk-in sellers is per product, so the map of stores is built from a
 * couple of listings of everyday products that, between them, reach most kinds of
 * store: phones and accessories, computers, appliances, perfume and beauty, shoes,
 * watches, books, toys, tools, tyres and bikes. Each tag is what the store was seen selling.
 */
const TOROB_SEEDS: { q: string; tag: string }[] = [
  { q: "گوشی موبایل", tag: "📱" }, { q: "قاب گوشی", tag: "📱" }, { q: "لپ تاپ", tag: "💻" }, { q: "هندزفری بلوتوث", tag: "🎧" },
  { q: "تلویزیون", tag: "📺" }, { q: "یخچال", tag: "🧊" }, { q: "جاروبرقی", tag: "🔌" }, { q: "عطر", tag: "🌸" },
  { q: "کرم ضد آفتاب", tag: "💄" }, { q: "کفش ورزشی", tag: "👟" }, { q: "ساعت مچی", tag: "⌚" }, { q: "کتاب", tag: "📚" },
  { q: "اسباب بازی", tag: "🧸" }, { q: "دریل", tag: "🔧" }, { q: "لاستیک خودرو", tag: "🚗" }, { q: "دوچرخه", tag: "🚲" },
];
const LISTINGS_PER_SEED = 2;
const MAX_TOROB_PLACES = 60_000;
type RawMapSeller = { shop_id?: number; shop_name?: string; shop_name2?: string; name1?: string; location?: { lat?: number; lon?: number }; media?: { url?: string }[]; working_hours?: { schedule?: { text?: string }[] } };
const torobCell = (lat: number, lng: number) => `${Math.floor(lat / TOROB_CELL)}:${Math.floor(lng / TOROB_CELL)}`;

/** The map's walk-in sellers of every seed product, merged per shop: Map<shop id, place>. */
export async function collectTorobPlaces(): Promise<Map<number, TorobPlace> | null> {
  const root = torobBase();
  if (!root) return null;
  const places = new Map<number, TorobPlace>();
  let answered = 0;
  for (const seed of TOROB_SEEDS) {
    const r = await getJson<RawTorob>(`${root}/v4/base-product/search/?q=${encodeURIComponent(seed.q)}&shop_type=offline&page=0&size=${LISTINGS_PER_SEED * 2}`);
    const keys = (r?.results ?? []).map((x) => x.random_key).filter((k): k is string => !!k).slice(0, LISTINGS_PER_SEED);
    const maps = await Promise.all(keys.map((k) => getJson<{ result?: RawMapSeller[] }>(`${root}/v4/base-product/map/sellers/?prk=${encodeURIComponent(k)}`)));
    for (const m of maps) {
      if (m) answered++;
      for (const s of m?.result ?? []) {
        const lat = Number(s.location?.lat), lng = Number(s.location?.lon);
        if (!s.shop_id || !s.shop_name || !Number.isFinite(lat) || !Number.isFinite(lng) || places.size >= MAX_TOROB_PLACES) continue;
        const had = places.get(s.shop_id);
        if (had) {
          if (!had.sells.includes(seed.tag)) had.sells.push(seed.tag);
          continue;
        }
        places.set(s.shop_id, {
          id: s.shop_id,
          name: s.shop_name.trim().slice(0, 60),
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
          city: (s.shop_name2 ?? "").trim(),
          // Torob cuts the address short on its map ("…"); the shop's page has all of it.
          address: (s.name1 ?? "").replace(/\.{2,}$|…$/, "").trim(),
          photo: s.media?.find((x) => x.url && /^https:\/\//.test(x.url))?.url ?? "",
          week: weekFromTorob(s.working_hours?.schedule),
          sells: [seed.tag],
        });
      }
    }
  }
  return answered ? places : null;
}

const TOROB_META = "tr:map:meta";
let torobBuild: Promise<void> | null = null;
/** Rebuild the walk-in store map: every place, kept per ~2 km cell (one ExtCache row each). */
async function buildTorobMap() {
  const places = await collectTorobPlaces().catch(() => null);
  if (!places) {
    // Failed: remember it, so the next try is in an hour instead of on every request.
    const data = { ok: false, places: 0 } as Prisma.InputJsonValue;
    await prisma.extCache.upsert({ where: { key: TOROB_META }, create: { key: TOROB_META, data }, update: { data, fetchedAt: new Date() } });
    return;
  }
  const cells = new Map<string, TorobPlace[]>();
  for (const p of places.values()) {
    const k = torobCell(p.lat, p.lng);
    const list = cells.get(k);
    if (list) list.push(p);
    else cells.set(k, [p]);
  }
  const meta = { ok: true, places: places.size, cells: cells.size } as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.extCache.deleteMany({ where: { key: { startsWith: "tr:map:c:" } } }),
    prisma.extCache.createMany({ data: [...cells].map(([k, list]) => ({ key: `tr:map:c:${k}`, data: list as unknown as Prisma.InputJsonValue })) }),
    prisma.extCache.upsert({ where: { key: TOROB_META }, create: { key: TOROB_META, data: meta }, update: { data: meta, fetchedAt: new Date() } }),
  ]);
}

/**
 * The map is current: rebuilt in the background once a day. Only the very first build
 * (no map yet) is waited for, and only so long — the card shows what there is meanwhile.
 */
async function freshTorobMap() {
  const meta = await prisma.extCache.findUnique({ where: { key: TOROB_META } });
  const ok = (meta?.data as { ok?: boolean } | undefined)?.ok;
  if (meta && Date.now() - meta.fetchedAt.getTime() < (ok ? TOROB_MAP_TTL : HOUR)) return;
  torobBuild ??= buildTorobMap()
    .catch(() => {})
    .finally(() => (torobBuild = null));
  if (!meta) await Promise.race([torobBuild, new Promise((r) => setTimeout(r, 25_000))]);
}

/** Walk-in Torob stores around a point, nearest first; `pending` while the very first map is still being built. */
export async function torobPlacesAround(here: LatLng, radiusM = 4000): Promise<{ shops: TorobPlace[]; pending: boolean }> {
  if (!torobBase()) return { shops: [], pending: false };
  await freshTorobMap();
  const pending = !!torobBuild && !(await prisma.extCache.findUnique({ where: { key: TOROB_META } }));
  const reach = Math.ceil(radiusM / (TOROB_CELL * 111_000)) + 1;
  const cy = Math.floor(here.lat / TOROB_CELL), cx = Math.floor(here.lng / TOROB_CELL);
  const keys: string[] = [];
  for (let y = cy - reach; y <= cy + reach; y++) for (let x = cx - reach; x <= cx + reach; x++) keys.push(`tr:map:c:${y}:${x}`);
  const rows = await prisma.extCache.findMany({ where: { key: { in: keys } } });
  const shops = rows
    .flatMap((r) => r.data as unknown as TorobPlace[])
    .map((p) => ({ p, d: distanceM(here, p) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.p);
  return { shops, pending };
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
  const phone = s.phone || menu?.phone || "";
  if (phone) links.push({ kind: "phone", url: `tel:${phone.replace(/[^\d+]/g, "")}`, label: phone });
  const about = {
    photo: menu?.cover || s.photo || shop?.logo || "",
    // Last resort: the store's own website icon.
    logo: menu?.vendor.logo || shop?.logo || siteIcon(s.website) || "",
    address: s.address || menu?.address || "",
    hours: s.hours ?? "",
    // The map's hours when they read as a week, else Snappfood's schedule.
    week: weekFromOsm(s.hours) ?? menu?.week ?? null,
    phone,
  };
  return { menu, torob: torob.slice(0, 12), torobQuery: food ? "" : s.name, torobShop: shop, links, about };
}

// ---------------------------------------------------------------- reachability
/**
 * Can this server reach each site (for /api/health?ext=1)? Iranian sites often refuse
 * foreign servers, and foreign ones may block Iran — a deployment's region decides which
 * of the store layers can work at all.
 */
export async function extHealth() {
  const probe = async (url: string | null) => {
    if (!url) return { ok: false, status: "off" };
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": "StreetQuest/1.0 health", accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      return { ok: res.ok, status: String(res.status), ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, status: (e as Error).name, ms: Date.now() - t0 };
    }
  };
  const sf = snappBase(), tr = torobBase(), dv = divarBase();
  const [snappfood, torob, divar] = await Promise.all([
    probe(sf && `${sf}/mobile/v3/restaurant/vendors-list?${snappQuery({ lat: 35.6997, lng: 51.338 })}&page=0&page_size=1`),
    probe(tr && `${tr}/v4/base-product/search/?q=test&page=0&size=1`),
    probe(dv && `${dv}/v8/places/cities`),
  ]);
  return { snappfood, torob, divar };
}
