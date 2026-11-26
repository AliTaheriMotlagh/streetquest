// Walking inside an owner's 3D scan of their store (pure; tests/scanFloor.test.ts). A phone scan is one mesh with no
// idea of what's a shelf: so the floor is cut into small cells, and a cell is blocked when any of the scan's points
// stands in it between knee and head height (a shelf, a counter, a wall) — the rest is floor you can walk on.
// Moving is refused into a blocked cell (keeping a body's width off), you start at the clear cell nearest the street
// side, and the keeper stands at the clear cell deepest inside, facing the door.

export type FloorGrid = { x0: number; z0: number; cell: number; nx: number; nz: number; blocked: Uint8Array };

/** Points between these heights above the floor block a cell (m). */
export const KNEE = 0.3, HEAD = 1.8;
export const CELL = 0.25;
/** Half a body's width kept off anything solid (m). */
export const BODY_R = 0.25;

/** The floor grid of a scan from its points (x, y, z triples, the floor at y = 0) inside the box. */
export function floorGrid(points: ArrayLike<number>, box: { x0: number; x1: number; z0: number; z1: number }, cell = CELL): FloorGrid {
  const nx = Math.max(1, Math.ceil((box.x1 - box.x0) / cell)), nz = Math.max(1, Math.ceil((box.z1 - box.z0) / cell));
  const blocked = new Uint8Array(nx * nz);
  for (let i = 0; i + 2 < points.length; i += 3) {
    const y = points[i + 1];
    if (y < KNEE || y > HEAD) continue;
    const cx = Math.floor((points[i] - box.x0) / cell), cz = Math.floor((points[i + 2] - box.z0) / cell);
    if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) blocked[cz * nx + cx] = 1;
  }
  return { x0: box.x0, z0: box.z0, cell, nx, nz, blocked };
}

const at = (g: FloorGrid, cx: number, cz: number) => cx < 0 || cz < 0 || cx >= g.nx || cz >= g.nz || g.blocked[cz * g.nx + cx] === 1;

/** Can a body of radius `r` stand at (x, z)? Off the grid counts as a wall. */
export function free(g: FloorGrid, x: number, z: number, r = BODY_R): boolean {
  const c0 = Math.floor((x - r - g.x0) / g.cell), c1 = Math.floor((x + r - g.x0) / g.cell);
  const r0 = Math.floor((z - r - g.z0) / g.cell), r1 = Math.floor((z + r - g.z0) / g.cell);
  for (let cz = r0; cz <= r1; cz++) for (let cx = c0; cx <= c1; cx++) if (at(g, cx, cz)) return false;
  return true;
}

/** A step from (x, z) toward (nx, nz): all of it if clear, else sliding along whichever axis is, else none. */
export function step(g: FloorGrid, x: number, z: number, nx: number, nz: number, r = BODY_R): { x: number; z: number } {
  if (free(g, nx, nz, r)) return { x: nx, z: nz };
  if (free(g, nx, z, r)) return { x: nx, z };
  if (free(g, x, nz, r)) return { x, z: nz };
  return { x, z };
}

/** The clear spot (cell centre) best by `score` (higher wins), or null when nothing is clear. */
function bestFree(g: FloorGrid, score: (x: number, z: number) => number, r = BODY_R): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null, bs = -Infinity;
  for (let cz = 0; cz < g.nz; cz++)
    for (let cx = 0; cx < g.nx; cx++) {
      const x = g.x0 + (cx + 0.5) * g.cell, z = g.z0 + (cz + 0.5) * g.cell;
      if (!free(g, x, z, r)) continue;
      const s = score(x, z);
      if (s > bs) (bs = s), (best = { x, z });
    }
  return best;
}

/** Where you start: the clear spot nearest the street side (+z), towards the middle. */
export const startSpot = (g: FloorGrid) => bestFree(g, (x, z) => z * 4 - Math.abs(x));
/** Where the keeper stands: the clear spot deepest inside (−z), towards the middle; facing the door (+z). */
export const keeperSpot = (g: FloorGrid) => bestFree(g, (x, z) => -z * 4 - Math.abs(x));
