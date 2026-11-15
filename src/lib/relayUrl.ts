// Where the server reaches an Iranian site: straight, or through the Iran relay (relay/relay.mjs). Pure.
//
//   RELAY_URL="http://<relay>:8790/<RELAY_KEY>"   the relay (its generic route: …/https/<host>/<path>)
//   RELAY_FOR="snappfood,torob"                   which sites go through it ("all" for every one; default
//                                                 "snappfood", the one that refuses servers abroad)
//
// A site's own *_URL still wins ("off" turns the site off), so nothing set before changes. A new site
// only needs a name here and in RELAY_FOR — the relay forwards any public host without a redeploy.
/** Sites outside Iran: "all" in RELAY_FOR leaves them out. */
export const ABROAD = ["iett", "adsb"];

export function siteBase(name: string, own: string | undefined, origin: string, env: Record<string, string | undefined> = process.env): string | null {
  if (own === "off") return null;
  if (own) return own.replace(/\/$/, "");
  const relay = env.RELAY_URL?.trim().replace(/\/$/, "");
  const list = (env.RELAY_FOR ?? "snappfood").split(",").map((s) => s.trim().toLowerCase());
  // "all" means every Iranian site: never one abroad (Istanbul's buses, plane positions), which the
  // relay in Iran would only slow down or lose. Those go through it only when named.
  if (relay && ((list.includes("all") && !ABROAD.includes(name)) || list.includes(name))) {
    const u = new URL(origin);
    return `${relay}/https/${u.host}${u.pathname.replace(/\/$/, "")}`;
  }
  return origin.replace(/\/$/, "");
}
