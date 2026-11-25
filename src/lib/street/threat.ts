// How frightened someone in the street is right now (pure; tests/threat.test.ts) — so a shopkeeper doesn't
// slam the shutter for a fender-bender down the road, but does run in when shots ring out beside them.
// One score 0…1 from what's around them, then a fear level that rises fast and falls slowly, with hysteresis:
// they run when it passes FLEE_AT and only calm down below CALM_AT (no flickering in and out of the door).
//  - a car coming at them: how soon it would reach them (distance ÷ closing speed), and how fast;
//  - the player on foot with a gun drawn (aiming), close by;
//  - shots, blasts, crashes, a car swerving past (Crowd.alarm): each by how far and how long ago — a blast
//    reaches furthest and is remembered longest, a crash barely counts; several shots add up;
//  - the player's wanted level, when they're near.
// Shopkeepers are braver than passers-by (their shop is there): a weak threat doesn't count at all.

export const FLEE_AT = 0.7;
export const CALM_AT = 0.3;
/** Back out at the door no sooner than this after running in (s), once calm. */
export const MIN_INSIDE_S = 6;

export type Scare = "shot" | "blast" | "crash" | "dodge";
/** Something frightening at x, z, heard up to r m away, at time `at` (s). */
export type ScareEvent = { kind: Scare; x: number; z: number; r: number; at: number };

/** How bad each is up close, and how long it's remembered (s, the fear's half-life of sorts). */
const SCARE: Record<Scare, { base: number; keep: number }> = {
  shot: { base: 1, keep: 4 },
  blast: { base: 1, keep: 8 },
  crash: { base: 0.35, keep: 2 },
  dodge: { base: 0.15, keep: 1 },
};
/** Events older than this (s) no longer matter. */
export const SCARE_FORGET_S = 20;

export type ThreatCtx = {
  /** Where the person stands. */
  x: number;
  z: number;
  /** The player: where, how they move (m/s), in a car or on foot, a gun drawn. */
  me: { x: number; z: number; vx: number; vz: number; inCar: boolean; gunDrawn: boolean };
  /** Wanted stars (0…5). */
  stars: number;
  events: readonly ScareEvent[];
  /** Now (s, the same clock as the events). */
  now: number;
  /** A shopkeeper: braver. */
  keeper?: boolean;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Several threats together: each one's chance of scaring, combined ("any of them"). */
const anyOf = (xs: number[]) => 1 - xs.reduce((p, x) => p * (1 - clamp01(x)), 1);

/** A car bearing down: seconds until it reaches them (closing speed only) and how fast it comes. */
export function carThreat(dx: number, dz: number, vx: number, vz: number): number {
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return 1;
  const closing = (dx * vx + dz * vz) / d; // m/s towards them (dx, dz: from the car to them)
  if (closing < 3) return 0;
  const ttc = d / closing;
  return clamp01((3 - ttc) / 2.5) * clamp01(closing / 12);
}

/** One event's threat at distance d, `age` s after it. */
export function scareThreat(e: ScareEvent, d: number, age: number): number {
  if (age < 0 || age > SCARE_FORGET_S || d > e.r * 1.2) return 0;
  const s = SCARE[e.kind];
  const near = 1 - (d / (e.r * 1.2)) ** 2;
  return s.base * clamp01(near) * Math.exp(-age / s.keep);
}

/** The threat they feel right now, 0…1. */
export function threatOf(c: ThreatCtx): number {
  const { me } = c;
  const dx = c.x - me.x, dz = c.z - me.z, d = Math.hypot(dx, dz);
  const parts: number[] = [];
  if (me.inCar) parts.push(carThreat(dx, dz, me.vx, me.vz));
  else if (me.gunDrawn && d < 25) parts.push(0.15 + 0.45 * (1 - d / 25));
  for (const e of c.events) parts.push(scareThreat(e, Math.hypot(c.x - e.x, c.z - e.z), c.now - e.at));
  if (c.stars > 0 && d < 40) parts.push(Math.min(5, c.stars) * 0.12 * (1 - d / 40));
  const raw = anyOf(parts);
  // Braver: a weak threat doesn't count, a strong one still does.
  return c.keeper ? clamp01((raw - 0.15) / 0.85) : raw;
}

export type Fear = { level: number; afraid: boolean };
export const CALM: Fear = { level: 0, afraid: false };

/**
 * The fear level follows the threat — up quickly (`rise` per s, a fraction of the gap), down slowly
 * (`fall` per s, linear) — and `afraid` flips on above FLEE_AT, off only below CALM_AT.
 */
export function stepFear(f: Fear, threat: number, dt: number, rise = 6, fall = 0.35): Fear {
  const level = threat > f.level ? f.level + (threat - f.level) * Math.min(1, rise * dt) : Math.max(threat, f.level - fall * dt);
  const afraid = f.afraid ? level >= CALM_AT : level > FLEE_AT;
  return { level, afraid };
}

/** A shopkeeper who ran in comes back out to the door: calm again, and inside a little while at least. */
export const mayReturn = (f: Fear, insideFor: number) => !f.afraid && f.level < CALM_AT && insideFor >= MIN_INSIDE_S;

/** Drops the events too old to matter (in place order kept). */
export const freshScares = (events: readonly ScareEvent[], now: number) => events.filter((e) => now - e.at <= SCARE_FORGET_S);
