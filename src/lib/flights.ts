// Planes in the sky (pure; tests/flights.test.ts). Two sources, one list:
//  - live: ADS-B positions from adsb.lol (what the planes broadcast: callsign, type, altitude, speed,
//    heading) — Turkey, the Gulf, Europe…; Iran has no public receivers, so there it's empty;
//  - scheduled: today's real flights from the nearest airport (MrBilit's timetable), each placed on
//    its great-circle route by the clock — climbing, cruising and descending like the real thing.
// The client moves each plane on between updates (`advance`), the 2D map and the 3D sky draw them.
import { distanceM, type LatLng } from "./geo";

export type Plane = {
  /** ICAO hex (live) or `<flight number>@<departure>` (scheduled). */
  id: string;
  call: string;
  lat: number;
  lng: number;
  /** Metres above sea level. */
  alt: number;
  /** Degrees from north, clockwise. */
  track: number;
  /** Ground speed, m/s. */
  speed: number;
  /** Climb (+) / descent (−), m/s. */
  vs: number;
  ground: boolean;
  source: "live" | "schedule";
  /** Aircraft type ("A320", "B38M") and registration, when known. */
  type?: string;
  reg?: string;
  /** IATA codes of where it's going (scheduled: always; live: unknown). */
  from?: string;
  to?: string;
  /** Airline name (scheduled). */
  airline?: string;
  /** When this position was true (ms). */
  at: number;
};

const FT = 0.3048, KT = 0.514444, FPM = 0.00508;
type AdsbAc = { hex?: string; flight?: string; r?: string; t?: string; alt_baro?: number | "ground"; alt_geom?: number; gs?: number; track?: number; true_heading?: number; baro_rate?: number; geom_rate?: number; lat?: number; lon?: number; seen_pos?: number; category?: string };
/** adsb.lol's /v2/point answer → planes (only those with a position; helicopters and drones kept). */
export function fromAdsb(json: unknown, now: number): Plane[] {
  const list = (json as { ac?: AdsbAc[] })?.ac ?? [];
  const out: Plane[] = [];
  for (const a of list) {
    if (a.lat == null || a.lon == null || !a.hex) continue;
    const ground = a.alt_baro === "ground";
    const alt = ground ? 0 : (typeof a.alt_geom === "number" ? a.alt_geom : typeof a.alt_baro === "number" ? a.alt_baro : 0) * FT;
    out.push({
      id: a.hex,
      call: (a.flight ?? "").trim() || a.r || a.hex.toUpperCase(),
      lat: a.lat,
      lng: a.lon,
      alt: Math.max(0, Math.round(alt)),
      track: a.track ?? a.true_heading ?? 0,
      speed: (a.gs ?? 0) * KT,
      vs: (a.geom_rate ?? a.baro_rate ?? 0) * FPM,
      ground,
      source: "live",
      type: a.t,
      reg: a.r,
      at: now - (a.seen_pos ?? 0) * 1000,
    });
  }
  return out;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
/** Where a plane is `dt` seconds on, flying straight at its speed (and climbing at its rate). */
export function advance(p: Plane, dtS: number): Plane {
  if (p.ground || p.speed <= 0 || dtS <= 0) return p;
  const d = (p.speed * dtS) / R, th = rad(p.track), la = rad(p.lat), lo = rad(p.lng);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(th));
  const lo2 = lo + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { ...p, lat: deg(la2), lng: ((deg(lo2) + 540) % 360) - 180, alt: Math.max(0, p.alt + p.vs * dtS), at: p.at + dtS * 1000 };
}

/** The initial course from a to b (degrees). */
export function bearing(a: LatLng, b: LatLng): number {
  const la1 = rad(a.lat), la2 = rad(b.lat), dl = rad(b.lng - a.lng);
  return (deg(Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl))) + 360) % 360;
}
/** The point a share `f` (0…1) of the way along the great circle from a to b. */
export function along(a: LatLng, b: LatLng, f: number): LatLng {
  const la1 = rad(a.lat), lo1 = rad(a.lng), la2 = rad(b.lat), lo2 = rad(b.lng);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d < 1e-9) return a;
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lng: deg(Math.atan2(y, x)) };
}

/** Cruise height for a route: short hops fly lower (m). */
export const cruiseAlt = (km: number) => Math.min(11_000, Math.max(5_500, 4_000 + km * 9));
/** Climb and descent take this share of the flight each (or 20 minutes, whichever is less). */
const CLIMB_MIN = 20;

export type Scheduled = { number: string; airline: string; type?: string; from: string; to: string; fromAt: LatLng; toAt: LatLng; /** UTC ms. */ depart: number; arrive: number };
/** "2026-11-20T08:00:00" in Iran time → UTC ms. */
export const iranTime = (local: string) => Date.parse(`${local.slice(0, 19)}+03:30`);

/**
 * Where a scheduled flight is at `now` (null before take-off and after landing): along its great
 * circle by the share of its block time flown, height by a climb–cruise–descent profile.
 */
export function scheduledPlane(f: Scheduled, now: number): Plane | null {
  if (!(now > f.depart && now < f.arrive)) return null;
  const total = (f.arrive - f.depart) / 60000, t = (now - f.depart) / 60000, share = t / total;
  const pos = along(f.fromAt, f.toAt, share);
  const km = distanceM(f.fromAt, f.toAt) / 1000;
  const top = cruiseAlt(km), ramp = Math.min(CLIMB_MIN, total / 3);
  const alt = t < ramp ? (top * t) / ramp : total - t < ramp ? (top * (total - t)) / ramp : top;
  const vs = t < ramp ? top / (ramp * 60) : total - t < ramp ? -top / (ramp * 60) : 0;
  const ahead = along(f.fromAt, f.toAt, Math.min(1, share + 0.01));
  return {
    id: `${f.number}@${f.depart}`,
    call: f.number,
    lat: pos.lat,
    lng: pos.lng,
    alt: Math.round(alt),
    track: bearing(pos, ahead),
    speed: (km * 1000) / (total * 60),
    vs,
    ground: false,
    source: "schedule",
    type: f.type,
    from: f.from,
    to: f.to,
    airline: f.airline,
    at: now,
  };
}

/** Live and scheduled together: a scheduled flight is dropped when a live plane already shows it. */
export function mergePlanes(live: Plane[], sched: Plane[]): Plane[] {
  const calls = new Set(live.map((p) => p.call.replace(/\s/g, "").toUpperCase()));
  return [...live, ...sched.filter((p) => !calls.has(p.call.replace(/\s/g, "").toUpperCase()))];
}

/** In the 3D sky: a plane `d` metres away at height `alt` drawn on a dome of radius `dome` round the
 *  player, in the same direction and at the same angle above the horizon (so a plane 60 km off still
 *  shows where you'd see it), and how big to draw it (never under `minPx`-ish of the dome). */
export function skyPlace(dx: number, dz: number, alt: number, dome: number, length = 40, minAngle = 0.004) {
  const real = Math.hypot(dx, dz, alt) || 1;
  // Nearer than the dome: where it really is. Further: pulled in along the line of sight.
  const k = real <= dome ? 1 : dome / real;
  const scale = Math.max(k, (minAngle * Math.min(real, dome)) / length);
  return { x: dx * k, y: alt * k, z: dz * k, scale };
}
