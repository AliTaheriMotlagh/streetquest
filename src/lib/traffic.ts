// Live traffic (pure — client and server). Speeds are kept per ~50 m square of road and
// direction of travel (server/traffic.ts), from players' real GPS and Neshan's live
// routing; the 3D city colours its streets and paces its traffic from them.
import type { LatLng } from "./geo";

/** Square size in degrees (~55 m north–south). */
export const TRAFFIC_DEG = 0.0005;
/** How long a reading counts as live. */
export const TRAFFIC_FRESH_MS = 15 * 60_000;
/** One cell as the API sends it: [lat, lng, dir 0–7, km/h]. */
export type TrafficCellOut = [number, number, number, number];

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) % 360 + 360) % 360;
}

/** A bearing → one of 8 directions (0 = north, 2 = east…). */
export const dirOf = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

export const trafficCell = (p: LatLng) => ({ ty: Math.floor(p.lat / TRAFFIC_DEG), tx: Math.floor(p.lng / TRAFFIC_DEG) });
export const trafficKey = (p: LatLng, dir: number) => {
  const { tx, ty } = trafficCell(p);
  return `${ty}_${tx}_${dir}`;
};

/** Points every `stepM` metres along a line (a trip between two fixes, a route's step). */
export function along(line: LatLng[], stepM: number): { p: LatLng; deg: number }[] {
  const out: { p: LatLng; deg: number }[] = [];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
    const len = Math.hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * 110_540);
    if (len < 0.5) continue;
    const deg = bearing(a, b);
    for (let s = carry; s < len; s += stepM) out.push({ p: { lat: a.lat + ((b.lat - a.lat) * s) / len, lng: a.lng + ((b.lng - a.lng) * s) / len }, deg });
    carry = (stepM - ((len - carry) % stepM)) % stepM;
  }
  return out;
}

/** Google-style encoded polyline (what Neshan's routes carry) → points. */
export function decodePolyline(s: string, precision = 5): LatLng[] {
  const f = 10 ** precision, out: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < s.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push({ lat: lat / f, lng: lng / f });
  }
  return out;
}

/**
 * Traffic lights: every junction runs the same 40 s cycle on the clock, north–south
 * streets first, then east–west, so every player sees the same lights.
 * 0 green · 1 amber · 2 red.
 */
export function signalPhase(sec: number, ns: boolean) {
  const u = (((sec - (ns ? 0 : 20)) % 40) + 40) % 40;
  return u < 17 ? 0 : u < 20 ? 1 : 2;
}

/** Usual city speed on a free road (km/h), by road kind. */
export const FREE_KMH = { major: 55, minor: 32, path: 18 } as const;

/** 0 flowing · 1 slow · 2 heavy · 3 standstill, from a speed and the road's free speed. */
export function congestion(kmh: number, free: number) {
  const r = kmh / free;
  return r > 0.7 ? 0 : r > 0.45 ? 1 : r > 0.2 ? 2 : 3;
}
export const CONGESTION_COLORS = ["#34c759", "#ffb020", "#ff5a36", "#a3132b"] as const;
