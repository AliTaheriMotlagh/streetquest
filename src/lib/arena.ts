// FPS layer (Counter-Strike / CoD style): the arena layout is generated from the
// match seed, so every client builds the same map with nothing sent over the wire.
// Coordinates are metres on the XZ plane; the arena is centred on 0,0. Pure.
import { rng } from "./geo";

export type Box = { x: number; z: number; w: number; d: number; h: number; color: number };
export type Pt = { x: number; z: number };
export type ArenaKind = "breach" | "raid";
export type Arena = { half: number; walls: Box[]; spawnA: Pt[]; spawnD: Pt[]; zone: (Pt & { r: number }) | null; core: Box | null };

export const ARENA_HALF = 32;
export const PLAYER_R = 0.4;
export const EYE = 1.6;
export const HEAD_Y = 1.45; // hits above this height count as headshots

export const RIFLE = { dmg: 20, headMult: 2, intervalMs: 110, mag: 30, reloadMs: 1800, range: 70 };
export const MAX_HIT_DMG = RIFLE.dmg * RIFLE.headMult;
export const MATCH_SECONDS = 180;
export const CAPTURE_SECONDS = 20;

export function buildArena(seed: number, kind: ArenaKind): Arena {
  const rand = rng(seed);
  const H = ARENA_HALF;
  const walls: Box[] = [
    { x: 0, z: -H - 0.5, w: 2 * H + 2, d: 1, h: 4, color: 0x2a2a3d },
    { x: 0, z: H + 0.5, w: 2 * H + 2, d: 1, h: 4, color: 0x2a2a3d },
    { x: -H - 0.5, z: 0, w: 1, d: 2 * H + 2, h: 4, color: 0x2a2a3d },
    { x: H + 0.5, z: 0, w: 1, d: 2 * H + 2, h: 4, color: 0x2a2a3d },
  ];
  let zone: Arena["zone"] = null;
  let core: Box | null = null;
  const keepClear: (Pt & { r: number })[] = [];
  let spawnA: Pt[];
  let spawnD: Pt[];

  if (kind === "breach") {
    // Defenders hold the Command Center at the north end; attackers push from the south.
    core = { x: 0, z: -H + 6, w: 12, d: 6, h: 6, color: 0x4b3b6b };
    walls.push(core);
    walls.push({ x: -10, z: -H + 14, w: 6, d: 1, h: 2.2, color: 0x5a5a72 }, { x: 10, z: -H + 14, w: 6, d: 1, h: 2.2, color: 0x5a5a72 });
    zone = { x: 0, z: -H + 12, r: 4 };
    spawnD = [-6, -3, 0, 3, 6, -9, 9, -12].map((x) => ({ x, z: -H + 18 }));
    spawnA = [-6, -3, 0, 3, 6, -9, 9, -12].map((x) => ({ x, z: H - 3 }));
    keepClear.push({ ...zone, r: 6 }, { x: 0, z: H - 3, r: 9 }, { x: 0, z: -H + 18, r: 8 });
  } else {
    // Boss pit: pillars ring an open centre where the boss stomps around.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      walls.push({ x: Math.cos(a) * 16, z: Math.sin(a) * 16, w: 2.5, d: 2.5, h: 5, color: 0x5b4040 });
    }
    spawnD = [{ x: 0, z: 0 }, { x: -5, z: -5 }, { x: 5, z: -5 }, { x: 0, z: 6 }];
    spawnA = [-6, -3, 0, 3, 6, -9, 9, -12].map((x) => ({ x, z: H - 3 }));
    keepClear.push({ x: 0, z: 0, r: 11 }, { x: 0, z: H - 3, r: 9 });
  }

  // Scatter cover: crates and low walls.
  for (let tries = 0, placed = 0; placed < 22 && tries < 200; tries++) {
    const big = rand() < 0.35;
    const w = big ? 4 + rand() * 4 : 1.6 + rand() * 1.2;
    const d = big ? 1 : w;
    const b: Box = {
      x: (rand() * 2 - 1) * (H - 4),
      z: (rand() * 2 - 1) * (H - 4),
      w: rand() < 0.5 ? w : d,
      d: rand() < 0.5 ? d : w,
      h: big ? 1.8 + rand() : 1.2 + rand() * 1.4,
      color: big ? 0x55556e : 0x8a6a3a,
    };
    if (keepClear.some((c) => Math.hypot(c.x - b.x, c.z - b.z) < c.r + Math.max(b.w, b.d) / 2)) continue;
    walls.push(b);
    placed++;
  }
  return { half: H, walls, spawnA, spawnD, zone, core };
}

/** Push a circle out of every box and keep it inside the arena. */
export function collide(p: Pt, walls: Box[], r = PLAYER_R): Pt {
  let { x, z } = p;
  for (const b of walls) {
    const cx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
    const cz = Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the shallowest axis
        const ox = b.w / 2 - Math.abs(x - b.x) + r;
        const oz = b.d / 2 - Math.abs(z - b.z) + r;
        if (ox < oz) x += Math.sign(x - b.x || 1) * ox;
        else z += Math.sign(z - b.z || 1) * oz;
      }
    }
  }
  const lim = ARENA_HALF - r;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}

/** Does any box taller than eye-ish height block the straight line a→b? (slab test, 2D) */
export function blocked(a: Pt, b: Pt, walls: Box[], minH = 1.3): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const w of walls) {
    if (w.h < minH) continue;
    let t0 = 0;
    let t1 = 1;
    const axes: [number, number, number, number][] = [
      [a.x, dx, w.x - w.w / 2, w.x + w.w / 2],
      [a.z, dz, w.z - w.d / 2, w.z + w.d / 2],
    ];
    let hit = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) hit = false;
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) hit = false;
    }
    if (hit) return true;
  }
  return false;
}
