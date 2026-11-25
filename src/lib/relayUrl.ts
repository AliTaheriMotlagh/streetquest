// Where the server reaches an Iranian site: straight, or through the Iran relay (relay/relay.mjs). Pure.
//
//   RELAY_URL="http://<a-b-c-d>.sslip.io:8790/<RELAY_KEY>"   the relay (its generic route: …/https/<host>/<path>);
//                                                 a bare IP works on Node, and on Workers becomes that name
//   RELAY_FOR="snappfood,torob"                   which sites go through it ("all" for every one; default
//                                                 "snappfood", the one that refuses servers abroad)
//
// A site's own *_URL still wins ("off" turns the site off), so nothing set before changes. A new site
// only needs a name here and in RELAY_FOR — the relay forwards any public host without a redeploy.
/** Sites outside Iran: "all" in RELAY_FOR leaves them out. */
export const ABROAD = ["iett", "adsb"];

/** Running inside Cloudflare Workers (production). */
export const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** Cloudflare Workers can't fetch a bare IP address (error 1003 "Direct IP access not allowed"), which the
 *  relay's address used to be. <a-b-c-d>.sslip.io resolves to that same address, so on Workers a bare IPv4
 *  host becomes that name — port, key and path unchanged. Elsewhere (and for real names) nothing changes. */
export function reachable(url: string, workers = onWorkers()): string {
  if (!workers) return url;
  return url.replace(/^(https?:\/\/)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?=[:/]|$)/, "$1$2-$3-$4-$5.sslip.io");
}

export function siteBase(name: string, own: string | undefined, origin: string, env: Record<string, string | undefined> = process.env, workers = onWorkers()): string | null {
  if (own === "off") return null;
  if (own) return reachable(own.replace(/\/$/, ""), workers);
  const relay = env.RELAY_URL?.trim().replace(/\/$/, "");
  const list = (env.RELAY_FOR ?? "snappfood").split(",").map((s) => s.trim().toLowerCase());
  // "all" means every Iranian site: never one abroad (Istanbul's buses, plane positions), which the
  // relay in Iran would only slow down or lose. Those go through it only when named.
  if (relay && ((list.includes("all") && !ABROAD.includes(name)) || list.includes(name))) {
    const u = new URL(origin);
    return reachable(`${relay}/https/${u.host}${u.pathname.replace(/\/$/, "")}`, workers);
  }
  return origin.replace(/\/$/, "");
}
