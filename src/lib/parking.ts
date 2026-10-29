// Cars parked along the kerb on Iran's streets (pure — drawn by drive/traffic.ts with the
// traffic's own models): nose to tail down the side streets (one side of a two-lane
// street, both sides of a wider one) and the slow lane of the avenues, with gaps for
// junctions, driveways and traffic lights; none on the expressways. Each street's row
// comes from a seed of its own, so the same cars are there when you come back. Traffic
// keeps to what's left of the street (laneOffset).
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
  for (let i = 0; i + 3 < line.length; i += 2) {
    const ax = line[i], az = line[i + 1], bx = line[i + 2], bz = line[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 8) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // Right of the direction of travel (as traffic drives it).
    const nx = -uz, nz = ux;
    const yaw = side > 0 ? Math.atan2(-ux, -uz) : Math.atan2(ux, uz);
    for (let at = 1.5 + rand() * 3; ; ) {
      // A driveway, a hydrant, a gap nobody squeezed into.
      if (rand() > fill) {
        at += 3 + rand() * 6;
        continue;
      }
      const key = parker(rand), L = FLEET[key].len, W = FLEET[key].wid;
      if (at + L > len - 1.5) break;
      const off = side * (w / 2 - KERB_GAP - W / 2), mid = at + L / 2;
      const x = ax + ux * mid + nx * off, z = az + uz * mid + nz * off;
      const ends = [x + (ux * L) / 2, z + (uz * L) / 2, x - (ux * L) / 2, z - (uz * L) / 2];
      if (free(x, z) && free(ends[0], ends[1]) && free(ends[2], ends[3])) out.push({ key, paint: pickPaint(key, rand), x, z, yaw });
      at += L + 0.5 + rand() * 1.1;
    }
  }
  return out;
}
