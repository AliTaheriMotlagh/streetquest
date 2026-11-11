// Vasatyab (وسط‌یاب): where a group should meet. Pure — client and server.
//  - centroid: the average on the globe (cheap, pulled by outliers);
//  - median:   the geometric median (Weiszfeld) — the least total travel for everyone, and the default;
//  - fairest:  the minimax point — the one that makes the farthest member's trip shortest.
// The two iterative ones run on a flat plane around the centroid, which is exact enough for a city-sized group.
import { distanceM, type LatLng } from "./geo";

export type MidMethod = "median" | "centroid" | "fairest";
export const MID_METHODS: MidMethod[] = ["median", "centroid", "fairest"];
export const isMidMethod = (v: unknown): v is MidMethod => typeof v === "string" && (MID_METHODS as string[]).includes(v);

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const ok = (p: LatLng) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** The average of the points on the sphere (so it is right across the date line too). */
export function sphericalCentroid(pts: LatLng[]): LatLng | null {
  const v = pts.filter(ok);
  if (!v.length) return null;
  let x = 0, y = 0, z = 0;
  for (const p of v) {
    const la = rad(p.lat), lo = rad(p.lng);
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  // Exactly opposite points cancel out: any point is as good as another, keep the first.
  if (Math.hypot(x, y, z) < 1e-9) return { ...v[0] };
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lng: deg(Math.atan2(y, x)) };
}

type XY = { x: number; y: number };
/** A flat plane (metres) around `c`. */
function plane(c: LatLng) {
  const kx = 111_320 * Math.cos(rad(c.lat)), ky = 110_540;
  return {
    to: (p: LatLng): XY => ({ x: (((p.lng - c.lng + 540) % 360) - 180) * kx, y: (p.lat - c.lat) * ky }),
    from: (q: XY): LatLng => ({ lat: c.lat + q.y / ky, lng: ((c.lng + q.x / kx + 540) % 360) - 180 }),
  };
}

/** The geometric median: minimises the sum of distances. One or two points, or identical ones, are handled directly. */
export function geometricMedian(pts: LatLng[]): LatLng | null {
  const v = pts.filter(ok);
  if (!v.length) return null;
  if (v.length === 1) return { ...v[0] };
  const c = sphericalCentroid(v)!;
  if (v.length === 2) return sphericalCentroid(v); // any point on the segment minimises the sum: take its middle
  const pl = plane(c);
  const q = v.map(pl.to);
  if (q.every((p) => Math.hypot(p.x - q[0].x, p.y - q[0].y) < 0.01)) return { ...v[0] };
  let m: XY = { x: q.reduce((a, p) => a + p.x, 0) / q.length, y: q.reduce((a, p) => a + p.y, 0) / q.length };
  for (let i = 0; i < 100; i++) {
    let nx = 0, ny = 0, w = 0;
    let onPoint = false;
    for (const p of q) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      // Sitting right on a member: nudge instead of dividing by ~0.
      if (d < 1e-6) { onPoint = true; continue; }
      nx += p.x / d; ny += p.y / d; w += 1 / d;
    }
    if (!w) break;
    const next = { x: nx / w, y: ny / w };
    const moved = Math.hypot(next.x - m.x, next.y - m.y);
    m = onPoint ? { x: (next.x + m.x) / 2, y: (next.y + m.y) / 2 } : next;
    if (moved < 0.05) break;
  }
  return pl.from(m);
}

/** The minimax point (centre of the smallest circle round everyone, Badoiu–Clarkson): the farthest member travels the least. */
export function minimaxPoint(pts: LatLng[]): LatLng | null {
  const v = pts.filter(ok);
  if (!v.length) return null;
  if (v.length === 1) return { ...v[0] };
  const c = sphericalCentroid(v)!;
  const pl = plane(c);
  const q = v.map(pl.to);
  let m: XY = { x: q.reduce((a, p) => a + p.x, 0) / q.length, y: q.reduce((a, p) => a + p.y, 0) / q.length };
  for (let i = 1; i <= 400; i++) {
    let far = q[0], fd = -1;
    for (const p of q) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d > fd) (fd = d), (far = p);
    }
    m = { x: m.x + (far.x - m.x) / (i + 1), y: m.y + (far.y - m.y) / (i + 1) };
  }
  return pl.from(m);
}

export type MidResult = {
  method: MidMethod;
  point: LatLng;
  /** Metres from the point to each input, in input order. */
  distances: number[];
  maxM: number;
  totalM: number;
};

export function memberDistances(point: LatLng, pts: LatLng[]): number[] {
  return pts.map((p) => Math.round(distanceM(point, p)));
}

/** Where to meet. null with nobody to meet. The default is the geometric median. */
export function midpoint(pts: LatLng[], method: MidMethod = "median"): MidResult | null {
  const v = pts.filter(ok);
  const point = v.length ? (method === "centroid" ? sphericalCentroid(v) : method === "fairest" ? minimaxPoint(v) : geometricMedian(v)) : null;
  if (!point) return null;
  const distances = memberDistances(point, v);
  return { method, point, distances, maxM: Math.max(...distances), totalM: distances.reduce((a, b) => a + b, 0) };
}

/** How many metres longer the farthest member's trip is than the group's average: 0 is perfectly even. */
export const unevenM = (r: MidResult) => (r.distances.length ? Math.round(r.maxM - r.totalM / r.distances.length) : 0);

/** The suggested places best for a group: closest to the midpoint, then fewest metres for the farthest member. */
export function rankPlaces<T extends LatLng>(places: T[], pts: LatLng[], max = 6): (T & { maxM: number })[] {
  return places
    .map((p) => ({ ...p, maxM: Math.max(0, ...pts.map((q) => distanceM(p, q))) }))
    .sort((a, b) => a.maxM - b.maxM)
    .slice(0, max);
}
