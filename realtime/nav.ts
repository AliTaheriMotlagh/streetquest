// Walkable streets inside an arena, as a graph: points every ~6 m along every street and
// footpath, linked along each street and across junctions (points within 4 m). Bots
// walk it, and spawns and bomb sites are picked from it, so everything stands on the
// real asphalt. Built once per match from the host's map (match frame, metres).
import type { FootprintIndex } from "../src/lib/arena/geom";

export type Node = { i: number; x: number; z: number; links: number[] };
const STEP = 6;
const JOIN = 4;

export class Nav {
  readonly nodes: Node[] = [];

  constructor(roads: number[][], radius: number, buildings: FootprintIndex) {
    const grid = new Map<string, number[]>();
    const cell = (x: number, z: number) => `${Math.floor(x / JOIN)}_${Math.floor(z / JOIN)}`;
    const addNode = (x: number, z: number) => {
      const n: Node = { i: this.nodes.length, x, z, links: [] };
      this.nodes.push(n);
      const k = cell(x, z);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(n.i);
      return n;
    };
    const link = (a: Node, b: Node) => {
      if (a === b || a.links.includes(b.i)) return;
      a.links.push(b.i);
      b.links.push(a.i);
    };
    const ok = (x: number, z: number) => Math.hypot(x, z) <= radius + 8 && !buildings.inside(x, z, 0.5);
    for (const line of roads) {
      let prev: Node | null = null;
      for (let i = 0; i + 3 < line.length; i += 2) {
        const x0 = line[i], z0 = line[i + 1], x1 = line[i + 2], z1 = line[i + 3];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.ceil(len / STEP));
        for (let s = i === 0 ? 0 : 1; s <= n; s++) {
          const x = x0 + ((x1 - x0) * s) / n, z = z0 + ((z1 - z0) * s) / n;
          if (!ok(x, z)) {
            prev = null;
            continue;
          }
          const node = addNode(x, z);
          if (prev && Math.hypot(prev.x - x, prev.z - z) < STEP * 2.2) link(prev, node);
          prev = node;
        }
      }
    }
    // Junctions: streets that meet (or cross) share nearby points.
    for (const n of this.nodes) {
      const cx = Math.floor(n.x / JOIN), cz = Math.floor(n.z / JOIN);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const j of grid.get(`${cx + dx}_${cz + dz}`) ?? []) {
            const m = this.nodes[j];
            if (m !== n && Math.hypot(m.x - n.x, m.z - n.z) < JOIN) link(n, m);
          }
    }
    this.keepLargest();
  }

  /** Drop islands (a cut-off alley) so every node can reach every other. */
  private keepLargest() {
    const comp = new Array(this.nodes.length).fill(-1);
    let best = -1, bestSize = 0;
    for (let s = 0, c = 0; s < this.nodes.length; s++) {
      if (comp[s] >= 0) continue;
      let size = 0;
      const q = [s];
      comp[s] = c;
      while (q.length) {
        const i = q.pop()!;
        size++;
        for (const j of this.nodes[i].links) if (comp[j] < 0) (comp[j] = c), q.push(j);
      }
      if (size > bestSize) (bestSize = size), (best = c);
      c++;
    }
    const keep = this.nodes.filter((n) => comp[n.i] === best);
    const remap = new Map(keep.map((n, i) => [n.i, i]));
    const out = keep.map((n, i) => ({ i, x: n.x, z: n.z, links: n.links.filter((j) => remap.has(j)).map((j) => remap.get(j)!) }));
    this.nodes.length = 0;
    this.nodes.push(...out);
  }

  nearest(x: number, z: number) {
    let best = this.nodes[0], bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) (bd = d), (best = n);
    }
    return best;
  }

  /** Shortest walk (by links; points are evenly spaced) from a to b, as node indices. */
  path(a: number, b: number, limit = 400): number[] {
    if (a === b) return [b];
    const prev = new Map<number, number>([[a, -1]]);
    const q = [a];
    for (let h = 0; h < q.length && prev.size < 6000; h++) {
      const i = q[h];
      for (const j of this.nodes[i].links) {
        if (prev.has(j)) continue;
        prev.set(j, i);
        if (j === b) {
          const out = [b];
          for (let k = i; k !== a && k >= 0; k = prev.get(k)!) out.push(k);
          return out.reverse().slice(0, limit);
        }
        q.push(j);
      }
    }
    return [];
  }

  random(rand = Math.random, filter?: (n: Node) => boolean) {
    const pool = filter ? this.nodes.filter(filter) : this.nodes;
    return pool.length ? pool[Math.floor(rand() * pool.length)] : this.nodes[Math.floor(rand() * this.nodes.length)];
  }
}
