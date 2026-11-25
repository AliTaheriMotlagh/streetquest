// The player's address, for per-network limits (guest sign-ups, error reports, visits) and the audit log. Pure.
//
// Who to believe, in order:
//  1. the Iran front door (front/front.mjs): players who can't reach Cloudflare come through a server in
//     Iran, so Cloudflare sees that server's address for all of them. The front door sends the real one
//     as `x-front-ip` with the shared FRONT_KEY in `x-front-key`; without the right key it's ignored;
//  2. `cf-connecting-ip` — Cloudflare sets it and a player can't (production);
//  3. `x-forwarded-for` (first hop) / `x-real-ip` — Vercel and the dev server, and what e2e tests send.
//     On Cloudflare a player could write x-forwarded-for themselves, which is why it comes after 2.
type Headers = { get(name: string): string | null };

/** Same length and same characters, without stopping at the first difference. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const clean = (v: string | null | undefined) => (v ?? "").split(",")[0].trim().slice(0, 64);

export function clientIp(h: Headers, frontKey: string | undefined = process.env.FRONT_KEY): string {
  if (frontKey && frontKey.length >= 16 && sameSecret(h.get("x-front-key") ?? "", frontKey)) {
    const ip = clean(h.get("x-front-ip"));
    if (ip) return ip;
  }
  return clean(h.get("cf-connecting-ip")) || clean(h.get("x-forwarded-for")) || clean(h.get("x-real-ip")) || "local";
}

/** The request came through the Iran front door (for logs and the Admin view). */
export const viaFront = (h: Headers, frontKey: string | undefined = process.env.FRONT_KEY) =>
  !!frontKey && frontKey.length >= 16 && sameSecret(h.get("x-front-key") ?? "", frontKey);

/** The player's country (two letters) from the host: Cloudflare's `cf-ipcountry`, Vercel's `x-vercel-ip-country`.
 *  Through the front door it's the front door's own (Iran), which is where its players are. "XX"/"T1" (unknown, Tor) → null. */
export function countryOf(h: Headers): string | null {
  const c = (h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || "").trim().toUpperCase().slice(0, 2);
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}
