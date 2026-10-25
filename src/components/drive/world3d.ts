"use client";
// Building blocks of the 3D city, in a storybook style: toon shading, pastel walls with
// windows that light up at night, terracotta and slate roofs, lollipop trees, a gradient
// sky with drifting clouds, glowing mission beacons and a chunky cartoon car.
// Everything for one map tile is merged into a handful of meshes so a whole
// neighbourhood draws in a few calls, even on a budget phone.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hashStr, rng } from "@/lib/geo";
import { insidePacked, type BuildingKind, type CityTile, type Frame } from "@/lib/city";

export type Phase = "night" | "dawn" | "day" | "dusk";

// ---------------------------------------------------------------- palette & materials
export const SKY: Record<Phase, { top: string; horizon: string; ground: string; sun: string; sunI: number; hemi: number; fog: string }> = {
  day: { top: "#5aa9ff", horizon: "#cfe9ff", ground: "#9bd27f", sun: "#fff3d6", sunI: 2.4, hemi: 1.1, fog: "#cfe6ff" },
  dawn: { top: "#6d7bd8", horizon: "#ffc6a8", ground: "#93c27a", sun: "#ffd2a0", sunI: 1.8, hemi: 0.9, fog: "#f5cdb8" },
  dusk: { top: "#4b3f9a", horizon: "#ff9e7a", ground: "#7fae6c", sun: "#ffb27a", sunI: 1.6, hemi: 0.8, fog: "#e8a690" },
  // A fairy-tale night: moonlit blue, bright enough to drive, with lit windows and fireflies.
  night: { top: "#141a4d", horizon: "#4b4a9a", ground: "#4f7d63", sun: "#b9c8ff", sunI: 1.25, hemi: 1.0, fog: "#3a3a7a" },
};

const WALLS: Record<BuildingKind, string[]> = {
  house: ["#fff1d6", "#ffe0e6", "#e7f5d9", "#fde7c4", "#e5e9ff", "#fff8e6"],
  apartments: ["#ffd8b5", "#f9c6c9", "#d7e8ff", "#e8dcff", "#fbe3a5"],
  shop: ["#ffd29d", "#ffb4c6", "#bfe8d4", "#ffe58f", "#c9d7ff"],
  office: ["#bfe0ff", "#d0d7ff", "#c6f0ec", "#e0e7f0"],
  industrial: ["#d9d2c5", "#cfd6d9", "#e1d4bd"],
  civic: ["#f2e6cf", "#e9e2f7", "#dff0e6"],
  church: ["#efe4d2", "#e6dccc"],
  tower: ["#a9d4ff", "#b9c4ff", "#a6e3e0"],
};
const ROOFS: Record<BuildingKind, string[]> = {
  house: ["#e2683c", "#c9573f", "#d97b4a", "#8e5bd8", "#3f8fd8", "#4aa36c"],
  apartments: ["#7b6fd6", "#d8644a", "#4a8fd0"],
  shop: ["#ff7a59", "#5b9cf0", "#f2b134", "#e35d8f"],
  office: ["#5e6fd6", "#3d8bd1", "#58b7b0"],
  industrial: ["#7d8794", "#8c7a68"],
  civic: ["#3c8f8a", "#7a5bd1"],
  church: ["#5a62c9", "#3b7fc4"],
  tower: ["#4757c9", "#2f8bd6"],
};
const ROADS = { major: "#6e7290", minor: "#82849c", path: "#d7c39a", curb: "#f4efe6", line: "#ffe27a" };
const AREAS = { park: "#86d36e", grass: "#97da7c", forest: "#4fa35e", pitch: "#6fc46a", water: "#52b8ef" };

let gradient: THREE.DataTexture | null = null;
/** 3-step toon ramp, shared by every toon material. */
export function toonRamp() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
export const toon = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...o });

/** Window grid for walls: white plaster with glass panes (tinted by the vertex colour). */
function windowCanvas(lit: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = lit ? "#000" : "#fff";
  g.fillRect(0, 0, 64, 64);
  const r = rng(7);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      const wx = 8 + x * 32, wy = 10 + y * 32;
      if (lit) {
        g.fillStyle = r() < 0.55 ? (r() < 0.5 ? "#ffd37a" : "#ffe9b0") : "#000";
      } else g.fillStyle = "#7fa8d8";
      g.fillRect(wx, wy, 16, 14);
      if (!lit) {
        g.fillStyle = "rgba(255,255,255,.7)";
        g.fillRect(wx + 2, wy + 2, 5, 4);
      }
    }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}

export type Materials = ReturnType<typeof makeMaterials>;
export function makeMaterials() {
  const walls = toon({ map: windowCanvas(false), vertexColors: true, emissiveMap: windowCanvas(true), emissive: new THREE.Color("#ffcf6b"), emissiveIntensity: 0 });
  return {
    walls,
    roofs: toon({ vertexColors: true, side: THREE.DoubleSide }),
    roads: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    areas: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    water: new THREE.MeshPhongMaterial({ color: AREAS.water, side: THREE.DoubleSide, shininess: 90, specular: new THREE.Color("#ffffff"), transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    trees: toon({ vertexColors: true }),
    dispose() {
      for (const m of [this.walls, this.roofs, this.roads, this.areas, this.water, this.trees]) {
        (m as THREE.MeshToonMaterial).map?.dispose();
        (m as THREE.MeshToonMaterial).emissiveMap?.dispose();
        m.dispose();
      }
    },
  };
}

/** Lit windows and their glow at night. */
export function setNight(mats: Materials, night: number) {
  mats.walls.emissiveIntensity = night * 1.1;
}

// ---------------------------------------------------------------- geometry helpers
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
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const tmpC = new THREE.Color();
const pickColor = (list: string[], seed: number) => tmpC.set(list[seed % list.length]).clone();

function signedArea(p: Float32Array) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return a / 2;
}

/** Add a triangle facing up (+y) whatever order its corners come in — flat surfaces light correctly from above. */
function up(b: Builder, i0: number, i1: number, i2: number) {
  const P = b.pos;
  const a = i0 * 3, c1 = i1 * 3, c2 = i2 * 3;
  const ux = P[c1] - P[a], uz = P[c1 + 2] - P[a + 2], vx = P[c2] - P[a], vz = P[c2 + 2] - P[a + 2];
  if (uz * vx - ux * vz >= 0) b.idx.push(i0, i1, i2);
  else b.idx.push(i0, i2, i1);
}
const pushUp = (b: Builder, base: number, tri: number[]) => up(b, base + tri[0], base + tri[1], base + tri[2]);

function triangulate(p: Float32Array) {
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
  return { contour, tris: THREE.ShapeUtils.triangulateShape(contour, []) };
}

// ---------------------------------------------------------------- a tile's meshes
export type Footprint = { pts: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number };
export type TileBuild = { group: THREE.Group; footprints: Footprint[]; roads: Float32Array[]; roadWidths: number[]; dispose: () => void };

const FLOOR_M = 3.3;
const WINDOW_M = 4.2;

export function buildTile(tile: CityTile, frame: Frame, mats: Materials, opts: { lite: boolean }): TileBuild {
  const group = new THREE.Group();
  const walls = new Builder(), roofs = new Builder(), roads = new Builder(), areas = new Builder(), water = new Builder();
  const footprints: Footprint[] = [];
  const roadLines: Float32Array[] = [];
  const roadWidths: number[] = [];
  const geoms: THREE.BufferGeometry[] = [];
  const extras: THREE.BufferGeometry[] = []; // spires, antennas (merged into roofs)

  // Buildings
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
    footprints.push({ pts, minX, maxX, minZ, maxZ });
    const seed = hashStr(`${tile.key}|${bi}`);
    const h = Math.max(3, b.h);
    const wall = pickColor(WALLS[b.k] ?? WALLS.house, seed);
    const foot = wall.clone().multiplyScalar(0.72); // darker at street level: fake ambient occlusion
    const roof = pickColor(ROOFS[b.k] ?? ROOFS.house, seed >>> 3);
    let u = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[j], z1 = pts[j + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
      const u0 = u / WINDOW_M, u1 = (u + len) / WINDOW_M, v1 = h / FLOOR_M;
      const a = walls.vert(x0, 0, z0, nx, 0, nz, foot, u0, 0);
      const bb = walls.vert(x1, 0, z1, nx, 0, nz, foot, u1, 0);
      const c = walls.vert(x1, h, z1, nx, 0, nz, wall, u1, v1);
      const d = walls.vert(x0, h, z0, nx, 0, nz, wall, u0, v1);
      walls.idx.push(a, c, bb, a, d, c); // front face toward the street
      u += len;
    }
    // Roof: a pyramid on small cottages, flat (with a parapet colour) on everything else.
    const area = Math.abs(signedArea(pts));
    const { contour, tris } = triangulate(pts);
    if (b.k === "house" && contour.length <= 10 && area < 450) {
      let cx = 0, cz = 0;
      for (const v of contour) (cx += v.x), (cz += v.y);
      cx /= contour.length;
      cz /= contour.length;
      const peak = h + Math.min(4, Math.sqrt(area) * 0.35);
      for (let i = 0; i < contour.length; i++) {
        const p0 = contour[i], p1 = contour[(i + 1) % contour.length];
        const e1 = new THREE.Vector3(p1.x - p0.x, 0, p1.y - p0.y), e2 = new THREE.Vector3(cx - p0.x, peak - h, cz - p0.y);
        const n = new THREE.Vector3().crossVectors(e2, e1).normalize();
        const shade = roof.clone().multiplyScalar(0.85 + 0.15 * Math.max(0, n.y));
        const ia = roofs.vert(p0.x, h, p0.y, n.x, n.y, n.z, shade), ib = roofs.vert(p1.x, h, p1.y, n.x, n.y, n.z, shade), ic = roofs.vert(cx, peak, cz, n.x, n.y, n.z, shade);
        roofs.idx.push(ia, ic, ib); // (apex − p0) × (p1 − p0) is the outward normal n
      }
    } else {
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, h, v.y, 0, 1, 0, roof);
      for (const tri of tris) pushUp(roofs, base, tri);
    }
    // Landmarks: spires on churches, antennas on towers.
    if (b.k === "church" || (b.k === "tower" && h > 60)) {
      let cx = 0, cz = 0;
      for (const v of contour) (cx += v.x), (cz += v.y);
      cx /= contour.length;
      cz /= contour.length;
      const s = b.k === "church" ? new THREE.ConeGeometry(Math.min(4, Math.sqrt(area) * 0.18), Math.min(18, h * 0.8), 8) : new THREE.CylinderGeometry(0.25, 0.4, h * 0.25, 6);
      s.translate(cx, h + (s.parameters.height as number) / 2, cz);
      const n = s.attributes.position.count;
      const col = new Float32Array(n * 3);
      const sc = b.k === "church" ? roof : new THREE.Color("#e0e6ff");
      for (let i = 0; i < n; i++) col.set([sc.r, sc.g, sc.b], i * 3);
      s.setAttribute("color", new THREE.BufferAttribute(col, 3));
      s.deleteAttribute("uv");
      extras.push(s);
    }
  }

  // Roads: a curb ribbon under the asphalt, discs at every joint so bends and crossings close up.
  const ribbon = (b: Builder, pts: Float32Array, w: number, y: number, c: THREE.Color) => {
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
      // Miter length, capped so sharp turns don't spike.
      const dot = Math.max(0.35, px * (-az / la) + pz * (ax / la));
      const half = w / 2 / dot;
      const l = b.vert(x + px * half, y, z + pz * half, 0, 1, 0, c), r = b.vert(x - px * half, y, z - pz * half, 0, 1, 0, c);
      if (prev >= 0) (up(b, prev, prev + 1, l), up(b, prev + 1, r, l));
      prev = l;
    }
  };
  const disc = (b: Builder, x: number, z: number, rad: number, y: number, c: THREE.Color) => {
    const center = b.vert(x, y, z, 0, 1, 0, c);
    const seg = 10;
    for (let k = 0; k <= seg; k++) b.vert(x + Math.cos((k / seg) * Math.PI * 2) * rad, y, z + Math.sin((k / seg) * Math.PI * 2) * rad, 0, 1, 0, c);
    for (let k = 0; k < seg; k++) up(b, center, center + 2 + k, center + 1 + k);
  };
  const curb = new THREE.Color(ROADS.curb);
  for (const r of tile.r) {
    const pts = frame.unpack(tile.cx, tile.cy, r.l);
    if (pts.length < 4) continue;
    roadLines.push(pts);
    roadWidths.push(r.w);
    const c = new THREE.Color(ROADS[r.k]);
    const y = r.k === "major" ? 0.09 : r.k === "minor" ? 0.07 : 0.05;
    if (r.k !== "path") ribbon(roads, pts, r.w + 1.2, y - 0.015, curb);
    ribbon(roads, pts, r.w, y, c);
    for (let i = 0; i < pts.length; i += 2) disc(roads, pts[i], pts[i + 1], r.w / 2, y - 0.005, c);
    // A dashed yellow centre line on the big roads.
    if (r.k === "major") {
      const line = new THREE.Color(ROADS.line);
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
        const len = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 1; s + 2 < len; s += 6) {
          const t0 = s / len, t1 = (s + 2.5) / len;
          ribbon(roads, new Float32Array([x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1]), 0.3, y + 0.01, line);
        }
      }
    }
  }

  // Parks, grass, woods and water.
  const treeSpots: { x: number; z: number; s: number }[] = [];
  const rand = rng(hashStr(`trees|${tile.key}`));
  for (const a of tile.a) {
    const pts = frame.unpack(tile.cx, tile.cy, a.r);
    if (pts.length < 6) continue;
    const { contour, tris } = triangulate(pts);
    const target = a.k === "water" ? water : areas;
    const c = new THREE.Color(AREAS[a.k] ?? AREAS.grass);
    const base = target.pos.length / 3;
    for (const v of contour) target.vert(v.x, a.k === "water" ? 0.03 : 0.02, v.y, 0, 1, 0, c);
    for (const tri of tris) pushUp(target, base, tri);
    if (a.k === "park" || a.k === "forest") {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 2) (minX = Math.min(minX, pts[i])), (maxX = Math.max(maxX, pts[i])), (minZ = Math.min(minZ, pts[i + 1])), (maxZ = Math.max(maxZ, pts[i + 1]));
      const area = Math.abs(signedArea(pts));
      const want = Math.min(opts.lite ? 25 : 60, Math.round(area / (a.k === "forest" ? 90 : 220)));
      for (let k = 0, tries = 0; k < want && tries < want * 4; tries++) {
        const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
        if (!insidePacked(pts, x, z)) continue;
        treeSpots.push({ x, z, s: 0.8 + rand() * 0.7 });
        k++;
      }
    }
  }
  // Street trees along the wider roads, on the pavement, wherever they don't land in a building.
  const roadside = opts.lite ? 40 : 110;
  let planted = 0;
  for (const r of tile.r) {
    if (r.k === "path" || r.w < 7 || planted >= roadside) continue;
    const pts = frame.unpack(tile.cx, tile.cy, r.l);
    for (let i = 0; i + 3 < pts.length && planted < roadside; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 12) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      for (let s = 9; s < len - 4 && planted < roadside; s += 20 + rand() * 16) {
        const side = rand() < 0.5 ? 1 : -1, off = r.w / 2 + 2.2 + rand();
        const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
        if (footprints.some((f) => x >= f.minX - 2 && x <= f.maxX + 2 && z >= f.minZ - 2 && z <= f.maxZ + 2)) continue;
        treeSpots.push({ x, z, s: 0.45 + rand() * 0.3 });
        planted++;
      }
    }
  }

  const add = (b: Builder, mat: THREE.Material, shadow: { cast?: boolean; receive?: boolean }, more: THREE.BufferGeometry[] = []) => {
    let g = b.geometry();
    if (more.length) g = mergeGeometries([...(g ? [g] : []), ...more].map((x) => (x.index ? x.toNonIndexed() : x)), false) ?? g;
    if (!g) return;
    geoms.push(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = !!shadow.cast && !opts.lite;
    mesh.receiveShadow = !!shadow.receive && !opts.lite;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  add(areas, mats.areas, { receive: true });
  add(water, mats.water, {});
  add(roads, mats.roads, { receive: true });
  add(walls, mats.walls, { cast: true, receive: true });
  add(roofs, mats.roofs, { cast: true }, extras.map((e) => {
    // Roof builder geometry has uv; extras don't — give them one so the merge lines up.
    if (!e.attributes.uv) e.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(e.attributes.position.count * 2), 2));
    return e;
  }));

  if (treeSpots.length) {
    const tree = treeGeometry();
    geoms.push(tree);
    const inst = new THREE.InstancedMesh(tree, mats.trees, treeSpots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const tints = ["#5fcf6b", "#7ad66a", "#4cb86d", "#98db5e", "#ff9fc4", "#ffd166"];
    for (let i = 0; i < treeSpots.length; i++) {
      const s = treeSpots[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      m.compose(p.set(s.x, 0, s.z), q, sc.set(s.s, s.s * (0.9 + rand() * 0.3), s.s));
      inst.setMatrixAt(i, m);
      // Mostly green, with the odd blossom or golden tree — it's a fairy-tale city.
      inst.setColorAt(i, new THREE.Color(tints[rand() < 0.88 ? Math.floor(rand() * 4) : 4 + Math.floor(rand() * 2)]));
    }
    inst.castShadow = !opts.lite;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }

  return {
    group,
    footprints,
    roads: roadLines,
    roadWidths,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const e of extras) e.dispose();
      group.clear();
    },
  };
}

/** A lollipop tree: trunk + two stacked crowns. Crown vertices are white so instance colours tint them; the trunk stays brown. */
let treeGeo: THREE.BufferGeometry | null = null;
function treeGeometry() {
  if (treeGeo) return treeGeo.clone();
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  const crown1 = new THREE.IcosahedronGeometry(1.9, 1);
  crown1.translate(0, 3.6, 0);
  const crown2 = new THREE.IcosahedronGeometry(1.25, 1);
  crown2.translate(0.3, 5.0, 0.2);
  const paint = (g: THREE.BufferGeometry, c: string) => {
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  // Instance colour multiplies everything: a brownish-white trunk reads as wood under any tint.
  treeGeo = mergeGeometries([paint(trunk, "#b98a62"), paint(crown1, "#ffffff"), paint(crown2, "#f4fff0")], false)!;
  treeGeo.deleteAttribute("uv");
  return treeGeo.clone();
}

// ---------------------------------------------------------------- sky, clouds, ground
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() }, sunCol: { value: new THREE.Color() }, stars: { value: 0 } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.6));
        float s = max(dot(vDir, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
        vec3 g = floor(vDir * 260.0);
        float st = step(0.9965, hash(g)) * stars * smoothstep(0.05, 0.4, vDir.y);
        c += vec3(st);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.frustumCulled = false;
  return { mesh, mat };
}

export function makeClouds(n: number) {
  const group = new THREE.Group();
  const mat = toon({ color: "#ffffff", transparent: true, opacity: 0.95 });
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(99);
  for (let k = 0; k < 5; k++) {
    const g = new THREE.IcosahedronGeometry(8 + r() * 6, 1);
    g.translate((k - 2) * 9 + r() * 4, r() * 4, r() * 6);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const puff = mergeGeometries(parts, false)!;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(puff, mat);
    m.position.set((r() - 0.5) * 1400, 140 + r() * 80, (r() - 0.5) * 1400);
    m.scale.setScalar(0.7 + r() * 0.9);
    m.userData.speed = 1.5 + r() * 2;
    group.add(m);
  }
  return { group, mat, geo: puff };
}

// ---------------------------------------------------------------- the car
export type Car = { group: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[]; steer: THREE.Object3D[]; lights: THREE.MeshBasicMaterial; brake: THREE.MeshBasicMaterial; beams: THREE.Mesh; cargo: THREE.Mesh; dispose: () => void };

export function makeCar(color: string): Car {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const paint = keep(toon({ color }));
  const trim = keep(toon({ color: "#2b2f45" }));
  const glass = keep(toon({ color: "#1d3557", emissive: new THREE.Color("#2a4d7a"), emissiveIntensity: 0.35 }));
  const chrome = keep(toon({ color: "#e8ecf5" }));

  const shell = new THREE.Mesh(keep(new RoundedBoxGeometry(2.0, 0.78, 4.2, 4, 0.28)), paint);
  shell.position.y = 0.78;
  const cabin = new THREE.Mesh(keep(new RoundedBoxGeometry(1.72, 0.72, 2.2, 4, 0.3)), glass);
  cabin.position.set(0, 1.42, 0.25);
  const roof = new THREE.Mesh(keep(new RoundedBoxGeometry(1.6, 0.14, 1.9, 2, 0.06)), paint);
  roof.position.set(0, 1.8, 0.25);
  const bumperF = new THREE.Mesh(keep(new RoundedBoxGeometry(2.04, 0.26, 0.3, 2, 0.1)), chrome);
  bumperF.position.set(0, 0.5, -2.08);
  const bumperB = bumperF.clone();
  bumperB.position.z = 2.08;
  const stripe = new THREE.Mesh(keep(new THREE.BoxGeometry(0.42, 0.02, 4.0)), keep(toon({ color: "#ffffff" })));
  stripe.position.set(0, 1.18, 0);
  for (const m of [shell, cabin, roof, bumperF, bumperB]) (m.castShadow = true), body.add(m);
  body.add(stripe);

  const lights = keep(new THREE.MeshBasicMaterial({ color: "#fff6c8" }));
  const brake = keep(new THREE.MeshBasicMaterial({ color: "#7a1020" }));
  const lampG = keep(new THREE.BoxGeometry(0.44, 0.18, 0.08));
  for (const x of [-0.66, 0.66]) {
    const h = new THREE.Mesh(lampG, lights);
    h.position.set(x, 0.86, -2.11);
    const tl = new THREE.Mesh(lampG, brake);
    tl.position.set(x, 0.86, 2.11);
    body.add(h, tl);
  }
  // Headlight beams (only shown at night): soft additive cones.
  const beamMat = keep(new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  const beamG = keep(new THREE.ConeGeometry(3.2, 16, 16, 1, true));
  beamG.rotateX(Math.PI / 2);
  beamG.translate(0, 0.4, -10);
  const beams = new THREE.Mesh(beamG, beamMat);
  beams.visible = false;
  body.add(beams);

  // A delivery box on the roof while carrying an order.
  const cargo = new THREE.Mesh(keep(new RoundedBoxGeometry(0.9, 0.6, 0.9, 2, 0.08)), keep(toon({ color: "#ffb347" })));
  cargo.position.set(0, 2.18, 0.35);
  cargo.visible = false;
  body.add(cargo);

  const tire = keep(new THREE.CylinderGeometry(0.44, 0.44, 0.34, 16));
  tire.rotateZ(Math.PI / 2);
  const rim = keep(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10));
  rim.rotateZ(Math.PI / 2);
  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.98, -1.35], [0.98, -1.35], [-0.98, 1.35], [0.98, 1.35]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, z);
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tire, trim), new THREE.Mesh(rim, chrome));
    w.children[0].castShadow = true;
    pivot.add(w);
    group.add(pivot);
    wheels.push(w);
    if (z < 0) steer.push(pivot);
  }
  // Soft blob shadow (always on, so cheap phones without shadow maps still ground the car).
  const blob = document.createElement("canvas");
  blob.width = blob.height = 64;
  const g = blob.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,.45)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const blobTex = keep(new THREE.CanvasTexture(blob));
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.4, 5.6)), keep(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.12;
  group.add(shadow);

  return { group, body, wheels, steer, lights, brake, beams, cargo, dispose: () => disposables.forEach((d) => d.dispose()) };
}

// ---------------------------------------------------------------- signs & beacons
/** Emoji + text on a rounded pill, as a camera-facing sprite. */
export function makeSign(emoji: string, text: string, color: string, opts: { big?: boolean } = {}) {
  const c = document.createElement("canvas");
  const H = opts.big ? 96 : 64;
  const g = c.getContext("2d")!;
  const font = `800 ${Math.round(H * 0.42)}px system-ui, -apple-system, "Segoe UI", Vazirmatn, sans-serif`;
  g.font = font;
  const label = text.length > 26 ? `${text.slice(0, 25)}…` : text;
  const w = Math.min(1024, Math.ceil(g.measureText(label).width + H * 1.5));
  c.width = w;
  c.height = H;
  g.font = font;
  const r = H / 2;
  g.fillStyle = "rgba(20,18,40,.82)";
  g.beginPath();
  if (g.roundRect) g.roundRect(2, 2, w - 4, H - 4, r - 2);
  else g.rect(2, 2, w - 4, H - 4);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  g.textBaseline = "middle";
  g.font = `${Math.round(H * 0.5)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(emoji, H * 0.22, H / 2 + 2);
  g.font = font;
  g.fillStyle = "#fff";
  g.direction = /[؀-ۿ]/.test(label) ? "rtl" : "ltr";
  g.textAlign = g.direction === "rtl" ? "right" : "left";
  g.fillText(label, g.direction === "rtl" ? w - H * 0.3 : H * 0.95, H / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  const scale = opts.big ? 3.4 : 2.2;
  s.scale.set((w / H) * scale, scale, 1);
  s.renderOrder = 5;
  return { sprite: s, dispose: () => (tex.dispose(), mat.dispose()) };
}

/** A big emoji, for the icon floating over a beacon. */
export function makeIcon(emoji: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,.35)";
  g.shadowBlur = 10;
  g.font = `96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(4.2, 4.2, 1);
  return { sprite: s, dispose: () => (tex.dispose(), mat.dispose()) };
}

let pillarGeo: THREE.CylinderGeometry | null = null;
let ringGeo: THREE.RingGeometry | null = null;
/** A column of light you can see across the city, a pulsing ring on the ground and the job's icon. */
export function makeBeacon(emoji: string, color: string, label: string) {
  pillarGeo ??= (() => {
    const g = new THREE.CylinderGeometry(2.2, 2.2, 90, 20, 1, true);
    g.translate(0, 45, 0);
    return g;
  })();
  ringGeo ??= new THREE.RingGeometry(5.2, 6.2, 40);
  const group = new THREE.Group();
  const col = new THREE.Color(color);
  const pillarMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { color: { value: col }, time: { value: 0 } },
    vertexShader: "varying float vY; void main(){ vY = position.y / 90.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 color; uniform float time; varying float vY; void main(){ float a = (1.0 - vY) * 0.55 * (0.8 + 0.2 * sin(time * 3.0 + vY * 12.0)); gl_FragColor = vec4(color, a); }",
  });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  const icon = makeIcon(emoji);
  icon.sprite.position.y = 9;
  const sign = makeSign(emoji, label, color, { big: true });
  sign.sprite.position.y = 14;
  group.add(pillar, ring, icon.sprite, sign.sprite);
  return {
    group,
    tick(t: number) {
      pillarMat.uniforms.time.value = t;
      const k = (t * 0.8) % 1;
      ring.scale.setScalar(0.6 + k * 0.8);
      ringMat.opacity = 0.9 * (1 - k);
      icon.sprite.position.y = 9 + Math.sin(t * 2.2) * 0.6;
    },
    dispose() {
      pillarMat.dispose();
      ringMat.dispose();
      icon.dispose();
      sign.dispose();
    },
  };
}

/** Floating loot (coins, chests, food) you drive through to collect. */
export function makeLoot(emoji: string, color: string) {
  const group = new THREE.Group();
  const icon = makeIcon(emoji);
  icon.sprite.scale.set(3, 3, 1);
  icon.sprite.position.y = 2.4;
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  ringGeo ??= new THREE.RingGeometry(5.2, 6.2, 40);
  const glow = new THREE.Mesh(ringGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.scale.setScalar(0.3);
  glow.position.y = 0.15;
  group.add(icon.sprite, glow);
  return {
    group,
    tick(t: number) {
      icon.sprite.position.y = 2.4 + Math.sin(t * 3 + group.position.x) * 0.35;
    },
    dispose() {
      icon.dispose();
      glowMat.dispose();
    },
  };
}
