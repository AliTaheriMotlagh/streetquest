// Stores in the 3D city, the way a street shows them — not as game markers (pure; tests/storefront.test.ts):
//  - every store has its own sign: a board on its wall, or on a pole at the kerb in front
//    of it (signSpot: where that pole stands — on the pavement, facing the street);
//  - slowing down or walking past one brings up its card (nearStore: which one — the
//    nearest, those ahead of you a little more than those behind, and the one already
//    shown kept until another is clearly nearer, so it doesn't flicker between neighbours).
// Glowing pillars, rings and floating icons are for game things only: missions and money.

/** A store the card can offer: where it stands, what it is. */
export type StoreSpot = { id: string; x: number; z: number; name: string; cls?: string; emoji?: string };

/** How near (m) a store has to be for its card. */
export const NEAR_STORE_M = 26;

/**
 * The store to offer at (x, z) heading (fx, fz) (a unit vector; 0, 0: no heading), or null.
 * `prev`: the one shown now (kept while it's still about as near as the best).
 */
export function nearStore(list: StoreSpot[], x: number, z: number, fx: number, fz: number, prev: string | null = null): { store: StoreSpot; d: number } | null {
  let best: { store: StoreSpot; d: number; rank: number } | null = null, kept: { store: StoreSpot; d: number; rank: number } | null = null;
  for (const s of list) {
    const dx = s.x - x, dz = s.z - z, d = Math.hypot(dx, dz);
    if (d > NEAR_STORE_M * 1.15) continue;
    const ahead = d > 0.5 ? (dx * fx + dz * fz) / d : 0;
    const rank = d * (1 - 0.25 * ahead);
    if (s.id === prev) kept = { store: s, d, rank };
    if (d <= NEAR_STORE_M && (!best || rank < best.rank)) best = { store: s, d, rank };
  }
  if (kept && (!best || kept.rank < best.rank * 1.3 + 2)) return { store: kept.store, d: kept.d };
  return best && { store: best.store, d: best.d };
}

/**
 * Where a store's pole sign stands: `out` m past the kerb of the nearest street, on the
 * store's side, turned to face the street (`angle`: the sign's rotation about y, as the
 * boards use). A store set well back from the street keeps its own spot, facing it.
 * `lines`/`widths`: the streets' centrelines (x, z pairs) and widths. Null: no street near.
 */
export function signSpot(lines: ArrayLike<number>[], widths: number[], x: number, z: number, out = 1.3, reach = 60): { x: number; z: number; angle: number } | null {
  const near = nearestOn(lines, widths, x, z, reach);
  if (!near) return null;
  const { d: best, px, pz, w } = near;
  const kerb = w / 2 + out;
  let sx = x, sz = z;
  if (best < kerb) {
    // In the street (or right at its edge): out to the pavement on the store's side.
    const nx = best > 0.01 ? (x - px) / best : 1, nz = best > 0.01 ? (z - pz) / best : 0;
    sx = px + nx * kerb;
    sz = pz + nz * kerb;
  } else if (best > kerb + 6) {
    // Set back behind a building line: the sign goes to the kerb in front of it.
    sx = px + ((x - px) / best) * kerb;
    sz = pz + ((z - pz) / best) * kerb;
  }
  // Out of one street can be into the next (a store at a junction, the corner of a
  // crossing): walked out of every street it still stands in, which ends on the corner.
  // No pavement within a few steps: no pole at all — never a sign in the road.
  const clear = offRoads(lines, widths, sx, sz, out);
  if (!clear) return null;
  return { x: clear.x, z: clear.z, angle: Math.atan2(px - clear.x, pz - clear.z) };
}

/** The nearest point on any street within `reach`: where, how far, and that street's width. */
function nearestOn(lines: ArrayLike<number>[], widths: number[], x: number, z: number, reach: number) {
  let best = reach, px = 0, pz = 0, w = 8;
  lines.forEach((l, li) => {
    for (let i = 0; i + 3 < l.length; i += 2) {
      const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * k, qz = az + dz * k, d = Math.hypot(qx - x, qz - z);
      if (d < best) (best = d), (px = qx), (pz = qz), (w = widths[li] ?? 8);
    }
  });
  return best < reach ? { d: best, px, pz, w } : null;
}

/**
 * Is (x, z) on the asphalt of any of these streets, or within `pad` m of its edge? (A pole
 * there stands in the way of the traffic: the 3D city leaves it out.)
 */
export function onRoads(lines: ArrayLike<number>[], widths: number[], x: number, z: number, pad = 0.3): boolean {
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li], half = (widths[li] ?? 8) / 2 + pad;
    for (let i = 0; i + 3 < l.length; i += 2) {
      const ax = l[i], az = l[i + 1];
      const dx = l[i + 2] - ax, dz = l[i + 3] - az, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * k - x, az + dz * k - z) < half) return true;
    }
  }
  return false;
}

/** (x, z) pushed out of every street it stands in, `out` m past that street's kerb; null when it can't get clear in a few steps. */
export function offRoads(lines: ArrayLike<number>[], widths: number[], x: number, z: number, out = 1.3): { x: number; z: number } | null {
  let sx = x, sz = z;
  for (let step = 0; step < 6; step++) {
    let worst: { px: number; pz: number; d: number; w: number } | null = null;
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li], w = widths[li] ?? 8;
      for (let i = 0; i + 3 < l.length; i += 2) {
        const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az, l2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((sx - ax) * dx + (sz - az) * dz) / l2));
        const qx = ax + dx * k, qz = az + dz * k, d = Math.hypot(qx - sx, qz - sz);
        // Deepest in first: the street it's most in the middle of.
        if (d < w / 2 + out * 0.6 - 0.01 && (!worst || d - w / 2 < worst.d - worst.w / 2)) worst = { px: qx, pz: qz, d, w };
      }
    }
    if (!worst) return { x: sx, z: sz };
    const nx = worst.d > 0.01 ? (sx - worst.px) / worst.d : 1, nz = worst.d > 0.01 ? (sz - worst.pz) / worst.d : 0;
    sx = worst.px + nx * (worst.w / 2 + out);
    sz = worst.pz + nz * (worst.w / 2 + out);
  }
  return null;
}

/** `onRoads` for many points against many streets: the segments bucketed on a grid once. */
export class RoadGrid {
  private cells = new Map<string, number[]>();
  private segs: number[] = [];
  private static G = 24;
  constructor(lines: ArrayLike<number>[], widths: number[]) {
    const G = RoadGrid.G;
    lines.forEach((l, li) => {
      const w = widths[li] ?? 8;
      for (let i = 0; i + 3 < l.length; i += 2) {
        const id = this.segs.length;
        this.segs.push(l[i], l[i + 1], l[i + 2], l[i + 3], w);
        const pad = w / 2 + 2;
        for (let gx = Math.floor((Math.min(l[i], l[i + 2]) - pad) / G); gx <= Math.floor((Math.max(l[i], l[i + 2]) + pad) / G); gx++)
          for (let gz = Math.floor((Math.min(l[i + 1], l[i + 3]) - pad) / G); gz <= Math.floor((Math.max(l[i + 1], l[i + 3]) + pad) / G); gz++) {
            const k = `${gx}_${gz}`;
            const c = this.cells.get(k);
            if (c) c.push(id);
            else this.cells.set(k, [id]);
          }
      }
    });
  }
  /** On the asphalt of any street, or within `pad` m of its edge (pad ≤ 2). */
  on(x: number, z: number, pad = 0.3): boolean {
    const s = this.segs;
    for (const id of this.cells.get(`${Math.floor(x / RoadGrid.G)}_${Math.floor(z / RoadGrid.G)}`) ?? []) {
      const ax = s[id], az = s[id + 1], dx = s[id + 2] - ax, dz = s[id + 3] - az, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * k - x, az + dz * k - z) < s[id + 4] / 2 + pad) return true;
    }
    return false;
  }
}
