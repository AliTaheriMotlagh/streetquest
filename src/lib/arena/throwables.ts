// Grenades and C4. Pure — the client draws the throw, the server referees it with the same
// numbers and the same flight (one simulation for both, so a grenade lands where everyone
// saw it land).
//
//  - Frag: bounces, goes off after its fuse; damage falls off from the centre to the edge
//    of the blast, and only reaches who the blast can see (walls shelter you).
//  - Flashbang: bounces, pops after its fuse; whoever sees it is blinded — longer the
//    closer it is and the more squarely they're looking at it.
//  - Smoke: bounces, then a cloud that hides who's behind it (bots can't see through it,
//    nor can touch aim assist).
//  - Molotov: breaks where it first lands (or at the end of its fuse in the air) into a
//    pool of fire that burns whoever stands in it.
//  - C4: a short lob that sticks where it lands; it goes off when its owner sets it off.
// Every life you get THROWN_PER of each (nothing in Gun Game — it's guns only).
import { msg } from "../i18n";
import type { Normal, Ray } from "./geom";

export type ThrowKey = "frag" | "flash" | "smoke" | "molotov" | "c4";

export type ThrowDef = {
  key: ThrowKey;
  name: string;
  emoji: string;
  /** Release speed (m/s), before the thrower's own movement is added. */
  speed: number;
  /** Seconds from the throw until it goes off (molotov: at most; it breaks on landing). C4: 0 (on command). */
  fuseS: number;
  /** Blast / blinding / cloud / fire radius (m). */
  radius: number;
  /** Damage at the centre (frag, C4) or per burn tick (molotov). */
  damage: number;
  /** How long the cloud or the fire lasts (s). */
  lastsS: number;
  /** Bounciness off walls and the ground (0–1). */
  bounce: number;
  /** Breaks on landing (molotov). */
  impact: boolean;
  /** Sticks where it first touches (C4). */
  sticky: boolean;
  /** How many you carry each life. */
  per: number;
};

export const THROWABLES: Record<ThrowKey, ThrowDef> = {
  frag: { key: "frag", name: msg("Frag grenade"), emoji: "💣", speed: 17, fuseS: 2.4, radius: 7, damage: 130, lastsS: 0, bounce: 0.35, impact: false, sticky: false, per: 1 },
  flash: { key: "flash", name: msg("Flashbang"), emoji: "⚡", speed: 18, fuseS: 1.5, radius: 24, damage: 0, lastsS: 0, bounce: 0.35, impact: false, sticky: false, per: 2 },
  smoke: { key: "smoke", name: msg("Smoke grenade"), emoji: "💨", speed: 16, fuseS: 1.8, radius: 5.5, damage: 0, lastsS: 16, bounce: 0.3, impact: false, sticky: false, per: 1 },
  molotov: { key: "molotov", name: msg("Molotov"), emoji: "🔥", speed: 15, fuseS: 2.6, radius: 3.6, damage: 8, lastsS: 7, bounce: 0.3, impact: true, sticky: false, per: 1 },
  c4: { key: "c4", name: msg("C4"), emoji: "🧨", speed: 8, fuseS: 0, radius: 9, damage: 200, lastsS: 0, bounce: 0, impact: false, sticky: true, per: 1 },
};
export const THROW_KEYS = Object.keys(THROWABLES) as ThrowKey[];
export const isThrow = (k: unknown): k is ThrowKey => typeof k === "string" && k in THROWABLES;

/** Fire burns in ticks this far apart (ms). */
export const BURN_TICK_MS = 500;
/** Fewest milliseconds between two throws. */
export const THROW_GAP_MS = 800;
/** A thrown thing can't land further than this from where it left the hand. */
export const THROW_MAX_M = 48;
/** Longest a flash can blind for (s). */
export const FLASH_MAX_S = 4.5;
/** Flights end (land and stop) after this long whatever happens. */
const MAX_FLIGHT_S = 6;
const G = 9.81 * 1.15;
const STEP = 1 / 60;
/** It stops rolling below this speed (m/s). */
const REST_V = 0.6;
/** Radius of the thing itself (it rests this far off the ground). */
export const NADE_R = 0.06;

export type Vec3 = [number, number, number];
/** Distance along a ray to the first wall (n gets its face), or Infinity — the city's (client) or the match's (server). */
export type Walls = (r: Ray, maxT: number, n: Normal) => number;

export type Flight = {
  /** Positions every 1/60 s from the throw (seconds since the throw ≈ index × STEP). */
  path: Vec3[];
  /** Where it ends up and when it got there (s). */
  rest: Vec3;
  restS: number;
  /** When it first touched anything (s); Infinity if it never did. */
  landS: number;
  /** When it goes off (s after the throw); Infinity for C4 (on command). */
  goS: number;
  /** For C4: the face it stuck to. */
  stuck: Normal | null;
};

export const FLIGHT_STEP = STEP;

/**
 * Fly a throw from o at velocity v: gravity, bounces off walls and the ground (losing
 * speed each time, rolling to a stop), stopping dead for C4 and breaking on landing for a
 * molotov. The same steps on the client and the server, so they agree where it ends up.
 */
export function fly(def: ThrowDef, o: Vec3, v: Vec3, walls: Walls): Flight {
  let [x, y, z] = o;
  let [vx, vy, vz] = v;
  const path: Vec3[] = [[x, y, z]];
  const n: Normal = { x: 0, y: 1, z: 0 };
  let landS = Infinity, stuck: Normal | null = null, onGround = false;
  // Grenades fly until their fuse (or until they come to rest first); a molotov until it
  // breaks on the ground or its fuse runs out in the air; C4 until it sticks.
  const end = def.sticky ? MAX_FLIGHT_S : Math.min(MAX_FLIGHT_S, def.fuseS);
  let t = 0;
  for (; t < end; t += STEP) {
    if (!onGround) vy -= G * STEP;
    // Rolling: friction on the ground.
    if (onGround) {
      const k = 1 - 2.5 * STEP;
      (vx *= k), (vz *= k), (vy = 0);
      if (Math.hypot(vx, vz) < REST_V) break;
    }
    const sx = vx * STEP, sy = vy * STEP, sz = vz * STEP;
    const len = Math.hypot(sx, sy, sz);
    if (len > 1e-6) {
      const r: Ray = { ox: x, oy: y, oz: z, dx: sx / len, dy: sy / len, dz: sz / len };
      const wt = walls(r, len + NADE_R, n);
      // The ground (y = 0) is a wall too, for both sides' sakes.
      const gt = sy < 0 && y + sy < NADE_R ? (y - NADE_R) / -r.dy : Infinity;
      if (Number.isFinite(wt) || Number.isFinite(gt)) {
        const ground = gt <= wt;
        // (The ground's distance already has the radius in it; a wall's doesn't.)
        const ht = ground ? gt : Math.max(0, wt - NADE_R);
        (x += r.dx * ht), (y += r.dy * ht), (z += r.dz * ht);
        const nx = ground ? 0 : n.x, ny = ground ? 1 : n.y, nz = ground ? 0 : n.z;
        if (landS === Infinity) landS = t + STEP * (ht / len);
        if (def.sticky) {
          stuck = { x: nx, y: ny, z: nz };
          path.push([x, y, z]);
          return { path, rest: [x, y, z], restS: landS, landS, goS: Infinity, stuck };
        }
        if (def.impact && ny > 0.5) {
          path.push([x, y, z]);
          return { path, rest: [x, Math.max(0, y - NADE_R), z], restS: landS, landS, goS: landS, stuck: null };
        }
        // Bounce: reflect off the face, lose speed (more of it into the face than along it).
        const dot = vx * nx + vy * ny + vz * nz;
        (vx -= 2 * dot * nx), (vy -= 2 * dot * ny), (vz -= 2 * dot * nz);
        const along = 0.75;
        (vx *= along), (vz *= along), (vy *= along);
        // The part of the speed off the face shrinks by the bounciness.
        const off = vx * nx + vy * ny + vz * nz;
        (vx -= off * (1 - def.bounce) * nx), (vy -= off * (1 - def.bounce) * ny), (vz -= off * (1 - def.bounce) * nz);
        if (ground && Math.abs(vy) < 1.2) {
          onGround = true;
          y = NADE_R;
        }
        // Step off the face so it isn't hit again at once.
        (x += nx * 0.01), (y += ny * 0.01), (z += nz * 0.01);
      } else (x += sx), (y += sy), (z += sz);
    }
    path.push([x, y, z]);
  }
  const restS = Math.min(t, end);
  const goS = def.sticky ? Infinity : def.impact ? Math.min(def.fuseS, restS) : def.fuseS;
  return { path, rest: [x, Math.max(0, y - NADE_R), z], restS, landS, goS, stuck: def.sticky ? { x: 0, y: 1, z: 0 } : null };
}

/** Where it is s seconds after the throw (its last spot once it's come to rest). */
export function along(f: Flight, s: number): Vec3 {
  const i = Math.max(0, Math.min(f.path.length - 1, Math.floor(s / STEP)));
  return f.path[i];
}

/** The throw's velocity: along the aim (lifted a little so it arcs), plus how I'm moving. */
export function throwVelocity(def: ThrowDef, dir: { dx: number; dy: number; dz: number }, move: { vx: number; vz: number }, lob = 0.18): Vec3 {
  let dx = dir.dx, dy = dir.dy + lob, dz = dir.dz;
  const l = Math.hypot(dx, dy, dz) || 1;
  (dx /= l), (dy /= l), (dz /= l);
  return [dx * def.speed + move.vx * 0.5, dy * def.speed, dz * def.speed + move.vz * 0.5];
}

/** Damage a blast does at a distance (0 outside its radius): steep near the centre. */
export function blastDamage(def: ThrowDef, dist: number) {
  if (dist >= def.radius || def.damage <= 0) return 0;
  const k = 1 - dist / def.radius;
  return Math.max(1, Math.round(def.damage * k ** 1.5));
}

/**
 * How long a flash blinds someone (s): nothing if they can't see it, longest up close and
 * looking straight at it, a moment if it went off behind them.
 */
export function flashSeconds(dist: number, facing: number, clear: boolean) {
  const def = THROWABLES.flash;
  if (!clear || dist >= def.radius) return 0;
  const near = 1 - (dist / def.radius) ** 2;
  // facing: cosine between where they look and the flash (1 = dead ahead, −1 behind).
  const look = facing > 0.5 ? 1 : facing > 0 ? 0.55 + 0.9 * facing : 0.18 + 0.37 * (facing + 1);
  const s = FLASH_MAX_S * near * look;
  return s < 0.15 ? 0 : Math.min(FLASH_MAX_S, s);
}

/** Does the segment a→b pass through any of these smoke clouds (spheres)? */
export function smokeBlocks(smokes: Iterable<{ x: number; y: number; z: number; r: number }>, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const ll = dx * dx + dy * dy + dz * dz || 1;
  for (const s of smokes) {
    const k = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / ll));
    const px = ax + dx * k - s.x, py = ay + dy * k - s.y, pz = az + dz * k - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return true;
  }
  return false;
}

/** A cloud's radius s seconds after it popped: it billows out over two seconds, thins away at the end. */
export function smokeRadius(s: number) {
  const def = THROWABLES.smoke;
  if (s < 0 || s > def.lastsS) return 0;
  const grow = Math.min(1, 0.3 + s / 2);
  const fade = s > def.lastsS - 2 ? Math.max(0, (def.lastsS - s) / 2) : 1;
  return def.radius * grow * (0.6 + 0.4 * fade);
}

/** What you carry at the start of a life. */
export const fullGear = (): Record<ThrowKey, number> => Object.fromEntries(THROW_KEYS.map((k) => [k, THROWABLES[k].per])) as Record<ThrowKey, number>;
