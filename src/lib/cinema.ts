// Cinemas and what's on, from cinematicket.org (Iran's cinema box office; its own site's
// open JSON API — server/cinema.ts fetches and caches it). Pure: the shapes the game uses
// and how the raw answers become them (tests/cinema.test.ts).
//  - a cinema: where it is (the API gives "SRID=4326;POINT (lng lat)" or { lat, long }), its
//    name, address, rating and picture;
//  - its sessions (سانس): each film with its poster and its showings today and tomorrow —
//    time, hall, price (the API's prices are in rials; the game shows toman).

/** `osm`: from the open map (Turkey) — no sessions; `site` is its own page (or a search for its programme). */
export type Cinema = { id: number; name: string; lat: number; lng: number; address: string; rate: number; rates: number; photo: string; osm?: boolean; site?: string };
export type Showing = { at: string; hall: string; toman: number; vip: boolean };
export type Film = { id: number; name: string; poster: string; showings: Showing[] };
export type CinemaShows = { cinema: Cinema | null; films: Film[]; fetchedAt: string };

/** The cinema's page on cinematicket.org (tickets are bought there). */
export const cinemaUrl = (id: number) => `https://cinematicket.org/cinema/detail/${id}`;

/** A position from either of the API's forms; null when it has none (or it's nowhere near Iran). */
export function parsePoint(loc: unknown): { lat: number; lng: number } | null {
  let lat = NaN, lng = NaN;
  if (typeof loc === "string") {
    const m = loc.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (m) (lng = Number(m[1])), (lat = Number(m[2]));
  } else if (loc && typeof loc === "object") {
    const o = loc as { lat?: unknown; long?: unknown; lng?: unknown };
    (lat = Number(o.lat)), (lng = Number(o.long ?? o.lng));
  }
  // Iran's box: anything else is a placeholder (0, 0) or a typo.
  if (!(lat > 24 && lat < 40.5 && lng > 43 && lng < 64)) return null;
  return { lat, lng };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const picOf = (p: unknown) => {
  const o = p as { desktop_url?: unknown; desktop_webp_url?: unknown; mobile_url?: unknown } | null;
  return str(o?.desktop_url) || str(o?.mobile_url) || str(o?.desktop_webp_url);
};

/** One cinema from the API's list (null: no name or no usable position). */
export function parseCinema(raw: unknown): Cinema | null {
  const r = raw as { id?: unknown; name_fa?: unknown; address?: unknown; rate?: unknown; rate_count?: unknown; thumbnail?: unknown; location?: unknown } | null;
  const id = Number(r?.id), name = str(r?.name_fa), at = parsePoint(r?.location);
  if (!(id > 0) || !name || !at) return null;
  return { id, name, ...at, address: str(r?.address), rate: Math.round(Number(r?.rate) * 10) / 10 || 0, rates: Number(r?.rate_count) || 0, photo: picOf(r?.thumbnail) };
}

/**
 * The API's sessions → each film with its showings, soonest first: films ordered by their
 * next showing, past showings (before `now`) left out. Only screenings in the hall
 * ("phy"); the online ones aren't a place to go to.
 */
export function filmsFrom(sessions: unknown[], now = new Date()): Film[] {
  const films = new Map<number, Film>();
  for (const raw of sessions) {
    const s = raw as { movie?: { id?: unknown; name?: unknown; poster?: unknown }; start_at?: unknown; cinema_hall?: { name?: unknown }; min_price?: unknown; session_type?: unknown };
    const id = Number(s?.movie?.id), at = str(s?.start_at), when = Date.parse(at);
    if (!(id > 0) || !Number.isFinite(when) || when < now.getTime() - 10 * 60_000) continue;
    if (s.session_type && s.session_type !== "phy") continue;
    let f = films.get(id);
    if (!f) films.set(id, (f = { id, name: str(s.movie?.name), poster: picOf(s.movie?.poster), showings: [] }));
    const hall = str(s.cinema_hall?.name);
    f.showings.push({ at, hall, toman: Math.round((Number(s.min_price) || 0) / 10), vip: /vip/i.test(hall) });
  }
  const list = [...films.values()].filter((f) => f.name);
  for (const f of list) f.showings.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return list.sort((a, b) => Date.parse(a.showings[0].at) - Date.parse(b.showings[0].at));
}

/** A showing's time of day in Tehran ("19:40"), whatever the device's clock zone. */
export function showTime(at: string) {
  const m = at.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

/** Today in Tehran (YYYY-MM-DD) — showings are grouped by Tehran's day. */
export function tehranDay(d = new Date()) {
  return new Date(d.getTime() + 3.5 * 3_600_000).toISOString().slice(0, 10);
}

/** The ISO window the sessions are asked for: from the start of Tehran's today to the end of tomorrow. */
export function sessionWindow(now = new Date()) {
  const day = tehranDay(now);
  const from = new Date(`${day}T00:00:00+03:30`);
  return { from: from.toISOString(), to: new Date(from.getTime() + 2 * 86_400_000 - 1000).toISOString(), day };
}
