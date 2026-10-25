// The 3D city (pure — client and server). The world is cut into the same ~450 m cells
// as spawns (lib/geo CELL_DEG). Each cell's tile holds building footprints with heights,
// roads, parks and water, and the named places in it — from OpenStreetMap (see
// server/city.ts), or, until that arrives or where there's no data, a fantasy village
// generated from the cell's seed so there's always somewhere to drive.
//
// Coordinates inside a tile are integers: millionths of a degree from the tile's
// south-west corner (≈ 0.1 m), which keeps the JSON small.
import { CELL_DEG, cellKey, hashStr, rng, type LatLng } from "./geo";
import { catOfTags, type Place } from "./places";

export const TILE_DEG = CELL_DEG;
const Q = 1e6;

export type BuildingKind = "house" | "apartments" | "shop" | "office" | "industrial" | "civic" | "church" | "tower";
export type RoadKind = "major" | "minor" | "path";
export type AreaKind = "park" | "water" | "forest" | "grass" | "pitch";

export type CityBuilding = { r: number[]; h: number; k: BuildingKind; n?: string };
export type CityRoad = { l: number[]; w: number; k: RoadKind; n?: string };
export type CityArea = { r: number[]; k: AreaKind };
export type CityTile = {
  v: 1;
  key: string;
  cx: number;
  cy: number;
  /** false: the generated fantasy village (no map data for this cell yet). */
  real: boolean;
  b: CityBuilding[];
  r: CityRoad[];
  a: CityArea[];
  p: Place[];
};

export const tileOf = (p: LatLng) => ({ cx: Math.floor(p.lng / TILE_DEG), cy: Math.floor(p.lat / TILE_DEG) });
export const tileKey = cellKey;
export const tileSW = (cx: number, cy: number): LatLng => ({ lat: cy * TILE_DEG, lng: cx * TILE_DEG });
export const parseTileKey = (key: string) => {
  const m = /^(-?\d+)_(-?\d+)$/.exec(key);
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : null;
};

/** Local metres around an origin: x east, z south (three.js: -z is north). */
export function makeFrame(origin: LatLng) {
  const ky = 110_540;
  const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    origin,
    toXZ: (lat: number, lng: number) => ({ x: (lng - origin.lng) * kx, z: -(lat - origin.lat) * ky }),
    toLatLng: (x: number, z: number): LatLng => ({ lat: origin.lat - z / ky, lng: origin.lng + x / kx }),
    /** A tile's packed coordinates → local x/z pairs. */
    unpack: (cx: number, cy: number, pts: number[]) => {
      const sw = tileSW(cx, cy);
      const out = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 2) {
        out[i] = (sw.lng + pts[i] / Q - origin.lng) * kx;
        out[i + 1] = -(sw.lat + pts[i + 1] / Q - origin.lat) * ky;
      }
      return out;
    },
  };
}
export type Frame = ReturnType<typeof makeFrame>;

// ---------------------------------------------------------------- from OpenStreetMap
type OsmEl = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

const MAJOR = /^(motorway|trunk|primary|secondary)(_link)?$/;
const MINOR = /^(tertiary|tertiary_link|unclassified|residential|living_street|road)$/;
const PATH = /^(service|pedestrian)$/;
const ROAD_W: Record<RoadKind, number> = { major: 12, minor: 8, path: 4.5 };

function buildingKind(tags: Record<string, string>): BuildingKind {
  const b = tags.building;
  if (/^(house|detached|semidetached_house|terrace|bungalow|cabin|hut|farm|residential|garage|garages|shed)$/.test(b)) return "house";
  if (/^(apartments|dormitory|hotel)$/.test(b)) return "apartments";
  if (/^(retail|commercial|supermarket|kiosk|shop)$/.test(b) || tags.shop || tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food") return "shop";
  if (/^(office)$/.test(b)) return "office";
  if (/^(industrial|warehouse|factory|hangar)$/.test(b)) return "industrial";
  if (/^(church|cathedral|chapel|mosque|temple|synagogue|shrine)$/.test(b) || tags.amenity === "place_of_worship") return "church";
  if (/^(school|university|college|hospital|public|civic|government|train_station|museum|library)$/.test(b)) return "civic";
  return "house";
}

function heightOf(tags: Record<string, string>, k: BuildingKind, seed: number) {
  const h = parseFloat(tags.height ?? "");
  if (Number.isFinite(h) && h > 1) return Math.min(300, h);
  const lv = parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(lv) && lv > 0) return Math.min(300, lv * 3.2 + 1.5);
  const base = { house: 7, apartments: 15, shop: 9, office: 20, industrial: 9, civic: 13, church: 16, tower: 40 }[k];
  return base * (0.8 + (seed % 100) / 250);
}

/** Pack a geometry into the tile's integer coordinates, dropping points closer than ~0.5 m. */
function pack(geom: { lat: number; lon: number }[], sw: LatLng, closed: boolean) {
  const out: number[] = [];
  let px = NaN, py = NaN;
  const n = closed && geom.length > 1 && geom[0].lat === geom[geom.length - 1].lat && geom[0].lon === geom[geom.length - 1].lon ? geom.length - 1 : geom.length;
  for (let i = 0; i < n; i++) {
    const x = Math.round((geom[i].lon - sw.lng) * Q), y = Math.round((geom[i].lat - sw.lat) * Q);
    if (Math.abs(x - px) + Math.abs(y - py) < 5) continue;
    out.push(x, y);
    px = x;
    py = y;
  }
  return out;
}

function centroid(geom: { lat: number; lon: number }[]) {
  let lat = 0, lon = 0;
  for (const g of geom) (lat += g.lat), (lon += g.lon);
  return { lat: lat / geom.length, lng: lon / geom.length };
}

/**
 * Overpass `out geom` elements → this cell's tile. Every feature belongs to exactly one
 * tile (buildings and areas by their centre, road segments by their midpoint), so
 * neighbouring tiles never draw the same building twice.
 */
export function fromOverpass(elements: OsmEl[], cx: number, cy: number): CityTile {
  const sw = tileSW(cx, cy);
  const inside = (p: LatLng) => p.lat >= sw.lat && p.lat < sw.lat + TILE_DEG && p.lng >= sw.lng && p.lng < sw.lng + TILE_DEG;
  const tile: CityTile = { v: 1, key: tileKey(cx, cy), cx, cy, real: true, b: [], r: [], a: [], p: [] };
  const seenPlace = new Set<string>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const geom = el.geometry;
    // Named places (nodes, or the centre of a building/area that is the place).
    const cat = catOfTags(tags);
    const name = tags.name || tags["name:en"] || tags.brand;
    if (cat && name && tile.p.length < 400) {
      const at = el.type === "node" && el.lat != null && el.lon != null ? { lat: el.lat, lng: el.lon } : geom?.length ? centroid(geom) : null;
      const id = `${el.type[0]}${el.id}`;
      if (at && inside(at) && !seenPlace.has(id)) {
        seenPlace.add(id);
        tile.p.push({ id, name: name.slice(0, 60), cat, lat: Math.round(at.lat * Q) / Q, lng: Math.round(at.lng * Q) / Q, ...(tags.brand && tags.brand !== name ? { brand: tags.brand.slice(0, 40) } : {}) });
      }
    }
    if (el.type !== "way" || !geom || geom.length < 2) continue;
    if (tags.building && tags.building !== "no" && geom.length >= 4) {
      if (!inside(centroid(geom)) || tile.b.length >= 2500) continue;
      const k = buildingKind(tags);
      const r = pack(geom, sw, true);
      if (r.length < 6) continue;
      const h = heightOf(tags, k, el.id);
      tile.b.push({ r, h: Math.round(h * 10) / 10, k: h > 60 ? "tower" : k, ...(tags.name && (k === "church" || k === "civic" || h > 40) ? { n: tags.name.slice(0, 40) } : {}) });
      continue;
    }
    const hw = tags.highway;
    if (hw) {
      const k: RoadKind | null = MAJOR.test(hw) ? "major" : MINOR.test(hw) ? "minor" : PATH.test(hw) ? "path" : null;
      if (!k || tile.r.length >= 1500) continue;
      // Keep the runs of segments whose midpoint is in this tile.
      let run: { lat: number; lon: number }[] = [];
      const flush = () => {
        if (run.length >= 2) tile.r.push({ l: pack(run, sw, false), w: ROAD_W[k], k, ...(tags.name ? { n: tags.name.slice(0, 40) } : {}) });
        run = [];
      };
      for (let i = 1; i < geom.length; i++) {
        const mid = { lat: (geom[i - 1].lat + geom[i].lat) / 2, lng: (geom[i - 1].lon + geom[i].lon) / 2 };
        if (inside(mid)) {
          if (!run.length) run.push(geom[i - 1]);
          run.push(geom[i]);
        } else flush();
      }
      flush();
      continue;
    }
    const area: AreaKind | null =
      tags.natural === "water" || tags.waterway === "riverbank" || tags.landuse === "reservoir" ? "water"
      : tags.leisure === "park" || tags.leisure === "garden" || tags.landuse === "recreation_ground" || tags.landuse === "village_green" ? "park"
      : tags.natural === "wood" || tags.landuse === "forest" ? "forest"
      : tags.leisure === "pitch" ? "pitch"
      : tags.landuse === "grass" || tags.landuse === "meadow" ? "grass"
      : null;
    if (area && geom.length >= 4 && inside(centroid(geom)) && tile.a.length < 300) {
      const r = pack(geom, sw, true);
      if (r.length >= 6) tile.a.push({ r, k: area });
    }
  }
  return tile;
}

/** The Overpass query for one tile. */
export function overpassQuery(cx: number, cy: number) {
  const sw = tileSW(cx, cy);
  const bb = `${sw.lat.toFixed(6)},${sw.lng.toFixed(6)},${(sw.lat + TILE_DEG).toFixed(6)},${(sw.lng + TILE_DEG).toFixed(6)}`;
  return `[out:json][timeout:50][bbox:${bb}];(
way["building"];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|service|pedestrian)(_link)?$"];
way["leisure"~"^(park|garden|pitch)$"];
way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green|reservoir)$"];
way["natural"~"^(water|wood)$"];
node["amenity"~"^(fast_food|restaurant|cafe|bar|pub|ice_cream|pharmacy|fuel|bank|cinema|theatre|library)$"]["name"];
node["shop"]["name"];
node["leisure"~"^(fitness_centre|sports_centre)$"]["name"];
);out geom qt;`;
}

// ---------------------------------------------------------------- the fantasy village
const GRID = 0.0008; // street spacing in degrees (~90 m north–south)

/**
 * A storybook village for a cell with no map data: streets on a global grid (so they
 * line up across tiles), blocks of cottages, towers and shops, the odd park and pond.
 */
export function villageTile(cx: number, cy: number): CityTile {
  const tile: CityTile = { v: 1, key: tileKey(cx, cy), cx, cy, real: false, b: [], r: [], a: [], p: [] };
  const n = Math.round(TILE_DEG / GRID);
  const span = Math.round(TILE_DEG * Q);
  const step = Math.round(GRID * Q);
  // Streets along every grid line inside the tile, the tile's own edges included once (west/south).
  for (let i = 0; i < n; i++) {
    const at = i * step;
    const big = (cy * n + i) % 4 === 0;
    tile.r.push({ l: [0, at, span, at], w: big ? 11 : 7, k: big ? "major" : "minor" });
    const bigV = (cx * n + i) % 4 === 0;
    tile.r.push({ l: [at, 0, at, span], w: bigV ? 11 : 7, k: bigV ? "major" : "minor" });
  }
  const inset = 120; // ≈ 12 m back from the street centre
  for (let bx = 0; bx < n; bx++)
    for (let by = 0; by < n; by++) {
      const rand = rng(hashStr(`village|${cx * n + bx}|${cy * n + by}`));
      const x0 = bx * step + inset, y0 = by * step + inset, x1 = (bx + 1) * step - inset, y1 = (by + 1) * step - inset;
      const roll = rand();
      if (roll < 0.1) {
        tile.a.push({ r: [x0, y0, x1, y0, x1, y1, x0, y1], k: "park" });
        if (rand() < 0.5) {
          const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, rr = (x1 - x0) * 0.22;
          const ring: number[] = [];
          for (let a = 0; a < 10; a++) ring.push(Math.round(cxm + Math.cos((a / 10) * Math.PI * 2) * rr), Math.round(cym + Math.sin((a / 10) * Math.PI * 2) * rr * 0.8));
          tile.a.push({ r: ring, k: "water" });
        }
        continue;
      }
      if (roll < 0.14) {
        tile.a.push({ r: [x0, y0, x1, y0, x1, y1, x0, y1], k: "forest" });
        continue;
      }
      // Lots around the block's edge: 3 along each side.
      const lots = 3;
      const w = (x1 - x0) / lots, hgt = (y1 - y0) / lots;
      for (let i = 0; i < lots; i++)
        for (let j = 0; j < lots; j++) {
          if (i > 0 && i < lots - 1 && j > 0 && j < lots - 1) continue; // courtyard
          if (rand() < 0.15) continue;
          const pad = 25 + rand() * 40;
          const lx0 = x0 + i * w + pad, ly0 = y0 + j * hgt + pad, lx1 = x0 + (i + 1) * w - pad, ly1 = y0 + (j + 1) * hgt - pad;
          const r2 = rand();
          const k: BuildingKind = r2 < 0.5 ? "house" : r2 < 0.7 ? "shop" : r2 < 0.85 ? "apartments" : r2 < 0.95 ? "office" : "church";
          const h = k === "house" ? 6 + rand() * 4 : k === "shop" ? 7 + rand() * 5 : k === "apartments" ? 12 + rand() * 12 : k === "office" ? 18 + rand() * 30 : 14 + rand() * 8;
          tile.b.push({ r: [Math.round(lx0), Math.round(ly0), Math.round(lx1), Math.round(ly0), Math.round(lx1), Math.round(ly1), Math.round(lx0), Math.round(ly1)], h: Math.round(h * 10) / 10, k });
        }
    }
  return tile;
}

/** Points inside a packed polygon (even–odd rule), in packed coordinates. */
export function insidePacked(r: number[] | Float32Array, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
