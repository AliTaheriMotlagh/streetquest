// Pure geo + seeded-random helpers. Safe to import on client and server.

export type LatLng = { lat: number; lng: number };

const R = 6371000; // earth radius, metres
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Point `meters` away from `from` along `bearingDeg` (0 = north). */
export function offset(from: LatLng, meters: number, bearingDeg: number): LatLng {
  const d = meters / R;
  const b = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

/** Rough bounding box (degrees) around a point, for cheap DB pre-filtering. */
export function bbox(center: LatLng, radiusM: number) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos(toRad(center.lat))));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

// ---- World grid -----------------------------------------------------------
// The planet is split into ~450m cells. Spawns are generated per cell.
export const CELL_DEG = 0.004;

export function cellOf(p: LatLng) {
  return { cx: Math.floor(p.lng / CELL_DEG), cy: Math.floor(p.lat / CELL_DEG) };
}
export const cellKey = (cx: number, cy: number) => `${cx}_${cy}`;

/** Coarse ~5km cell used for "local chat" rooms. */
export function regionKey(p: LatLng) {
  return `${Math.floor(p.lng / 0.05)}_${Math.floor(p.lat / 0.05)}`;
}

/**
 * Local solar hour (0-24) at a location. Works everywhere on Earth without a
 * timezone database, which is exactly what we want for "is it night here?".
 */
export function solarHour(p: LatLng, at = new Date()): number {
  const utcH = at.getUTCHours() + at.getUTCMinutes() / 60;
  return (((utcH + p.lng / 15) % 24) + 24) % 24;
}

export type DayPhase = "night" | "dawn" | "day" | "dusk";
export function dayPhase(p: LatLng, at = new Date()): DayPhase {
  const h = solarHour(p, at);
  if (h < 5 || h >= 21) return "night";
  if (h < 8) return "dawn";
  if (h < 18) return "day";
  return "dusk";
}

// ---- Seeded randomness ----------------------------------------------------
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T extends { weight: number }>(items: T[], r: number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let x = r * total;
  for (const it of items) {
    x -= it.weight;
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
