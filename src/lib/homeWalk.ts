// Play from home: the commander walks to where you tapped along a path — the streets when a
// route came back (the same live route navigation uses), else straight there. Pure; tests/homeWalk.test.ts.
import { distanceM, type LatLng } from "./geo";

/** A path to walk: its points (the first is where you are), and how far along it you've come (m). */
export type Walk = { path: LatLng[]; done: number; total: number };

/** A walk from `from` through the route's points (if any) to `to`; a route point that would only double back near the ends is dropped. */
export function walkOf(from: LatLng, to: LatLng, route: [number, number][] | null = null): Walk {
  const path: LatLng[] = [from];
  for (const [lat, lng] of route ?? []) {
    const p = { lat, lng };
    if (distanceM(path[path.length - 1], p) > 1) path.push(p);
  }
  if (distanceM(path[path.length - 1], to) > 1 || path.length === 1) path.push(to);
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceM(path[i - 1], path[i]);
  return { path, done: 0, total };
}

/** Where you are `m` metres along the path, and the index of the point you're walking toward. */
export function pointAlong(w: Walk, m: number): { at: LatLng; next: number } {
  let left = Math.max(0, m);
  for (let i = 1; i < w.path.length; i++) {
    const a = w.path[i - 1], b = w.path[i], d = distanceM(a, b);
    if (left <= d) {
      const k = d > 0 ? left / d : 1;
      return { at: { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k }, next: i };
    }
    left -= d;
  }
  return { at: w.path[w.path.length - 1], next: w.path.length - 1 };
}

/** One step of `m` metres: the new spot, the walk carried on, and whether you've arrived. */
export function stepWalk(w: Walk, m: number): { at: LatLng; walk: Walk; arrived: boolean } {
  const done = Math.min(w.total, w.done + m);
  return { at: pointAlong(w, done).at, walk: { ...w, done }, arrived: done >= w.total - 0.01 };
}

/** What's left to walk (for the line on the map): where you are, then the points still ahead. */
export function restOf(w: Walk): LatLng[] {
  const { at, next } = pointAlong(w, w.done);
  return [at, ...w.path.slice(next)];
}
