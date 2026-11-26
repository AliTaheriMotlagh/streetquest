// Street furniture a car can knock about (pure; tests/props.test.ts). Bins, rubbish bags, benches and the
// galvanised dumpsters are light bodies: a car that hits one hands it an impulse by mass and speed
// (carPhysics.ts `resolve`, so momentum is kept — the car slows by what it gave), then it slides on
// its own friction, spins from where it was struck, tips over when the hit is hard enough for its
// shape, and breaks past its limit (a bag bursts, a plastic bin is crushed, a bench snaps).
// A dumpster rolls on its wheels and is heavy enough to stop a Pride.
// drive/looseProps.ts runs it: only bodies within AWAKE_M of the player move, at most MAX_AWAKE.

import { resolve, sane, type Contact, type Rigid } from "./carPhysics";

export type LooseKind = "bin" | "bags" | "bench" | "dumpster";
export const LOOSE_KINDS: LooseKind[] = ["bin", "bags", "bench", "dumpster"];

export type LooseSpec = {
  /** kg */ mass: number;
  /** Footprint (m): along its yaw and across. */ len: number; wid: number;
  /** Height (m): a tall narrow thing tips sooner. */ hgt: number;
  /** Sliding deceleration (m/s²): rubber feet and bags drag, wheels roll. */ drag: number;
  /** Change of speed (m/s) that tips it over. */ tipAt: number;
  /** Change of speed (m/s) that breaks it (Infinity: never). */ breakAt: number;
};

export const LOOSE: Record<LooseKind, LooseSpec> = {
  bin: { mass: 18, len: 0.5, wid: 0.5, hgt: 0.9, drag: 5, tipAt: 1.2, breakAt: 16 },
  bags: { mass: 8, len: 0.7, wid: 0.6, hgt: 0.5, drag: 7, tipAt: 0.6, breakAt: 7 },
  bench: { mass: 70, len: 1.7, wid: 0.5, hgt: 0.9, drag: 7, tipAt: 2.5, breakAt: 20 },
  dumpster: { mass: 380, len: 1.8, wid: 1.2, hgt: 1.35, drag: 2.2, tipAt: 7, breakAt: Infinity },
};

/** Bodies further from the player than this stop moving (and nothing new wakes there). */
export const AWAKE_M = 40;
/** Most bodies moving at once; the oldest one at rest is left where it lies. */
export const MAX_AWAKE = 16;
/** Seconds for a tip to fall flat. */
export const TIP_S = 0.45;
/** Below this speed and spin a body is at rest. */
const REST_V = 0.05, REST_SPIN = 0.05;

/** What a tile's obstacle says when it's loose furniture (structured-clone safe: it comes from the tile worker). */
export type LooseRef = { loose: LooseKind; key: string; i: number };
export const isLooseRef = (r: unknown): r is LooseRef =>
  !!r && typeof r === "object" && typeof (r as LooseRef).loose === "string" && (r as LooseRef).loose in LOOSE && typeof (r as LooseRef).i === "number";

/** A piece of furniture in motion (or lying where it stopped). */
export type Body = Rigid & {
  kind: LooseKind;
  /** 0 upright … 1 lying flat, falling away from the hit along (tx, tz). */ tip: number; tx: number; tz: number;
  tipping: boolean;
  broken: boolean;
  /** Seconds it has been still. */ still: number;
};

export function makeBody(kind: LooseKind, x: number, z: number, yaw: number): Body {
  const s = LOOSE[kind];
  return { kind, x, z, yaw, vx: 0, vz: 0, spin: 0, mass: s.mass, len: s.len, wid: s.wid, tip: 0, tx: 0, tz: 0, tipping: false, broken: false, still: 0 };
}

export type Knock = { dv: number; tipped: boolean; broke: boolean; carDv: number };

/**
 * A car meets the body. `c` is the contact from car to body (normal pointing at the body). Mutates
 * both (the car loses what it gave). Says how hard it was for the body, and whether it tipped or broke.
 */
export function knock(b: Body, car: Rigid, c: Contact): Knock {
  const s = LOOSE[b.kind];
  // Light things scatter rather than bounce the car back: a soft hit (little restitution).
  const h = resolve(car, b, c, 0.15, 0.4);
  const dv = h.dvb;
  let tipped = false, broke = false;
  if (!b.tipping && dv >= s.tipAt * (s.wid / s.hgt) * 2) {
    b.tipping = tipped = true;
    const l = Math.hypot(b.vx, b.vz) || 1;
    (b.tx = b.vx / l), (b.tz = b.vz / l);
  }
  if (!b.broken && dv >= s.breakAt) b.broken = broke = true;
  return { dv, tipped, broke, carDv: h.dva };
}

/** Moves a body on by dt: slides with drag, spin dies away, a tip falls flat. Returns whether it's still moving. */
export function stepBody(b: Body, dt: number): boolean {
  const s = LOOSE[b.kind];
  // Lying down it drags much more (a bin on its side, a bench on its back).
  const drag = s.drag * (b.tip > 0.5 ? 2 : 1);
  const v = Math.hypot(b.vx, b.vz);
  if (v > 0) {
    const k = Math.max(0, v - drag * dt) / v;
    (b.vx *= k), (b.vz *= k);
  }
  b.spin *= Math.max(0, 1 - dt * 3);
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.yaw += b.spin * dt;
  if (b.tipping && b.tip < 1) b.tip = Math.min(1, b.tip + dt / TIP_S);
  sane(b);
  const moving = Math.hypot(b.vx, b.vz) > REST_V || Math.abs(b.spin) > REST_SPIN || (b.tipping && b.tip < 1);
  b.still = moving ? 0 : b.still + dt;
  return moving;
}

/** The car as a rigid box for the hit (its mass from carPhysics `massOf`, its speed now). */
export const carRigid = (x: number, z: number, yaw: number, vx: number, vz: number, mass: number, len: number, wid: number): Rigid => ({ x, z, yaw, vx, vz, spin: 0, mass, len, wid });
