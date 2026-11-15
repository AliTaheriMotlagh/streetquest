// The List view's at-a-glance pictures (pure; tests/insights.test.ts): what the stores round you are
// made of, how many are open, and how prices spread for what you searched. Each is one pass over the
// rows (O(n)), plus one sort of the prices for the median and the price band (O(n log n), n ≤ 300).
//  - priceBands: a histogram of prices between the 5th and 95th percentile (a single 5,000,000-toman
//    outlier mustn't squash every other bar into the first one), with the cheapest band marked;
//  - shares: counts as segments of one bar, largest first, the tail folded into "other";
//  - storeGlance / productGlance: the numbers the summary strip shows.

export type Band = { from: number; to: number; n: number };
export type Bands = { bands: Band[]; min: number; max: number; median: number; peak: number };

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/** A "nice" step for a price axis: 1, 2 or 5 × a power of ten. */
export function niceStep(span: number, bins: number): number {
  if (!(span > 0) || bins < 1) return 1;
  const raw = span / bins, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Prices (> 0) in at most `bins` bands of a round width, from the 5th to the 95th percentile (the
 * rest joins the first and last band). Null with fewer than 3 prices — no shape to show.
 */
export function priceBands(prices: readonly number[], bins = 12): Bands | null {
  const p = prices.filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  if (p.length < 3) return null;
  const lo = quantile(p, 0.05), hi = quantile(p, 0.95);
  const step = niceStep(hi - lo || lo || 1, bins);
  const start = Math.floor(lo / step) * step;
  const count = Math.max(1, Math.min(bins, Math.ceil((hi - start) / step) || 1));
  const bands: Band[] = Array.from({ length: count }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step, n: 0 }));
  for (const x of p) bands[Math.max(0, Math.min(count - 1, Math.floor((x - start) / step)))].n++;
  return { bands, min: p[0], max: p[p.length - 1], median: Math.round(quantile(p, 0.5)), peak: Math.max(...bands.map((b) => b.n)) };
}

/** The folded tail's key (not a word any list uses as a key: a store type is called "other"). */
export const REST = "__rest" as const;
export type Share<K extends string> = { key: K | typeof REST; n: number; pct: number };

/** Counts as one bar's segments, largest first; past `top` the rest is one REST segment. */
export function shares<K extends string>(counts: Iterable<[K, number]>, top = 5): Share<K>[] {
  const all = [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = all.reduce((s, [, n]) => s + n, 0);
  if (!total) return [];
  const head = all.slice(0, top), tail = all.slice(top).reduce((s, [, n]) => s + n, 0);
  const out: Share<K>[] = head.map(([key, n]) => ({ key, n, pct: (n / total) * 100 }));
  if (tail) out.push({ key: REST, n: tail, pct: (tail / total) * 100 });
  return out;
}

/** Counting by a key, in one pass. */
export function countBy<T, K extends string>(rows: readonly T[], key: (r: T) => K | readonly K[] | null | undefined): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    for (const x of (Array.isArray(k) ? k : [k]) as K[]) m.set(x, (m.get(x) ?? 0) + 1);
  }
  return m;
}

export type StoreGlance = { total: number; open: number; known: number; deals: number; rated: number; avgRating: number; nearM: number | null };

/** The store list's numbers: how many, how many open (of those whose hours are known), deals, rating. */
export function storeGlance(rows: readonly { open: boolean | null | undefined; off: number; rating: number; m?: number | null }[]): StoreGlance {
  let open = 0, known = 0, deals = 0, rated = 0, sum = 0, nearM: number | null = null;
  for (const r of rows) {
    if (r.open != null) (known++, r.open && open++);
    if (r.off > 0) deals++;
    if (r.rating > 0) (rated++, (sum += r.rating));
    if (r.m != null && (nearM == null || r.m < nearM)) nearM = r.m;
  }
  return { total: rows.length, open, known, deals, rated, avgRating: rated ? Math.round((sum / rated) * 10) / 10 : 0, nearM };
}

export type ProductGlance = { total: number; priced: number; cheapest: number; median: number; discounted: number; bestOff: number; stores: number };

/** The product list's numbers: the cheapest and the middle price, how many are discounted, from how many stores. */
export function productGlance(hits: readonly { price: number; was?: number; store: string }[]): ProductGlance {
  const prices: number[] = [];
  let discounted = 0, bestOff = 0;
  const stores = new Set<string>();
  for (const h of hits) {
    if (h.price > 0) prices.push(h.price);
    if (h.was && h.price > 0 && h.was > h.price) {
      discounted++;
      bestOff = Math.max(bestOff, Math.round((1 - h.price / h.was) * 100));
    }
    if (h.store) stores.add(h.store);
  }
  prices.sort((a, b) => a - b);
  return { total: hits.length, priced: prices.length, cheapest: prices[0] ?? 0, median: Math.round(quantile(prices, 0.5)), discounted, bestOff, stores: stores.size };
}
