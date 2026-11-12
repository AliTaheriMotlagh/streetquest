// Iran's street kit, placed per tile (tileMesh.ts buildTileArrays calls placeKit and crossSigns; world3d /
// streetKit3d.ts draw it). None of it is on the map, so it is put where it stands in a real Iranian city:
//  - the Iran Post box (yellow, red roof), electricity and telecom (کافو) cabinets at the back of the
//    pavement, the odd payphone hood and, in Iran, a saqakhaneh (سقاخانه) — a tiled water shrine;
//  - green-and-yellow railings down the middle of two-way main roads, gaps at every junction;
//  - a pedestrian bridge (پل عابر پیاده) over a wide main road, a stair tower on each pavement;
//  - at the crossings: white arrow signs naming the cross street (left / right) before the junction
//    of a main road, and a green overhead sign on a motorway (straight on, and the exit).
// Runs in the tile worker: no three.js, positions only (local x/z metres, yaw about +y; +z of a
// cabinet faces the street). Every spot comes from the tile's seeded rand, so a tile looks the same
// each time it is built.
import type { RoadKind } from "@/lib/city";
import type { Footprint, Label } from "./tileMesh";

export type Spot = { x: number; z: number; yaw: number };
export type KitRoad = { pts: Float32Array; k: RoadKind; w: number; n: string | null; drawn: boolean; ow: boolean };
type Near = { px: number; pz: number; d: number; w: number; dx: number; dz: number } | null;
export type KitCtx = {
  roads: KitRoad[];
  road: { on(x: number, z: number, pad: number): boolean; onOther(x: number, z: number, pad: number, line: Float32Array): boolean; nearest(x: number, z: number, r: number): Near };
  blocked: (x: number, z: number, pad: number) => boolean;
  rand: () => number;
  lite: boolean;
  /** In Iran (the Middle East region): the railings, the bridges and the saqakhaneh. */
  iran: boolean;
  /** Spots already taken by other street furniture (kiosks, dumpsters…): kept clear. */
  taken: { x: number; z: number }[];
  box: (x: number, z: number, hw: number, hd: number, yaw: number, h: number) => Footprint;
  post: (x: number, z: number, r: number, h: number) => Footprint;
};
export type KitKind = "postbox" | "power" | "telecom" | "phone" | "saqa" | "rail" | "bridgeDeck" | "bridgeStair";
export type Kit = Record<KitKind, Spot[]> & { obstacles: Footprint[] };
export const KIT_KINDS: KitKind[] = ["postbox", "power", "telecom", "phone", "saqa", "rail", "bridgeDeck", "bridgeStair"];

/** How many of each at most on one tile (lite phones: none of the small kit). */
export const KIT_CAPS = { postbox: 3, power: 4, telecom: 5, phone: 2, saqa: 1, rail: 220, bridge: 1 } as const;
/** A railing panel's length (m): the instanced piece in streetKit3d.ts. */
export const RAIL_M = 2.4;
/** One piece of a bridge's deck (m) and how high its walkway is. */
export const DECK_M = 3, DECK_Y = 5.7;

const near = (list: { x: number; z: number }[], x: number, z: number, m: number) => list.some((p) => Math.hypot(p.x - x, p.z - z) < m);

/** Street furniture of the kit along a tile's streets. */
export function placeKit(c: KitCtx): Kit {
  const kit: Kit = { postbox: [], power: [], telecom: [], phone: [], saqa: [], rail: [], bridgeDeck: [], bridgeStair: [], obstacles: [] };
  if (c.lite) return kit;
  const { road, rand } = c;
  const used = [...c.taken];
  /** On the pavement `off` m from the street's middle, facing it; clear of buildings, asphalt, junctions and the rest. */
  const spot = (pts: Float32Array, x0: number, z0: number, ux: number, uz: number, s: number, off: number, side: number, pad: number): Spot | null => {
    const nx = -uz, nz = ux;
    const x = x0 + ux * s + nx * off * side, z = z0 + uz * s + nz * off * side;
    if (c.blocked(x, z, pad) || road.on(x, z, 0.3) || road.onOther(x, z, 4, pts) || near(used, x, z, 3.5)) return null;
    return { x, z, yaw: Math.atan2(-nx * side, -nz * side) };
  };
  type Small = { kind: "postbox" | "power" | "telecom" | "phone" | "saqa"; every: number; gap: number; back: number; pad: number; ok: (r: KitRoad) => boolean };
  const SMALL: Small[] = [
    { kind: "postbox", every: 260, gap: 150, back: 1.3, pad: 0.4, ok: (r) => r.k === "major" || r.k === "minor" },
    { kind: "power", every: 170, gap: 110, back: 1.9, pad: 0.5, ok: (r) => r.k === "major" || r.k === "minor" },
    { kind: "telecom", every: 140, gap: 90, back: 1.7, pad: 0.4, ok: (r) => r.k === "major" || r.k === "minor" },
    { kind: "phone", every: 240, gap: 180, back: 1.4, pad: 0.4, ok: (r) => r.k === "major" },
    { kind: "saqa", every: 300, gap: 400, back: 1.9, pad: 0.6, ok: (r) => c.iran && r.k === "minor" && !!r.n },
  ];
  // Railings: one solid run per stretch between junctions.
  let railRun: { x0: number; z0: number; x1: number; z1: number; yaw: number } | null = null;
  const endRun = () => {
    if (!railRun) return;
    const len = Math.hypot(railRun.x1 - railRun.x0, railRun.z1 - railRun.z0) + RAIL_M;
    kit.obstacles.push(c.box((railRun.x0 + railRun.x1) / 2, (railRun.z0 + railRun.z1) / 2, len / 2, 0.3, railRun.yaw, 1.1));
    railRun = null;
  };
  for (const r of c.roads) {
    if (!r.drawn || (r.k !== "major" && r.k !== "minor")) continue;
    const pts = r.pts;
    const railed = c.iran && r.k === "major" && !r.ow && r.w >= 14 && r.w < 20;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 12) continue;
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      for (const k of SMALL) {
        if (!k.ok(r)) continue;
        for (let s = 8 + rand() * k.every * 0.6; s < len - 6 && kit[k.kind].length < KIT_CAPS[k.kind]; s += k.every * (0.7 + rand() * 0.6)) {
          if (near(kit[k.kind], x0 + ux * s, z0 + uz * s, k.gap)) continue;
          const side = rand() < 0.5 ? 1 : -1;
          const p = spot(pts, x0, z0, ux, uz, s, r.w / 2 + k.back, side, k.pad) ?? spot(pts, x0, z0, ux, uz, s, r.w / 2 + 1.2, side, k.pad);
          if (!p) continue;
          kit[k.kind].push(p);
          used.push(p);
        }
      }
      if (railed) {
        const yaw = Math.atan2(-uz, ux);
        for (let s = RAIL_M / 2; s < len - RAIL_M / 2 && kit.rail.length < KIT_CAPS.rail; s += RAIL_M) {
          const x = x0 + ux * s, z = z0 + uz * s;
          // A gap at each junction, wide enough to turn through.
          if ([-8, -4, 0, 4, 8].some((d) => road.onOther(x + ux * d, z + uz * d, 2, pts))) {
            endRun();
            continue;
          }
          kit.rail.push({ x, z, yaw });
          if (railRun) (railRun.x1 = x), (railRun.z1 = z);
          else railRun = { x0: x, z0: z, x1: x, z1: z, yaw };
        }
        endRun();
      }
      if (c.iran && r.k === "major" && r.w >= 14 && len >= 90 && kit.bridgeDeck.length === 0) bridge(c, kit, r, x0, z0, ux, uz, len, used);
    }
  }
  return kit;
}

/** A footbridge across the middle of this stretch, if both stair towers find room on the pavement. */
function bridge(c: KitCtx, kit: Kit, r: KitRoad, x0: number, z0: number, ux: number, uz: number, len: number, used: { x: number; z: number }[]) {
  if (c.rand() < 0.45) return;
  const s = len / 2 + (c.rand() - 0.5) * (len - 70) * 0.6;
  const mx = x0 + ux * s, mz = z0 + uz * s;
  if (c.road.onOther(mx, mz, 30, r.pts)) return;
  const nx = -uz, nz = ux, off = r.w / 2 + 2.6;
  const stairs: Spot[] = [];
  for (const side of [1, -1]) {
    const lx = mx + nx * off * side, lz = mz + nz * off * side;
    // The flight runs 10 m along the pavement from the landing: whichever way is clear.
    let done = false;
    for (const dir of [1, -1]) {
      const clear = [0, 3, 6, 9.5].every((d) => {
        const x = lx + ux * dir * d, z = lz + uz * dir * d;
        return !c.blocked(x, z, 0.6) && !c.road.on(x, z, 0.4) && !near(used, x, z, 2);
      });
      if (!clear) continue;
      // Local +x across the street (outward), +z along the flight.
      const yaw = Math.atan2(ux * dir, uz * dir);
      stairs.push({ x: lx, z: lz, yaw });
      done = true;
      break;
    }
    if (!done) return;
  }
  const span = 2 * off, pieces = Math.ceil(span / DECK_M), yaw = Math.atan2(-nz, nx);
  for (let i = 0; i < pieces; i++) {
    const o = -span / 2 + DECK_M / 2 + (i * (span - DECK_M)) / Math.max(1, pieces - 1);
    kit.bridgeDeck.push({ x: mx + nx * o, z: mz + nz * o, yaw });
  }
  kit.bridgeStair.push(...stairs);
  used.push({ x: mx, z: mz }, ...stairs);
  // Solid: each stair tower and flight; the deck only up where it is (flyers, tall trucks).
  for (const st of stairs) {
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    kit.obstacles.push(c.box(st.x + fx * 4.4, st.z + fz * 4.4, 1.3, 5.7, st.yaw, DECK_Y + 1.2));
  }
  const deck = c.box(mx, mz, span / 2, 1.4, yaw, DECK_Y + 1.3);
  deck.mh = DECK_Y - 0.4;
  kit.obstacles.push(deck);
}

/** Small kit that a car hits. */
export function kitObstacles(c: Pick<KitCtx, "box" | "post">, kit: Kit): Footprint[] {
  const out: Footprint[] = [];
  for (const p of kit.postbox) out.push(c.post(p.x, p.z, 0.3, 1.6));
  for (const p of kit.power) out.push(c.box(p.x, p.z, 0.68, 0.32, p.yaw, 1.7));
  for (const p of kit.telecom) out.push(c.box(p.x, p.z, 0.48, 0.26, p.yaw, 1.35));
  for (const p of kit.phone) out.push(c.post(p.x, p.z, 0.32, 2.1));
  for (const p of kit.saqa) out.push(c.box(p.x, p.z, 0.65, 0.38, p.yaw, 2.3));
  return out;
}

// ---------------------------------------------------------------- signs at the crossings
/** Two named streets crossing (tileMesh cornerSigns finds them). */
export type Crossing = { x: number; z: number; a: CrossRoad; b: CrossRoad };
export type CrossRoad = { n: string; w: number; dx: number; dz: number; line: Float32Array };

/** Distance from (x, z) to a street's centre line. */
export function lineDist(p: Float32Array, x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], l2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - p[i]) * dx + (z - p[i + 1]) * dz) / l2));
    best = Math.min(best, Math.hypot(p[i] + dx * k - x, p[i + 1] + dz * k - z));
  }
  return best;
}

/** Sign sizes and how far before the junction they stand (m). */
export const SIGN_BEFORE = { arrow: 30, gantry: 110 } as const;
/** A motorway or trunk road: green overhead signs. */
export const GANTRY_W = 20;
/** A main road: arrow signs before its junctions. */
export const ARROW_W = 14;

/**
 * Direction signs before the junctions of the main roads: on the right-hand pavement (Iran drives
 * on the right), facing the drivers coming up to it, one arrow plate for the street to the right
 * and one for the street to the left (they may have different names). On a motorway a green
 * overhead sign further back: straight on (the road itself) and the exit.
 * `nameAt`: the name of a street other than `not` at (x, z), if any.
 */
export function crossSigns(crossings: Crossing[], c: Pick<KitCtx, "road" | "blocked" | "lite" | "post">, nameAt: (x: number, z: number, not: string) => string | null, labels: Label[], obstacles: Footprint[]) {
  const signs: { x: number; z: number }[] = [];
  let arrows = 0, gantries = 0;
  const capA = c.lite ? 3 : 10, capG = c.lite ? 1 : 3;
  for (const j of crossings) {
    for (const [X, Y] of [[j.a, j.b], [j.b, j.a]] as const) {
      if (X.w < ARROW_W) continue;
      const gantry = X.w >= GANTRY_W;
      if (gantry ? gantries >= capG : arrows >= capA) continue;
      for (const dir of [1, -1]) {
        // Heading toward the junction, the right-hand side of the road.
        const hx = X.dx * dir, hz = X.dz * dir, rx = -hz, rz = hx;
        const back = (gantry ? SIGN_BEFORE.gantry : SIGN_BEFORE.arrow) + Y.w / 2;
        const cx = j.x - hx * back, cz = j.z - hz * back;
        if (lineDist(X.line, cx, cz) > X.w / 2) continue; // the road bends away before that
        const x = cx + rx * (X.w / 2 + 1.1), z = cz + rz * (X.w / 2 + 1.1);
        if (c.road.on(x, z, 0.3) || c.blocked(x, z, 0.3) || near(signs, x, z, 25)) continue;
        const reach = X.w / 2 + 10;
        const right = nameAt(j.x + rx * reach, j.z + rz * reach, X.n), left = nameAt(j.x - rx * reach, j.z - rz * reach, X.n);
        if (!right && !left) continue;
        const angle = Math.atan2(-hx, -hz);
        signs.push({ x, z });
        if (gantry) {
          const exit = right ?? left!;
          labels.push({ kind: "gantry", text: exit, x, z, y: 0, angle, w: Math.min(13, X.w * 0.55), pole: true, plates: [{ text: X.n, angle, dir: 0 }, { text: exit, angle, dir: right ? 1 : -1 }] });
          obstacles.push(c.post(x, z, 0.22, 7.4));
          gantries++;
        } else {
          const plates = [...(right ? [{ text: right, angle, dir: 1 as const }] : []), ...(left ? [{ text: left, angle, dir: -1 as const }] : [])];
          labels.push({ kind: "direction", text: plates[0].text, x, z, y: 3.5, angle, w: 0, pole: true, plates });
          obstacles.push(c.post(x, z, 0.12, 3.6));
          arrows++;
        }
        if (gantry ? gantries >= capG : arrows >= capA) break;
      }
    }
  }
}

