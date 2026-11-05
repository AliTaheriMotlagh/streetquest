// Explore mode: look around the map anywhere — no location needed. The store layers
// (Snappfood, Torob, Divar) and the real places load around the middle of the map instead
// of around you; nothing there can be picked up (that still needs you on the spot).
import { msg } from "./i18n";
import { distanceM, type LatLng } from "./geo";

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
