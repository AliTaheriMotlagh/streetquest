// One list engine for every scrollable list (pure; tests/listEngine.test.ts): search, filter chips, a price
// range and a sort, declared once per kind of item (a ListSpec) and run the same way everywhere — a shop's
// products today, any list tomorrow. Search folds Persian/Arabic letters and digits (lib/stores/moderation.ts
// `fold`) and wants every word of the query somewhere in the item's text, in any order.
import { fold } from "./stores/moderation";

export type Sorter<T> = (a: T, b: T) => number;

export type ListSpec<T, S extends string, F extends string> = {
  /** Everything a search should find the item by. */
  text: (x: T) => string;
  sorts: Record<S, Sorter<T>>;
  /** Filter chips: each one a test an item must pass while the chip is on. */
  filters: Record<F, (x: T) => boolean>;
  /** Its price, for the price range (none: no range). */
  price?: (x: T) => number;
  /** Before the chosen sort, whatever it is (e.g. sold out last). */
  lead?: Sorter<T>;
  /** Ties after the chosen sort. */
  tie?: Sorter<T>;
};

export type ListQuery<S extends string, F extends string> = { q?: string; sort?: S; on?: F[]; min?: number; max?: number };

/** The query's words, folded. */
export const words = (q: string | undefined) => fold(q ?? "").split(/[\s‌,،.\-_/]+/).filter(Boolean);

/** Every word somewhere in the text (folded, any order). */
export function matches(text: string, ws: string[]): boolean {
  if (!ws.length) return true;
  const hay = fold(text);
  return ws.every((w) => hay.includes(w));
}

const passes = <T, S extends string, F extends string>(x: T, spec: ListSpec<T, S, F>, qv: ListQuery<S, F>, ws: string[], skip?: F) => {
  for (const f of qv.on ?? []) if (f !== skip && spec.filters[f] && !spec.filters[f](x)) return false;
  if (spec.price && (qv.min || qv.max)) {
    const p = spec.price(x);
    if ((qv.min && p < qv.min) || (qv.max && p > qv.max)) return false;
  }
  return matches(spec.text(x), ws);
};

/** The items that pass the query, in its sort (stable: equal items keep their order). */
export function runList<T, S extends string, F extends string>(items: readonly T[], spec: ListSpec<T, S, F>, qv: ListQuery<S, F> = {}): T[] {
  const ws = words(qv.q);
  const out = items.filter((x) => passes(x, spec, qv, ws));
  const by = qv.sort ? spec.sorts[qv.sort] : undefined;
  if (by || spec.lead || spec.tie) {
    const idx = new Map(out.map((x, i) => [x, i]));
    out.sort((a, b) => (spec.lead ? spec.lead(a, b) : 0) || (by ? by(a, b) : 0) || (spec.tie ? spec.tie(a, b) : 0) || idx.get(a)! - idx.get(b)!);
  }
  return out;
}

/** How many items each chip would show if it were (also) on — the numbers on the chips. */
export function chipCounts<T, S extends string, F extends string>(items: readonly T[], spec: ListSpec<T, S, F>, qv: ListQuery<S, F> = {}): Record<F, number> {
  const ws = words(qv.q);
  const out = {} as Record<F, number>;
  for (const f of Object.keys(spec.filters) as F[]) out[f] = items.filter((x) => passes(x, spec, qv, ws, f) && spec.filters[f](x)).length;
  return out;
}

/** The lowest and highest price among the items (for the range's hints). */
export function priceSpan<T>(items: readonly T[], price: (x: T) => number): { min: number; max: number } | null {
  if (!items.length) return null;
  let min = Infinity, max = -Infinity;
  for (const x of items) {
    const p = price(x);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}
