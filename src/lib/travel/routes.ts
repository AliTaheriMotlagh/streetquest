// A trip drawn across the map (pure; tests/travelPlan.test.ts): each leg from city to city in the
// way it's travelled — a flight as a bowed arc (as planes are drawn on route maps), the train and
// the bus as straight lines between the cities, the car dashed. Unchosen legs are drawn faint.
import { cityByKey } from "./index";
import { legsOf, type LegPick, type Plan, type Way } from "./plan";

export type RouteLine = { from: string; to: string; way: Way | null; points: [number, number][]; mid: [number, number] };

/** Points along a gentle arc from a to b (`bend`: how far it bows, as a share of the distance; to the left of travel). */
export function arcPoints(a: { lat: number; lng: number }, b: { lat: number; lng: number }, n = 24, bend = 0.18): [number, number][] {
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  // Control point: the middle, pushed out sideways.
  const cx = (a.lng + b.lng) / 2 - dy * bend, cy = (a.lat + b.lat) / 2 + dx * bend;
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a.lat + 2 * u * t * cy + t * t * b.lat, u * u * a.lng + 2 * u * t * cx + t * t * b.lng]);
  }
  return out;
}

/** The plan's legs as lines to draw (legs between cities with no known position are left out). `picks` by leg key `from>to@date`. */
export function tripRoutes(plan: Plan, picks: Record<string, LegPick | undefined>): RouteLine[] {
  const out: RouteLine[] = [];
  for (const l of legsOf(plan)) {
    const a = cityByKey(l.from), b = cityByKey(l.to);
    if (a?.lat == null || a.lng == null || b?.lat == null || b.lng == null) continue;
    const way = picks[`${l.from}>${l.to}@${l.date}`]?.way ?? null;
    const A = { lat: a.lat, lng: a.lng }, B = { lat: b.lat, lng: b.lng };
    const points: [number, number][] = way === "flight" ? arcPoints(A, B) : [[A.lat, A.lng], [B.lat, B.lng]];
    out.push({ from: l.from, to: l.to, way, points, mid: points[Math.floor(points.length / 2)] ?? [(A.lat + B.lat) / 2, (A.lng + B.lng) / 2] });
  }
  return out;
}
