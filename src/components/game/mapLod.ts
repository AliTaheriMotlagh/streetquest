// Level of detail for the map: what to draw at which zoom, and grid clustering so a
// zoomed-out map shows "🧰 12" bubbles instead of hundreds of overlapping emoji. Pure
// (Web Mercator maths only) so it's cheap to call on every zoom change.
import L from "leaflet";

/** near: street level, everything · mid: neighbourhood, clutter clustered · far: city, landmarks only */
export type Lod = "near" | "mid" | "far";
export const lodFor = (zoom: number): Lod => (zoom >= 16 ? "near" : zoom >= 14 ? "mid" : "far");

/** Cluster cell size in screen pixels; 0 = no clustering. */
export const CELL_PX: Record<Lod, number> = { near: 26, mid: 56, far: 72 };
/** From this zoom on, nothing is grouped: every item can be tapped on its own. */
export const NO_CLUSTER_ZOOM = 18;
export const cellFor = (zoom: number) => (zoom >= NO_CLUSTER_ZOOM ? 0 : CELL_PX[lodFor(zoom)]);

export type Group<T> = { key: string; lat: number; lng: number; items: T[] };

/**
 * Bucket points by the screen-pixel cell they fall in at `zoom`, then merge buckets
 * whose centres still sit within a cell of each other (neighbouring cells would
 * otherwise leave bubbles touching). Absolute pixel coordinates, so the result
 * doesn't change while the map pans — only on zoom.
 */
export function cluster<T extends { id: string; lat: number; lng: number }>(items: T[], zoom: number, cellPx: number, prefix: string): Group<T>[] {
  if (!cellPx) return items.map((it) => ({ key: `${prefix}${it.id}`, lat: it.lat, lng: it.lng, items: [it] }));
  type Cell = { k: string; x: number; y: number; items: T[] };
  const cells = new Map<string, Cell>();
  for (const it of items) {
    const p = L.CRS.EPSG3857.latLngToPoint(L.latLng(it.lat, it.lng), zoom);
    const k = `${Math.floor(p.x / cellPx)}_${Math.floor(p.y / cellPx)}`;
    const c = cells.get(k);
    if (c) {
      c.x += p.x;
      c.y += p.y;
      c.items.push(it);
    } else cells.set(k, { k, x: p.x, y: p.y, items: [it] });
  }
  // Biggest first, each swallows smaller neighbours closer than one cell.
  const list = [...cells.values()].map((c) => ({ ...c, x: c.x / c.items.length, y: c.y / c.items.length })).sort((a, b) => b.items.length - a.items.length);
  const out: Group<T>[] = [];
  const taken = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    if (taken.has(i)) continue;
    const c = list[i];
    let its = c.items;
    for (let j = i + 1; j < list.length; j++) {
      if (taken.has(j)) continue;
      const d = list[j];
      if (Math.hypot(d.x - c.x, d.y - c.y) < cellPx) {
        taken.add(j);
        its = its.concat(d.items);
      }
    }
    if (its.length === 1) {
      out.push({ key: `${prefix}${its[0].id}`, lat: its[0].lat, lng: its[0].lng, items: its });
      continue;
    }
    let lat = 0;
    let lng = 0;
    for (const it of its) {
      lat += it.lat;
      lng += it.lng;
    }
    out.push({ key: `${prefix}c${c.k}`, lat: lat / its.length, lng: lng / its.length, items: its });
  }
  return out;
}

/** Bounds of a group, for zooming into a tapped cluster. */
export const groupBounds = (g: Group<{ lat: number; lng: number }>) => L.latLngBounds(g.items.map((i) => [i.lat, i.lng] as [number, number]));
