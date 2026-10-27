// One map tile → plain typed arrays for the 3D city. Pure geometry, no DOM and no GPU,
// so it runs inside a Web Worker (tile.worker.ts) and the drive never stutters while a
// neighbourhood loads; the main thread only wraps the arrays in meshes (tiles3d.ts).
//
// Per tile: a handful of merged layers (ground, water, asphalt, road markings, walls,
// glass façades, roofs), instance matrices for street furniture (trees, lamps, traffic
// lights, bus stops), building footprints for collisions and the street names to paint.
import * as THREE from "three";
import { hashStr, rng, type LatLng } from "@/lib/geo";
import { insidePacked, makeFrame, PROP, type BuildingKind, type CityTile, type RoadKind, type RoofShape } from "@/lib/city";
import type { VtCell } from "./vectorTile";

export type Style = "real" | "toon";
export type LayerName = "ground" | "water" | "roads" | "marks" | "walls" | "glass" | "roofs";
export type Layer = { name: LayerName; pos: Float32Array; nor: Float32Array; col: Float32Array; uv: Float32Array; idx: Uint32Array };
export type PropKind = "tree" | "lamp" | "signal" | "bus";
export type Instances = { kind: PropKind; mats: Float32Array; cols: Float32Array | null };
export type Footprint = { pts: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number; h: number; mh: number };
/**
 * Text to show in the city: street names on the asphalt, landmark names over buildings,
 * storefront signs on the wall nearest a shop ("shop", with its OSM class in `cls`; on a
 * pole when there's no wall close by) and house-number plaques ("num").
 */
export type Label = { text: string; x: number; z: number; angle: number; w: number; y: number; kind: "street" | "building" | "shop" | "num"; cls?: string; pole?: boolean };
export type TileArrays = {
  key: string;
  real: boolean;
  layers: Layer[];
  props: Instances[];
  footprints: Footprint[];
  roads: Float32Array[];
  roadWidths: number[];
  roadKinds: RoadKind[];
  roadNames: (string | null)[];
  /** false: a name-only line (the asphalt is another line). */
  roadDrawn: boolean[];
  labels: Label[];
};

// ---------------------------------------------------------------- palettes
type Palette = {
  walls: Record<BuildingKind, string[]>;
  roofs: Record<BuildingKind, string[]>;
  flatRoofs: string[];
  roads: Record<RoadKind | "walk" | "line" | "center" | "rail2", string>;
  areas: Record<string, string>;
  trees: string[];
  /** Façades drawn as glass curtain walls. */
  glass: BuildingKind[];
};

export const PALETTES: Record<Style, Palette> = {
  real: {
    walls: {
      house: ["#e6dfd2", "#d9cbb3", "#cdbca4", "#b0674e", "#9a5b46", "#efe9de", "#d2c9bb", "#c4b29a"],
      apartments: ["#d9d3c7", "#c9c0b3", "#bca78e", "#a76b54", "#e3ddd0", "#c3c6c9", "#b8b2a6"],
      shop: ["#e5dbca", "#d4c4a8", "#c9ced3", "#b98e6d", "#ddd6cc"],
      office: ["#6f8aa3", "#5d7389", "#7d95a8", "#8aa0b0"],
      industrial: ["#bab7af", "#a9a59c", "#c6c2b8", "#91959a"],
      civic: ["#e4dccb", "#d6cdb9", "#cbbb9e"],
      church: ["#d9cfba", "#c8bba2"],
      tower: ["#56718a", "#4a6278", "#6b8499", "#5f7a8c"],
    },
    roofs: {
      house: ["#8b4a36", "#723f30", "#5b5c60", "#4b4d53", "#7a5442", "#6a3a2c"],
      apartments: ["#6d6e70", "#7b7c7e", "#5f6163"],
      shop: ["#6d6e70", "#7b7c7e"],
      office: ["#5f6163", "#707274"],
      industrial: ["#8c9094", "#7b8085", "#9a8f84"],
      civic: ["#5a6e6a", "#6b6f78", "#7a5442"],
      church: ["#4f5a63", "#5b6670"],
      tower: ["#4f5459", "#5c6166"],
    },
    flatRoofs: ["#6d6e70", "#7b7c7e", "#5f6163", "#8a8b8c", "#74706a"],
    roads: { major: "#3a3d43", minor: "#44474d", path: "#5c5f64", foot: "#a8a396", rail: "#6b6258", walk: "#b5b2aa", line: "#e9e9e6", center: "#e0b43a", rail2: "#3a3634" },
    areas: { park: "#5f8f45", grass: "#6c9a4e", forest: "#3e6a34", pitch: "#4c9a46", water: "#3a6d8c", parking: "#56595e", plaza: "#b3ab9e", sand: "#d8c79a", farm: "#8d985a", residential: "#868b7a", commercial: "#8d8b86", industrial: "#8a8780", cemetery: "#68875a" },
    trees: ["#3f6b2f", "#4b7a35", "#557f3a", "#3a5f2c", "#62873f", "#7a8a3a"],
    glass: ["office", "tower"],
  },
  toon: {
    walls: {
      house: ["#fff1d6", "#ffe0e6", "#e7f5d9", "#fde7c4", "#e5e9ff", "#fff8e6"],
      apartments: ["#ffd8b5", "#f9c6c9", "#d7e8ff", "#e8dcff", "#fbe3a5"],
      shop: ["#ffd29d", "#ffb4c6", "#bfe8d4", "#ffe58f", "#c9d7ff"],
      office: ["#bfe0ff", "#d0d7ff", "#c6f0ec", "#e0e7f0"],
      industrial: ["#d9d2c5", "#cfd6d9", "#e1d4bd"],
      civic: ["#f2e6cf", "#e9e2f7", "#dff0e6"],
      church: ["#efe4d2", "#e6dccc"],
      tower: ["#a9d4ff", "#b9c4ff", "#a6e3e0"],
    },
    roofs: {
      house: ["#e2683c", "#c9573f", "#d97b4a", "#8e5bd8", "#3f8fd8", "#4aa36c"],
      apartments: ["#7b6fd6", "#d8644a", "#4a8fd0"],
      shop: ["#ff7a59", "#5b9cf0", "#f2b134", "#e35d8f"],
      office: ["#5e6fd6", "#3d8bd1", "#58b7b0"],
      industrial: ["#7d8794", "#8c7a68"],
      civic: ["#3c8f8a", "#7a5bd1"],
      church: ["#5a62c9", "#3b7fc4"],
      tower: ["#4757c9", "#2f8bd6"],
    },
    flatRoofs: ["#7b6fd6", "#5b9cf0", "#58b7b0", "#d8644a"],
    roads: { major: "#6e7290", minor: "#82849c", path: "#a3a5b8", foot: "#d7c39a", rail: "#9b8f84", walk: "#f4efe6", line: "#ffffff", center: "#f6d58c", rail2: "#5a5a6a" },
    areas: { park: "#86d36e", grass: "#97da7c", forest: "#4fa35e", pitch: "#6fc46a", water: "#52b8ef", parking: "#a9abc0", plaza: "#f0dcb4", sand: "#ffe3a1", farm: "#c9df7a", residential: "#a9d98f", commercial: "#c7d7a8", industrial: "#c9c6b6", cemetery: "#8fcf7a" },
    trees: ["#5fcf6b", "#7ad66a", "#4cb86d", "#98db5e", "#ff9fc4", "#ffd166"],
    glass: [],
  },
};

const AREA_Y: Record<string, number> = { residential: 0.004, commercial: 0.004, industrial: 0.004, farm: 0.012, cemetery: 0.012, sand: 0.012, grass: 0.016, park: 0.018, forest: 0.018, pitch: 0.02, parking: 0.024, plaza: 0.024, water: 0.03 };
const ROAD_Y: Record<RoadKind, number> = { major: 0.09, minor: 0.075, path: 0.06, foot: 0.045, rail: 0.05 };

// ---------------------------------------------------------------- builders
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, u = 0, v = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  layer(name: LayerName): Layer | null {
    if (!this.idx.length) return null;
    return { name, pos: new Float32Array(this.pos), nor: new Float32Array(this.nor), col: new Float32Array(this.col), uv: new Float32Array(this.uv), idx: new Uint32Array(this.idx) };
  }
  /** A flat-shaded triangle facing away from `out` (a point inside the solid). */
  tri(a: V3, b: V3, c: V3, col: THREE.Color, out: V3) {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const mx = (a[0] + b[0] + c[0]) / 3 - out[0], my = (a[1] + b[1] + c[1]) / 3 - out[1], mz = (a[2] + b[2] + c[2]) / 3 - out[2];
    let flip = false;
    if (nx * mx + ny * my + nz * mz < 0) (nx = -nx), (ny = -ny), (nz = -nz), (flip = true);
    const l = Math.hypot(nx, ny, nz) || 1;
    (nx /= l), (ny /= l), (nz /= l);
    const shade = col.clone().multiplyScalar(0.82 + 0.18 * Math.max(0, ny));
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, shade), i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, shade), i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, shade);
    // three.js front faces are counter-clockwise seen from outside.
    if (flip) this.idx.push(i0, i2, i1);
    else this.idx.push(i0, i1, i2);
  }
}
type V3 = [number, number, number];

const color = (hex: string) => new THREE.Color(hex);
const pick = (list: string[], seed: number) => color(list[seed % list.length]);

function signedArea(p: Float32Array) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return a / 2;
}

/** A flat triangle facing up (+y) whatever order its corners come in. */
function up(b: Builder, i0: number, i1: number, i2: number) {
  const P = b.pos;
  const a = i0 * 3, c1 = i1 * 3, c2 = i2 * 3;
  const ux = P[c1] - P[a], uz = P[c1 + 2] - P[a + 2], vx = P[c2] - P[a], vz = P[c2 + 2] - P[a + 2];
  if (uz * vx - ux * vz >= 0) b.idx.push(i0, i1, i2);
  else b.idx.push(i0, i2, i1);
}

function triangulate(p: Float32Array) {
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
  return { contour, tris: THREE.ShapeUtils.triangulateShape(contour, []) };
}

/** A strip `w` wide along a polyline (mitred, capped so hairpins don't spike). */
function ribbon(b: Builder, pts: Float32Array, w: number, y: number, c: THREE.Color, uvScale = 0) {
  const n = pts.length / 2;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    const ax = i > 0 ? x - pts[i * 2 - 2] : pts[i * 2 + 2] - x, az = i > 0 ? z - pts[i * 2 - 1] : pts[i * 2 + 3] - z;
    const bx = i < n - 1 ? pts[i * 2 + 2] - x : ax, bz = i < n - 1 ? pts[i * 2 + 3] - z : az;
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    let px = -(az / la + bz / lb), pz = ax / la + bx / lb;
    const lp = Math.hypot(px, pz) || 1;
    px /= lp;
    pz /= lp;
    const dot = Math.max(0.35, px * (-az / la) + pz * (ax / la));
    const half = w / 2 / dot;
    const lx = x + px * half, lz = z + pz * half, rx = x - px * half, rz = z - pz * half;
    const l = b.vert(lx, y, lz, 0, 1, 0, c, lx * uvScale, lz * uvScale), r = b.vert(rx, y, rz, 0, 1, 0, c, rx * uvScale, rz * uvScale);
    if (prev >= 0) (up(b, prev, prev + 1, l), up(b, prev + 1, r, l));
    prev = l;
  }
}

/** A polyline shifted sideways by `off` metres (left of travel is positive). */
function offsetLine(pts: Float32Array, off: number) {
  const n = pts.length / 2, out = new Float32Array(pts.length);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    const ax = i > 0 ? x - pts[i * 2 - 2] : pts[i * 2 + 2] - x, az = i > 0 ? z - pts[i * 2 - 1] : pts[i * 2 + 3] - z;
    const bx = i < n - 1 ? pts[i * 2 + 2] - x : ax, bz = i < n - 1 ? pts[i * 2 + 3] - z : az;
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    let px = -(az / la + bz / lb), pz = ax / la + bx / lb;
    const lp = Math.hypot(px, pz) || 1;
    (px /= lp), (pz /= lp);
    const dot = Math.max(0.5, px * (-az / la) + pz * (ax / la));
    out[i * 2] = x + (px * off) / dot;
    out[i * 2 + 1] = z + (pz * off) / dot;
  }
  return out;
}

/** Dashes along a polyline: `on` metres painted, `gap` metres bare. */
function dashes(b: Builder, pts: Float32Array, w: number, y: number, c: THREE.Color, on: number, gap: number) {
  let carry = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
    const len = Math.hypot(x1 - x0, z1 - z0);
    let s = carry;
    for (; s < len; s += on + gap) {
      const e = Math.min(len, s + on);
      if (e - s < 0.4) continue;
      ribbon(b, new Float32Array([x0 + ((x1 - x0) * s) / len, z0 + ((z1 - z0) * s) / len, x0 + ((x1 - x0) * e) / len, z0 + ((z1 - z0) * e) / len]), w, y, c);
    }
    carry = s - len;
  }
}

function disc(b: Builder, x: number, z: number, rad: number, y: number, c: THREE.Color, uvScale = 0) {
  const center = b.vert(x, y, z, 0, 1, 0, c, x * uvScale, z * uvScale);
  const seg = 10;
  for (let k = 0; k <= seg; k++) {
    const px = x + Math.cos((k / seg) * Math.PI * 2) * rad, pz = z + Math.sin((k / seg) * Math.PI * 2) * rad;
    b.vert(px, y, pz, 0, 1, 0, c, px * uvScale, pz * uvScale);
  }
  for (let k = 0; k < seg; k++) up(b, center, center + 2 + k, center + 1 + k);
}

// ---------------------------------------------------------------- the tile
const FLOOR_M = 3.3;
const WINDOW_M = 4.2;
const DRIVABLE: RoadKind[] = ["major", "minor", "path"];

export function buildTileArrays(tile: CityTile, origin: LatLng, style: Style, lite: boolean): TileArrays {
  const frame = makeFrame(origin);
  const pal = PALETTES[style];
  const realStyle = style === "real";
  const ground = new Builder(), water = new Builder(), roads = new Builder(), marks = new Builder(), walls = new Builder(), glass = new Builder(), roofs = new Builder();
  const footprints: Footprint[] = [];
  const labels: Label[] = [];
  const rand = rng(hashStr(`props|${tile.key}`));

  // ---- buildings
  for (let bi = 0; bi < tile.b.length; bi++) {
    const b = tile.b[bi];
    let pts = frame.unpack(tile.cx, tile.cy, b.r);
    if (pts.length < 6) continue;
    // Counter-clockwise in (x, z): then (dz, −dx) along each edge points outward.
    if (signedArea(pts) < 0) {
      const rev = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 2) (rev[i] = pts[pts.length - 2 - i]), (rev[i + 1] = pts[pts.length - 1 - i]);
      pts = rev;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pts.length; i += 2) (minX = Math.min(minX, pts[i])), (maxX = Math.max(maxX, pts[i])), (minZ = Math.min(minZ, pts[i + 1])), (maxZ = Math.max(maxZ, pts[i + 1]));
    const seed = hashStr(`${tile.key}|${bi}`);
    const h = Math.max(3, b.h), mh = Math.min(h - 1, b.mh ?? 0);
    footprints.push({ pts, minX, maxX, minZ, maxZ, h, mh });
    const isGlass = pal.glass.includes(b.k) && !b.c;
    const wall = b.c ? color(b.c) : pick(pal.walls[b.k] ?? pal.walls.house, seed);
    const foot = wall.clone().multiplyScalar(realStyle ? 0.8 : 0.72); // darker at street level: fake ambient occlusion
    const area = Math.abs(signedArea(pts));
    const { contour, tris } = triangulate(pts);
    let cx = 0, cz = 0;
    for (const v of contour) (cx += v.x), (cz += v.y);
    cx /= contour.length;
    cz /= contour.length;
    // Roof shape: from the map, else a guess — pitched roofs on small houses.
    const n = contour.length;
    let shape: RoofShape = b.rf ?? (b.k === "house" && area < 450 ? (n === 4 ? "gabled" : n <= 10 ? "hipped" : "flat") : b.k === "church" && n === 4 ? "gabled" : "flat");
    if ((shape === "gabled" && n !== 4) || ((shape === "hipped" || shape === "pyramidal") && n > 12)) shape = n <= 12 ? "hipped" : "flat";
    const roof = b.rc ? color(b.rc) : shape === "flat" ? pick(pal.flatRoofs, seed >>> 3) : pick(pal.roofs[b.k] ?? pal.roofs.house, seed >>> 3);

    const target = isGlass ? glass : walls;
    let u = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[j], z1 = pts[j + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
      const u0 = u / WINDOW_M, u1 = (u + len) / WINDOW_M, v0 = mh / FLOOR_M, v1 = h / FLOOR_M;
      const a = target.vert(x0, mh, z0, nx, 0, nz, foot, u0, v0);
      const bb = target.vert(x1, mh, z1, nx, 0, nz, foot, u1, v0);
      const c = target.vert(x1, h, z1, nx, 0, nz, wall, u1, v1);
      const d = target.vert(x0, h, z0, nx, 0, nz, wall, u0, v1);
      target.idx.push(a, c, bb, a, d, c);
      u += len;
    }
    // A canopy on pillars: close it underneath.
    if (mh > 0.5) {
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, mh, v.y, 0, -1, 0, roof.clone().multiplyScalar(0.6));
      for (const tri of tris) roofs.idx.push(base + tri[0], base + tri[2], base + tri[1]);
    }

    const inside: V3 = [cx, h - 1, cz];
    if (shape === "gabled") {
      const P = contour.map((v) => [v.x, v.y] as [number, number]);
      const e0 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), e1 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
      // Ridge along the long side: rotate the corners so p0→p1 is a long edge.
      const Q = e0 >= e1 ? P : [P[1], P[2], P[3], P[0]];
      const short = Math.min(e0, e1);
      const peak = h + Math.min(realStyle ? 5 : 4, short * (realStyle ? 0.42 : 0.35));
      const rA: V3 = [(Q[3][0] + Q[0][0]) / 2, peak, (Q[3][1] + Q[0][1]) / 2];
      const rB: V3 = [(Q[1][0] + Q[2][0]) / 2, peak, (Q[1][1] + Q[2][1]) / 2];
      const c3 = (q: [number, number]): V3 => [q[0], h, q[1]];
      roofs.tri(c3(Q[0]), c3(Q[1]), rB, roof, inside);
      roofs.tri(c3(Q[0]), rB, rA, roof, inside);
      roofs.tri(c3(Q[2]), c3(Q[3]), rA, roof, inside);
      roofs.tri(c3(Q[2]), rA, rB, roof, inside);
      // The gable ends are wall.
      walls.tri(c3(Q[1]), c3(Q[2]), rB, wall, inside);
      walls.tri(c3(Q[3]), c3(Q[0]), rA, wall, inside);
    } else if (shape === "hipped" || shape === "pyramidal") {
      const peak = h + Math.min(4.5, Math.sqrt(area) * 0.35);
      for (let i = 0; i < n; i++) {
        const p0 = contour[i], p1 = contour[(i + 1) % n];
        roofs.tri([p0.x, h, p0.y], [p1.x, h, p1.y], [cx, peak, cz], roof, inside);
      }
    } else if (shape === "dome") {
      const r = Math.min(Math.sqrt(area / Math.PI), 18);
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, h, v.y, 0, 1, 0, roof);
      for (const tri of tris) up(roofs, base + tri[0], base + tri[1], base + tri[2]);
      const rings = 5, segs = 14;
      const at = (i: number, k: number): V3 => {
        const phi = (i / rings) * (Math.PI / 2), th = (k / segs) * Math.PI * 2;
        return [cx + Math.cos(th) * Math.cos(phi) * r, h + Math.sin(phi) * r * 0.9, cz + Math.sin(th) * Math.cos(phi) * r];
      };
      const out: V3 = [cx, h, cz];
      for (let i = 0; i < rings; i++)
        for (let k = 0; k < segs; k++) {
          roofs.tri(at(i, k), at(i, k + 1), at(i + 1, k + 1), roof, out);
          if (i < rings - 1) roofs.tri(at(i, k), at(i + 1, k + 1), at(i + 1, k), roof, out);
        }
    } else {
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, h, v.y, 0, 1, 0, roof);
      for (const tri of tris) up(roofs, base + tri[0], base + tri[1], base + tri[2]);
      // Rooftop clutter on big flat roofs: an AC box / lift housing.
      if (realStyle && area > 300 && h > 9 && !lite) {
        const s = Math.min(6, Math.sqrt(area) * 0.18), hh = 1.6 + (seed % 3) * 0.5;
        const box: V3[] = [[cx - s, h, cz - s], [cx + s, h, cz - s], [cx + s, h, cz + s], [cx - s, h, cz + s]];
        const top = box.map((p) => [p[0], h + hh, p[2]] as V3);
        const grey = color("#8e9092"), mid: V3 = [cx, h + hh / 2, cz];
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          roofs.tri(box[i], box[j], top[j], grey, mid);
          roofs.tri(box[i], top[j], top[i], grey, mid);
        }
        roofs.tri(top[0], top[1], top[2], grey, mid);
        roofs.tri(top[0], top[2], top[3], grey, mid);
      }
    }
    // Landmarks: spires on churches, antennas on towers.
    if (b.k === "church" || (b.k === "tower" && h > 60)) {
      const church = b.k === "church";
      const rad = church ? Math.min(3.5, Math.sqrt(area) * 0.16) : 0.35;
      const tall = church ? Math.min(20, h * 0.85) : h * 0.22;
      const top = (shape === "gabled" ? h + Math.min(5, Math.sqrt(area) * 0.3) : h) + tall;
      const sc = church ? roof : color("#d8dde6");
      const segs = church ? 8 : 6, out: V3 = [cx, h + tall / 3, cz];
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
        roofs.tri([cx + Math.cos(a0) * rad, top - tall, cz + Math.sin(a0) * rad], [cx + Math.cos(a1) * rad, top - tall, cz + Math.sin(a1) * rad], [cx, top, cz], sc, out);
      }
    }
    if (b.n) labels.push({ text: b.n, x: cx, z: cz, angle: 0, w: 0, y: h + 4, kind: "building" });
  }

  // ---- roads, sidewalks and markings
  const roadLines: Float32Array[] = [], roadWidths: number[] = [], roadKinds: RoadKind[] = [], roadNames: (string | null)[] = [], roadDrawn: boolean[] = [];
  const walk = color(pal.roads.walk), white = color(pal.roads.line), yellow = color(pal.roads.center), rail2 = color(pal.roads.rail2);
  const UV = realStyle ? 1 / 7 : 0;
  // Intersections: vertices where three or more road ends meet get zebra crossings.
  const degree = new Map<string, number>();
  const vk = (x: number, z: number) => `${Math.round(x * 2)}_${Math.round(z * 2)}`;
  const unpacked = tile.r.map((r) => frame.unpack(tile.cx, tile.cy, r.l));
  tile.r.forEach((r, ri) => {
    if ((r.k !== "major" && r.k !== "minor") || r.x) return;
    const p = unpacked[ri], n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const k = vk(p[i * 2], p[i * 2 + 1]);
      degree.set(k, (degree.get(k) ?? 0) + (i === 0 || i === n - 1 ? 1 : 2));
    }
  });
  let zebras = 0;
  tile.r.forEach((r, ri) => {
    const pts = unpacked[ri];
    if (pts.length < 4) return;
    roadLines.push(pts);
    roadWidths.push(r.w);
    roadKinds.push(r.k);
    roadNames.push(r.n ?? null);
    roadDrawn.push(!r.x);
    if (r.x) return;
    const c = color(pal.roads[r.k]);
    const y = ROAD_Y[r.k];
    const car = r.k === "major" || r.k === "minor";
    if (car) ribbon(roads, pts, r.w + (realStyle ? 4.6 : 1.2), y - 0.02, walk, UV);
    if (r.k === "rail") {
      ribbon(roads, pts, r.w, y, c, UV);
      for (const off of [-0.72, 0.72]) ribbon(marks, offsetLine(pts, off), 0.12, y + 0.03, rail2);
      return;
    }
    ribbon(roads, pts, r.w, y, c, UV);
    if (r.k !== "foot") for (let i = 0; i < pts.length; i += 2) disc(roads, pts[i], pts[i + 1], r.w / 2, y - 0.005, c, UV);
    if (!car) return;
    const my = y + 0.012;
    // Markings: double yellow down the middle of two-way main roads, dashed white elsewhere,
    // lane dividers on wide roads and solid edge lines on main roads.
    if (r.k === "major" && !r.ow) for (const off of [-0.14, 0.14]) ribbon(marks, offsetLine(pts, off), 0.12, my, realStyle ? yellow : white);
    else if (!r.ow && r.w >= 6.5) dashes(marks, pts, 0.14, my, white, 3, 6);
    const lanes = r.ln ?? Math.max(1, Math.round(r.w / 3.4));
    if (lanes >= (r.ow ? 2 : 4)) {
      const per = r.ow ? lanes : lanes / 2;
      for (let l = 1; l < per; l++) {
        const off = r.ow ? -r.w / 2 + (r.w / lanes) * l : (r.w / 2 / per) * l;
        dashes(marks, offsetLine(pts, off), 0.12, my, white, 3, 6);
        if (!r.ow) dashes(marks, offsetLine(pts, -off), 0.12, my, white, 3, 6);
      }
    }
    if (r.k === "major" && realStyle) for (const off of [-(r.w / 2 - 0.35), r.w / 2 - 0.35]) ribbon(marks, offsetLine(pts, off), 0.12, my, white);
    // Zebra crossings a few metres back from each intersection.
    if (!realStyle || lite || zebras > 140 || r.w < 6) return;
    const n = pts.length / 2;
    for (const end of [0, n - 1]) {
      const k = vk(pts[end * 2], pts[end * 2 + 1]);
      if ((degree.get(k) ?? 0) < 3) continue;
      const nb = end === 0 ? 1 : n - 2;
      const x0 = pts[end * 2], z0 = pts[end * 2 + 1], dx = pts[nb * 2] - x0, dz = pts[nb * 2 + 1] - z0, len = Math.hypot(dx, dz);
      if (len < 10) continue;
      const fx = dx / len, fz = dz / len, sx = -fz, sz = fx;
      const at = 5.5, cxp = x0 + fx * at, czp = z0 + fz * at;
      for (let s = -r.w / 2 + 0.5; s < r.w / 2 - 0.3; s += 1.1) {
        const ax = cxp + sx * s, az = czp + sz * s;
        ribbon(marks, new Float32Array([ax - fx * 1.5, az - fz * 1.5, ax + fx * 1.5, az + fz * 1.5]), 0.55, my, white);
      }
      zebras++;
    }
  });

  // Street names, painted along the road: one every ~160 m of each named street.
  const lastAt = new Map<string, { x: number; z: number }[]>();
  tile.r.forEach((r, ri) => {
    if (!r.n || !DRIVABLE.includes(r.k)) return;
    const pts = unpacked[ri];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < Math.max(26, r.n.length * 1.6)) continue;
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      const seen = lastAt.get(r.n) ?? [];
      if (seen.some((p) => Math.hypot(p.x - x, p.z - z) < 160)) continue;
      seen.push({ x, z });
      lastAt.set(r.n, seen);
      labels.push({ text: r.n, x, z, angle: Math.atan2(x1 - x0, z1 - z0), w: r.w, y: ROAD_Y[r.k] + 0.02, kind: "street" });
    }
  });

  // ---- parks, water, land use
  const treeSpots: { x: number; z: number; s: number }[] = [];
  for (const a of tile.a) {
    const pts = frame.unpack(tile.cx, tile.cy, a.r);
    if (pts.length < 6) continue;
    const { contour, tris } = triangulate(pts);
    const target = a.k === "water" ? water : ground;
    const c = color(pal.areas[a.k] ?? pal.areas.grass);
    const y = AREA_Y[a.k] ?? 0.015;
    const base = target.pos.length / 3;
    for (const v of contour) target.vert(v.x, y, v.y, 0, 1, 0, c, v.x * UV, v.y * UV);
    for (const tri of tris) up(target, base + tri[0], base + tri[1], base + tri[2]);
    if (a.k === "park" || a.k === "forest" || a.k === "cemetery") {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 2) (minX = Math.min(minX, pts[i])), (maxX = Math.max(maxX, pts[i])), (minZ = Math.min(minZ, pts[i + 1])), (maxZ = Math.max(maxZ, pts[i + 1]));
      const want = Math.min(lite ? 25 : 70, Math.round(Math.abs(signedArea(pts)) / (a.k === "forest" ? 80 : 220)));
      for (let k = 0, tries = 0; k < want && tries < want * 4; tries++) {
        const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
        if (!insidePacked(pts, x, z)) continue;
        treeSpots.push({ x, z, s: 0.8 + rand() * 0.7 });
        k++;
      }
    }
  }

  // ---- street furniture
  const blocked = (x: number, z: number, pad: number) => footprints.some((f) => x >= f.minX - pad && x <= f.maxX + pad && z >= f.minZ - pad && z <= f.maxZ + pad && insidePacked(f.pts, x, z));
  const lamps: { x: number; z: number; yaw: number }[] = [], signals: { x: number; z: number; yaw: number }[] = [], buses: { x: number; z: number; yaw: number }[] = [];
  /** Facing the nearest street: the yaw that points from (x, z) to it. */
  const faceRoad = (x: number, z: number) => {
    let best = Infinity, yaw = 0;
    for (let ri = 0; ri < roadLines.length; ri++) {
      if (!DRIVABLE.includes(roadKinds[ri])) continue;
      const p = roadLines[ri];
      for (let i = 0; i + 3 < p.length; i += 2) {
        const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], l2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((x - p[i]) * dx + (z - p[i + 1]) * dz) / l2));
        const qx = p[i] + dx * k - x, qz = p[i + 1] + dz * k - z, d = qx * qx + qz * qz;
        if (d < best) (best = d), (yaw = Math.atan2(qx, qz));
      }
    }
    return yaw;
  };
  const o = tile.o ?? [];
  let osmTrees = 0, osmLamps = 0;
  for (let i = 0; i + 2 < o.length; i += 3) {
    const [x, z] = frame.unpack(tile.cx, tile.cy, [o[i], o[i + 1]]);
    const kind = o[i + 2];
    if (kind === PROP.tree) (treeSpots.push({ x, z, s: 0.7 + rand() * 0.6 }), osmTrees++);
    else if (kind === PROP.lamp && !lite) (lamps.push({ x, z, yaw: faceRoad(x, z) }), osmLamps++);
    else if (kind === PROP.signal) signals.push({ x, z, yaw: faceRoad(x, z) });
    else if (kind === PROP.bus && !lite) buses.push({ x, z, yaw: faceRoad(x, z) + Math.PI });
  }
  // Street trees and lamps along the bigger roads where the map has none.
  const roadside = (lite ? 40 : 110) * (osmTrees > 20 ? 0.3 : 1);
  let planted = 0, lit = 0;
  const lampCap = osmLamps > 5 ? 0 : lite ? 0 : 140;
  roadLines.forEach((pts, ri) => {
    const k = roadKinds[ri], w = roadWidths[ri];
    if (k !== "major" && k !== "minor") return;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 12) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (w >= 7)
        for (let s = 9; s < len - 4 && planted < roadside; s += 20 + rand() * 16) {
          const side = rand() < 0.5 ? 1 : -1, off = w / 2 + 2.3 + rand() * 0.6;
          const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
          if (blocked(x, z, 1.5)) continue;
          treeSpots.push({ x, z, s: 0.5 + rand() * 0.3 });
          planted++;
        }
      for (let s = 6, side = 1; s < len - 2 && lit < lampCap; s += 34, side = -side) {
        const off = w / 2 + 1.1;
        const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
        if (blocked(x, z, 0.5)) continue;
        lamps.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
        lit++;
      }
    }
  });

  const props: Instances[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const pack = (kind: PropKind, list: { x: number; z: number; yaw?: number; s?: number }[], tint?: () => THREE.Color) => {
    if (!list.length) return;
    const mats = new Float32Array(list.length * 16), cols = tint ? new Float32Array(list.length * 3) : null;
    list.forEach((it, i) => {
      const s = it.s ?? 1;
      q.setFromAxisAngle(Y, it.yaw ?? rand() * Math.PI * 2);
      m.compose(p.set(it.x, 0, it.z), q, sc.set(s, kind === "tree" ? s * (0.9 + rand() * 0.3) : s, s));
      m.toArray(mats, i * 16);
      if (cols && tint) tint().toArray(cols, i * 3);
    });
    props.push({ kind, mats, cols });
  };
  const tints = pal.trees.map(color);
  pack("tree", treeSpots, () => (realStyle ? tints[Math.floor(rand() * tints.length)] : tints[rand() < 0.88 ? Math.floor(rand() * 4) : 4 + Math.floor(rand() * 2)]));
  pack("lamp", lamps);
  pack("signal", signals);
  pack("bus", buses);

  const layers = [ground.layer("ground"), water.layer("water"), roads.layer("roads"), marks.layer("marks"), walls.layer("walls"), glass.layer("glass"), roofs.layer("roofs")].filter((l): l is Layer => !!l);
  placeSigns(tile as VtCell, frame, footprints, labels, faceRoad);
  return { key: tile.key, real: tile.real, layers, props, footprints, roads: roadLines, roadWidths, roadKinds, roadNames, roadDrawn, labels };
}

/**
 * Storefront signs and house numbers, mounted where they'd really be: on the wall of the
 * nearest building, facing the street, at first-floor height. Two shops on the same
 * stretch of wall stack instead of overlapping. No wall within reach: a sign on a pole.
 */
function placeSigns(tile: VtCell, frame: ReturnType<typeof makeFrame>, footprints: Footprint[], labels: Label[], faceRoad: (x: number, z: number) => number) {
  const placed: { x: number; z: number; y: number; w: number }[] = [];
  const nearestWall = (x: number, z: number, reach: number) => {
    let best = reach, hit: { x: number; z: number; nx: number; nz: number; len: number; f: Footprint } | null = null;
    for (const f of footprints) {
      if (x < f.minX - reach || x > f.maxX + reach || z < f.minZ - reach || z > f.maxZ + reach) continue;
      const p = f.pts;
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        const ax = p[i], az = p[i + 1], dx = p[j] - ax, dz = p[j + 1] - az, l2 = dx * dx + dz * dz;
        if (l2 < 4) continue; // walls under 2 m don't carry a sign
        const k = Math.max(0.1, Math.min(0.9, ((x - ax) * dx + (z - az) * dz) / l2));
        const qx = ax + dx * k, qz = az + dz * k, d = Math.hypot(qx - x, qz - z);
        if (d >= best) continue;
        const len = Math.sqrt(l2);
        best = d;
        hit = { x: qx, z: qz, nx: dz / len, nz: -dx / len, len, f };
      }
    }
    return hit;
  };
  for (const s of tile.s ?? []) {
    const [x, z] = frame.unpack(tile.cx, tile.cy, [s.x, s.y]);
    const w = Math.max(2.6, Math.min(7.5, s.n.length * 0.36 + 1.6));
    const wall = nearestWall(x, z, 22);
    if (!wall) {
      labels.push({ text: s.n, x, z, angle: faceRoad(x, z), w: Math.min(w, 4), y: 2.6, kind: "shop", cls: s.c, pole: true });
      continue;
    }
    const sw = Math.min(w, wall.len * 0.92);
    const px = wall.x + wall.nx * 0.14, pz = wall.z + wall.nz * 0.14;
    let y = Math.max(2.4, Math.min(3.6, wall.f.h - 0.7));
    // Same stretch of wall already has a sign: go one row up (at most three rows).
    for (let row = 0; row < 3 && placed.some((o) => Math.abs(o.y - y) < 0.6 && Math.hypot(o.x - px, o.z - pz) < (o.w + sw) / 2); row++) y += 1.05;
    if (y > wall.f.h - 0.3) continue;
    placed.push({ x: px, z: pz, y, w: sw });
    labels.push({ text: s.n, x: px, z: pz, angle: Math.atan2(wall.nx, wall.nz), w: sw, y, kind: "shop", cls: s.c });
  }
  for (const h of tile.hn ?? []) {
    const [x, z] = frame.unpack(tile.cx, tile.cy, [h.x, h.y]);
    const wall = nearestWall(x, z, 14);
    if (!wall) continue;
    labels.push({ text: h.n, x: wall.x + wall.nx * 0.1, z: wall.z + wall.nz * 0.1, angle: Math.atan2(wall.nx, wall.nz), w: 0.5, y: 2.2, kind: "num" });
  }
}

/** Every buffer in a built tile, for a zero-copy postMessage out of the worker. */
export function transferables(t: TileArrays): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const l of t.layers) out.push(l.pos.buffer as ArrayBuffer, l.nor.buffer as ArrayBuffer, l.col.buffer as ArrayBuffer, l.uv.buffer as ArrayBuffer, l.idx.buffer as ArrayBuffer);
  for (const p of t.props) (out.push(p.mats.buffer as ArrayBuffer), p.cols && out.push(p.cols.buffer as ArrayBuffer));
  // Footprints and road lines are read on both sides of the boundary — copied, not moved.
  return out;
}
