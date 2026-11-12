// Explore mode: look around the map anywhere — no location needed. The store layers
// (Snappfood, Torob, Divar) and the real places load around the middle of the map instead
// of around you; nothing there can be picked up (that still needs you on the spot).
import { msg } from "./i18n";
import { distanceM, type LatLng } from "./geo";
import { normName } from "./localData";
import type { Place, PlaceCat } from "./places";

/** Quick jumps: big cities and the north (shomal), where many players holiday — each at its busiest streets. */
export const EXPLORE_PLACES: { id: string; name: string; lat: number; lng: number }[] = [
  { id: "tehran", name: msg("Tehran"), lat: 35.6997, lng: 51.338 },
  { id: "karaj", name: msg("Karaj"), lat: 35.8327, lng: 50.9915 },
  { id: "sari", name: msg("Sari"), lat: 36.5625, lng: 53.0693 },
  { id: "babol", name: msg("Babol"), lat: 36.5525, lng: 52.6765 },
  { id: "babolsar", name: msg("Babolsar"), lat: 36.7025, lng: 52.6576 },
  { id: "amol", name: msg("Amol"), lat: 36.4696, lng: 52.3507 },
  { id: "royan", name: msg("Royan"), lat: 36.5699, lng: 51.9644 },
  { id: "nur", name: msg("Nur"), lat: 36.5733, lng: 52.0139 },
  { id: "chalus", name: msg("Chalus"), lat: 36.6553, lng: 51.4204 },
  { id: "nowshahr", name: msg("Nowshahr"), lat: 36.648, lng: 51.505 },
  { id: "ramsar", name: msg("Ramsar"), lat: 36.9156, lng: 50.6467 },
  { id: "rasht", name: msg("Rasht"), lat: 37.2808, lng: 49.5832 },
  { id: "gorgan", name: msg("Gorgan"), lat: 36.8326, lng: 54.4405 },
  { id: "mashhad", name: msg("Mashhad"), lat: 36.2972, lng: 59.6067 },
  { id: "isfahan", name: msg("Isfahan"), lat: 32.6539, lng: 51.666 },
  { id: "shiraz", name: msg("Shiraz"), lat: 29.6104, lng: 52.5311 },
  { id: "tabriz", name: msg("Tabriz"), lat: 38.08, lng: 46.2919 },
];

/** The map's zoom after a quick jump: a whole neighbourhood, streets and shops readable. */
export const EXPLORE_ZOOM = 15;
/** Panning less than this (m) keeps what's loaded: a small drag shouldn't refetch every layer. */
export const EXPLORE_REFETCH_M = 600;
/** Real places loaded around the explored spot. */
export const EXPLORE_PLACES_RADIUS_M = 1500;
export const EXPLORE_MAX_PLACES = 300;
/** How far from the friend a traveller lands (m): beside them, not on top. */
export const FRIEND_LAND_M = 12;

/** Has the explored centre moved far enough to load the layers again? */
export const exploreMoved = (from: LatLng | null, to: LatLng) => !from || distanceM(from, to) >= EXPLORE_REFETCH_M;

/** Minutes left before a home player may travel to a friend again (0 = now). */
export function travelWaitMin(lastAt: number | null, cooldownMin: number, now = Date.now()) {
  if (!lastAt || cooldownMin <= 0) return 0;
  return Math.max(0, Math.ceil((lastAt + cooldownMin * 60_000 - now) / 60_000));
}

// ---------------------------------------------------------------- finding a store by name
/** A search looks this far round the spot (m) — a whole district, not just the streets drawn so far. */
export const SEARCH_RADIUS_M = 3500;
export const SEARCH_MAX = 60;
export type PlaceHit = { id: string; name: string; cat: PlaceCat; lat: number; lng: number; dist: number };

/**
 * The places that answer a search, best first: a name that starts with the words typed, then
 * one with a word that does, then one that has them anywhere, then a brand or a kind
 * ("pharmacy", "داروخانه" via `labelOf`) — nearest first within each. Persian and Arabic
 * spellings, digits and half-spaces are folded (normName). With `cats`, only those kinds;
 * an empty search with `cats` lists the kind by distance.
 */
export function searchPlaces(places: Place[], q: string, here: LatLng, opts: { max?: number; cats?: PlaceCat[]; labelOf?: (c: PlaceCat) => string } = {}): PlaceHit[] {
  const nq = normName(q), tight = nq.replace(/ /g, "");
  const cats = opts.cats?.length ? new Set(opts.cats) : null;
  if (!tight && !cats) return [];
  const seen = new Set<string>();
  const out: (PlaceHit & { rank: number })[] = [];
  for (const p of places) {
    if (!p.name || (cats && !cats.has(p.cat)) || seen.has(p.id)) continue;
    let rank = 0;
    if (tight) {
      const name = normName(p.name);
      // "برگر لند" finds "برگرلند" and the other way round.
      if (name.startsWith(nq) || name.replace(/ /g, "").startsWith(tight)) rank = 0;
      else if (name.split(" ").some((w) => w.startsWith(nq))) rank = 1;
      else if (name.includes(nq) || name.replace(/ /g, "").includes(tight)) rank = 2;
      else if (normName(`${p.brand ?? ""} ${p.cat} ${opts.labelOf?.(p.cat) ?? ""}`).includes(nq)) rank = 3;
      else continue;
    }
    seen.add(p.id);
    out.push({ id: p.id, name: p.name, cat: p.cat, lat: p.lat, lng: p.lng, dist: Math.round(distanceM(here, p)), rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
  return out.slice(0, opts.max ?? SEARCH_MAX).map(({ rank: _rank, ...hit }) => hit);
}
