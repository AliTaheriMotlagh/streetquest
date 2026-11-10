// Cinemas and their sessions from cinematicket.org's own JSON API (lib/cinema.ts holds the
// shapes). Polite and cheap, like the store data (server/localData.ts's fetch and cache):
//  - every cinema in Iran (about 400, read in pages) is one ExtCache row for a day — the
//    map layer and the 3D city's billboards pick the nearest from it;
//  - a cinema's sessions for today and tomorrow are cached ten minutes per cinema;
//  - CINEMATICKET_URL points at the site ("off" disables it — the e2e tests use a stub).
// It answers from abroad (Vercel's US servers), so it needs no relay in Iran.
import { distanceM, type LatLng } from "../lib/geo";
import { filmsFrom, parseCinema, sessionWindow, type Cinema, type CinemaShows } from "../lib/cinema";
import { cached, getJson } from "./localData";

const base = () => {
  const v = process.env.CINEMATICKET_URL;
  return v === "off" ? null : (v || "https://cinematicket.org/api/v1").replace(/\/$/, "");
};

const DAY_MS = 86_400_000, SESSIONS_MS = 10 * 60_000;
/** Pages of the cinema list read at most (100 each). */
const MAX_PAGES = 12;

/** Every cinema with a position (cached a day). */
export async function allCinemas(): Promise<Cinema[]> {
  const b = base();
  if (!b) return [];
  const list = await cached<Cinema[]>("ct:cinemas", DAY_MS, async () => {
    const out: Cinema[] = [];
    let url: string | null = `${b}/cinematicket/home/cinemas/?page_size=100`;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const r: { next?: string | null; results?: unknown[] } | null = await getJson(url);
      if (!r) return out.length ? out : null;
      for (const raw of r.results ?? []) {
        const c = parseCinema(raw);
        if (c) out.push(c);
      }
      // Only follow its own next page (never somewhere else).
      url = typeof r.next === "string" && r.next.startsWith(b) ? r.next : null;
    }
    return out.length ? out : null;
  });
  return list ?? [];
}

/** The cinemas within `radiusM` of a point, nearest first (at most `max`). */
export async function cinemasNear(here: LatLng, radiusM = 20_000, max = 40): Promise<Cinema[]> {
  return (await allCinemas())
    .map((c) => ({ c, d: distanceM(here, c) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.c);
}

/** What's on at a cinema today and tomorrow (cached ten minutes). */
export async function cinemaShows(id: number): Promise<CinemaShows> {
  const b = base();
  const cinema = (await allCinemas()).find((c) => c.id === id) ?? null;
  if (!b) return { cinema, films: [], fetchedAt: new Date().toISOString() };
  const w = sessionWindow();
  const raw = await cached<unknown[]>(`ct:s:${id}:${w.day}`, SESSIONS_MS, async () => {
    const r = await getJson<{ results?: unknown[] }>(`${b}/movie/sessions/?cinema=${id}&start_at__gte=${encodeURIComponent(w.from)}&start_at__lte=${encodeURIComponent(w.to)}&page_size=400`);
    return r?.results ?? null;
  });
  return { cinema, films: filmsFrom(raw ?? []), fetchedAt: new Date().toISOString() };
}
