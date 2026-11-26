// A list's filters kept in the page address (pure; tests/urlState.test.ts), so a filtered list can be
// shared, reloaded and gone back to. Each filter has a codec: `parse` reads the query value (undefined
// when absent or not valid — the default is used), `show` writes it (null when it's the default, so the
// address only carries what was changed). components/useUrlParam.ts binds one to React state.

export type Codec<T> = { parse(s: string | null): T | undefined; show(v: T): string | null };

/** A whole number ≥ 0 (prices, counts); 0 or the default is left out. */
export const num = (def = 0, max = 1e12): Codec<number> => ({
  parse: (s) => {
    if (s == null || !/^\d{1,13}$/.test(s)) return undefined;
    const n = Number(s);
    return n <= max ? n : undefined;
  },
  show: (v) => (v === def || !Number.isFinite(v) || v < 0 ? null : String(Math.round(v))),
});

/** On/off: "1" when on. */
export const bool: Codec<boolean> = { parse: (s) => (s == null ? undefined : s === "1"), show: (v) => (v ? "1" : null) };

/** Free text (a search), trimmed and capped. */
export const text = (max = 80): Codec<string> => ({ parse: (s) => (s == null ? undefined : s.slice(0, max)), show: (v) => (v.trim() ? v.trim().slice(0, max) : null) });

/** One of a fixed set (a sort order). */
export const oneOf = <K extends string>(keys: readonly K[], def: K): Codec<K> => ({
  parse: (s) => (s != null && (keys as readonly string[]).includes(s) ? (s as K) : undefined),
  show: (v) => (v === def ? null : v),
});

/** Several values, comma-separated; with `keys`, only those (unknown ones dropped). */
export const listOf = <K extends string = string>(keys?: readonly K[], max = 30): Codec<K[]> => ({
  parse: (s) => {
    if (s == null) return undefined;
    const vs = s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, max);
    return (keys ? vs.filter((x) => (keys as readonly string[]).includes(x)) : vs) as K[];
  },
  show: (v) => (v.length ? v.map((x) => x.replace(/,/g, " ")).join(",") : null),
});

/** The query string with these keys set (null removes one); the rest kept in order. Returns "" or "?…". */
export function withParams(search: string, set: Record<string, string | null>): string {
  const p = new URLSearchParams(search);
  for (const [k, v] of Object.entries(set)) if (v == null) p.delete(k);
  else p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
