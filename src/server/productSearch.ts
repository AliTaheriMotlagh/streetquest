// Product search across the store sites (the rules are lib/productSearch.ts):
//  - food: the dishes Snappfood's own search names (it gives two), then the menus of the
//    vendors it matched and of the restaurants round the player. Menus already in the cache
//    are all read (one query); at most MENUS_PER_SEARCH new ones are fetched per search, the
//    likeliest first — so a search never hammers Snappfood, each one widens what the next
//    finds, and `more` says there are menus left to read (the list offers "look in more");
//  - deals: Takhfifan's deals near the player;
//  - torob / basalam: their own product searches (cached, Torob's spaced out as ever).
// A source that fails is left out and named in `failed`; the others still answer.
import { distanceM, type LatLng } from "@/lib/geo";
import { nameScore, type Menu, type Vendor } from "@/lib/localData";
import { basalamHits, dealHits, filterProducts, LOCAL_SOURCES, menuHits, productSourcesAt, menusToRead, torobHits, type ProductFilter, type ProductHit, type ProductSource } from "@/lib/productSearch";
import { cachedMany, dealsAround, menuKey, snappProducts, torobSearch, vendorMenu, vendorsAround } from "./localData";
import { basalamSearch } from "./storeSites";
import { sourceAt } from "@/lib/region";

/** Restaurants this far round the player are searched (m). */
export const FOOD_RADIUS_M = 3000;
/** The nearest this many vendors' cached menus are read. */
const MENUS_READ = 160;
/**
 * New menus fetched per *fresh* search (new words, or "look in more restaurants") and how long
 * the search waits for them (ms). Changing the price or the order never fetches anything.
 */
export const MENUS_PER_SEARCH = 4;
/**
 * How long a fresh search waits for those menus. Short: a search that hangs is worse than one
 * that shows fewer hits now (the rest arrive on the next search, or via "look in more restaurants").
 */
const MENU_WAIT_MS = 3500;

export type ProductAnswer = { hits: ProductHit[]; total: number; /** Restaurants whose menus were read. */ stores: number; /** More menus could be read: ask again. */ more: boolean; failed: ProductSource[] };

const within = <T>(p: Promise<T>, ms: number, none: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(none), ms))]);

async function foodHits(q: string, here: LatLng, read: boolean): Promise<{ hits: ProductHit[]; stores: number; more: boolean }> {
  const [around, named] = await Promise.all([vendorsAround(here, FOOD_RADIUS_M), q && sourceAt("snappfood", here) ? snappProducts(q, here).catch(() => null) : null]);
  const byCode = new Map(around.map((v) => [v.code, v]));
  // Vendors the search named (near enough to matter) and those whose own name answers it come first.
  const likely = [
    ...(named?.vendors ?? []).filter((c) => byCode.has(c)),
    ...(named?.dishes ?? []).map((d) => d.code).filter((c) => byCode.has(c)),
    ...(q ? around.filter((v) => nameScore(q, v.title) >= 0.5 || v.title.includes(q) || v.about.includes(q)).map((v) => v.code) : []),
  ];
  const codes = menusToRead(likely, around, MENUS_READ);
  const have = await cachedMany<Menu>(codes.map(menuKey));
  const missing = codes.filter((c) => !have.has(menuKey(c)));
  // A few new menus per search, the likeliest first; whatever isn't back in time is found next time.
  const fetched = read
    ? await within(Promise.all(missing.slice(0, MENUS_PER_SEARCH).map((c) => vendorMenu(c, byCode.get(c)).catch(() => null))), MENU_WAIT_MS, [] as (Menu | null)[])
    : [];
  const menus = [...have.values(), ...fetched.filter((m): m is Menu => !!m)];
  const hits: ProductHit[] = [];
  for (const m of menus) {
    // The list knows where the vendor is now; a cached menu may carry an older copy of it.
    const v: Vendor = byCode.get(m.vendor.code) ?? m.vendor;
    if (distanceM(here, v) > FOOD_RADIUS_M * 1.5) continue;
    hits.push(...menuHits({ ...m, vendor: v }, q, here));
  }
  // Snappfood's own two dishes, unless their menu already gave them.
  const seen = new Set(hits.map((h) => `${h.code}:${h.title}`));
  for (const d of named?.dishes ?? []) {
    if (seen.has(`${d.code}:${d.title}`)) continue;
    const v = byCode.get(d.code);
    hits.push({ id: `food:${d.code}:${d.id}`, source: "food", title: d.title, about: d.about || undefined, price: d.price, was: d.was > d.price ? d.was : undefined, photo: d.photo, store: d.store, code: d.code, lat: v?.lat, lng: v?.lng, dist: v ? Math.round(distanceM(here, v)) : undefined, rating: d.rating > 0 ? Math.round(d.rating * 5) / 10 : 0 });
  }
  return { hits, stores: menus.length, more: missing.length > (read ? MENUS_PER_SEARCH : 0) };
}

/**
 * Everything on sale that answers `q` round `here`, filtered and sorted as asked. With no
 * words only the sources that know where their stores are answer ("any food under 150,000").
 */
export async function searchProducts(here: LatLng, f: ProductFilter & { city?: string; /** A fresh search: a few menus not read yet may be fetched. */ read?: boolean }): Promise<ProductAnswer> {
  const q = (f.q ?? "").trim().slice(0, 60);
  // Only the sources that answer here (Iran's in Iran; in Turkey, Yemeksepeti's menus).
  const here_ = productSourcesAt(here);
  const want = (f.sources?.length ? f.sources : here_).filter((s) => here_.includes(s) && (q.length >= 2 || LOCAL_SOURCES.includes(s)));
  const failed: ProductSource[] = [];
  let stores = 0, more = false;
  const run = async (s: ProductSource): Promise<ProductHit[]> => {
    try {
      if (s === "food") {
        const r = await foodHits(q, here, !!f.read);
        (stores = r.stores), (more = r.more);
        return r.hits;
      }
      if (s === "deal") return dealHits(await dealsAround(here), q, here);
      if (s === "torob") return torobHits(await torobSearch(q));
      return basalamHits(await basalamSearch(q, f.city));
    } catch {
      failed.push(s);
      return [];
    }
  };
  const all = (await Promise.all(want.map(run))).flat();
  return { ...filterProducts(all, { ...f, q, sources: want }), stores, more, failed };
}
