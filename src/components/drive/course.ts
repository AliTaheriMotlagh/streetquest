// Laying out a party round on the streets the host's client has loaded: checkpoints
// for a race (a loop of legs 180–320 m apart, heading away first), coins for Coin Rush
// (spread along nearby streets). Points are snapped to drivable roads, so every gate and
// coin sits on the asphalt. The server checks the limits again (lib/party checkPoints).
import { COIN_POINTS, RACE_POINTS, type PartyGame } from "@/lib/party";
import type { RoadKind } from "@/lib/city";

type Roads = { roads: Float32Array[]; roadKinds: RoadKind[] }[];
type P = { x: number; z: number };

/** Points every ~18 m along the car-worthy roads. */
function samples(tiles: Roads) {
  const out: P[] = [];
  for (const t of tiles)
    t.roads.forEach((pts, ri) => {
      const k = t.roadKinds[ri];
      if (k !== "major" && k !== "minor") return;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
        const len = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 0; s < len; s += 18) out.push({ x: x0 + ((x1 - x0) * s) / len, z: z0 + ((z1 - z0) * s) / len });
      }
    });
  return out;
}

/**
 * Points for a round, in local x/z around the start, or null if there aren't enough
 * streets around (open country, or the map is still loading).
 */
export function layCourse(game: PartyGame, tiles: Roads, start: P & { yaw: number }, rand = Math.random): P[] | null {
  if (game === "tag") return [];
  const pts = samples(tiles);
  const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
  if (game === "coins") {
    const pool = pts.filter((p) => d(p, start) > 25 && d(p, start) < COIN_POINTS.maxFromStartM - 150);
    const out: P[] = [];
    for (let tries = 0; out.length < 20 && tries < 600 && pool.length; tries++) {
      const p = pool[Math.floor(rand() * pool.length)];
      if (out.every((q) => d(p, q) > 35)) out.push(p);
    }
    return out.length >= COIN_POINTS.min ? out : null;
  }
  // Race: 6 checkpoints, each 180–320 m on from the last, never doubling back onto an
  // earlier gate, the first one roughly in front of the car.
  const fx = -Math.sin(start.yaw), fz = -Math.cos(start.yaw);
  const out: P[] = [];
  let prev: P = start;
  for (let n = 0; n < 6; n++) {
    const cands = pts.filter((p) => {
      const leg = d(p, prev);
      if (leg < 180 || leg > 320 || d(p, start) > RACE_POINTS.maxFromStartM - 200) return false;
      if (out.some((q) => d(p, q) < 140)) return false;
      if (n === 0 && (p.x - start.x) * fx + (p.z - start.z) * fz < 0) return false;
      return true;
    });
    if (!cands.length) break;
    // Prefer gates that keep the course moving (away from the one before last).
    const back = out.length >= 2 ? out[out.length - 2] : start;
    cands.sort((a, b) => d(b, back) - d(a, back));
    const p = cands[Math.floor(rand() * Math.min(5, cands.length))];
    out.push(p);
    prev = p;
  }
  return out.length >= RACE_POINTS.min ? out : null;
}
