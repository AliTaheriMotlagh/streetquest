// Product search across every store the game knows (pure; tests/productSearch.test.ts):
// one list of things to buy — dishes on the menus of the restaurants round you (Snappfood),
// Torob's and Basalam's products, Takhfifan's deals near you — that can be narrowed to a
// price range ("a pizza under 300,000 toman"), to what's discounted, to some sources, and
// sorted by price, distance, rating or how much is off. server/productSearch.ts gathers the
// hits; components/game/ProductSearch.tsx is the list (no map needed).
// Every price is TOMAN.
import { distanceM, type LatLng } from "./geo";
import { msg } from "./i18n";
import { normName, type Deal, type Menu, type TorobItem, type Vendor } from "./localData";
import type { Product as BasalamProduct } from "./stores/directory";

export type ProductSource = "food" | "torob" | "basalam" | "deal";
export const PRODUCT_SOURCES: Record<ProductSource, { emoji: string; label: string; site: string }> = {
  food: { emoji: "🍽️", label: msg("Food near you"), site: msg("Snappfood") },
  deal: { emoji: "🎟️", label: msg("Deals near you"), site: msg("Takhfifan") },
  torob: { emoji: "🏷️", label: msg("Shops' prices"), site: msg("Torob") },
  basalam: { emoji: "🧺", label: msg("Home-made & local"), site: msg("Basalam") },
};
export const PRODUCT_SOURCE_KEYS = Object.keys(PRODUCT_SOURCES) as [ProductSource, ...ProductSource[]];
/** The sources that know where their stores are (they answer without any words typed: "anything under…"). */
export const LOCAL_SOURCES: ProductSource[] = ["food", "deal"];

export type ProductHit = {
  /** Unique in a result: `<source>:<its id>`. */
  id: string;
  source: ProductSource;
  title: string;
  about?: string;
  /** What it costs now (0: the store shows no price). */
  price: number;
  /** Its price before the discount, when it has one. */
  was?: number;
  /** The cheapest of several shops ("from …"). */
  from?: boolean;
  photo: string;
  /** Who sells it. */
  store: string;
  /** A Snappfood vendor's code: its menu opens in the game. */
  code?: string;
  lat?: number;
  lng?: number;
  /** Metres from the player (stores with a known spot). */
  dist?: number;
  /** The store's rating, 0…5 (0: none). */
  rating?: number;
  /** Its page on its own site. */
  url?: string;
};

export type ProductSort = "match" | "cheap" | "dear" | "near" | "rating" | "off";
export const PRODUCT_SORTS: Record<ProductSort, string> = {
  match: msg("Best match"),
  cheap: msg("Cheapest first"),
  dear: msg("Most expensive first"),
  near: msg("Nearest first"),
  rating: msg("Best rated"),
  off: msg("Biggest discount"),
};
export const PRODUCT_SORT_KEYS = Object.keys(PRODUCT_SORTS) as [ProductSort, ...ProductSort[]];
export type ProductFilter = { q?: string; min?: number; max?: number; sort?: ProductSort; sources?: ProductSource[]; onlyOff?: boolean; limit?: number };
/** At most this many rows go to the player at once. */
export const PRODUCT_LIMIT = 300;

/** % off (0 when it isn't discounted). */
export const offOf = (h: { price: number; was?: number }) => (h.was && h.price > 0 && h.was > h.price ? Math.round((1 - h.price / h.was) * 100) : 0);

/**
 * How well a product answers the words typed: 0 its name starts with them, 1 a word of
 * its name does, 2 they're somewhere in the name, 3 only in its description; -1 not at
 * all. Every word typed has to be there ("پیتزا پپرونی"). No words: 0. The store's name
 * never counts: the ketchup at "Tele Pizza" isn't a pizza.
 */
export function productRank(title: string, q: string, about = ""): number {
  const nq = normName(q);
  if (!nq) return 0;
  const name = normName(title), tight = name.replace(/ /g, ""), qt = nq.replace(/ /g, "");
  if (name.startsWith(nq) || tight.startsWith(qt)) return 0;
  const words = nq.split(" "), nameWords = name.split(" ");
  if (words.every((w) => nameWords.some((n) => n.startsWith(w)))) return 1;
  if (words.every((w) => name.includes(w)) || tight.includes(qt)) return 2;
  const rest = `${name} ${normName(about)}`;
  return words.every((w) => rest.includes(w)) ? 3 : -1;
}

type Ranked = ProductHit & { rank: number };
const withRank = (h: ProductHit, q: string): Ranked | null => {
  const rank = productRank(h.title, q, h.about);
  return rank < 0 ? null : { ...h, rank };
};

/** "پیتزا مارگاریتا پیتزا مارگاریتا" → "پیتزا مارگاریتا": some menus write a dish's name twice. */
export function onceTitle(s: string) {
  const w = s.trim().split(/\s+/);
  if (w.length >= 2 && w.length % 2 === 0 && w.slice(0, w.length / 2).join(" ") === w.slice(w.length / 2).join(" ")) return w.slice(0, w.length / 2).join(" ");
  return s.trim();
}

/** The dishes (or groceries) on one vendor's menu that answer `q`, each once. */
export function menuHits(menu: Menu, q: string, here?: LatLng | null): ProductHit[] {
  const v: Vendor = menu.vendor;
  const dist = here ? Math.round(distanceM(here, v)) : undefined;
  const seen = new Set<string>();
  const out: ProductHit[] = [];
  for (const s of menu.sections)
    for (const i of s.items) {
      if (!i.title || seen.has(i.id) || productRank(i.title, q, i.about) < 0) continue;
      seen.add(i.id);
      const now = i.priceNow > 0 && i.priceNow < i.price ? i.priceNow : i.price;
      out.push({
        id: `food:${v.code}:${i.id}`, source: "food", title: onceTitle(i.title), about: i.about || undefined, price: now, was: now < i.price ? i.price : undefined,
        photo: i.photo || i.image || "", store: v.title, code: v.code, lat: v.lat, lng: v.lng, dist, rating: v.rating > 0 ? Math.round(v.rating * 5) / 10 : 0, url: v.url || undefined,
      });
    }
  return out;
}

/** Takhfifan's deals near you whose name (or store) answers `q`. */
export function dealHits(deals: Deal[], q: string, here?: LatLng | null): ProductHit[] {
  const out: ProductHit[] = [];
  for (const d of deals)
    for (const i of d.items) {
      if (!i.name || productRank(i.name, q, d.category) < 0) continue;
      out.push({
        id: `deal:${d.id}:${i.id}`, source: "deal", title: i.name, about: d.category || undefined, price: i.price, was: i.retail > i.price ? i.retail : undefined,
        photo: i.photo || d.photos[0] || "", store: d.name, lat: d.lat, lng: d.lng, dist: here ? Math.round(distanceM(here, d)) : undefined, rating: d.rating > 0 ? d.rating : 0, url: d.url,
      });
    }
  return out;
}

export const torobHits = (items: TorobItem[]): ProductHit[] =>
  items.map((i) => ({ id: `torob:${i.url}`, source: "torob" as const, title: i.title, price: i.price, from: i.from || undefined, photo: i.photo, store: i.shop, url: i.url }));

export const basalamHits = (items: BasalamProduct[]): ProductHit[] =>
  items.map((p) => ({ id: `basalam:${p.id}`, source: "basalam" as const, title: p.name, about: p.city || undefined, price: p.price, photo: p.img, store: p.seller, rating: p.rating > 0 ? p.rating : 0, url: p.url }));

/**
 * The hits a player asked for, in the order they asked: those answering the words, inside
 * the price range (an unpriced one never passes a price filter), from the chosen sources,
 * discounted only if so asked — each once. A product that only mentions the words in its
 * description is listed (last) by best match, and otherwise only when no name has them:
 * "cheapest pizza" mustn't open with garlic bread "for your pizza". Unpriced products sort
 * after priced ones by price, stores with no known spot after those with one by distance.
 * `total`: how many passed before the list was cut to `limit`.
 */
export function filterProducts(hits: ProductHit[], f: ProductFilter = {}): { hits: ProductHit[]; total: number } {
  const q = f.q ?? "", sort = f.sort ?? "match";
  const src = f.sources?.length ? new Set(f.sources) : null;
  const min = f.min && f.min > 0 ? f.min : 0, max = f.max && f.max > 0 ? f.max : 0;
  const seen = new Set<string>();
  let list: Ranked[] = [];
  for (const h of hits) {
    if (seen.has(h.id) || (src && !src.has(h.source))) continue;
    if ((min || max) && (h.price <= 0 || h.price < min || (max && h.price > max))) continue;
    if (f.onlyOff && !offOf(h)) continue;
    const r = withRank(h, q);
    if (!r) continue;
    seen.add(h.id);
    list.push(r);
  }
  if (sort !== "match" && list.some((h) => h.rank <= 2)) list = list.filter((h) => h.rank <= 2);
  const priced = (h: ProductHit) => (h.price > 0 ? 0 : 1);
  const far = (h: ProductHit) => h.dist ?? Infinity;
  const by: Record<ProductSort, (a: Ranked, b: Ranked) => number> = {
    match: (a, b) => a.rank - b.rank || far(a) - far(b) || priced(a) - priced(b) || a.price - b.price,
    cheap: (a, b) => priced(a) - priced(b) || a.price - b.price || a.rank - b.rank || far(a) - far(b),
    dear: (a, b) => priced(a) - priced(b) || b.price - a.price || a.rank - b.rank,
    near: (a, b) => far(a) - far(b) || a.rank - b.rank || a.price - b.price,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.rank - b.rank || far(a) - far(b),
    off: (a, b) => offOf(b) - offOf(a) || a.rank - b.rank || a.price - b.price,
  };
  list.sort(by[sort]);
  if (sort === "match") list = spreadStores(list);
  return { hits: list.slice(0, f.limit ?? PRODUCT_LIMIT).map(({ rank: _rank, ...h }) => h), total: list.length };
}

/**
 * Best match shouldn't be one shop's whole menu: browsing with nothing typed, every dish of
 * the nearest restaurant ties with the next. Within each match tier, each store gets its
 * first `per` items in before any store gets more; the order is otherwise kept.
 */
export function spreadStores<T extends { store: string; rank: number }>(list: T[], per = 2): T[] {
  const seen = new Map<string, number>();
  return list
    .map((h, i) => {
      const k = `${h.rank}|${h.store}`, n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { h, i, round: Math.floor(n / per) };
    })
    .sort((a, b) => a.h.rank - b.h.rank || a.round - b.round || a.i - b.i)
    .map((x) => x.h);
}

/**
 * Round price caps worth offering as one-tap filters for these hits ("under 200,000"): up
 * to four, between the cheapest and the dearest, each leaving something out and something in.
 */
export function priceSteps(hits: ProductHit[]): number[] {
  const prices = hits.map((h) => h.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (prices.length < 4) return [];
  const nice = (n: number) => {
    const mag = 10 ** Math.floor(Math.log10(n));
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => s * mag >= n) ?? 10;
    return Math.round(step * mag);
  };
  const out: number[] = [];
  for (const share of [0.25, 0.5, 0.75, 0.9]) {
    const cap = nice(prices[Math.min(prices.length - 1, Math.floor(prices.length * share))]);
    const under = prices.filter((p) => p <= cap).length;
    if (!out.includes(cap) && under > 0 && under < prices.length) out.push(cap);
  }
  return out;
}

/** Which menus to read for a food search, best first: the ones a search named, then the nearest. */
export function menusToRead(named: string[], around: { code: string }[], max: number): string[] {
  return [...new Set([...named, ...around.map((v) => v.code)])].slice(0, max);
}
