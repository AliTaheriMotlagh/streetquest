// How long the game keeps answering from a copy of another site's data (pure; tests/cachePolicy.test.ts).
// Fresh (younger than its TTL): served, the site isn't asked. Stale but within the window: served at
// once while a fresh copy loads in the background. Older: the caller waits for the fresh copy, and still
// gets the old one if the site fails — so the game always answers from what it has.
export const STALE_TTLS = 12;
export const STALE_MAX_MS = 7 * 24 * 3600_000;

/** How long past its TTL a copy is still served at once: `staleTtls` × TTL, at most `max`. */
export const staleWindow = (ttlMs: number, staleTtls = STALE_TTLS, max = STALE_MAX_MS) => Math.min(max, ttlMs * staleTtls);

export type CacheAction = "fresh" | "stale" | "wait";
/** What to do with a copy `ageMs` old (Infinity: none). */
export function cacheAction(ageMs: number, ttlMs: number, opts: { staleTtls?: number; max?: number; swr?: boolean } = {}): CacheAction {
  if (ageMs < ttlMs) return "fresh";
  if (opts.swr !== false && Number.isFinite(ageMs) && ageMs < staleWindow(ttlMs, opts.staleTtls, opts.max)) return "stale";
  return "wait";
}
