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
  let best = reach, px = 0, pz = 0, w = 8;
  lines.forEach((l, li) => {
    for (let i = 0; i + 3 < l.length; i += 2) {
      const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * k, qz = az + dz * k, d = Math.hypot(qx - x, qz - z);
      if (d < best) (best = d), (px = qx), (pz = qz), (w = widths[li] ?? 8);
    }
  });
  if (best >= reach) return null;
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
  return { x: sx, z: sz, angle: Math.atan2(px - sx, pz - sz) };
}
