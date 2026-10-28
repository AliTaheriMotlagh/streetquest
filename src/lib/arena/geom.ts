// Street Arena geometry, shared by the client (what my bullet hit) and the server (was
// that hit possible). Pure maths, local metres: x east, z south, y up.
//
// A player's hitbox is a vertical cylinder for the body plus a sphere for the head,
// shorter when crouched. Buildings are the city's footprints (a polygon from mh to h
// metres up); a bullet stops at the first wall or roof it meets.
import type { Zone } from "./weapons";

export type Ray = { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number };
export type Footprint = { pts: ArrayLike<number>; minX: number; maxX: number; minZ: number; maxZ: number; h: number; mh: number };

export const STAND_H = 1.8;
export const CROUCH_H = 1.25;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.1;
export const BODY_R = 0.32;
export const HEAD_R = 0.16;

export const hitHeight = (crouch: boolean) => (crouch ? CROUCH_H : STAND_H);
export const eyeHeight = (crouch: boolean) => (crouch ? EYE_CROUCH : EYE_STAND);

/** Distance along the ray to a sphere, or Infinity. */
export function raySphere(r: Ray, cx: number, cy: number, cz: number, rad: number) {
  const lx = r.ox - cx, ly = r.oy - cy, lz = r.oz - cz;
  const b = lx * r.dx + ly * r.dy + lz * r.dz;
  const c = lx * lx + ly * ly + lz * lz - rad * rad;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t = -b - s >= 0 ? -b - s : -b + s;
  return t >= 0 ? t : Infinity;
}

/** Distance along the ray to a vertical cylinder (x,z centre, radius, y0..y1), or Infinity. */
export function rayCylinder(r: Ray, cx: number, cz: number, rad: number, y0: number, y1: number) {
  const ox = r.ox - cx, oz = r.oz - cz;
  const a = r.dx * r.dx + r.dz * r.dz;
  let best = Infinity;
  if (a > 1e-9) {
    const b = ox * r.dx + oz * r.dz, c = ox * ox + oz * oz - rad * rad;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [(-b - s) / a, (-b + s) / a]) {
        if (t < 0 || t >= best) continue;
        const y = r.oy + r.dy * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  // Caps (shooting straight down or up).
  if (Math.abs(r.dy) > 1e-6)
    for (const y of [y0, y1]) {
      const t = (y - r.oy) / r.dy;
      if (t < 0 || t >= best) continue;
      const x = ox + r.dx * t, z = oz + r.dz * t;
      if (x * x + z * z <= rad * rad) best = t;
    }
  return best;
}

/**
 * Where a ray meets a player standing at (x, y, z), with `pad` metres of forgiveness
 * (the server's lag tolerance; touch aim assist). Returns the distance and the zone.
 */
export function rayPlayer(r: Ray, x: number, y: number, z: number, crouch: boolean, pad = 0): { t: number; zone: Zone } | null {
  const top = y + hitHeight(crouch);
  const headY = top - HEAD_R;
  const th = raySphere(r, x, headY, z, HEAD_R + pad * 0.5);
  const tb = rayCylinder(r, x, z, BODY_R + pad, y, headY - HEAD_R * 0.6);
  const t = Math.min(th, tb);
  if (t === Infinity) return null;
  if (th <= tb) return { t, zone: "head" };
  const hy = r.oy + r.dy * t - y;
  return { t, zone: hy < (crouch ? 0.45 : 0.82) ? "legs" : "body" };
}

export function pointInPoly(pts: ArrayLike<number>, x: number, z: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const ax = pts[j], az = pts[j + 1], bx = pts[i], bz = pts[i + 1];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** Distance along the ray to a building (walls between mh and h, its roof and underside), or Infinity. */
export function rayFootprint(r: Ray, f: Footprint, maxT: number) {
  // Quick reject: the ray's 2D box against the footprint's.
  const ex = r.ox + r.dx * maxT, ez = r.oz + r.dz * maxT;
  if (Math.max(r.ox, ex) < f.minX || Math.min(r.ox, ex) > f.maxX || Math.max(r.oz, ez) < f.minZ || Math.min(r.oz, ez) > f.maxZ) return Infinity;
  let best = Infinity;
  const p = f.pts;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
    const sx = bx - ax, sz = bz - az;
    const den = r.dx * sz - r.dz * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - r.ox) * sz - (az - r.oz) * sx) / den;
    const u = ((ax - r.ox) * r.dz - (az - r.oz) * r.dx) / den;
    if (t < 0 || t >= best || t > maxT || u < 0 || u > 1) continue;
    const y = r.oy + r.dy * t;
    if (y >= f.mh && y <= f.h) best = t;
  }
  // Through the roof (or the underside of a canopy).
  if (Math.abs(r.dy) > 1e-6)
    for (const y of [f.h, f.mh]) {
      if (y <= 0.01) continue;
      const t = (y - r.oy) / r.dy;
      if (t < 0 || t >= best || t > maxT) continue;
      if (pointInPoly(p, r.ox + r.dx * t, r.oz + r.dz * t)) best = t;
    }
  return best;
}

/** Footprints in a 25 m spatial hash, for line-of-sight and movement checks (server and bots). */
export class FootprintIndex {
  private cells = new Map<number, Footprint[]>();
  private static S = 25;
  private key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  readonly all: Footprint[] = [];

  add(f: Footprint) {
    this.all.push(f);
    const S = FootprintIndex.S;
    for (let cx = Math.floor(f.minX / S); cx <= Math.floor(f.maxX / S); cx++)
      for (let cz = Math.floor(f.minZ / S); cz <= Math.floor(f.maxZ / S); cz++) {
        const k = this.key(cx, cz);
        const list = this.cells.get(k);
        if (list) list.push(f);
        else this.cells.set(k, [f]);
      }
  }

  /** Distance to the first building along the ray within maxT, or Infinity. */
  ray(r: Ray, maxT: number) {
    const S = FootprintIndex.S;
    const seen = new Set<Footprint>();
    let best = Infinity;
    const steps = Math.ceil(maxT / (S * 0.5)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxT, (i * maxT) / steps);
      if (t > best) break;
      const x = r.ox + r.dx * t, z = r.oz + r.dz * t;
      const cx = Math.floor(x / S), cz = Math.floor(z / S);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++)
          for (const f of this.cells.get(this.key(cx + ox, cz + oz)) ?? []) {
            if (seen.has(f)) continue;
            seen.add(f);
            best = Math.min(best, rayFootprint(r, f, maxT));
          }
    }
    return best;
  }

  /** Is (x, z) inside a building whose walls reach height y? */
  inside(x: number, z: number, y = 0.5) {
    const S = FootprintIndex.S;
    for (const f of this.cells.get(this.key(Math.floor(x / S), Math.floor(z / S))) ?? []) {
      if (y < f.mh || y > f.h || x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      if (pointInPoly(f.pts, x, z)) return true;
    }
    return false;
  }

  /** Clear line from a to b (eye to eye)? */
  clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.ray({ ox: ax, oy: ay, oz: az, dx: dx / d, dy: dy / d, dz: dz / d }, d) >= d - 0.05;
  }
}

/** Unit direction for a yaw (0 = -z, the drive's forward) and pitch (up positive). */
export function aimDir(yaw: number, pitch: number) {
  const c = Math.cos(pitch);
  return { dx: -Math.sin(yaw) * c, dy: Math.sin(pitch), dz: -Math.cos(yaw) * c };
}

/** A direction nudged randomly inside a cone of half-angle `spread` (radians). */
export function spreadDir(d: { dx: number; dy: number; dz: number }, spread: number, rand = Math.random) {
  if (spread <= 0) return d;
  // Two axes perpendicular to d.
  let ux = -d.dz, uy = 0, uz = d.dx;
  let l = Math.hypot(ux, uy, uz);
  if (l < 1e-6) (ux = 1), (uy = 0), (uz = 0), (l = 1);
  ux /= l;
  uz /= l;
  const vx = d.dy * uz - d.dz * uy, vy = d.dz * ux - d.dx * uz, vz = d.dx * uy - d.dy * ux;
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * Math.tan(spread);
  const x = d.dx + (ux * Math.cos(a) + vx * Math.sin(a)) * r;
  const y = d.dy + (uy * Math.cos(a) + vy * Math.sin(a)) * r;
  const z = d.dz + (uz * Math.cos(a) + vz * Math.sin(a)) * r;
  const n = Math.hypot(x, y, z);
  return { dx: x / n, dy: y / n, dz: z / n };
}
