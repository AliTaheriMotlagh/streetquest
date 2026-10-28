// What other sites know about a real store: Snappfood menus and catalogs (restaurants,
// cafés, bakeries, supermarkets — with their real position, so they go on the map) and
// Torob listings and prices. Neither has an official public API, so this stays polite:
//  - everything is cached in ExtCache (vendors per ~1 km cell for 12 h, a menu for 6 h,
//    a Torob search for 12 h), so a busy map costs them one request per area;
//  - each key is fetched once at a time (deduped per instance, at most three requests at
//    once, honest User-Agent), and a failed refresh serves the stale copy;
//  - SNAPPFOOD_URL / TOROB_URL point at the sites ("off" disables them — the e2e tests
//    point them at a local stub instead).
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import {
  divarLink, isFoodCat, LINK_CHECKS, nameScore, rialToToman, snappfoodCode, torobLink, vendorKind,
  type Menu, type StoreData, type StoreLink, type TorobItem, type Vendor,
} from "../lib/localData";
import { t } from "../lib/i18n";

const base = (env: string | undefined, fallback: string) => (env === "off" ? null : (env || fallback).replace(/\/$/, ""));
const snappBase = () => base(process.env.SNAPPFOOD_URL, "https://snappfood.ir");
const torobBase = () => base(process.env.TOROB_URL, "https://api.torob.com");

const HOUR = 3600_000;
const VENDORS_TTL = 12 * HOUR;
const MENU_TTL = 6 * HOUR;
const TOROB_TTL = 12 * HOUR;
/** Vendor lists are cached per cell of this many degrees (~1 km). */
const CELL = 0.01;
/** Pages of 30 vendors read per cell: the list is every vendor delivering there, nearest not first. */
const PAGES = 3;
/** A store and a Snappfood vendor this close, with a similar name, are the same place. */
const MATCH_M = 120;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PARALLEL = 3;

let running = 0;
const queue: (() => void)[] = [];
async function getJson<T>(url: string): Promise<T | null> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
  running++;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const ua = `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;
    const res = await fetch(url, { headers: { "user-agent": ua, accept: "application/json" }, signal: ctl.signal });
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

/** Every Snappfood vendor the first pages list for a cell (it lists vendors delivering there). */
function vendorsInCell(c: { x: number; y: number }) {
  return cached<Vendor[]>(`sf:cell:${c.y}:${c.x}`, VENDORS_TTL, async () => {
    const root = snappBase();
    if (!root) return null;
    const at = { lat: c.y * CELL, lng: c.x * CELL };
    const pages = await Promise.all(
      Array.from({ length: PAGES }, (_, page) =>
        getJson<{ data?: { finalResult?: { type: string; data: RawVendor }[] } }>(`${root}/mobile/v3/restaurant/vendors-list?${snappQuery(at)}&page=${page}&page_size=30`),
      ),
    );
    if (pages.every((p) => !p?.data)) return null;
    const out = new Map<string, Vendor>();
    for (const p of pages) for (const r of p?.data?.finalResult ?? []) if (r.type === "VENDOR") {
      const v = toVendor(r.data);
      if (v) out.set(v.code, v);
    }
    return [...out.values()];
  });
}

/** Snappfood vendors around a point, nearest first (for the map layer). */
export async function vendorsAround(here: LatLng, radiusM = 1500): Promise<Vendor[]> {
  const list = (await vendorsInCell(cellOf(here))) ?? [];
  return list
    .map((v) => ({ v, d: distanceM(here, v) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.v);
}

/** The Snappfood vendor that is this store: right next to it, with a similar name. */
export async function matchVendor(store: { name: string; lat: number; lng: number }): Promise<Vendor | null> {
  const list = (await vendorsInCell(cellOf(store))) ?? [];
  let best: { v: Vendor; score: number } | null = null;
  for (const v of list) {
    const d = distanceM(store, v);
    if (d > MATCH_M) continue;
    // Next door needs a clear name match; right on top of it, half the name is enough.
    const score = nameScore(store.name, v.title) - (d > 40 ? 0.15 : 0);
    if (score >= 0.5 && (!best || score > best.score)) best = { v, score };
  }
  return best?.v ?? null;
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
type RawTorob = { results?: { name1?: string; price?: number; shop_text?: string; image_url?: string; web_client_absolute_url?: string }[] };

/** Torob's listings for a search, cheapest-first is left to the client. Prices are toman. */
export async function torobSearch(q: string): Promise<TorobItem[]> {
  const query = q.trim().slice(0, 60);
  if (query.length < 2) return [];
  const out = await cached<TorobItem[]>(`tr:${query.toLowerCase()}`, TOROB_TTL, async () => {
    const root = torobBase();
    if (!root) return null;
    const r = await getJson<RawTorob>(`${root}/v4/base-product/search/?q=${encodeURIComponent(query)}&page=0&size=24`);
    if (!r?.results) return null;
    return r.results
      .filter((x) => x.name1 && x.web_client_absolute_url)
      .map((x) => ({
        title: x.name1!,
        price: x.price ?? 0,
        shop: (x.shop_text ?? "").replace(/^در\s+/, "").trim(),
        photo: x.image_url ?? "",
        url: `https://torob.com${x.web_client_absolute_url}`,
      }));
  });
  return out ?? [];
}

// ---------------------------------------------------------------- one store
/** The owner's links in the Business center and Market shop forms (empty = guess from the map). */
export const OwnerLinks = {
  snappfood: z.string().trim().max(300).refine(LINK_CHECKS.snappfood, "Paste your Snappfood menu link (snappfood.ir/…)").default(""),
  torob: z.string().trim().max(300).refine(LINK_CHECKS.torob, "Paste a link to your shop on torob.com").default(""),
  divar: z.string().trim().max(300).refine(LINK_CHECKS.divar, "Paste a link to your ad on divar.ir").default(""),
};

export type StoreInfo = { name: string; lat: number; lng: number; cat: string; snappfood?: string; torob?: string; divar?: string; website?: string; phone?: string };

/** Everything the store card shows from other sites: menu or catalog, Torob listings, links. */
export async function storeData(s: StoreInfo): Promise<StoreData> {
  const owned = s.snappfood ? snappfoodCode(s.snappfood) : null;
  const code = owned ?? (await matchVendor(s).catch(() => null))?.code ?? null;
  const menu = code ? await vendorMenu(code, s).catch(() => null) : null;
  // Torob lists online shops: show this store's own listings when it sells there (every word of the name matches).
  const food = isFoodCat(s.cat);
  const torob = food ? [] : (await torobSearch(s.name).catch(() => [])).filter((x) => x.shop && nameScore(x.shop, s.name) >= 1);
  const links: StoreLink[] = [];
  if (menu) links.push({ kind: "snappfood", url: menu.vendor.url, label: t("Order on Snappfood") });
  else if (owned) links.push({ kind: "snappfood", url: `https://snappfood.ir/restaurant/menu/${owned}`, label: t("Order on Snappfood") });
  const tl = s.torob ? torobLink(s.torob) : null;
  if (tl) links.push({ kind: "torob", url: tl, label: t("Shop on Torob") });
  const dl = s.divar ? divarLink(s.divar) : null;
  if (dl) links.push({ kind: "divar", url: dl, label: t("See the ad on Divar") });
  if (s.website && /^https?:\/\//i.test(s.website)) links.push({ kind: "website", url: s.website, label: t("Website") });
  if (s.phone) links.push({ kind: "phone", url: `tel:${s.phone.replace(/[^\d+]/g, "")}`, label: s.phone });
  return { menu, torob: torob.slice(0, 12), torobQuery: food ? "" : s.name, links };
}
