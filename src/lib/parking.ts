// Cars parked along the kerb on Iran's streets (pure — drawn by drive/traffic.ts with the
// traffic's own models): nose to tail down the side streets (one side of a two-lane
// street, both sides of a wider one) and the slow lane of the avenues, with gaps for
// junctions, driveways and traffic lights; none on the expressways. Each street's row
// comes from a seed of its own, so the same cars are there when you come back. Traffic
// keeps to what's left of the street (laneOffset). Junctions are found from the other
// streets' segments, not just their points, so a crossing with no shared point still
// stays clear (Junctions), and so do roundabouts and the inside of bends.
import { FLEET, heavy, pickFleet, pickPaint, type FleetKey } from "./fleet";

export type Parked = { key: FleetKey; paint: string; x: number; z: number; yaw: number };
/** Rows of parked cars: [right of the line's direction, left of it]. */
export type Sides = [boolean, boolean];

/** The strip of street a row of parked cars takes, kerb to door mirrors (m). */
export const ROW_M = 2.1;
/** From the kerb to a parked car's side (m). */
const KERB_GAP = 0.25;
/** Expressways (trunk roads and motorways are drawn 20–22 m wide): no parking. */
const NO_PARKING_M = 19;
/** Kept clear past a crossing street's kerb, as the law asks near a junction (m). */
export const JUNCTION_CLEAR_M = 5;
/** A bend this sharp or sharper (radians) leaves no kerb to park on at its corner. */
const SHARP_BEND = (80 * Math.PI) / 180;

/** Which sides of a street have a row of parked cars. */
export function parkingSides(w: number, seed: number): Sides {
  if (w >= NO_PARKING_M || w < 6.5) return [false, false];
  if (w >= 10) return [true, true];
  // A two-lane side street: one row, on whichever side this street has it.
  return seed % 2 ? [true, false] : [false, true];
}

/**
 * Where a vehicle drives across its street (m right of the centreline, facing the way it
 * goes; `dir` −1 runs against the line's points): the middle of its half of what parked
 * cars leave free, or the middle of it all where that's too narrow for two; a bike out
 * by the kerb (or the parked cars).
 */
export function laneOffset(w: number, park: Sides, dir: 1 | -1, bike = false) {
  const e = w / 2;
  const lo = -e + (park[1] ? ROW_M : 0), hi = e - (park[0] ? ROW_M : 0);
  const [l, h] = dir > 0 ? [lo, hi] : [-hi, -lo];
  const m = (l + h) / 2;
  const lane = h - l >= 5.2 ? (m + h) / 2 : m;
  return bike ? Math.min(h - 0.6, lane + 1.2) : lane;
}

/** A car that parks: no buses, trucks or motorbikes. */
function parker(rand: () => number): FleetKey {
  for (;;) {
    const k = pickFleet(rand, false);
    if (!FLEET[k].bike && !heavy(k)) return k;
  }
}

/**
 * One row of parked cars along a street line (x, z pairs), on `side` (+1 right of the
 * line's direction, −1 left), each facing the way traffic on that side goes. `free` says
 * whether a spot on the street may hold a car (not a junction or a light); `fill` is how
 * much of the kerb is taken.
 */
export function parkedRow(line: ArrayLike<number>, w: number, side: 1 | -1, rand: () => number, free: (x: number, z: number) => boolean, fill = 0.75): Parked[] {
  const out: Parked[] = [];
  // A roundabout (a closed ring): nobody parks on one.
  const n = line.length;
  if (n >= 8 && Math.hypot(line[0] - line[n - 2], line[1] - line[n - 1]) < 1) return out;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const ax = line[i], az = line[i + 1], bx = line[i + 2], bz = line[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 8) continue;
    // Where the street bends, cars from the two segments would meet at the corner.
    const start = 1.5 + bendMargin(line, i, w), end = len - 1.5 - bendMargin(line, i + 2, w);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // Right of the direction of travel (as traffic drives it).
    const nx = -uz, nz = ux;
    const yaw = side > 0 ? Math.atan2(-ux, -uz) : Math.atan2(ux, uz);
    for (let at = start + rand() * 3; ; ) {
      // A driveway, a hydrant, a gap nobody squeezed into.
      if (rand() > fill) {
        at += 3 + rand() * 6;
        continue;
      }
      const key = parker(rand), L = FLEET[key].len, W = FLEET[key].wid;
      if (at + L > end) break;
      const off = side * (w / 2 - KERB_GAP - W / 2), mid = at + L / 2;
      const x = ax + ux * mid + nx * off, z = az + uz * mid + nz * off;
      const ends = [x + (ux * L) / 2, z + (uz * L) / 2, x - (ux * L) / 2, z - (uz * L) / 2];
      if (free(x, z) && free(ends[0], ends[1]) && free(ends[2], ends[3])) out.push({ key, paint: pickPaint(key, rand), x, z, yaw });
      at += L + 0.5 + rand() * 1.1;
    }
  }
  return out;
}

/** How far from the point at `i` (x index) a row must stay so it doesn't meet the next segment's row. */
function bendMargin(line: ArrayLike<number>, i: number, w: number) {
  if (i < 2 || i + 3 >= line.length) return 0;
  const a = Math.atan2(line[i + 1] - line[i - 1], line[i] - line[i - 2]), b = Math.atan2(line[i + 3] - line[i + 1], line[i + 2] - line[i]);
  const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  return turn >= SHARP_BEND ? w : (w / 2) * Math.tan(turn / 2);
}

/** A street for Junctions: its points (x, z pairs) and width. */
export type Street = { line: ArrayLike<number>; w: number };
const CELL = 16;

/**
 * Every street's segments in a 16 m grid, to keep parked cars off junctions: a spot is
 * clear when it's at least JUNCTION_CLEAR_M past the kerb of every other street — measured
 * to the segment, so it holds where the two streets share no point (a clipped tile, a
 * crossing drawn without a node) and for a T-junction from either side.
 */
export class Junctions {
  private grid = new Map<string, { s: Street; i: number }[]>();

  constructor(streets: Street[]) {
    for (const s of streets) {
      const reach = s.w / 2 + JUNCTION_CLEAR_M;
      for (let i = 0; i + 3 < s.line.length; i += 2) {
        const x0 = Math.min(s.line[i], s.line[i + 2]) - reach, x1 = Math.max(s.line[i], s.line[i + 2]) + reach;
        const z0 = Math.min(s.line[i + 1], s.line[i + 3]) - reach, z1 = Math.max(s.line[i + 1], s.line[i + 3]) + reach;
        for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
          for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
            const key = `${gx}_${gz}`, l = this.grid.get(key);
            if (l) l.push({ s, i });
            else this.grid.set(key, [{ s, i }]);
          }
      }
    }
  }

  /** Whether (x, z), on the street `own`, is clear of every other street. */
  clear(x: number, z: number, own: ArrayLike<number>) {
    const l = this.grid.get(`${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`);
    if (!l) return true;
    for (const { s, i } of l) {
      if (s.line === own || continues(s.line, own)) continue;
      if (segDist(x, z, s.line[i], s.line[i + 1], s.line[i + 2], s.line[i + 3]) < s.w / 2 + JUNCTION_CLEAR_M) return false;
    }
    return true;
  }
}

/** The same street going on as another line (a way split in the map, a tile's edge): end to end, straight on. */
function continues(a: ArrayLike<number>, b: ArrayLike<number>) {
  const na = a.length, nb = b.length;
  for (const ea of [0, na - 2])
    for (const eb of [0, nb - 2]) {
      if (Math.hypot(a[ea] - b[eb], a[ea + 1] - b[eb + 1]) > 1) continue;
      // Each line's direction at the shared end, pointing away from it.
      const pa = ea ? na - 4 : 2, pb = eb ? nb - 4 : 2;
      const ux = a[pa] - a[ea], uz = a[pa + 1] - a[ea + 1], vx = b[pb] - b[eb], vz = b[pb + 1] - b[eb + 1];
      const cos = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1);
      if (cos < -0.94) return true;
    }
  return false;
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const k = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * k, pz - az - dz * k);
}
