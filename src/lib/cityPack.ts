// City packs (pure — script and server). A whole city's street detail is read once from
// an OpenStreetMap extract (scripts/city-pack.ts), cut into the 3D city's cells and
// stored per cell (CityDetail). The street-map tiles the drive is built from
// carry buildings and streets but no street furniture; the pack adds every mapped tree,
// lamp, traffic light, crossing, bus stop, bench, bin, hydrant, fountain and pitch.
import { pitchOf, propOfTags, TILE_DEG, tileKey, tileOf, tileSW, type CityDetail } from "./city";
import type { LatLng } from "./geo";

export type Bbox = { south: number; west: number; north: number; east: number };
/** `extract`: the Geofabrik region file it's read from ("asia/iran" → asia/iran-latest.osm.pbf). */
export type CityDef = Bbox & { slug: string; name: string; extract?: string };

/** Cities with a known outline. Others are found from where players are (scripts/city-pack.ts --top). */
export const CITIES: CityDef[] = [
  { slug: "tehran", name: "Tehran", south: 35.56, west: 51.09, north: 35.83, east: 51.61, extract: "asia/iran" },
  { slug: "karaj", name: "Karaj", south: 35.76, west: 50.88, north: 35.88, east: 51.08, extract: "asia/iran" },
  { slug: "mashhad", name: "Mashhad", south: 36.2, west: 59.45, north: 36.43, east: 59.7, extract: "asia/iran" },
  { slug: "isfahan", name: "Isfahan", south: 32.55, west: 51.55, north: 32.75, east: 51.8, extract: "asia/iran" },
  { slug: "shiraz", name: "Shiraz", south: 29.55, west: 52.4, north: 29.7, east: 52.62, extract: "asia/iran" },
  { slug: "tabriz", name: "Tabriz", south: 37.99, west: 46.18, north: 38.15, east: 46.4, extract: "asia/iran" },
];

/** A city's cells, as the range [cx0, cx1) × [cy0, cy1). */
export function rangeOf(b: Bbox) {
  const a = tileOf({ lat: b.south, lng: b.west }), z = tileOf({ lat: b.north, lng: b.east });
  return { cx0: a.cx, cy0: a.cy, cx1: z.cx + 1, cy1: z.cy + 1 };
}

type El = { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

/**
 * OpenStreetMap elements (Overpass `out geom` shape) → detail per cell of the range `c`.
 * Only what lies inside the range is kept (a pitch by its centre).
 */
export function packCells(elements: El[], c: { cx0: number; cy0: number; cx1: number; cy1: number }): Map<string, CityDetail> {
  const out = new Map<string, CityDetail>();
  const inChunk = (p: LatLng) => {
    const t = tileOf(p);
    return t.cx >= c.cx0 && t.cx < c.cx1 && t.cy >= c.cy0 && t.cy < c.cy1;
  };
  const cell = (p: LatLng) => {
    const t = tileOf(p), key = tileKey(t.cx, t.cy);
    let d = out.get(key);
    if (!d) out.set(key, (d = { o: [], f: [] }));
    return { d, sw: tileSW(t.cx, t.cy) };
  };
  const seen = new Set<string>();
  const put = (lat: number, lng: number, kind: number) => {
    const p = { lat, lng };
    if (!inChunk(p)) return;
    // Two features at one spot (a crossing mapped twice, a lamp on a signal's node).
    const id = `${kind}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const { d, sw } = cell(p);
    if (d.o.length < 3 * 6000) d.o.push(Math.round((lng - sw.lng) * 1e6), Math.round((lat - sw.lat) * 1e6), kind);
  };
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "node" && el.lat != null && el.lon != null) {
      const kind = propOfTags(tags);
      if (kind >= 0) put(el.lat, el.lon, kind);
      continue;
    }
    const g = el.geometry;
    if (el.type !== "way" || !g || g.length < 2) continue;
    if (tags.natural === "tree_row") {
      // A row of street trees: one every ~8 m along the line.
      for (let i = 1; i < g.length; i++) {
        const kx = 111_320 * Math.cos((g[i].lat * Math.PI) / 180);
        const len = Math.hypot((g[i].lon - g[i - 1].lon) * kx, (g[i].lat - g[i - 1].lat) * 110_540);
        for (let s = i === 1 ? 0 : 8; s < len; s += 8) {
          const k = s / len;
          put(g[i - 1].lat + (g[i].lat - g[i - 1].lat) * k, g[i - 1].lon + (g[i].lon - g[i - 1].lon) * k, 0);
        }
      }
      continue;
    }
    if (tags.leisure === "pitch" && g.length >= 4) {
      let lat = 0, lng = 0;
      for (const p of g) (lat += p.lat), (lng += p.lon);
      const mid = { lat: lat / g.length, lng: lng / g.length };
      if (!inChunk(mid)) continue;
      const { d, sw } = cell(mid);
      const pitch = pitchOf(g, tags, sw);
      if (pitch && d.f.length < 60) d.f.push(pitch);
    }
  }
  return out;
}

/** A square around a point, `km` across (a city found from where players are). */
export function bboxAround(p: LatLng, km: number): Bbox {
  const dLat = km / 2 / 110.54, dLng = km / 2 / (111.32 * Math.cos((p.lat * Math.PI) / 180));
  const r = (v: number) => Math.round(v / TILE_DEG) * TILE_DEG;
  return { south: r(p.lat - dLat), west: r(p.lng - dLng), north: r(p.lat + dLat), east: r(p.lng + dLng) };
}
