// Driving and flying. Pure maths (no three.js), so it's easy to reason about and test.
//
// Collisions: building footprints from every loaded tile live in one spatial hash
// (30 m cells). A vehicle is one or two circles pushed out of footprints whose height
// range it overlaps — wheels hit walls, a helicopter clears the roofs (and can land on
// them), a car drives under a petrol-station canopy.
import type { VehicleDef } from "@/lib/vehicles";
import { rayFootprint, type Ray } from "@/lib/arena/geom";
import type { Footprint } from "./tileMesh";

const HASH = 30;
const cellOf = (x: number, z: number) => `${Math.floor(x / HASH)}_${Math.floor(z / HASH)}`;

export class CollisionWorld {
  private cells = new Map<string, { tile: string; f: Footprint }[]>();
  private byTile = new Map<string, string[]>();

  add(tile: string, footprints: Footprint[]) {
    this.remove(tile);
    const used = new Set<string>();
    for (const f of footprints)
      for (let hx = Math.floor(f.minX / HASH); hx <= Math.floor(f.maxX / HASH); hx++)
        for (let hz = Math.floor(f.minZ / HASH); hz <= Math.floor(f.maxZ / HASH); hz++) {
          const k = `${hx}_${hz}`;
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push({ tile, f });
          used.add(k);
        }
    this.byTile.set(tile, [...used]);
  }

  remove(tile: string) {
    for (const k of this.byTile.get(tile) ?? []) {
      const list = this.cells.get(k)?.filter((e) => e.tile !== tile);
      if (list?.length) this.cells.set(k, list);
      else this.cells.delete(k);
    }
    this.byTile.delete(tile);
  }

  private near(x: number, z: number, out: Set<Footprint>) {
    out.clear();
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) for (const e of this.cells.get(cellOf(x + dx * HASH, z + dz * HASH)) ?? []) out.add(e.f);
    return out;
  }
  private scratch = new Set<Footprint>();

  /**
   * Push a circle at height [alt, alt + tall] out of every footprint it overlaps.
   * Returns the corrected spot and the last wall normal hit (or null).
   */
  collide(x: number, z: number, r: number, alt = 0, tall = 2) {
    let hit: { nx: number; nz: number } | null = null;
    for (const f of this.near(x, z, this.scratch)) {
      if (x < f.minX - r || x > f.maxX + r || z < f.minZ - r || z > f.maxZ + r) continue;
      if (alt >= f.h - 0.3 || alt + tall <= f.mh) continue; // above the roof / under the canopy
      const p = f.pts;
      let best = Infinity, qx = 0, qz = 0, inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const cx = ax + dx * k, cz = az + dz * k, d2 = (x - cx) ** 2 + (z - cz) ** 2;
        if (d2 < best) (best = d2), (qx = cx), (qz = cz);
      }
      const d = Math.sqrt(best);
      if (!inside && d >= r) continue;
      let nx = inside ? qx - x : x - qx, nz = inside ? qz - z : z - qz;
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      const depth = inside ? d + r : r - d;
      x += nx * depth;
      z += nz * depth;
      hit = { nx, nz };
    }
    return { x, z, hit };
  }

  /**
   * Distance along a ray (unit direction) to the first wall, roof or the ground, up to
   * maxT (Infinity if nothing): what a bullet or the shoulder camera runs into.
   */
  raycast(r: Ray, maxT: number) {
    let best = r.dy < -1e-6 ? Math.min(maxT, -r.oy / r.dy) : Infinity;
    const seen = new Set<Footprint>();
    const steps = Math.ceil(Math.min(maxT, best) / (HASH * 0.5)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = (i * Math.min(maxT, best === Infinity ? maxT : best)) / steps;
      const x = r.ox + r.dx * t, z = r.oz + r.dz * t;
      for (const f of this.near(x, z, this.scratch)) {
        if (seen.has(f)) continue;
        seen.add(f);
        const ft = rayFootprint(r, f, maxT);
        if (ft < best) best = ft;
      }
    }
    return best <= maxT ? best : Infinity;
  }

  /** The highest roof under (x, z) that's at or below `alt` — where a flyer can land. */
  floor(x: number, z: number, alt: number) {
    let top = 0;
    for (const f of this.near(x, z, this.scratch)) {
      if (f.h > alt + 0.5 || f.h <= top || x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      let inside = false;
      const p = f.pts;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
      }
      if (inside) top = f.h;
    }
    return top;
  }
}

export type Body = {
  x: number;
  z: number;
  alt: number;
  /** Altitude a flyer is heading for. */
  cruise: number;
  yaw: number;
  vx: number;
  vz: number;
  vy: number;
  speed: number;
  steer: number;
  roll: number;
  pitch: number;
  wheelSpin: number;
};

export type Controls = { gas: number; brake: number; steer: number; hand: boolean; lift: number };

export const forward = (yaw: number) => ({ fx: -Math.sin(yaw), fz: -Math.cos(yaw) });

/** Wheels: throttle, brake-then-reverse, grip with handbrake drifts, bicycle-model steering. */
export function stepGround(b: Body, def: VehicleDef, c: Controls, dt: number, V: number) {
  const { fx, fz } = forward(b.yaw);
  const rx = -fz, rz = fx;
  let vF = b.vx * fx + b.vz * fz, vR = b.vx * rx + b.vz * rz;
  if (c.gas) vF += (vF < 0 ? 16 : def.accel * (1 - Math.max(0, vF) / V)) * c.gas * dt;
  if (c.brake) vF -= (vF > 0.5 ? 18 : 6 * (1 + vF / 7)) * c.brake * dt;
  if (!c.gas && !c.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (1.4 + Math.abs(vF) * 0.12) * dt);
  vF = Math.max(-7, Math.min(V, vF));
  vR *= Math.exp(-(c.hand ? 1.6 : def.grip) * dt);
  b.steer += (c.steer * (0.62 - 0.4 * Math.min(1, Math.abs(vF) / V)) - b.steer) * Math.min(1, dt * 8);
  b.yaw += (vF / def.wheelbase) * Math.tan(b.steer) * dt * (c.hand ? 1.35 : 1);
  const n = forward(b.yaw);
  b.vx = n.fx * vF + -n.fz * vR;
  b.vz = n.fz * vF + n.fx * vR;
  b.vy = 0;
  b.alt = 0;
  return vF;
}

/**
 * Rotors: yaw with the stick, thrust forward/back, climb toward a cruise height (the
 * lift input moves it), drift a little sideways. Taking off is automatic on throttle.
 */
export function stepAir(b: Body, def: VehicleDef, c: Controls, dt: number, V: number, floor: number) {
  const ceiling = def.ceiling ?? 100;
  if (c.lift) b.cruise = Math.max(0, Math.min(ceiling, b.cruise + c.lift * (def.key === "heli" ? 16 : 10) * dt));
  else if (c.gas && b.cruise < 6) b.cruise = def.key === "heli" ? 40 : 18;
  const { fx, fz } = forward(b.yaw);
  const rx = -fz, rz = fx;
  let vF = b.vx * fx + b.vz * fz, vR = b.vx * rx + b.vz * rz;
  const airborne = b.alt > floor + 0.3;
  const target = airborne ? (c.gas - c.brake * 0.6) * V : 0;
  const a = def.accel * dt;
  vF += Math.max(-a, Math.min(a, target - vF));
  vR *= Math.exp(-def.grip * dt);
  const yawRate = def.key === "heli" ? 0.95 : 1.6;
  b.steer += (c.steer - b.steer) * Math.min(1, dt * 5);
  if (airborne || c.gas) b.yaw += b.steer * yawRate * dt;
  const wantVy = Math.max(-8, Math.min(8, (Math.max(b.cruise, floor) - b.alt) * 1.2));
  b.vy += (wantVy - b.vy) * Math.min(1, dt * 3);
  b.alt = Math.max(floor, Math.min(ceiling, b.alt + b.vy * dt));
  if (b.alt <= floor + 0.01 && b.vy < 0) b.vy = 0;
  const n = forward(b.yaw);
  b.vx = n.fx * vF + -n.fz * vR;
  b.vz = n.fz * vF + n.fx * vR;
  return vF;
}
