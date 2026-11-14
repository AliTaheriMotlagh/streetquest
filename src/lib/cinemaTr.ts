// Turkey's cinemas and film trailers (pure; tests/cinemaTr.test.ts).
// Turkish chains' showtimes sit behind HTML pages with bot checks (no public JSON), so Istanbul's
// cinemas come from the open map (amenity=cinema, via Overpass — server/cinema.ts) with a link to
// the cinema's own page: its `website` tag, else a search for its programme. Ids are the OSM id,
// offset by element type so a node and a way never collide.
// Trailers: Cinematicket's film answer carries Aparat's MP4 (CORS-open, so a video can be a 3D texture).
import type { Cinema } from "./cinema";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type OsmEl = { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };
const OSM_OFFSET: Record<string, number> = { node: 0, way: 1e13, relation: 2e13 };

/** Overpass query for the cinemas within `r` m of a point. */
export const osmCinemaQuery = (lat: number, lng: number, r: number) =>
  `[out:json][timeout:25];nwr["amenity"="cinema"](around:${Math.round(r)},${lat.toFixed(5)},${lng.toFixed(5)});out center tags 120;`;

/** An https link from a tag ("sinema.com" → https://sinema.com); null when it isn't a web address. */
export function webLink(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.protocol = "https:";
    return u.href;
  } catch {
    return null;
  }
}

/** One cinema from an Overpass element (null: no name or position). */
export function parseOsmCinema(raw: unknown): Cinema | null {
  const e = raw as OsmEl | null;
  const tags = e?.tags ?? {};
  const name = str(tags.name) || str(tags["name:tr"]) || str(tags["name:en"]);
  const lat = Number(e?.lat ?? e?.center?.lat), lng = Number(e?.lon ?? e?.center?.lon), off = OSM_OFFSET[e?.type ?? ""];
  if (!name || !(e?.id && e.id > 0) || off === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = [tags["addr:street"], tags["addr:housenumber"], tags["addr:suburb"] ?? tags["addr:district"], tags["addr:city"]].map(str).filter(Boolean).join(" ");
  const site = webLink(tags.website ?? tags["contact:website"]) ?? `https://www.google.com/search?q=${encodeURIComponent(`${name} seans saatleri`)}`;
  return { id: e.id + off, name, lat, lng, address, rate: 0, rates: 0, photo: "", osm: true, site };
}

/** Hosts a trailer file may come from (https only; they send CORS headers so a video can be a texture). */
const TRAILER_HOSTS = /(^|\.)(aparat\.com|cinematicket\.org)$/i;
export type Trailer = { url: string | null; page: string | null };

/** The trailer of a Cinematicket movie answer: its MP4 (when the host is a known one) and Aparat's page for it. */
export function trailerOf(raw: unknown): Trailer {
  const m = (raw as { movie?: { aparat_trailer?: unknown; aparat_hash?: unknown } } | null)?.movie;
  let url: string | null = null;
  try {
    const u = new URL(str(m?.aparat_trailer));
    if (u.protocol === "https:" && TRAILER_HOSTS.test(u.hostname) && /\.mp4$/i.test(u.pathname)) url = u.href;
  } catch {
    // none
  }
  const hash = str(m?.aparat_hash);
  return { url, page: /^[A-Za-z0-9]{3,12}$/.test(hash) ? `https://www.aparat.com/v/${hash}` : null };
}
