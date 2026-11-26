// Display ad slots (pure; tests/adSlot.test.ts). The decision (BACKLOG.md): self-serve house ads first,
// then Yektanet (native) and Tapsell for players in Iran, AdSense only outside Iran (it doesn't pay Iranian
// publishers). One AdSlot (components/AdSlot.tsx) walks the chain, lazy-loaded when it scrolls into view,
// never inside the 3D city. House ads are bought with coins (server/houseAds.ts) and pre-checked like
// shop listings.

export type AdProvider = "house" | "yektanet" | "tapsell" | "adsense";
/** What the server tells a slot: the networks set up for this deployment (empty = not set up). */
export type AdNetworks = { yektanet?: string; tapsell?: string; adsense?: { client: string; slot: string } };

/** The order a slot tries providers in, for the player's country (two letters, or null when unknown). */
export function adChain(country: string | null, nets: AdNetworks): AdProvider[] {
  const iran = country === "IR";
  const out: AdProvider[] = ["house"];
  if (iran || country == null) {
    if (nets.yektanet) out.push("yektanet");
    if (nets.tapsell) out.push("tapsell");
  }
  // Only where we know it's outside Iran (no country: it may be an Iranian player through the front door).
  if (country && !iran && nets.adsense) out.push("adsense");
  return out;
}

/** Where ads go in a list of `n` rows: after the `first`th row (or the last, in a short list), then every `every`. */
export function adPositions(n: number, first = 3, every = 12, max = 4): Set<number> {
  const out = new Set<number>();
  if (n <= 0) return out;
  for (let i = Math.min(first, n) - 1; i < n && out.size < max; i += every) out.add(i);
  return out;
}

/** Views per purchase step, and the bounds of one purchase. */
export const AD_VIEWS_STEP = 100, AD_VIEWS_MIN = 100, AD_VIEWS_MAX = 20_000;

/** Coins for `views` views at `per100` coins per hundred (rounded up to whole hundreds). */
export const adPrice = (views: number, per100: number) => Math.ceil(views / AD_VIEWS_STEP) * per100;

/** A house ad's link: https only (or a path on this site), else none. */
export function cleanAdUrl(u: string): string | null {
  const s = u.trim();
  if (!s) return "";
  if (/^\/[^/\\]/.test(s) && s.length <= 300) return s;
  try {
    const url = new URL(s);
    return url.protocol === "https:" && s.length <= 300 ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Picks one ad to show, weighted by the views it still has (a big buyer shows more often). */
export function pickHouse<T extends { views: number; shown: number }>(ads: T[], rand = Math.random): T | null {
  let total = 0;
  for (const a of ads) total += Math.max(0, a.views - a.shown);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const a of ads) {
    r -= Math.max(0, a.views - a.shown);
    if (r < 0) return a;
  }
  return ads[ads.length - 1];
}
