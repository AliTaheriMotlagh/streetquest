// Product search across every store the game knows (pure; tests/productSearch.test.ts):
// one list of things to buy — dishes on the menus of the restaurants round you (Snappfood),
// Torob's and Basalam's products, Takhfifan's deals near you — that can be narrowed to a
// price range ("a pizza under 300,000 toman"), to what's discounted, to some sources, and
// sorted by price, distance, rating or how much is off. server/productSearch.ts gathers the
// hits; components/game/ProductSearch.tsx is the list (no map needed).
// Every price is TOMAN.
import { distanceM, type LatLng } from "./geo";
import { msg } from "./i18n";
import { deliveryAt, sourceAt } from "./region";
import { normName, type Deal, type Menu, type TorobItem, type Vendor } from "./localData";
import type { Product as BasalamProduct } from "./stores/directory";
import { alternatives, nearWord } from "./search/query";

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
/** The sources that answer at a point: food is Snappfood in Iran and Yemeksepeti in Turkey; the rest are Iran's. */
export const productSourcesAt = (at: LatLng | null | undefined): ProductSource[] =>
  PRODUCT_SOURCE_KEYS.filter((s) => (s === "food" ? !!deliveryAt(at) : sourceAt(s === "deal" ? "takhfifan" : s, at)));

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
  /** Prices are toman unless this says lira (a Yemeksepeti menu, in Turkey). */
  currency?: "TRY";
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
export type ProductFilter = {
  q?: string; min?: number; max?: number; sort?: ProductSort; sources?: ProductSource[]; onlyOff?: boolean; limit?: number;
  /** Stores rated at least this (0…5). */
  minRating?: number;
  /** Stores at most this far (m); hits with no known spot are left out once it's set. */
  maxDist?: number;
};
/**
 * The key a search's gathered hits are remembered under (server/productSearch.ts): the words (case
 * and spacing folded), the sources asked, and the spot to ~11 m (4 decimals) — near enough that the
 * distances shown stay right, so the same player asking again is answered from memory.
 */
export const gatherKey = (at: LatLng, q: string, sources: readonly ProductSource[], city?: string) =>
  `${q.trim().replace(/\s+/g, " ").toLowerCase()}|${[...sources].sort().join(",")}|${at.lat.toFixed(4)},${at.lng.toFixed(4)}|${city ?? ""}`;

/** At most this many rows go to the player at once. */
export const PRODUCT_LIMIT = 300;

/** % off (0 when it isn't discounted). */
export const offOf = (h: { price: number; was?: number }) => (h.was && h.price > 0 && h.was > h.price ? Math.round((1 - h.price / h.was) * 100) : 0);

/**
 * How well a product answers the words typed: 0 its name starts with them, 1 a word of
 * its name does, 2 they're somewhere in the name, 3 only in its description, 4 its name has
 * them with a typo ("piza"); -1 not at all. Every word typed has to be there ("پیتزا پپرونی").
 * The words also match in the other languages (pizza = پیتزا, kebap = کباب: search/query.ts).
 * No words: 0. The store's name never counts: the ketchup at "Tele Pizza" isn't a pizza.
 */
export function productRank(title: string, q: string, about = ""): number {
  return rankAny(title, alternatives(q), about);
}
/** The best rank over several ways of saying it (`alts` from alternatives(), worked out once per search). */
export function rankAny(title: string, alts: string[], about = ""): number {
  if (!alts.length) return 0;
  let best = -1;
  for (const a of alts) {
    const r = rankOne(title, a, about);
    if (r >= 0 && (best < 0 || r < best)) best = r;
    if (best === 0) return 0;
  }
  if (best >= 0) return best;
  // Typos: every word typed is in the name, give or take a letter.
  const name = normName(title), words = alts[0].split(" ");
  return words.every((w) => name.includes(w) || nearWord(w, name)) ? 4 : -1;
}
function rankOne(title: string, nq: string, about: string): number {
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
const withRank = (h: ProductHit, alts: string[]): Ranked | null => {
  const rank = rankAny(h.title, alts, h.about);
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
  const alts = alternatives(q);
  for (const s of menu.sections)
    for (const i of s.items) {
      if (!i.title || seen.has(i.id) || rankAny(i.title, alts, i.about) < 0) continue;
      seen.add(i.id);
      const now = i.priceNow > 0 && i.priceNow < i.price ? i.priceNow : i.price;
      out.push({
        id: `food:${v.code}:${i.id}`, source: "food", ...(menu.currency ? { currency: menu.currency } : {}), title: onceTitle(i.title), about: i.about || undefined, price: now, was: now < i.price ? i.price : undefined,
        photo: i.photo || i.image || "", store: v.title, code: v.code, lat: v.lat, lng: v.lng, dist, rating: v.rating > 0 ? Math.round(v.rating * 5) / 10 : 0, url: v.url || undefined,
      });
    }
  return out;
}

/** Takhfifan's deals near you whose name (or store) answers `q`. */
export function dealHits(deals: Deal[], q: string, here?: LatLng | null): ProductHit[] {
  const out: ProductHit[] = [];
  const alts = alternatives(q);
  for (const d of deals)
    for (const i of d.items) {
      if (!i.name || rankAny(i.name, alts, d.category) < 0) continue;
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
export function filterProducts(hits: ProductHit[], f: ProductFilter = {}): { hits: ProductHit[]; total: number; bySource: Partial<Record<ProductSource, number>> } {
  const q = f.q ?? "", sort = f.sort ?? "match";
  const alts = alternatives(q);
  const bySource: Partial<Record<ProductSource, number>> = {};
  const src = f.sources?.length ? new Set(f.sources) : null;
  const min = f.min && f.min > 0 ? f.min : 0, max = f.max && f.max > 0 ? f.max : 0;
  const seen = new Set<string>();
  let list: Ranked[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    if ((min || max) && (h.price <= 0 || h.price < min || (max && h.price > max))) continue;
    if (f.onlyOff && !offOf(h)) continue;
    if (f.minRating && (h.rating ?? 0) < f.minRating) continue;
    if (f.maxDist && (h.dist == null || h.dist > f.maxDist)) continue;
    const r = withRank(h, alts);
    if (!r) continue;
    seen.add(h.id);
    // Every source's count with the other filters on (the source chips show how many each would add).
    bySource[h.source] = (bySource[h.source] ?? 0) + 1;
    if (src && !src.has(h.source)) continue;
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
  return { hits: list.slice(0, f.limit ?? PRODUCT_LIMIT).map(({ rank: _rank, ...h }) => h), total: list.length, bySource };
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

// ---------------------------------------------------------------- the same product in several stores
/** Words that say nothing about which product it is (sizes and units stay: 1kg ≠ 5kg). */
const FILLER = new Set(["و", "با", "در", "از", "the", "and", "with", "of", "for", "-", "|", "+", "،"]);
const wordsOf = (title: string) => new Set(normName(title).split(" ").filter((w) => w.length > 1 && !FILLER.has(w)));
/** How alike two names are: words in both over words in either (0…1). */
export function nameLikeness(a: string, b: string): number {
  const x = wordsOf(a), y = wordsOf(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

export type SameProduct = { title: string; hits: ProductHit[]; min: number; max: number; stores: number; save: number };

/**
 * The same product sold by more than one store, cheapest first: names at least `alike` alike (word
 * overlap), a price each, the same currency, at least two different stores. Groups ranked by how much
 * picking the cheapest saves (the most first). Pure.
 */
export function sameProducts(hits: ProductHit[], alike = 0.6, max = 8): SameProduct[] {
  const priced = hits.filter((h) => h.price > 0 && !h.from).slice(0, 200);
  const used = new Set<string>();
  const out: SameProduct[] = [];
  for (let i = 0; i < priced.length; i++) {
    const a = priced[i];
    if (used.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < priced.length; j++) {
      const b = priced[j];
      if (used.has(b.id) || b.currency !== a.currency || nameLikeness(a.title, b.title) < alike) continue;
      group.push(b);
    }
    const stores = new Set(group.map((h) => h.store)).size;
    if (stores < 2) continue;
    group.forEach((h) => used.add(h.id));
    group.sort((x, y) => x.price - y.price);
    const lo = group[0].price, hi = group[group.length - 1].price;
    out.push({ title: group[0].title, hits: group, min: lo, max: hi, stores, save: hi > 0 ? Math.round((1 - lo / hi) * 100) : 0 });
  }
  return out.sort((x, y) => y.save - x.save || y.stores - x.stores).slice(0, max);
}
