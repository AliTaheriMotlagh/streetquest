// One map tile → plain typed arrays for the 3D city. Pure geometry, no DOM and no GPU,
// so it runs inside a Web Worker (tile.worker.ts) and the drive never stutters while a
// neighbourhood loads; the main thread only wraps the arrays in meshes (tiles3d.ts).
//
// Per tile: a handful of merged layers (ground, water, asphalt, road markings, walls,
// glass façades, roofs), instance matrices for street furniture (trees, lamps, traffic
// lights, bus stops, and what Iran's pavements have: charity boxes on their posts and
// newspaper kiosks on the main roads), building footprints for collisions, small solid footprints for the
// furniture (a car stops at a tree or a lamp post), and the text to show: street names,
// corner street-name signs, every shop and house number.
import * as THREE from "three";
import { countryAt } from "@/lib/region";
import { hashStr, rng, type LatLng } from "@/lib/geo";
import { crossSigns, KIT_KINDS, kitObstacles, placeKit, type Crossing, type KitKind, type KitRoad } from "./streetKit";
import { insidePacked, makeFrame, PROP, tileSW, type BuildingKind, type CityPitch, type CityTile, type RoadKind, type RoofShape } from "@/lib/city";
import type { VtCell } from "./vectorTile";

export type Style = "real" | "toon";
/** `trim`: balconies and rooftop kit (coolers, water tanks) — drawn like roofs, only up close. */
/** `decals`: soft stains on the asphalt (oil, tyre rubber, patches), each vertex's opacity in `fac`. */
export type LayerName = "ground" | "water" | "roads" | "marks" | "walls" | "glass" | "roofs" | "trim" | "kerbs" | "decals";
/** `fac`: the façade each wall vertex wears (an index into FACADES), when any isn't plaster. */
/** `bs`: bounding sphere (x, y, z, radius) — worked out here, in the worker, not on the frame. */
export type Layer = { name: LayerName; pos: Float32Array; nor: Float32Array; col: Float32Array; uv: Float32Array; idx: Uint32Array; fac?: Float32Array; bs: [number, number, number, number] };

/** Bounding sphere of packed xyz positions as three.js computes it: the box's centre, the farthest point. */
export function boundingSphere(pos: ArrayLike<number>): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (x0 > x1) return [0, 0, 0, -1];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  let r2 = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - cx, dy = pos[i + 1] - cy, dz = pos[i + 2] - cz, d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  return [cx, cy, cz, Math.sqrt(r2)];
}
export type PropKind = "tree" | "lamp" | "signal" | "bus" | "bench" | "bin" | "hydrant" | "fountain" | "charity" | "kiosk" | "dumpster" | "bags" | KitKind;
export type Instances = { kind: PropKind; mats: Float32Array; cols: Float32Array | null };
/** A solid outline (mh..h m up). `ref`: what moves with it (a street car), for whoever bumps into it. */
export type Footprint = { pts: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number; h: number; mh: number; ref?: object };
/**
 * Text to show in the city: street names on the asphalt, landmark names over buildings,
 * storefront signs on the wall nearest a shop ("shop", with its OSM class in `cls`; on a
 * pole when there's no wall close by; `noBoard` when its wall is already full — it still
 * gets a pin and a line in the Places list; `top`: the roof over it), house-number
 * plaques ("num") and street-name signs on a pole at a corner ("corner", one plate per
 * street in `plates`, each turned to run along its street; `ir`: Tehran's charcoal plate),
 * arrow signs before a main road's junction ("direction", a plate per side, `dir` 1 right,
 * −1 left as the driver sees it) and green overhead signs on motorways ("gantry", `w` the
 * arm's reach, `dir` 0 straight on) — streetKit.ts crossSigns. Names may hold a second
 * line after "\n" (trades.ts nameLines).
 */
export type Label = {
  text: string;
  x: number;
  z: number;
  angle: number;
  w: number;
  y: number;
  kind: "street" | "building" | "shop" | "num" | "corner" | "direction" | "gantry";
  cls?: string;
  pole?: boolean;
  noBoard?: boolean;
  top?: number;
  plates?: { text: string; angle: number; dir?: -1 | 0 | 1 }[];
  ir?: boolean;
};
/**
 * A store's own 3D building (landmarks.ts) standing on this tile: its street-level
 * outline in local x/z and its pin. The map's building under it isn't drawn, and no
 * tree, lamp, sign or house number is put inside it — the model brings its own.
 */
export type Cut = { pts: number[]; ax: number; az: number };
export type TileArrays = {
  key: string;
  real: boolean;
  layers: Layer[];
  props: Instances[];
  footprints: Footprint[];
  /** Street furniture you can hit: trunks, posts, poles, bus shelters. */
  obstacles: Footprint[];
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

// ---------------------------------------------------------------- façades
/**
 * What a wall is made of, in the order of the walls' texture array (world3d.ts): the
 * pattern between the windows and the windows themselves. The vertex colour tints the
 * wall, never the glass. "shopfront" is a ground floor of shop windows.
 */
export const FACADES = ["plaster", "brick", "stone", "concrete", "metal", "shopfront"] as const;
export type Facade = (typeof FACADES)[number];
const FAC = Object.fromEntries(FACADES.map((f, i) => [f, i])) as Record<Facade, number>;
/** Wall colours per material (the real style), where the map gives none. Stone is Tehran's travertine. */
const MATERIAL_WALLS: Record<Exclude<Facade, "plaster" | "shopfront">, string[]> = {
  brick: ["#a4553b", "#b3644a", "#94503a", "#b97a5c", "#9c5d45", "#c08868"],
  stone: ["#e9dfcc", "#efe6d4", "#ddd0b6", "#f3ecdd", "#d9ccb2", "#e4d6bd"],
  concrete: ["#b8b5ad", "#a8a59d", "#c4c1b9", "#9fa3a6"],
  metal: ["#9aa3ab", "#b0b6bb", "#8b959d", "#c2c6c8", "#a7a097"],
};
/** OpenStreetMap `building:material` → the façade drawn. Glass is the curtain-wall layer; wood is a painted wall. */
const MATERIALS: Record<string, Facade | "glass" | "wood"> = {
  brick: "brick", masonry: "brick", traditional: "brick", clay: "brick", mud: "brick", adobe: "brick",
  stone: "stone", sandstone: "stone", limestone: "stone", marble: "stone", granite: "stone", travertine: "stone",
  plaster: "plaster", stucco: "plaster", render: "plaster", timber_framing: "plaster",
  cement: "concrete", concrete: "concrete", cement_block: "concrete", reinforced_concrete: "concrete",
  metal: "metal", steel: "metal", tin: "metal", aluminium: "metal", metal_plates: "metal", glass: "glass", wood: "wood",
};
/**
 * OpenMapTiles colours a building that has no colour of its own by its material: those
 * exact colours tell us the material (and aren't a real paint colour).
 */
const TILE_MATERIAL_COLOURS: Record<string, Facade | "glass" | "wood"> = {
  "#bd8161": "brick", "#9d8b75": "brick", "#dadbdb": "plaster", "#b3b0a9": "plaster", "#d48741": "wood",
  "#d3c2b0": "concrete", "#6a7880": "concrete", "#b7b1a6": "metal", "#b4a995": "stone", "#5a625c": "glass",
};
/** Weighted guesses where the map says nothing, by region: the Middle East builds in stone and brick, flat-roofed. */
const GUESS: Record<"me" | "world", Record<BuildingKind, [Facade, number][]>> = {
  me: {
    house: [["brick", 4], ["plaster", 4], ["stone", 2]], apartments: [["stone", 4], ["brick", 3], ["plaster", 2], ["concrete", 1]],
    shop: [["plaster", 4], ["stone", 3], ["concrete", 2]], office: [["stone", 3], ["concrete", 3]], industrial: [["metal", 6], ["concrete", 4]],
    civic: [["stone", 5], ["brick", 4]], church: [["brick", 5], ["stone", 3]], tower: [["concrete", 1]],
  },
  world: {
    house: [["plaster", 5], ["brick", 4], ["stone", 1]], apartments: [["concrete", 4], ["brick", 3], ["plaster", 3]],
    shop: [["plaster", 5], ["brick", 3], ["concrete", 2]], office: [["concrete", 5], ["stone", 3]], industrial: [["metal", 6], ["concrete", 4]],
    civic: [["stone", 6], ["brick", 4]], church: [["stone", 7], ["brick", 3]], tower: [["concrete", 1]],
  },
};
/** Roofs are flat across the Middle East (Iran, the Gulf, the Levant…): mosques, rooftop coolers and tanks go with it. */
export const middleEast = (lat: number, lng: number) => lat > 12 && lat < 42 && lng > 25 && lng < 75;

/**
 * A building's façade and wall colour: the map's material (or the material OpenMapTiles
 * coloured it by), else a seeded guess for its kind and region; the map's own paint colour
 * wins. `glass`: drawn as a curtain wall.
 */
export function buildingLook(b: { k: BuildingKind; c?: string; m?: string }, seed: number, region: "me" | "world"): { facade: Facade; colour: string | null; glass: boolean } {
  const fromTiles = b.c ? TILE_MATERIAL_COLOURS[b.c.toLowerCase()] : undefined;
  const said = (b.m ? MATERIALS[b.m.toLowerCase()] : undefined) ?? fromTiles;
  const colour = b.c && !fromTiles ? b.c : said === "wood" ? "#a77b52" : null;
  if (said === "glass") return { facade: "plaster", colour, glass: true };
  if (said && said !== "wood") return { facade: said, colour, glass: false };
  if (said === "wood") return { facade: "plaster", colour, glass: false };
  const options = GUESS[region][b.k] ?? GUESS[region].house;
  let r = seed % options.reduce((n, [, w]) => n + w, 0);
  for (const [f, w] of options) if ((r -= w) < 0) return { facade: f, colour, glass: false };
  return { facade: options[0][0], colour, glass: false };
}

// ---------------------------------------------------------------- builders
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  fac: number[] = [];
  /** The façade the next vertices wear (walls only). */
  facade = 0;
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, u = 0, v = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    this.fac.push(this.facade);
    return this.pos.length / 3 - 1;
  }
  layer(name: LayerName): Layer | null {
    if (!this.idx.length) return null;
    const fac = this.fac.some((f) => f !== 0) ? new Float32Array(this.fac) : undefined;
    const pos = new Float32Array(this.pos);
    return { name, pos, nor: new Float32Array(this.nor), col: new Float32Array(this.col), uv: new Float32Array(this.uv), idx: new Uint32Array(this.idx), ...(fac ? { fac } : {}), bs: boundingSphere(pos) };
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
/** Mosque domes: turquoise and blue tile, now and then gold. */
const DOMES = ["#2f8f9d", "#2c6fb0", "#3a9bb0", "#1f7a8c", "#c9a227"];
/** Ottoman domes (Istanbul, all of Turkey): sheet lead, grey with a little blue or green from the weather. */
const LEAD_DOMES = ["#7f868e", "#8a9199", "#737a83", "#7d8a86"];
/** Ottoman minarets: pale cut stone. */
const OTTOMAN_STONE = color("#dcd6c8");
/** Balcony railings: dark steel, white, grey, blue-grey glass. */
const RAILS = ["#3b3f45", "#e9e7e2", "#5b6168", "#8fa3b0"];
const COOLER = color("#c9cbcd"), TANK_WHITE = color("#e8eaec"), TANK_BLUE = color("#3f78b5"), GOLD = color("#d4af37");
/** Split air-conditioners on the walls: white, now and then yellowed by the sun. */
const AC_UNITS = ["#e6e7e3", "#dcdcd4", "#e9e4d6", "#cfd1cf"];
/** Dishes (mostly white), aerials (galvanised), the dark bits (grilles, receivers). */
const DISH = color("#dfe0de"), AERIAL = color("#9a9fa4"), DARK_KIT = color("#3e4246");
/** Awning canvas, striped with off-white. */
const AWNINGS = ["#a8322c", "#2d6f48", "#2b5690", "#c26d22", "#6e2433", "#1f6f78"];
const CANVAS_WHITE = color("#ece5d6");
/** Manhole covers (cast iron) and their rims; oil and rubber on the asphalt; a fresh patch of tarmac. */
const IRON = color("#2c2b29"), IRON_RIM = color("#4a4743"), OIL = color("#0b0a09"), RUBBER_MARK = color("#101010"), PATCH = color("#17181a");

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

/** The stretches of a polyline where `ok` holds, tested every `step` metres (kept points are its own corners and the last good test points). */
export function clearRuns(pts: Float32Array, ok: (x: number, z: number) => boolean, step = 1): Float32Array[] {
  const runs: Float32Array[] = [];
  let cur: number[] = [], was = false, lx = 0, lz = 0, kept = false;
  const end = () => {
    if (cur.length >= 4) runs.push(new Float32Array(cur));
    cur = [];
  };
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
    const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let s = i === 0 ? 0 : 1; s <= k; s++) {
      const x = x0 + ((x1 - x0) * s) / k, z = z0 + ((z1 - z0) * s) / k, o = ok(x, z);
      if (o && (!was || s === k)) (cur.push(x, z), (kept = true));
      else if (o) kept = false;
      else if (was) {
        if (!kept) cur.push(lx, lz);
        end();
      }
      (was = o), (lx = x), (lz = z);
    }
  }
  if (was && !kept) cur.push(lx, lz);
  end();
  return runs;
}

/** A raised strip along a polyline, `w` wide with its top at y1, and upright faces (at ±w/2, from their own y0 up to y1, or their own top) where asked. */
function strip(b: Builder, pts: Float32Array, w: number, y1: number, c: THREE.Color, uv: number, faces: { off: number; y0: number; y1?: number }[]) {
  if (w > 0) ribbon(b, pts, w, y1, c, uv);
  for (const f of faces) {
    const e = offsetLine(pts, f.off), top = f.y1 ?? y1;
    for (let i = 0; i + 3 < e.length; i += 2) {
      // Facing away from the middle of the strip.
      const inside: V3 = [(pts[i] + pts[i + 2]) / 2, (f.y0 + top) / 2 - 0.05, (pts[i + 1] + pts[i + 3]) / 2];
      const a: V3 = [e[i], f.y0, e[i + 1]], bb: V3 = [e[i + 2], f.y0, e[i + 3]], cc: V3 = [e[i + 2], top, e[i + 3]], d: V3 = [e[i], top, e[i + 1]];
      b.tri(a, bb, cc, c, inside);
      b.tri(a, cc, d, c, inside);
    }
  }
}

/** A 45° chamfer along a strip's edge: from `off` at `y0` in to `offIn` at `y1` (a kerb's rounded-off lip catches the light). */
function chamfer(b: Builder, pts: Float32Array, off: number, offIn: number, y0: number, y1: number, c: THREE.Color) {
  const lo = offsetLine(pts, off), hi = offsetLine(pts, offIn);
  for (let i = 0; i + 3 < lo.length; i += 2) {
    const inside: V3 = [(hi[i] + hi[i + 2]) / 2 + (hi[i] - lo[i]) * 3, y0 - 0.06, (hi[i + 1] + hi[i + 3]) / 2 + (hi[i + 1] - lo[i + 1]) * 3];
    const a: V3 = [lo[i], y0, lo[i + 1]], bb: V3 = [lo[i + 2], y0, lo[i + 3]], cc: V3 = [hi[i + 2], y1, hi[i + 3]], d: V3 = [hi[i], y1, hi[i + 1]];
    b.tri(a, bb, cc, c, inside);
    b.tri(a, cc, d, c, inside);
  }
}

/** How high kerbs and pavements stand above the street (m). */
export const KERB_H = 0.13;
const KERB_W = 0.2;
/** The kerbstone's bevelled street-side lip (m). */
const KERB_BEVEL = 0.035;
/** Pavement each side of a street, kerb included: wider in Iran, where the jube runs along it. */
const PAVE_M = { me: 3.0, world: 2.3 };
/** Tehran's jube: the open gutter between kerb and pavement (wider on the main roads). */
const jubeW = (major: boolean) => (major ? 0.7 : 0.5);
const KERB = color("#bcb8ad"), JUBE = color("#45433d");

/**
 * One side of a street (`side` +1 right of the line's direction, −1 left), cut short where
 * it meets another street: the kerb, the jube behind it (Iran), the raised pavement.
 */
function streetSide(b: Builder, pts: Float32Array, w: number, y: number, side: 1 | -1, jube: number, pave: number, walk: THREE.Color, uv: number, ok: (x: number, z: number) => boolean) {
  const top = y + KERB_H, low = y - 0.012;
  for (const run of clearRuns(offsetLine(pts, side * (w / 2 + KERB_W / 2)), ok)) {
    // The kerbstone: its top, the face down to the street ending in a bevelled lip.
    ribbon(b, offsetLine(run, side * (KERB_BEVEL / 2)), KERB_W - KERB_BEVEL, top, KERB, uv);
    strip(b, run, 0, top, KERB, uv, [{ off: -side * (KERB_W / 2), y0: y - 0.03, y1: top - KERB_BEVEL }, ...(jube ? [{ off: side * (KERB_W / 2), y0: low }] : [])]);
    chamfer(b, run, -side * (KERB_W / 2), -side * (KERB_W / 2 - KERB_BEVEL), top - KERB_BEVEL, top, KERB);
    if (jube) ribbon(b, offsetLine(run, side * (KERB_W / 2 + jube / 2)), jube, low, JUBE);
    const sw = pave - KERB_W - jube, at = side * (KERB_W / 2 + jube + sw / 2);
    strip(b, offsetLine(run, at), sw, top, walk, uv, [...(jube ? [{ off: -side * (sw / 2), y0: low }] : []), { off: side * (sw / 2), y0: 0 }]);
  }
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

// ---------------------------------------------------------------- streets nearby
type Seg = { ax: number; az: number; bx: number; bz: number; w: number; y: number; line: Float32Array };
const RG = 24;

/** The tile's drivable asphalt in a 24 m grid: which street is nearest, is a spot on one. */
function roadIndex(lines: Float32Array[], widths: number[], kinds: RoadKind[], drawn: boolean[]) {
  const segs: Seg[] = [];
  const grid = new Map<string, Seg[]>();
  lines.forEach((p, li) => {
    if (!drawn[li] || !DRIVABLE.includes(kinds[li])) return;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const sg = { ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3], w: widths[li], y: ROAD_Y[kinds[li]], line: p };
      segs.push(sg);
      const pad = sg.w / 2 + 2;
      for (let gx = Math.floor((Math.min(sg.ax, sg.bx) - pad) / RG); gx <= Math.floor((Math.max(sg.ax, sg.bx) + pad) / RG); gx++)
        for (let gz = Math.floor((Math.min(sg.az, sg.bz) - pad) / RG); gz <= Math.floor((Math.max(sg.az, sg.bz) + pad) / RG); gz++) {
          const k = `${gx}_${gz}`;
          const l = grid.get(k);
          if (l) l.push(sg);
          else grid.set(k, [sg]);
        }
    }
  });
  const project = (sg: Seg, x: number, z: number) => {
    const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, l2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / l2));
    const px = sg.ax + dx * k, pz = sg.az + dz * k, len = Math.sqrt(l2);
    return { px, pz, dx: dx / len, dz: dz / len, w: sg.w, y: sg.y, d: Math.hypot(px - x, pz - z) };
  };
  const nearest = (x: number, z: number, reach: number) => {
    let best: ReturnType<typeof project> | null = null;
    const r = Math.ceil(reach / RG);
    const gx = Math.floor(x / RG), gz = Math.floor(z / RG);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (const sg of grid.get(`${gx + i}_${gz + j}`) ?? []) {
          const q = project(sg, x, z);
          if (q.d <= reach && (!best || q.d < best.d)) best = q;
        }
    return best;
  };
  return {
    nearest,
    /** On the asphalt (or within `pad` metres of its edge). */
    on(x: number, z: number, pad: number) {
      for (const sg of grid.get(`${Math.floor(x / RG)}_${Math.floor(z / RG)}`) ?? []) if (project(sg, x, z).d < sg.w / 2 + pad) return true;
      return false;
    },
    /** On the asphalt of a street other than `line` (or within `pad` metres of its edge). */
    onOther(x: number, z: number, pad: number, line: Float32Array) {
      for (const sg of grid.get(`${Math.floor(x / RG)}_${Math.floor(z / RG)}`) ?? []) if (sg.line !== line && project(sg, x, z).d < sg.w / 2 + pad) return true;
      return false;
    },
    /**
     * A post that the map puts on the road itself (traffic lights and bus stops are often
     * mapped on the centreline): moved to the kerb, `out` metres past the edge, on the
     * side it was on. Returns the spot and the yaw that faces the street.
     */
    kerb(x: number, z: number, out: number) {
      const q = nearest(x, z, 40);
      if (!q) return null;
      const nx = -q.dz, nz = q.dx;
      const side = Math.sign((x - q.px) * nx + (z - q.pz) * nz) || 1;
      const yaw = Math.atan2(-nx * side, -nz * side);
      if (q.d >= q.w / 2 + out * 0.6) return { x, z, yaw }; // already on the pavement
      return { x: q.px + nx * side * (q.w / 2 + out), z: q.pz + nz * side * (q.w / 2 + out), yaw };
    },
    /**
     * `kerb`, and then off every other street too. A light or a sign mapped at the middle
     * of a junction clears the nearest street's kerb only to stand in the middle of the
     * street crossing it: it's walked out of each street it's still on, which ends on the
     * corner. Null when no pavement turns up within a few steps (it isn't put up at all).
     */
    pavement(x: number, z: number, out: number) {
      const first = this.kerb(x, z, out);
      if (!first) return null;
      let px = first.x, pz = first.z;
      for (let step = 0; step < 5; step++) {
        let on: ReturnType<typeof project> | null = null;
        for (const sg of grid.get(`${Math.floor(px / RG)}_${Math.floor(pz / RG)}`) ?? []) {
          const q = project(sg, px, pz);
          if (q.d < q.w / 2 + out * 0.6 - 0.01 && (!on || q.d - q.w / 2 < on.d - on.w / 2)) on = q;
        }
        if (!on) return { x: px, z: pz, yaw: first.yaw };
        const nx = -on.dz, nz = on.dx, side = Math.sign((px - on.px) * nx + (pz - on.pz) * nz) || 1;
        px = on.px + nx * side * (on.w / 2 + out);
        pz = on.pz + nz * side * (on.w / 2 + out);
      }
      return null;
    },
  };
}

/** Distance from a point to the nearest edge of a closed outline. */
function edgeDist(p: ArrayLike<number>, x: number, z: number) {
  let best = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], dx = p[i] - ax, dz = p[i + 1] - az, l2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(ax + dx * k - x, az + dz * k - z));
  }
  return best;
}

/** A small solid for the collision world: an octagon (trunk, post) or a turned box. */
export function post(x: number, z: number, r: number, h: number): Footprint {
  const pts = new Float32Array(16);
  for (let k = 0; k < 8; k++) (pts[k * 2] = x + Math.cos((k / 8) * Math.PI * 2) * r), (pts[k * 2 + 1] = z + Math.sin((k / 8) * Math.PI * 2) * r);
  return { pts, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h, mh: 0 };
}
export function box(x: number, z: number, hw: number, hd: number, yaw: number, h: number): Footprint {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const pts = new Float32Array(8);
  [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([lx, lz], i) => ((pts[i * 2] = x + lx * c + lz * s), (pts[i * 2 + 1] = z - lx * s + lz * c)));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < 8; i += 2) (minX = Math.min(minX, pts[i])), (maxX = Math.max(maxX, pts[i])), (minZ = Math.min(minZ, pts[i + 1])), (maxZ = Math.max(maxZ, pts[i + 1]));
  return { pts, minX, maxX, minZ, maxZ, h, mh: 0 };
}

// ---------------------------------------------------------------- the tile
export const FLOOR_M = 3.3;
export const WINDOW_M = 4.2;
/** A ground floor of shops is this tall. */
const SHOP_FLOOR_M = 3.9;
/** How far a balcony sticks out, and the parapet round a flat roof. */
const BALCONY_M = 1.15;
const PARAPET_M = 0.85;
/** Per tile, so a dense block stays cheap: balconies, and rooftop coolers and tanks. */
const MAX_BALCONIES = 360;
const MAX_KIT = 220;
/** Per tile: awnings, wall air-conditioners, dishes and aerials, stains and streaks on the asphalt. */
const MAX_AWNINGS = 160;
const MAX_AC = 520;
const MAX_DISHES = 260;
const MAX_DECALS = 700;
/** Buildings people live and work in get air-conditioners on their walls. */
const AC_KINDS: BuildingKind[] = ["apartments", "house", "office", "shop", "civic"];
const DRIVABLE: RoadKind[] = ["major", "minor", "path"];

/** Zebra stripes across a street `w` wide at (x, z); (fx, fz) runs along the street. */
function zebra(b: Builder, x: number, z: number, fx: number, fz: number, w: number, y: number, c: THREE.Color) {
  const sx = -fz, sz = fx;
  for (let s = -w / 2 + 0.5; s < w / 2 - 0.3; s += 1.1) {
    const ax = x + sx * s, az = z + sz * s;
    ribbon(b, new Float32Array([ax - fx * 1.5, az - fz * 1.5, ax + fx * 1.5, az + fz * 1.5]), 0.55, y, c);
  }
}

/** An upright prism of `sides` faces (a water tank, a minaret's shaft), closed on top. */
function prism(b: Builder, x: number, z: number, r: number, y0: number, y1: number, c: THREE.Color, sides = 8) {
  const out: V3 = [x, (y0 + y1) / 2, z];
  const P = (k: number, y: number): V3 => [x + Math.cos((k / sides) * Math.PI * 2) * r, y, z + Math.sin((k / sides) * Math.PI * 2) * r];
  for (let k = 0; k < sides; k++) {
    b.tri(P(k, y0), P(k + 1, y0), P(k + 1, y1), c, out);
    b.tri(P(k, y0), P(k + 1, y1), P(k, y1), c, out);
    b.tri([x, y1, z], P(k, y1), P(k + 1, y1), c, out);
  }
}
const tank = prism;

/** A cone from a ring at y0 to a point at y1 (a minaret's cap, a finial). */
function spike(b: Builder, x: number, z: number, r: number, y0: number, y1: number, c: THREE.Color, sides = 8) {
  const out: V3 = [x, y0 + (y1 - y0) / 4, z];
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
    b.tri([x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r], [x, y1, z], c, out);
  }
}

/**
 * A minaret on the roof: a shaft, the muezzin's balcony, a slimmer top, a tiled cap and a gold
 * finial. Ottoman (`slim`): a pencil — thinner, with a long lead cone.
 */
function minaret(b: Builder, x: number, z: number, y0: number, y1: number, body: THREE.Color, cap: THREE.Color, slim = false) {
  const r = slim ? 0.65 : 0.9, coneH = slim ? 6 : 2.8;
  prism(b, x, z, r, y0, y1 - 3, body);
  prism(b, x, z, r * 1.5, y1 - 3, y1 - 2.6, body.clone().multiplyScalar(0.85));
  prism(b, x, z, r * 0.78, y1 - 2.6, y1, body);
  spike(b, x, z, r * 0.95, y1, y1 + coneH, cap);
  spike(b, x, z, 0.08, y1 + coneH, y1 + coneH + 1.2, GOLD);
}

/**
 * A mosque's roof: a drum (with the walls' windows) and an onion-shaped tiled dome over
 * the middle with a gold finial, and two minarets at the two corners furthest apart.
 */
function drawMosque(roofs: Builder, walls: Builder, contour: THREE.Vector2[], pts: Float32Array, cx: number, cz: number, area: number, h: number, wall: THREE.Color, dome: THREE.Color, ottoman = false) {
  const r = Math.max(2.5, Math.min(11, Math.sqrt(area / Math.PI) * 0.55));
  const drumTop = h + r * 0.4, segs = 16;
  const ring = (rad: number, y: number, k: number): V3 => [cx + Math.cos((k / segs) * Math.PI * 2) * rad, y, cz + Math.sin((k / segs) * Math.PI * 2) * rad];
  const drumIn: V3 = [cx, h + r * 0.2, cz];
  for (let k = 0; k < segs; k++) {
    walls.tri(ring(r, h, k), ring(r, h, k + 1), ring(r, drumTop, k + 1), wall, drumIn);
    walls.tri(ring(r, h, k), ring(r, drumTop, k + 1), ring(r, drumTop, k), wall, drumIn);
  }
  // The onion: (radius, height) in dome radii, bulging past the drum, then to a point.
  // Ottoman: a plain hemisphere of lead (Süleymaniye, the Blue Mosque) instead of the tiled onion.
  const PROFILE: [number, number][] = ottoman
    ? [[1, 0], [0.97, 0.25], [0.87, 0.5], [0.71, 0.71], [0.5, 0.87], [0.26, 0.97], [0, 1]]
    : [[1, 0], [1.08, 0.28], [1.02, 0.55], [0.84, 0.8], [0.56, 1.02], [0.24, 1.22], [0, 1.4]];
  const at = (i: number, k: number) => ring(PROFILE[i][0] * r, drumTop + PROFILE[i][1] * r, k);
  const inside: V3 = [cx, drumTop + r * 0.5, cz];
  for (let i = 0; i + 1 < PROFILE.length; i++)
    for (let k = 0; k < segs; k++) {
      roofs.tri(at(i, k), at(i, k + 1), at(i + 1, k + 1), dome, inside);
      if (PROFILE[i + 1][0] > 0) roofs.tri(at(i, k), at(i + 1, k + 1), at(i + 1, k), dome, inside);
    }
  const tip = drumTop + PROFILE[PROFILE.length - 1][1] * r;
  spike(roofs, cx, cz, 0.18, tip, tip + Math.max(1.5, r * 0.3), GOLD);
  let pair = [0, 0], far = -1;
  for (let i = 0; i < contour.length; i++)
    for (let j = i + 1; j < contour.length; j++) {
      const d = (contour[i].x - contour[j].x) ** 2 + (contour[i].y - contour[j].y) ** 2;
      if (d > far) (far = d), (pair = [i, j]);
    }
  // Ottoman minarets stand far above the dome.
  const tall = h + (ottoman ? Math.max(20, h * 2.2) : Math.max(12, h * 1.3));
  for (const i of pair) {
    // 2.2 m in from the corner, towards the middle.
    const c = contour[i], dx = cx - c.x, dz = cz - c.y, dl = Math.hypot(dx, dz) || 1;
    const mx = c.x + (dx / dl) * 2.2, mz = c.y + (dz / dl) * 2.2;
    if (insidePacked(pts, mx, mz)) minaret(roofs, mx, mz, h, tall, ottoman ? OTTOMAN_STONE : wall, dome, ottoman);
  }
}

/** A box from y0 to y1 around (x, z), `hx` × `hz` half-sizes, turned so +x runs along (ux, uz). */
function cuboid(b: Builder, x: number, z: number, hx: number, hz: number, y0: number, y1: number, ux: number, uz: number, c: THREE.Color) {
  const vx = -uz, vz = ux;
  const P = (i: number, j: number, y: number): V3 => [x + ux * hx * i + vx * hz * j, y, z + uz * hx * i + vz * hz * j];
  const out: V3 = [x, (y0 + y1) / 2, z];
  const q = (a: V3, b2: V3, c2: V3, d: V3) => (b.tri(a, b2, c2, c, out), b.tri(a, c2, d, c, out));
  q(P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1));
  for (const [i0, j0, i1, j1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) q(P(i0, j0, y0), P(i1, j1, y0), P(i1, j1, y1), P(i0, j0, y1));
}

// ---------------------------------------------------------------- bridges
const BRIDGE_CONCRETE = color("#b8b4ab"), BRIDGE_PARAPET = color("#d7d4cc"), BRIDGE_STEEL = color("#d3d8dc"), BRIDGE_CABLE = color("#9aa1a8");
/** A pier under a bridge deck this often (m). */
const PIER_EVERY_M = 40;

/**
 * Bridges (vectorTile.ts: roads with `br`, spans `bs`, towers `bt`). The deck stays where the road
 * is (so driving is unchanged); around it: low concrete parapets on both edges, the deck's edge
 * below, piers down into the water or the valley; over a long bridge the suspension structure —
 * two towers of two legs with cross beams, the main cables sagging between them, hangers down to
 * the deck. A carriageway of two (`ow`) has the structure to its left, over both (driving on the right).
 */
function drawBridges(tile: CityTile, frame: ReturnType<typeof makeFrame>, unpacked: Float32Array[], trim: Builder, walls: Builder, lite: boolean) {
  tile.r.forEach((r, ri) => {
    if (!r.br) return;
    const pts = unpacked[ri];
    if (pts.length < 4) return;
    const half = r.w / 2 + 0.25;
    let along = 0, nextPier = PIER_EVERY_M / 2;
    for (let i = 2; i < pts.length; i += 2) {
      const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.5) continue;
      const nx = -dz / len, nz = dx / len;
      for (const sd of [-1, 1]) {
        const ox = nx * half * sd, oz = nz * half * sd;
        beam(trim, [ax + ox, 0.55, az + oz], [bx + ox, 0.55, bz + oz], 0.5, BRIDGE_PARAPET);
        beam(walls, [ax + ox, -0.9, az + oz], [bx + ox, -0.9, bz + oz], 1.4, BRIDGE_CONCRETE);
      }
      // A pier every PIER_EVERY_M along the bridge (not on the lite tier).
      for (; !lite && nextPier <= along + len; nextPier += PIER_EVERY_M) {
        const k = (nextPier - along) / len;
        beam(walls, [ax + dx * k, -30, az + dz * k], [ax + dx * k, -1.6, az + dz * k], Math.min(3, r.w * 0.35), BRIDGE_CONCRETE);
      }
      along += len;
    }
  });
  /** The middle of the structure and how far its sides stand out, for a deck of width `w`. */
  const across = (w: number, ow?: 1) => ({ shift: ow ? w / 2 + 1.5 : 0, half: (ow ? w + 1.5 : w / 2) + 1.4 });
  for (const sp of tile.bs ?? []) {
    const p = frame.unpack(tile.cx, tile.cy, sp.l);
    const { shift, half } = across(sp.w, sp.ow);
    for (let i = 1; i < sp.h.length && 2 * i + 1 < p.length; i++) {
      const ax = p[2 * i - 2], az = p[2 * i - 1], bx = p[2 * i], bz = p[2 * i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      // Left of the way the road runs (x east, z south), and square to it.
      const lx = dz / len, lz = -dx / len;
      const cax = ax + lx * shift, caz = az + lz * shift, cbx = bx + lx * shift, cbz = bz + lz * shift;
      for (const sd of [-1, 1]) {
        const ox = lx * half * sd, oz = lz * half * sd;
        beam(trim, [cax + ox, sp.h[i - 1], caz + oz], [cbx + ox, sp.h[i], cbz + oz], 0.45, BRIDGE_CABLE);
        if (!lite && sp.h[i - 1] > 2) beam(trim, [cax + ox, sp.h[i - 1], caz + oz], [cax + ox, 0.9, caz + oz], 0.1, BRIDGE_CABLE);
      }
    }
  }
  for (const tw of tile.bt ?? []) {
    const p = frame.unpack(tile.cx, tile.cy, tw.l);
    if (p.length < 4) continue;
    const dx = p[2] - p[0], dz = p[3] - p[1], len = Math.hypot(dx, dz) || 1;
    const lx = dz / len, lz = -dx / len;
    const { shift, half } = across(tw.w, tw.ow);
    const cx = p[0] + lx * shift, cz = p[1] + lz * shift;
    const leg = (sd: number): [number, number] => [cx + lx * (half + 0.6) * sd, cz + lz * (half + 0.6) * sd];
    const [l0, l1] = [leg(-1), leg(1)];
    for (const [x, z] of [l0, l1]) beam(walls, [x, -30, z], [x, tw.h, z], 3.2, BRIDGE_STEEL);
    for (const y of [-2.2, tw.h * 0.55, tw.h - 2]) beam(walls, [l0[0], y, l0[1]], [l1[0], y, l1[1]], 2.2, BRIDGE_STEEL);
  }
}

// ---------------------------------------------------------------- street-level and façade detail
/** A thin box from `a` to `bb`, `t` across (a mast, an antenna's elements, a dish's arm). */
function beam(b: Builder, a: V3, bb: V3, t: number, c: THREE.Color) {
  const dx = bb[0] - a[0], dy = bb[1] - a[1], dz = bb[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / l, dy / l, dz / l];
  // Two directions square to the beam: from "up" unless it is upright, then from "east".
  const ref: V3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let p: V3 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
  const pl = Math.hypot(...p) || 1;
  p = [(p[0] / pl) * t, (p[1] / pl) * t, (p[2] / pl) * t];
  const q: V3 = [d[1] * p[2] - d[2] * p[1], d[2] * p[0] - d[0] * p[2], d[0] * p[1] - d[1] * p[0]];
  const at = (o: V3, i: number, j: number): V3 => [o[0] + p[0] * i + q[0] * j, o[1] + p[1] * i + q[1] * j, o[2] + p[2] * i + q[2] * j];
  const mid: V3 = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2, (a[2] + bb[2]) / 2];
  for (const [i0, j0, i1, j1] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    b.tri(at(a, i0, j0), at(a, i1, j1), at(bb, i1, j1), c, mid);
    b.tri(at(a, i0, j0), at(bb, i1, j1), at(bb, i0, j0), c, mid);
  }
}

/** A satellite dish on a short post, its bowl `r` across turned to `yaw` (0 = +z, south) and tipped up by `tilt`, with the arm that holds its receiver. */
function dish(b: Builder, x: number, z: number, y0: number, r: number, yaw: number, tilt: number, c: THREE.Color) {
  const post = 0.75;
  beam(b, [x, y0, z], [x, y0 + post, z], 0.025, c);
  const f: V3 = [Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)];
  // Across the bowl: sideways (level) and "up" in the bowl's own plane.
  const s: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const u: V3 = [f[1] * s[2] - f[2] * s[1], f[2] * s[0] - f[0] * s[2], f[0] * s[1] - f[1] * s[0]];
  const C: V3 = [x, y0 + post + r * 0.55, z];
  const back: V3 = [C[0] - f[0] * r * 0.32, C[1] - f[1] * r * 0.32, C[2] - f[2] * r * 0.32];
  const behind: V3 = [C[0] - f[0] * r, C[1] - f[1] * r, C[2] - f[2] * r];
  const seg = 10, ring = (k: number): V3 => {
    const a = (k / seg) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r * 1.08; // a touch oval, as offset dishes are
    return [C[0] + s[0] * ca + u[0] * sa, C[1] + s[1] * ca + u[1] * sa, C[2] + s[2] * ca + u[2] * sa];
  };
  for (let k = 0; k < seg; k++) b.tri(back, ring(k), ring(k + 1), c, behind);
  // The arm from under the bowl out to the receiver at its focus, and the receiver.
  const low = ring(Math.round(seg * 0.75));
  const focus: V3 = [C[0] + f[0] * r * 0.75 - u[0] * r * 0.25, C[1] + f[1] * r * 0.75 - u[1] * r * 0.25, C[2] + f[2] * r * 0.75 - u[2] * r * 0.25];
  beam(b, low, focus, 0.012, c);
  beam(b, focus, [focus[0] - f[0] * 0.12, focus[1] - f[1] * 0.12, focus[2] - f[2] * 0.12], 0.04, DARK_KIT);
}

/** A rooftop TV aerial: a mast, a boom on top pointing along `yaw`, and its elements across it. */
function aerial(b: Builder, x: number, z: number, y0: number, tall: number, yaw: number, c: THREE.Color) {
  const top = y0 + tall, fx = Math.sin(yaw), fz = Math.cos(yaw);
  beam(b, [x, y0, z], [x, top + 0.1, z], 0.022, c);
  beam(b, [x - fx * 0.75, top, z - fz * 0.75], [x + fx * 0.75, top, z + fz * 0.75], 0.014, c);
  for (let i = 0; i < 4; i++) {
    const t = -0.6 + i * 0.4, w = 0.5 - i * 0.07, cx = x + fx * t, cz = z + fz * t;
    beam(b, [cx - fz * w, top, cz + fx * w], [cx + fz * w, top, cz - fx * w], 0.009, c);
  }
}

/** A split air-conditioner's outdoor unit on a wall (its back on the wall at (x, z), facing out along n; +x of the box runs along (ux, uz)): a white box and its fan grille. */
function acUnit(b: Builder, x: number, z: number, y0: number, ux: number, uz: number, nx: number, nz: number, c: THREE.Color) {
  const W = 0.4, D = 0.15, H = 0.55;
  cuboid(b, x + nx * D, z + nz * D, W, D, y0, y0 + H, ux, uz, c);
  // The grille: a dark round-ish square, off to one side, just proud of the front.
  const fx = x + nx * (2 * D + 0.004), fz = z + nz * (2 * D + 0.004), gx = -0.08, gh = 0.19;
  const v = (i: number, j: number) => b.vert(fx + ux * (gx + i * gh), y0 + H / 2 + j * gh, fz + uz * (gx + i * gh), nx, 0, nz, DARK_KIT);
  const p0 = v(-1, -1), p1 = v(1, -1), p2 = v(1, 1), p3 = v(-1, 1);
  b.idx.push(p0, p1, p2, p0, p2, p3);
}

/**
 * A striped canvas awning over a shop window: from the wall at `y` out `out` metres,
 * sloping down by `drop`, with a valance hanging off its front and closed sides. (x0, z0)
 * → (x1, z1) along the wall; (nx, nz) out of it.
 */
function awning(b: Builder, x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, y: number, out: number, drop: number, c: THREE.Color, white: THREE.Color) {
  const stripes = 6, val = 0.24;
  const inside: V3 = [(x0 + x1) / 2 - nx * 0.6, y - 1.4, (z0 + z1) / 2 - nz * 0.6];
  const yf = y - drop;
  const P = (t: number, o: number, yy: number): V3 => [x0 + (x1 - x0) * t + nx * o, yy, z0 + (z1 - z0) * t + nz * o];
  for (let i = 0; i < stripes; i++) {
    const t0 = i / stripes, t1 = (i + 1) / stripes, col = i % 2 ? white : c;
    b.tri(P(t0, 0, y), P(t1, 0, y), P(t1, out, yf), col, inside);
    b.tri(P(t0, 0, y), P(t1, out, yf), P(t0, out, yf), col, inside);
    b.tri(P(t0, out, yf), P(t1, out, yf), P(t1, out, yf - val), col, inside);
    b.tri(P(t0, out, yf), P(t1, out, yf - val), P(t0, out, yf - val), col, inside);
  }
  for (const t of [0, 1]) b.tri(P(t, 0, y), P(t, out, yf), P(t, out, yf - val), c, [inside[0] + (t ? -1 : 1) * (x1 - x0), inside[1], inside[2] + (t ? -1 : 1) * (z1 - z0)]);
}

/**
 * A soft stain on the street (oil, a fresh patch): opaque-ish in the middle, fading to
 * nothing at its ragged edge. The decals layer carries each vertex's opacity in `fac`
 * (world3d's decal material reads it); `stretch` draws it out along `yaw`.
 */
function blot(b: Builder, x: number, z: number, r: number, y: number, c: THREE.Color, a: number, yaw: number, stretch: number, rnd: () => number) {
  b.facade = a;
  const centre = b.vert(x, y, z, 0, 1, 0, c);
  b.facade = 0;
  const seg = 9, sx = Math.sin(yaw), sz = Math.cos(yaw);
  const first = b.pos.length / 3;
  for (let k = 0; k < seg; k++) {
    const t = (k / seg) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.45);
    const along = Math.cos(t) * rr * stretch, across = Math.sin(t) * rr;
    b.vert(x + sx * along + sz * across, y, z + sz * along - sx * across, 0, 1, 0, c);
  }
  for (let k = 0; k < seg; k++) up(b, centre, first + k, first + ((k + 1) % seg));
}

/** A streak along a path of (x, z) points, `w` wide — tyre rubber — darkest in the middle of its length, fading out at both ends. */
function streak(b: Builder, pts: number[], w: number, y: number, c: THREE.Color, a: number) {
  const n = pts.length / 2;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + 1), h = Math.max(0, i - 1);
    let dx = pts[j * 2] - pts[h * 2], dz = pts[j * 2 + 1] - pts[h * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    (dx /= l), (dz /= l);
    b.facade = a * Math.sqrt(Math.sin((Math.PI * i) / (n - 1)));
    const x = pts[i * 2], z = pts[i * 2 + 1];
    const L = b.vert(x - dz * w * 0.5, y, z + dx * w * 0.5, 0, 1, 0, c), R = b.vert(x + dz * w * 0.5, y, z - dx * w * 0.5, 0, 1, 0, c);
    if (prev >= 0) (up(b, prev, prev + 1, L), up(b, prev + 1, R, L));
    prev = L;
  }
  b.facade = 0;
}

const SURFACE: Record<CityPitch["s"], [string, string]> = {
  // [real, toon]: grass for football, hard courts for the rest.
  soccer: ["#4f9a48", "#6fcf6a"], basketball: ["#b0653f", "#ff9f6b"], tennis: ["#3f7a9e", "#6bb8ff"], volleyball: ["#c49a5c", "#ffd08a"], other: ["#5f8f55", "#8fd67a"],
};

/**
 * A pitch's markings from its centre, size and heading: the surface, white lines for its
 * sport, and the bits that stand up — goals, hoops or a net (as solid walls geometry; the
 * posts go in `posts` so a car stops at them).
 */
function drawPitch(f: CityPitch, at: Float32Array, ground: Builder, marks: Builder, walls: Builder, white: THREE.Color, real: boolean, posts: { x: number; z: number; h: number }[]) {
  const cx = at[0], cz = at[1];
  // Long side along (ux, uz) in local x/z (x east, z south); (vx, vz) across.
  const ux = Math.cos(f.a), uz = -Math.sin(f.a), vx = -uz, vz = ux;
  const L = f.l / 2 - 0.6, W = f.w / 2 - 0.6;
  if (L < 3 || W < 2) return;
  const P = (u: number, v: number) => [cx + ux * u + vx * v, cz + uz * u + vz * v];
  const Y = 0.042;
  // Surface (over whatever land use is under it).
  const s = color(SURFACE[f.s][real ? 0 : 1]);
  const base = ground.pos.length / 3;
  for (const [u, v] of [[-L - 0.6, -W - 0.6], [L + 0.6, -W - 0.6], [L + 0.6, W + 0.6], [-L - 0.6, W + 0.6]]) {
    const [x, z] = P(u, v);
    ground.vert(x, 0.032, z, 0, 1, 0, s);
  }
  up(ground, base, base + 1, base + 2);
  up(ground, base, base + 2, base + 3);
  const line = (pts: number[][], closed = false) => {
    const flat: number[] = [];
    for (const [u, v] of closed ? [...pts, pts[0]] : pts) flat.push(...P(u, v));
    ribbon(marks, new Float32Array(flat), 0.12, Y, white);
  };
  const rect = (u0: number, v0: number, u1: number, v1: number) => line([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], true);
  const arc = (u: number, v: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
    const pts: number[][] = [];
    for (let i = 0; i <= 24; i++) {
      const a = a0 + ((a1 - a0) * i) / 24;
      pts.push([u + Math.cos(a) * r, v + Math.sin(a) * r]);
    }
    line(pts);
  };
  const metal = color("#e9ecef");
  const stand = (u: number, v: number, h: number) => {
    const [x, z] = P(u, v);
    cuboid(walls, x, z, 0.06, 0.06, 0, h, ux, uz, metal);
    posts.push({ x, z, h });
  };
  rect(-L, -W, L, W);
  if (f.s === "soccer") {
    line([[0, -W], [0, W]]);
    arc(0, 0, Math.min(9.15, W * 0.3));
    const goalW = f.l > 70 ? 3.66 : f.l > 30 ? 1.6 : 1.1, goalH = f.l > 70 ? 2.44 : 2;
    for (const end of [-1, 1]) {
      const box = Math.min(16.5, L * 0.3), half = Math.min(20.15, W * 0.6), small = Math.min(5.5, L * 0.1), halfS = Math.min(9.15, W * 0.3);
      rect(end * L, -half, end * (L - box), half);
      rect(end * L, -halfS, end * (L - small), halfS);
      // The goal: two posts and a crossbar on the line.
      for (const side of [-1, 1]) stand(end * L, side * goalW, goalH);
      const [gx, gz] = P(end * L, 0);
      cuboid(walls, gx, gz, 0.06, goalW + 0.06, goalH - 0.12, goalH, ux, uz, metal);
    }
  } else if (f.s === "basketball") {
    line([[0, -W], [0, W]]);
    arc(0, 0, Math.min(1.8, W * 0.25));
    for (const end of [-1, 1]) {
      const key = Math.min(5.8, L * 0.4), kw = Math.min(2.45, W * 0.35);
      rect(end * L, -kw, end * (L - key), kw);
      arc(end * (L - key), 0, kw, Math.PI / 2, (Math.PI * 3) / 2);
      // Hoop on a pole just behind the line, board facing the court.
      stand(end * (L + 0.5), 0, 3.05);
      const [bx, bz] = P(end * (L - 0.6), 0);
      cuboid(walls, bx, bz, 0.04, 0.9, 2.9, 3.95, ux, uz, color("#f4f6f8"));
    }
  } else if (f.s === "tennis" || f.s === "volleyball") {
    line([[0, -W], [0, W]]);
    if (f.s === "tennis") line([[-L * 0.55, 0], [L * 0.55, 0]]);
    const h = f.s === "tennis" ? 0.95 : 2.43;
    for (const side of [-1, 1]) stand(0, side * (W + 0.4), h + 0.1);
    const [nx, nz] = P(0, 0);
    cuboid(walls, nx, nz, 0.02, W + 0.4, h - (f.s === "tennis" ? 0.9 : 1), h, ux, uz, color(real ? "#2b2f33" : "#ffffff"));
  }
}

export function buildTileArrays(tile: CityTile, origin: LatLng, style: Style, lite: boolean, cuts: Cut[] = []): TileArrays {
  const frame = makeFrame(origin);
  const pal = PALETTES[style];
  // Mosques in Turkey are Ottoman: lead domes and pencil minarets (the rest of the region: tiled onions).
  const ottoman = countryAt(origin.lat, origin.lng) === "TR";
  const realStyle = style === "real";
  const ground = new Builder(), water = new Builder(), roads = new Builder(), marks = new Builder(), walls = new Builder(), glass = new Builder(), roofs = new Builder(), trim = new Builder(), kerbs = new Builder(), decals = new Builder();
  const footprints: Footprint[] = [];
  const labels: Label[] = [];
  const rand = rng(hashStr(`props|${tile.key}`));
  /** Inside a store's own building (or within `pad` metres of its outline). */
  const inCut = (x: number, z: number, pad = 0) => cuts.some((c) => insidePacked(c.pts, x, z) || (pad > 0 && edgeDist(c.pts, x, z) < pad));

  // ---- streets first: a wall needs to know whether it faces one (shopfronts, balconies)
  const unpacked = tile.r.map((r) => frame.unpack(tile.cx, tile.cy, r.l));
  const roadLines: Float32Array[] = [], roadWidths: number[] = [], roadKinds: RoadKind[] = [], roadNames: (string | null)[] = [], roadDrawn: boolean[] = [], roadOw: boolean[] = [];
  tile.r.forEach((r, ri) => {
    if (unpacked[ri].length < 4) return;
    roadLines.push(unpacked[ri]);
    roadWidths.push(r.w);
    roadKinds.push(r.k);
    roadNames.push(r.n ?? null);
    roadDrawn.push(!r.x);
    roadOw.push(!!r.ow);
  });
  const road = roadIndex(roadLines, roadWidths, roadKinds, roadDrawn);

  // ---- buildings
  const sw = tileSW(tile.cx, tile.cy);
  const region = middleEast(sw.lat, sw.lng) ? "me" : "world";
  /** Balconies, parapets and rooftop kit: the real style, on phones that can afford them. */
  const detailed = realStyle && !lite;
  const kitRand = rng(hashStr(`kit|${tile.key}`)), acRand = rng(hashStr(`ac|${tile.key}`)), skyRand = rng(hashStr(`dish|${tile.key}`));
  let balconies = 0, kit = 0, awningN = 0, acN = 0, dishN = 0;
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
    if (cuts.length) {
      // Replaced by a store's model: its middle is inside the model, or the store's pin is
      // inside it. A filled-in block of flats (`g`) goes if it touches the model at all.
      let mx = 0, mz = 0;
      for (let i = 0; i < pts.length; i += 2) (mx += pts[i]), (mz += pts[i + 1]);
      mx /= pts.length / 2;
      mz /= pts.length / 2;
      const gone = cuts.some((c) => insidePacked(c.pts, mx, mz) || insidePacked(pts, c.ax, c.az) || (b.g && Array.from({ length: pts.length / 2 }, (_, i) => i).some((i) => insidePacked(c.pts, pts[i * 2], pts[i * 2 + 1]))));
      if (gone) continue;
    }
    const seed = hashStr(`${tile.key}|${bi}`);
    const h = Math.max(3, b.h), mh = Math.min(h - 1, b.mh ?? 0);
    footprints.push({ pts, minX, maxX, minZ, maxZ, h, mh });
    // What it's made of and its colour: the map's, else a guess for its kind and region.
    const look = realStyle ? buildingLook(b, seed, region) : null;
    const isGlass = look ? look.glass || (pal.glass.includes(b.k) && !b.c && !b.m) : pal.glass.includes(b.k) && !b.c;
    const facade: Facade = look && !isGlass ? look.facade : "plaster";
    const paint = look ? look.colour : (b.c ?? null);
    const wall = paint ? color(paint) : facade === "plaster" || facade === "shopfront" ? pick(pal.walls[b.k] ?? pal.walls.house, seed) : pick(MATERIAL_WALLS[facade], seed);
    const foot = wall.clone().multiplyScalar(realStyle ? 0.8 : 0.72); // darker at street level: fake ambient occlusion
    const area = Math.abs(signedArea(pts));
    const { contour, tris } = triangulate(pts);
    let cx = 0, cz = 0;
    for (const v of contour) (cx += v.x), (cz += v.y);
    cx /= contour.length;
    cz /= contour.length;
    // A mosque (a place of worship in the Middle East): a tiled dome and minarets, never a spire.
    const mosque = b.k === "church" && region === "me";
    // Roof shape: from the map, else a guess — pitched roofs on small houses.
    const n = contour.length;
    let shape: RoofShape = mosque ? "dome" : b.rf ?? (b.k === "house" && area < 450 ? (n === 4 ? "gabled" : n <= 10 ? "hipped" : "flat") : b.k === "church" && n === 4 ? "gabled" : "flat");
    if (((shape === "gabled" || shape === "skillion") && n !== 4) || ((shape === "hipped" || shape === "pyramidal") && n > 12)) shape = n <= 12 && shape !== "skillion" ? "hipped" : "flat";
    const flatRoof = pick(pal.flatRoofs, seed >>> 3);
    const roof = b.rc ? color(b.rc) : mosque ? pick(ottoman ? LEAD_DOMES : DOMES, seed >>> 5) : shape === "flat" ? flatRoof : pick(pal.roofs[b.k] ?? pal.roofs.house, seed >>> 3);

    // Walls, one quad per edge — split at the first floor where shops line the street, with
    // balconies on the street side of blocks of flats.
    const target = isGlass ? glass : walls;
    const floors = Math.max(1, Math.round(h / FLOOR_M));
    const shopsBelow = realStyle && !isGlass && h > 4.5 && mh < 0.5 && (b.k === "shop" || ((b.k === "apartments" || b.k === "office") && seed % 5 < 3));
    const withBalconies = detailed && !isGlass && !mosque && (b.k === "apartments" || (b.k === "house" && h >= 9)) && floors >= 3 && seed % 4 !== 0;
    const balconyEvery = 1 + ((seed >>> 4) % 2);
    const rail = color(RAILS[(seed >>> 6) % RAILS.length]);
    const slab = wall.clone().multiplyScalar(0.86);
    // Awnings on two shops in five; air-conditioners on homes and offices, some blocks bristling with them.
    const awnings = detailed && shopsBelow && (seed >>> 11) % 5 < 2;
    const awningCol = color(AWNINGS[(seed >>> 13) % AWNINGS.length]);
    const acDensity = detailed && !isGlass && !mosque && floors >= 2 && AC_KINDS.includes(b.k) ? [0, 0.06, 0.13, 0.22][(seed >>> 9) % 4] : 0;
    let u = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[j], z1 = pts[j + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
      // Faces a street: drivable asphalt a few metres in front of the wall's middle.
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const street = (shopsBelow || withBalconies) && len >= 4 ? road.nearest(mx + nx * 6, mz + nz * 6, 12) : null;
      const facesStreet = !!street && (street.px - mx) * nx + (street.pz - mz) * nz > 1;
      const quad = (y0: number, y1: number, f: Facade) => {
        target.facade = FAC[f];
        const u0 = u / WINDOW_M, u1 = (u + len) / WINDOW_M, v0 = y0 / FLOOR_M, v1 = y1 / FLOOR_M;
        const low = y0 <= mh + 0.01 ? foot : wall;
        const a = target.vert(x0, y0, z0, nx, 0, nz, low, u0, v0);
        const bb = target.vert(x1, y0, z1, nx, 0, nz, low, u1, v0);
        const c = target.vert(x1, y1, z1, nx, 0, nz, wall, u1, v1);
        const d = target.vert(x0, y1, z0, nx, 0, nz, wall, u0, v1);
        target.idx.push(a, c, bb, a, d, c);
      };
      const split = shopsBelow && facesStreet ? Math.min(h - 0.5, SHOP_FLOOR_M) : 0;
      if (split > mh + 1) (quad(mh, split, "shopfront"), quad(split, h, facade));
      else quad(mh, h, facade);
      // Balconies on the window bays (one every WINDOW_M along the walls, as the façade draws
      // them), from the first floor up: a slab and a railing along its front.
      if (withBalconies && facesStreet && len >= 5) {
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
        for (let k = Math.ceil((u + 0.6) / WINDOW_M - 0.5); (k + 0.5) * WINDOW_M < u + len - 0.6 && balconies < MAX_BALCONIES; k++) {
          if (k % balconyEvery) continue;
          const along = (k + 0.5) * WINDOW_M - u;
          const half = Math.min(1.45, along - 0.3, len - along - 0.3);
          if (half < 0.8) continue;
          const bx = x0 + ux * along, bz = z0 + uz * along;
          for (let f = 1; f < floors && (f + 1) * FLOOR_M <= h + 0.2 && balconies < MAX_BALCONIES; f++) {
            const y = f * FLOOR_M;
            cuboid(trim, bx + (nx * BALCONY_M) / 2, bz + (nz * BALCONY_M) / 2, half, BALCONY_M / 2, y - 0.16, y, ux, uz, slab);
            // The railing: one panel, seen from both sides (trim is drawn double-sided).
            const fx = bx + nx * (BALCONY_M - 0.03), fz = bz + nz * (BALCONY_M - 0.03);
            const r0 = trim.vert(fx - ux * half, y, fz - uz * half, nx, 0, nz, rail), r1 = trim.vert(fx + ux * half, y, fz + uz * half, nx, 0, nz, rail);
            const r2 = trim.vert(fx + ux * half, y + 1, fz + uz * half, nx, 0, nz, rail), r3 = trim.vert(fx - ux * half, y + 1, fz - uz * half, nx, 0, nz, rail);
            trim.idx.push(r0, r1, r2, r0, r2, r3);
            balconies++;
          }
        }
      }
      // Striped awnings over the shop windows, one per bay, on some streets' shops.
      if (awnings && split > mh + 1 && len >= 3.5) {
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
        for (let k = Math.ceil(u / WINDOW_M); (k + 1) * WINDOW_M <= u + len + 0.01 && awningN < MAX_AWNINGS; k++) {
          const a0 = k * WINDOW_M - u + 0.22, a1 = (k + 1) * WINDOW_M - u - 0.22;
          if (a0 < 0.15 || a1 > len - 0.15) continue;
          const y = Math.min(split - 0.35, 2.75);
          awning(trim, x0 + ux * a0 + nx * 0.02, z0 + uz * a0 + nz * 0.02, x0 + ux * a1 + nx * 0.02, z0 + uz * a1 + nz * 0.02, nx, nz, y, 1.15, 0.42, awningCol, CANVAS_WHITE);
          awningN++;
        }
      }
      // Split air-conditioners hung beside the windows, from the first floor up (not on the balcony bays).
      if (acDensity > 0 && len >= 3) {
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
        const balconyHere = withBalconies && facesStreet && len >= 5;
        for (let k = Math.ceil((u + 0.6) / WINDOW_M - 0.5); (k + 0.5) * WINDOW_M < u + len - 0.6 && acN < MAX_AC; k++) {
          if (balconyHere && k % balconyEvery === 0) continue;
          for (let f = 1; f < floors && (f + 1) * FLOOR_M <= h + 0.2 && acN < MAX_AC; f++) {
            if (acRand() > acDensity) continue;
            const along = (k + 0.5) * WINDOW_M - u + (acRand() < 0.5 ? -1.62 : 1.62);
            if (along < 0.5 || along > len - 0.5) continue;
            acUnit(trim, x0 + ux * along, z0 + uz * along, f * FLOOR_M + 0.95, ux, uz, nx, nz, color(AC_UNITS[(acN + bi) % AC_UNITS.length]));
            acN++;
          }
        }
      }
      u += len;
    }
    target.facade = 0;
    // A canopy on pillars: close it underneath.
    if (mh > 0.5) {
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, mh, v.y, 0, -1, 0, roof.clone().multiplyScalar(0.6));
      for (const tri of tris) roofs.idx.push(base + tri[0], base + tri[2], base + tri[1]);
    }

    const inside: V3 = [cx, h - 1, cz];
    if (shape === "gabled" || shape === "skillion" || (shape === "hipped" && n === 4)) {
      const P = contour.map((v) => [v.x, v.y] as [number, number]);
      const e0 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), e1 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
      // Along the long side: rotate the corners so p0→p1 is a long edge.
      const Q = e0 >= e1 ? P : [P[1], P[2], P[3], P[0]];
      const short = Math.min(e0, e1), long = Math.max(e0, e1);
      const c3 = (q: [number, number], y = h): V3 => [q[0], y, q[1]];
      if (shape === "skillion") {
        // One slope across the short side: high over p0→p1, the eaves over p2→p3.
        const top = h + Math.min(3, short * 0.3);
        roofs.tri(c3(Q[0], top), c3(Q[1], top), c3(Q[2]), roof, inside);
        roofs.tri(c3(Q[0], top), c3(Q[2]), c3(Q[3]), roof, inside);
        // The high wall and the two triangles at the ends are wall.
        walls.tri(c3(Q[0]), c3(Q[1]), c3(Q[1], top), wall, inside);
        walls.tri(c3(Q[0]), c3(Q[1], top), c3(Q[0], top), wall, inside);
        walls.tri(c3(Q[1]), c3(Q[2]), c3(Q[1], top), wall, inside);
        walls.tri(c3(Q[3]), c3(Q[0]), c3(Q[0], top), wall, inside);
      } else {
        const peak = h + Math.min(realStyle ? 5 : 4, short * (realStyle ? 0.42 : 0.35));
        const mA: [number, number] = [(Q[3][0] + Q[0][0]) / 2, (Q[3][1] + Q[0][1]) / 2];
        const mB: [number, number] = [(Q[1][0] + Q[2][0]) / 2, (Q[1][1] + Q[2][1]) / 2];
        // A gable's ridge runs end to end; a hip's stops half the short side in from each end.
        const t = shape === "hipped" ? Math.min(0.45, short / 2 / long) : 0;
        const rA: V3 = [mA[0] + (mB[0] - mA[0]) * t, peak, mA[1] + (mB[1] - mA[1]) * t];
        const rB: V3 = [mB[0] + (mA[0] - mB[0]) * t, peak, mB[1] + (mA[1] - mB[1]) * t];
        roofs.tri(c3(Q[0]), c3(Q[1]), rB, roof, inside);
        roofs.tri(c3(Q[0]), rB, rA, roof, inside);
        roofs.tri(c3(Q[2]), c3(Q[3]), rA, roof, inside);
        roofs.tri(c3(Q[2]), rA, rB, roof, inside);
        // The ends: wall under a gable, roof under a hip.
        const end = shape === "hipped" ? roofs : walls, endCol = shape === "hipped" ? roof : wall;
        end.tri(c3(Q[1]), c3(Q[2]), rB, endCol, inside);
        end.tri(c3(Q[3]), c3(Q[0]), rA, endCol, inside);
      }
    } else if (shape === "hipped" || shape === "pyramidal") {
      const peak = h + Math.min(4.5, Math.sqrt(area) * 0.35);
      for (let i = 0; i < n; i++) {
        const p0 = contour[i], p1 = contour[(i + 1) % n];
        roofs.tri([p0.x, h, p0.y], [p1.x, h, p1.y], [cx, peak, cz], roof, inside);
      }
    } else if (shape === "dome") {
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, h, v.y, 0, 1, 0, mosque ? flatRoof : roof);
      for (const tri of tris) up(roofs, base + tri[0], base + tri[1], base + tri[2]);
      if (mosque) drawMosque(roofs, walls, contour, pts, cx, cz, area, h, wall, roof, ottoman);
      else {
        const r = Math.min(Math.sqrt(area / Math.PI), 18);
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
      }
    } else {
      const base = roofs.pos.length / 3;
      for (const v of contour) roofs.vert(v.x, h, v.y, 0, 1, 0, roof);
      for (const tri of tris) up(roofs, base + tri[0], base + tri[1], base + tri[2]);
      // A low parapet round the roof's edge: one face, seen from both sides (roofs are double-sided).
      if (detailed && h >= 5) {
        const lip = wall.clone().multiplyScalar(0.9);
        for (let i = 0; i < pts.length; i += 2) {
          const j = (i + 2) % pts.length;
          const ex = pts[j] - pts[i], ez = pts[j + 1] - pts[i + 1], el = Math.hypot(ex, ez) || 1;
          const a = roofs.vert(pts[i], h, pts[i + 1], ez / el, 0, -ex / el, lip), c = roofs.vert(pts[j], h, pts[j + 1], ez / el, 0, -ex / el, lip);
          const d = roofs.vert(pts[j], h + PARAPET_M, pts[j + 1], ez / el, 0, -ex / el, lip), e = roofs.vert(pts[i], h + PARAPET_M, pts[i + 1], ez / el, 0, -ex / el, lip);
          roofs.idx.push(a, c, d, a, d, e);
        }
      }
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
      // Middle Eastern roofs: evaporative coolers and water tanks, as on every Tehran block.
      if (detailed && region === "me" && area >= 40 && !isGlass && kit < MAX_KIT) {
        const want = Math.min(4, 1 + Math.floor(area / 160));
        for (let k = 0, tries = 0; k < want && tries < want * 6 && kit < MAX_KIT; tries++) {
          const x = minX + kitRand() * (maxX - minX), z = minZ + kitRand() * (maxZ - minZ);
          if (!insidePacked(pts, x, z) || edgeDist(pts, x, z) < 1.3) continue;
          if (kitRand() < 0.55) {
            // An evaporative cooler: a grey box on the roof.
            cuboid(trim, x, z, 0.55, 0.5, h, h + 0.95, 1, 0, COOLER);
          } else tank(trim, x, z, 0.55, h, h + 1.2, kitRand() < 0.5 ? TANK_WHITE : TANK_BLUE, 6);
          k++;
          kit++;
        }
      }
      // Satellite dishes turned to the southern sky, and the odd old TV aerial.
      if (detailed && !isGlass && !mosque && area >= 40 && h >= 5 && dishN < MAX_DISHES) {
        const want = (region === "me" ? 1 : 0) + Math.floor(skyRand() * (1.6 + Math.min(2, area / 300)));
        for (let k = 0, tries = 0; k < want && tries < want * 6 && dishN < MAX_DISHES; tries++) {
          const x = minX + skyRand() * (maxX - minX), z = minZ + skyRand() * (maxZ - minZ);
          if (!insidePacked(pts, x, z) || edgeDist(pts, x, z) < 0.9) continue;
          if (skyRand() < 0.8) dish(trim, x, z, h, 0.36 + skyRand() * 0.22, (skyRand() - 0.5) * 0.7, 0.62 + skyRand() * 0.25, DISH);
          else aerial(trim, x, z, h, 1.6 + skyRand() * 0.8, skyRand() * Math.PI, AERIAL);
          k++;
          dishN++;
        }
      }
    }
    // Landmarks: spires on churches (not mosques: they have their minarets), antennas on towers.
    if ((b.k === "church" && !mosque) || (b.k === "tower" && h > 60)) {
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
  const walk = color(pal.roads.walk), white = color(pal.roads.line), yellow = color(pal.roads.center), rail2 = color(pal.roads.rail2);
  const raised = realStyle && !lite, pave = PAVE_M[region];
  const jube = (major: boolean) => (region === "me" ? jubeW(major) : 0);
  const UV = realStyle ? 1 / 7 : 0;
  // Intersections: vertices where three or more road ends meet get zebra crossings.
  const degree = new Map<string, number>();
  const vk = (x: number, z: number) => `${Math.round(x * 2)}_${Math.round(z * 2)}`;
  tile.r.forEach((r, ri) => {
    if ((r.k !== "major" && r.k !== "minor") || r.x) return;
    const p = unpacked[ri], n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const k = vk(p[i * 2], p[i * 2 + 1]);
      degree.set(k, (degree.get(k) ?? 0) + (i === 0 || i === n - 1 ? 1 : 2));
    }
  });
  let zebras = 0;
  // Where the map has its crossings, those are drawn (below) instead of guessing at junctions.
  let mapped = 0;
  for (let i = 2; i < (tile.o?.length ?? 0); i += 3) if (tile.o![i] === PROP.crossing) mapped++;
  const wearRand = rng(hashStr(`wear|${tile.key}`));
  let decalN = 0;
  /** A lane's middle `side` of the line (two-way: one lane each way; one-way: any lane). */
  const laneOff = (w: number, oneWay: boolean) => {
    const lanes = Math.max(1, Math.round(w / 3.4));
    if (oneWay) return -w / 2 + (w / lanes) * (Math.floor(wearRand() * lanes) + 0.5);
    return (wearRand() < 0.5 ? -1 : 1) * Math.max(1.2, w / 4);
  };
  const streetWear = (pts: Float32Array, w: number, y: number, oneWay: boolean, key: typeof vk, deg: Map<string, number>) => {
    const dy = y + 0.006;
    // Along the street: every so often a manhole, oil in the lanes, a patched trench.
    let nextHole = 15 + wearRand() * 40, nextOil = 4 + wearRand() * 12, nextPatch = 30 + wearRand() * 90, s = 0;
    for (let i = 0; i + 3 < pts.length && decalN < MAX_DECALS; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], dx = pts[i + 2] - x0, dz = pts[i + 3] - z0, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const fx = dx / len, fz = dz / len, yaw = Math.atan2(fx, fz);
      const at = (t: number, off: number): [number, number] => [x0 + fx * t - fz * off, z0 + fz * t + fx * off];
      for (; nextHole < s + len; nextHole += 35 + wearRand() * 45) {
        const [x, z] = at(nextHole - s, laneOff(w, oneWay) * 0.6);
        disc(marks, x, z, 0.4, y + 0.005, IRON_RIM);
        disc(marks, x, z, 0.33, y + 0.0095, IRON);
      }
      for (; nextOil < s + len && decalN < MAX_DECALS; nextOil += 6 + wearRand() * 16) {
        const [x, z] = at(nextOil - s, laneOff(w, oneWay) + (wearRand() - 0.5) * 0.6);
        blot(decals, x, z, 0.22 + wearRand() * 0.4, dy, OIL, 0.16 + wearRand() * 0.26, yaw, 1.3 + wearRand(), wearRand);
        decalN++;
      }
      for (; nextPatch < s + len && decalN < MAX_DECALS; nextPatch += 60 + wearRand() * 120) {
        // A trench dug across part of the street and filled with fresh, darker tarmac.
        const t = nextPatch - s, across = w * (0.35 + wearRand() * 0.5), start = (wearRand() < 0.5 ? -1 : 1) * (w / 2 - across / 2 - 0.1);
        const [ax, az] = at(t, start - across / 2), [bx, bz] = at(t, start + across / 2);
        decals.facade = 0.22 + wearRand() * 0.16;
        ribbon(decals, new Float32Array([ax, az, bx, bz]), 0.7 + wearRand() * 0.9, dy + 0.001, PATCH);
        decals.facade = 0;
        decalN++;
      }
      s += len;
    }
    // At each end that meets a junction: oil where cars wait, rubber where they brake and turn.
    const n = pts.length / 2;
    for (const end of [0, n - 1]) {
      if ((deg.get(key(pts[end * 2], pts[end * 2 + 1])) ?? 0) < 3 || decalN >= MAX_DECALS) continue;
      const nb = end === 0 ? 1 : n - 2;
      const jx = pts[end * 2], jz = pts[end * 2 + 1], ddx = pts[nb * 2] - jx, ddz = pts[nb * 2 + 1] - jz, l = Math.hypot(ddx, ddz);
      if (l < 12) continue;
      const fx = ddx / l, fz = ddz / l, px = -fz, pz = fx;
      for (let k = 0; k < 3; k++) {
        const t = 7 + wearRand() * 6, off = laneOff(w, oneWay);
        blot(decals, jx + fx * t + px * off, jz + fz * t + pz * off, 0.3 + wearRand() * 0.45, dy, OIL, 0.2 + wearRand() * 0.25, Math.atan2(fx, fz), 1.5 + wearRand(), wearRand);
        decalN++;
      }
      for (let k = 0, marksN = Math.floor(wearRand() * 3); k < marksN; k++) {
        // A car's pair of tyres: from its lane, braking into the junction and swinging round the corner.
        const off = laneOff(w, oneWay), t0 = 6 + wearRand() * 10, turn = (wearRand() < 0.5 ? -1 : 1) * (3 + wearRand() * 7), back = 1 + wearRand() * 4;
        const S = [jx + fx * t0 + px * off, jz + fz * t0 + pz * off], C = [jx + px * off, jz + pz * off], E = [jx + px * turn - fx * back, jz + pz * turn - fz * back];
        for (const tyre of [-0.75, 0.75]) {
          const path: number[] = [];
          for (let q = 0; q <= 10; q++) {
            const u = q / 10, a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), c2 = u * u;
            path.push(a * S[0] + b2 * C[0] + c2 * E[0] + px * tyre, a * S[1] + b2 * C[1] + c2 * E[1] + pz * tyre);
          }
          streak(decals, path, 0.2, dy + 0.002, RUBBER_MARK, 0.16 + wearRand() * 0.2);
        }
        decalN++;
      }
    }
  };
  tile.r.forEach((r, ri) => {
    const pts = unpacked[ri];
    if (pts.length < 4 || r.x) return;
    const c = color(pal.roads[r.k]);
    const y = ROAD_Y[r.k];
    const car = r.k === "major" || r.k === "minor";
    if (car) ribbon(roads, pts, r.w + (realStyle ? 2 * pave : 1.2), y - 0.02, walk, UV);
    // Up close: kerbs, the jube and a raised pavement each side, stopping at the next street.
    if (car && raised) for (const side of [1, -1] as const) streetSide(kerbs, pts, r.w, y, side, jube(r.k === "major"), pave, walk, UV, (x, z) => !road.onOther(x, z, 0, pts));
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
    // The asphalt's life: manhole covers, oil dripped in the lanes, patched trenches, and
    // rubber laid down where cars brake and turn at the junctions.
    if (detailed && r.w >= 5) streetWear(pts, r.w, y, !!r.ow, vk, degree);
    // Zebra crossings a few metres back from each intersection.
    if (!realStyle || lite || mapped || zebras > 140 || r.w < 6) return;
    const n = pts.length / 2;
    for (const end of [0, n - 1]) {
      const k = vk(pts[end * 2], pts[end * 2 + 1]);
      if ((degree.get(k) ?? 0) < 3) continue;
      const nb = end === 0 ? 1 : n - 2;
      const x0 = pts[end * 2], z0 = pts[end * 2 + 1], dx = pts[nb * 2] - x0, dz = pts[nb * 2 + 1] - z0, len = Math.hypot(dx, dz);
      if (len < 10) continue;
      const fx = dx / len, fz = dz / len;
      const at = 5.5, cxp = x0 + fx * at, czp = z0 + fz * at;
      zebra(marks, cxp, czp, fx, fz, r.w, my, white);
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
  const treeSpots: { x: number; z: number; s: number; y?: number }[] = [];
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

  // ---- sports pitches: lines, goals, hoops and nets
  const goalPosts: { x: number; z: number; h: number }[] = [];
  if (!lite) for (const f of tile.f ?? []) drawPitch(f, frame.unpack(tile.cx, tile.cy, [f.x, f.y]), ground, marks, walls, white, realStyle, goalPosts);

  // ---- street furniture
  const blocked = (x: number, z: number, pad: number) => inCut(x, z, pad + 0.5) || footprints.some((f) => x >= f.minX - pad && x <= f.maxX + pad && z >= f.minZ - pad && z <= f.maxZ + pad && insidePacked(f.pts, x, z));
  const lamps: { x: number; z: number; yaw: number }[] = [], signals: { x: number; z: number; yaw: number }[] = [], buses: { x: number; z: number; yaw: number }[] = [];
  const small: Record<"bench" | "bin" | "hydrant" | "fountain", { x: number; z: number; yaw: number }[]> = { bench: [], bin: [], hydrant: [], fountain: [] };
  const SMALL: Record<number, keyof typeof small> = { [PROP.bench]: "bench", [PROP.bin]: "bin", [PROP.hydrant]: "hydrant", [PROP.fountain]: "fountain" };
  const crossed: { x: number; z: number }[] = [];
  /** Facing the nearest street: the yaw that points from (x, z) to it. */
  const faceRoad = (x: number, z: number) => {
    const q = road.nearest(x, z, 60);
    return q ? Math.atan2(q.px - x, q.pz - z) : rand() * Math.PI * 2;
  };
  /**
   * Where something mapped at (x, z) stands: on the pavement, `out` m past the kerb, off
   * every street (null: there's no pavement for it here) — or where it is, far from any street.
   */
  const stand = (x: number, z: number, out: number) => (road.nearest(x, z, 40) ? road.pavement(x, z, out) : { x, z, yaw: faceRoad(x, z) });
  /** Not a second traffic light (or shelter) on the same corner. */
  const near = (list: { x: number; z: number }[], x: number, z: number, m: number) => list.some((p) => Math.hypot(p.x - x, p.z - z) < m);
  const o = tile.o ?? [];
  let osmTrees = 0, osmLamps = 0;
  for (let i = 0; i + 2 < o.length; i += 3) {
    const [x, z] = frame.unpack(tile.cx, tile.cy, [o[i], o[i + 1]]);
    const kind = o[i + 2];
    if (kind === PROP.tree) {
      if (!road.on(x, z, 0.8)) (treeSpots.push({ x, z, s: 0.7 + rand() * 0.6 }), osmTrees++);
      continue;
    }
    if (kind === PROP.crossing) {
      // Stripes across the street the crossing is mapped on, along its direction.
      const q = !lite && realStyle ? road.nearest(x, z, 6) : null;
      if (!q || q.w < 5 || near(crossed, q.px, q.pz, 6)) continue;
      crossed.push({ x: q.px, z: q.pz });
      zebra(marks, q.px, q.pz, q.dx, q.dz, q.w, q.y + 0.012, white);
      continue;
    }
    if ((kind === PROP.lamp || kind === PROP.bus || SMALL[kind]) && lite) continue;
    if (SMALL[kind]) {
      // Benches, bins, hydrants and fountains stand on the pavement, never in the street.
      const k = road.on(x, z, 0.3) ? road.pavement(x, z, 1.2) : { x, z, yaw: faceRoad(x, z) };
      if (k && !blocked(k.x, k.z, 0.1)) small[SMALL[kind]].push(k);
      continue;
    }
    // Posts mapped on the road itself go to the kerb, clear of the cross street too, facing the street.
    const k = stand(x, z, kind === PROP.bus ? 2.1 : kind === PROP.signal ? 1.1 : 1.2);
    if (!k || blocked(k.x, k.z, 0.2)) continue;
    if (kind === PROP.lamp) (lamps.push(k), osmLamps++);
    else if (kind === PROP.signal && !near(signals, k.x, k.z, 5)) signals.push(k);
    else if (kind === PROP.bus && !near(buses, k.x, k.z, 8)) buses.push({ ...k, yaw: k.yaw + Math.PI });
  }
  // Park trees and the like never stand on a street running through (or in a store's model).
  for (let i = treeSpots.length - 1; i >= 0; i--) if (road.on(treeSpots[i].x, treeSpots[i].z, 1) || inCut(treeSpots[i].x, treeSpots[i].z, 1)) treeSpots.splice(i, 1);
  // Street trees and lamps along the bigger roads where the map has none; charity boxes
  // every block or two and the odd newspaper kiosk on the main roads (not mapped, but on
  // every Iranian street).
  const roadside = (lite ? 40 : 110) * (osmTrees > 20 ? 0.3 : 1);
  let planted = 0, lit = 0;
  const lampCap = osmLamps > 5 ? 0 : lite ? 0 : 140;
  const charities: { x: number; z: number; yaw: number }[] = [], kiosks: { x: number; z: number; yaw: number }[] = [];
  // The municipality's big waste containers: one every block or two at the kerb (never mapped).
  const dumpsters: { x: number; z: number; yaw: number }[] = [];
  // Iran's streets: whole lengths lined with plane trees growing out of the jube.
  const rows = realStyle && region === "me", rowCap = lite ? 60 : 200;
  let rowed = 0;
  roadLines.forEach((pts, ri) => {
    const k = roadKinds[ri], w = roadWidths[ri];
    if ((k !== "major" && k !== "minor") || !roadDrawn[ri]) return;
    const lined = rows && w >= 6 && w < 19 ? [rand() < 0.5, rand() < 0.5] : [false, false];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 12) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      lined.forEach((on, si) => {
        const side = si ? -1 : 1, off = w / 2 + KERB_W + jubeW(k === "major") / 2;
        for (let s = 3 + rand() * 4; on && s < len - 3 && rowed < rowCap; s += 10 + rand() * 3.5) {
          const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
          // Not in a building, nor out at a junction.
          if (blocked(x, z, 1) || road.onOther(x, z, 2.5, pts)) continue;
          treeSpots.push({ x, z, s: 0.95 + rand() * 0.35, y: 0 });
          rowed++;
        }
      });
      if (w >= 7 && !rows)
        for (let s = 9; s < len - 4 && planted < roadside; s += 20 + rand() * 16) {
          const side = rand() < 0.5 ? 1 : -1, off = w / 2 + 2.3 + rand() * 0.6;
          const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
          // Not in a building, nor out on the cross street at a junction.
          if (blocked(x, z, 1.5) || road.on(x, z, 1)) continue;
          treeSpots.push({ x, z, s: 0.5 + rand() * 0.3 });
          planted++;
        }
      for (let s = 6, side = 1; s < len - 2 && lit < lampCap; s += 34, side = -side) {
        const off = w / 2 + 1.1;
        const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
        if (blocked(x, z, 0.5) || road.on(x, z, 0.3)) continue;
        lamps.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
        lit++;
      }
      if (lite) continue;
      for (let s = 12 + rand() * 50; s < len - 6 && charities.length < 10; s += 110 + rand() * 90) {
        const side = rand() < 0.5 ? 1 : -1, off = w / 2 + 1.25;
        const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
        if (rand() < 0.5 || blocked(x, z, 0.4) || road.on(x, z, 0.3) || near(charities, x, z, 90)) continue;
        charities.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
      }
      for (let s = 30 + rand() * 60; s < len - 8 && dumpsters.length < 6; s += 150 + rand() * 100) {
        const side = rand() < 0.5 ? 1 : -1, off = w / 2 + 1.0;
        const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
        if (blocked(x, z, 1.1) || road.on(x, z, 0.6) || road.onOther(x, z, 6, pts) || near(dumpsters, x, z, 100)) continue;
        dumpsters.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
      }
      if (k === "major" && len > 40 && kiosks.length < 3 && rand() < 0.22) {
        const side = rand() < 0.5 ? 1 : -1, off = w / 2 + 2.1, s = 10 + rand() * (len - 20);
        const x = x0 + ((x1 - x0) * s) / len + nx * off * side, z = z0 + ((z1 - z0) * s) / len + nz * off * side;
        if (!blocked(x, z, 1.4) && !road.on(x, z, 1.2) && !near(kiosks, x, z, 120)) kiosks.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
      }
    }
  });
  // Last word on trees: the jube rows and roadside trees above only kept clear of *other*
  // streets, so on the inside of a bend the offset could still put a trunk on its own
  // asphalt. A tree in the jube stands ≥0.45 m past the edge; anything nearer is in the road.
  for (let i = treeSpots.length - 1; i >= 0; i--) if (road.on(treeSpots[i].x, treeSpots[i].z, 0.3)) treeSpots.splice(i, 1);

  const props: Instances[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  /** Up on the raised pavement, if it stands on one. */
  const lift = (x: number, z: number) => {
    if (!raised) return 0;
    const q = road.nearest(x, z, 12);
    return q && q.y > ROAD_Y.path && q.d < q.w / 2 + pave + 0.2 ? KERB_H : 0;
  };
  const pack = (kind: PropKind, list: { x: number; z: number; yaw?: number; s?: number; y?: number }[], tint?: () => THREE.Color) => {
    if (!list.length) return;
    const mats = new Float32Array(list.length * 16), cols = tint ? new Float32Array(list.length * 3) : null;
    list.forEach((it, i) => {
      const s = it.s ?? 1;
      q.setFromAxisAngle(Y, it.yaw ?? rand() * Math.PI * 2);
      m.compose(p.set(it.x, it.y ?? lift(it.x, it.z), it.z), q, sc.set(s, kind === "tree" ? s * (0.9 + rand() * 0.3) : s, s));
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
  for (const [kind, list] of Object.entries(small)) pack(kind as PropKind, list);
  pack("charity", charities);
  pack("kiosk", kiosks);
  pack("dumpster", dumpsters);
  // Rubbish bags left beside about half the containers (the bin men come at night).
  const bags = dumpsters.filter(() => rand() < 0.55).map((d) => ({ x: d.x + Math.cos(d.yaw) * 1.35, z: d.z - Math.sin(d.yaw) * 1.35, yaw: d.yaw + (rand() - 0.5) }));
  pack("bags", bags.filter((b) => !road.on(b.x, b.z, 0.2) && !blocked(b.x, b.z, 0.1)));
  // Iran's street kit: post boxes, cabinets, payphones, saqakhaneh, median railings, footbridges (streetKit.ts).
  const kitRoads: KitRoad[] = roadLines.map((pts, ri) => ({ pts, k: roadKinds[ri], w: roadWidths[ri], n: roadNames[ri], drawn: roadDrawn[ri], ow: roadOw[ri] }));
  const iranKit = realStyle ? placeKit({ roads: kitRoads, road, blocked, rand, lite, iran: region === "me", taken: [...charities, ...kiosks, ...dumpsters, ...buses, ...lamps], box, post }) : null;
  if (iranKit) for (const k of KIT_KINDS) pack(k, iranKit[k]);

  // What a car can hit: the trunk (and canopy, for low flyers), posts and shelters.
  const obstacles: Footprint[] = [];
  for (const t of treeSpots) obstacles.push(post(t.x, t.z, 0.32 * t.s, 6 * t.s));
  for (const l of lamps) obstacles.push(post(l.x, l.z, 0.15, 6.6));
  for (const g of signals) obstacles.push(post(g.x, g.z, 0.15, 4.5));
  for (const b of buses) obstacles.push(box(b.x, b.z, 1.6, 0.75, b.yaw, 2.6));
  for (const b of small.bench) obstacles.push(box(b.x, b.z, 0.85, 0.22, b.yaw, 0.9));
  for (const p of [...small.bin, ...small.hydrant]) obstacles.push(post(p.x, p.z, 0.22, 0.8));
  for (const f of small.fountain) obstacles.push(box(f.x, f.z, 0.3, 0.25, f.yaw, 1.1));
  for (const c of charities) obstacles.push(post(c.x, c.z, 0.2, 1.4));
  for (const k of kiosks) obstacles.push(box(k.x, k.z, 1.0, 0.75, k.yaw, 2.4));
  for (const d of dumpsters) obstacles.push(box(d.x, d.z, 0.9, 0.6, d.yaw, 1.35));
  for (const g of goalPosts) obstacles.push(post(g.x, g.z, 0.08, g.h));
  if (iranKit) obstacles.push(...iranKit.obstacles, ...kitObstacles({ box, post }, iranKit));

  // Bridges: parapets, deck edges and piers on every bridge road; towers and cables over the long ones.
  drawBridges(tile, frame, unpacked, trim, walls, lite);

  const layers = [ground.layer("ground"), water.layer("water"), roads.layer("roads"), marks.layer("marks"), walls.layer("walls"), glass.layer("glass"), roofs.layer("roofs"), trim.layer("trim"), kerbs.layer("kerbs"), decals.layer("decals")].filter((l): l is Layer => !!l);
  cornerSigns(tile, unpacked, road, blocked, labels, obstacles, lite, region === "me" && realStyle);
  placeSigns(tile as VtCell, frame, footprints, labels, obstacles, stand);
  // The store's model carries its own sign and number.
  if (cuts.length) for (let i = labels.length - 1; i >= 0; i--) if ((labels[i].kind === "shop" || labels[i].kind === "num" || labels[i].kind === "building") && inCut(labels[i].x, labels[i].z, 4)) labels.splice(i, 1);
  return { key: tile.key, real: tile.real, layers, props, footprints, obstacles, roads: roadLines, roadWidths, roadKinds, roadNames, roadDrawn, labels };
}

/**
 * Street-name signs where two named streets cross: a pole on the pavement at a corner,
 * one plate per street, each running along its own street — the way they hang in a real
 * city. Found by intersecting the named lines themselves (in vector tiles the name and
 * the asphalt are separate lines, so shared vertices can't be relied on).
 */
function cornerSigns(tile: CityTile, lines: Float32Array[], road: ReturnType<typeof roadIndex>, blocked: (x: number, z: number, pad: number) => boolean, labels: Label[], obstacles: Footprint[], lite: boolean, ir: boolean) {
  type NSeg = { ax: number; az: number; bx: number; bz: number; w: number; n: string; line: Float32Array };
  const G = 30;
  const grid = new Map<string, NSeg[]>();
  tile.r.forEach((r, ri) => {
    if (!r.n || !DRIVABLE.includes(r.k)) return;
    const p = lines[ri];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const sg = { ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3], w: r.w, n: r.n, line: p };
      for (let gx = Math.floor(Math.min(sg.ax, sg.bx) / G); gx <= Math.floor(Math.max(sg.ax, sg.bx) / G); gx++)
        for (let gz = Math.floor(Math.min(sg.az, sg.bz) / G); gz <= Math.floor(Math.max(sg.az, sg.bz) / G); gz++) {
          const k = `${gx}_${gz}`;
          const l = grid.get(k);
          if (l) l.push(sg);
          else grid.set(k, [sg]);
        }
    }
  });
  const cap = lite ? 12 : 40;
  const done: { x: number; z: number; pair: string }[] = [];
  const crossings: Crossing[] = [];
  let signed = 0;
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.n === b.n) continue;
        // Where the two centre lines cross (both parameters within their segments).
        const rx = a.bx - a.ax, rz = a.bz - a.az, sx = b.bx - b.ax, sz = b.bz - b.az;
        const den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-6) continue;
        const qx = b.ax - a.ax, qz = b.az - a.az;
        const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const px = a.ax + rx * t, pz = a.az + rz * t;
        const pair = a.n < b.n ? `${a.n}|${b.n}` : `${b.n}|${a.n}`;
        if (done.some((d) => d.pair === pair && Math.hypot(d.x - px, d.z - pz) < 40)) continue;
        const la = Math.hypot(rx, rz) || 1, lb = Math.hypot(sx, sz) || 1;
        const ax = rx / la, az = rz / la, bx = sx / lb, bz = sz / lb;
        done.push({ x: px, z: pz, pair });
        crossings.push({ x: px, z: pz, a: { n: a.n, w: a.w, dx: ax, dz: az, line: a.line }, b: { n: b.n, w: b.w, dx: bx, dz: bz, line: b.line } });
        if (signed >= cap) continue;
        // Try the four corners for one on the pavement, clear of buildings and asphalt.
        let spot: { x: number; z: number } | null = null;
        for (const [sa, sb] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const x = px + ax * sa * (b.w / 2 + 1.8) + bx * sb * (a.w / 2 + 1.8), z = pz + az * sa * (b.w / 2 + 1.8) + bz * sb * (a.w / 2 + 1.8);
          if (road.on(x, z, 0.5) || blocked(x, z, 0.4)) continue;
          spot = { x, z };
          break;
        }
        if (!spot) continue;
        signed++;
        // Plate angle: its face turned square to the street, so it runs along it.
        const plate = (dx: number, dz: number) => Math.atan2(dz, -dx);
        labels.push({ text: a.n, x: spot.x, z: spot.z, angle: 0, w: 0, y: 4.2, kind: "corner", pole: true, plates: [{ text: a.n, angle: plate(ax, az) }, { text: b.n, angle: plate(bx, bz) }], ...(ir ? { ir: true } : {}) });
        obstacles.push(post(spot.x, spot.z, 0.1, 4.2));
      }
  }
  // Arrow signs and motorway gantries before the junctions (streetKit.ts).
  const nameAt = (x: number, z: number, not: string) => {
    for (const sg of grid.get(`${Math.floor(x / G)}_${Math.floor(z / G)}`) ?? []) {
      if (sg.n === not) continue;
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / l2));
      if (Math.hypot(sg.ax + dx * k - x, sg.az + dz * k - z) < sg.w / 2 + 2) return sg.n;
    }
    return null;
  };
  crossSigns(crossings, { road, blocked, lite, post }, nameAt, labels, obstacles);
}

/**
 * Storefront signs and house numbers, mounted where they'd really be: on the wall of the
 * nearest building, facing the street, at first-floor height. Two shops on the same
 * stretch of wall stack instead of overlapping; a wall with no room left keeps the shop
 * (pin and Places list) without a board. No wall within reach: a sign on a pole.
 * Server (Overpass) tiles carry places instead of storefronts: they're shops here too.
 */
function placeSigns(tile: VtCell, frame: ReturnType<typeof makeFrame>, footprints: Footprint[], labels: Label[], obstacles: Footprint[], stand: (x: number, z: number, out: number) => { x: number; z: number; yaw: number } | null) {
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
  const shops: { x: number; z: number; n: string; c: string }[] = (tile.s ?? []).map((s) => {
    const [x, z] = frame.unpack(tile.cx, tile.cy, [s.x, s.y]);
    return { x, z, n: s.n, c: s.c };
  });
  if (!tile.s)
    for (const pl of tile.p ?? []) {
      if (pl.cat === "park") continue;
      const q = frame.toXZ(pl.lat, pl.lng);
      shops.push({ x: q.x, z: q.z, n: pl.name, c: pl.cat });
    }
  for (const s of shops) {
    const { x, z } = s;
    const long = s.n.split("\n")[0];
    const w = Math.max(2.6, Math.min(7.5, long.length * 0.36 + 1.6));
    const wall = nearestWall(x, z, 22);
    if (!wall) {
      // A shop mapped on the street itself (or by it): its pole stands on the pavement, never
      // in the road — and where there's no pavement for it, the shop keeps its pin, no board.
      const k = stand(x, z, 1.3);
      if (k) (labels.push({ text: s.n, x: k.x, z: k.z, angle: k.yaw, w: Math.min(w, 4), y: 2.6, kind: "shop", cls: s.c, pole: true, top: 3.2 }), obstacles.push(post(k.x, k.z, 0.1, 3.2)));
      else labels.push({ text: s.n, x, z, angle: 0, w: Math.min(w, 4), y: 2.6, kind: "shop", cls: s.c, top: 3.2, noBoard: true });
      continue;
    }
    const sw = Math.min(w, wall.len * 0.92);
    const px = wall.x + wall.nx * 0.14, pz = wall.z + wall.nz * 0.14;
    let y = Math.max(2.4, Math.min(3.6, wall.f.h - 0.7));
    // Same stretch of wall already has a sign: go one row up (at most three rows).
    for (let row = 0; row < 3 && placed.some((o) => Math.abs(o.y - y) < 0.6 && Math.hypot(o.x - px, o.z - pz) < (o.w + sw) / 2); row++) y += 1.05;
    const full = y > wall.f.h - 0.3 || placed.some((o) => Math.abs(o.y - y) < 0.6 && Math.hypot(o.x - px, o.z - pz) < (o.w + sw) / 2);
    if (!full) placed.push({ x: px, z: pz, y, w: sw });
    labels.push({ text: s.n, x: px, z: pz, angle: Math.atan2(wall.nx, wall.nz), w: sw, y, kind: "shop", cls: s.c, top: wall.f.h, ...(full ? { noBoard: true } : {}) });
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
  for (const l of t.layers) {
    out.push(l.pos.buffer as ArrayBuffer, l.nor.buffer as ArrayBuffer, l.col.buffer as ArrayBuffer, l.uv.buffer as ArrayBuffer, l.idx.buffer as ArrayBuffer);
    if (l.fac) out.push(l.fac.buffer as ArrayBuffer);
  }
  for (const p of t.props) (out.push(p.mats.buffer as ArrayBuffer), p.cols && out.push(p.cols.buffer as ArrayBuffer));
  // Footprints and road lines are read on both sides of the boundary — copied, not moved.
  return out;
}
