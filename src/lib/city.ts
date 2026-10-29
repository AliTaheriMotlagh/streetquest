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
/**
 * Tile format version. v2 added building colours and roof shapes, multipolygon
 * buildings, footways, rail, land use and street furniture; older stored tiles are
 * still served while a fresh copy is fetched in the background.
 */
export const TILE_V = 2;

export type BuildingKind = "house" | "apartments" | "shop" | "office" | "industrial" | "civic" | "church" | "tower";
export type RoadKind = "major" | "minor" | "path" | "foot" | "rail";
export type AreaKind = "park" | "water" | "forest" | "grass" | "pitch" | "parking" | "plaza" | "sand" | "farm" | "residential" | "commercial" | "industrial" | "cemetery";
export type RoofShape = "flat" | "gabled" | "hipped" | "pyramidal" | "dome" | "skillion";
/** Street furniture, stored as [x, y, kind] triples in CityTile.o. */
export const PROP = { tree: 0, lamp: 1, signal: 2, bus: 3, crossing: 4, bench: 5, bin: 6, hydrant: 7, fountain: 8 } as const;
export type Sport = "soccer" | "basketball" | "tennis" | "volleyball" | "other";
/**
 * A sports pitch, for its lines and goals: centre (packed like every other point), size
 * in metres (`l` the long side) and the long side's heading (radians, from east towards
 * north).
 */
export type CityPitch = { x: number; y: number; l: number; w: number; a: number; s: Sport };
/** A city pack's extra detail for one cell (see lib/cityPack.ts): it replaces the tile's own `o` and `f`. */
export type CityDetail = { o: number[]; f: CityPitch[] };

export type CityBuilding = {
  r: number[];
  h: number;
  k: BuildingKind;
  n?: string;
  /** Height where the walls start (an overhang, a canopy on pillars). */
  mh?: number;
  rf?: RoofShape;
  /** Wall / roof colour from the map ("#rrggbb"). */
  c?: string;
  rc?: string;
  /** Not on the map: filled in along a street with no buildings mapped (see drive/vectorTile.ts). */
  g?: 1;
};
export type CityRoad = {
  l: number[];
  w: number;
  k: RoadKind;
  n?: string;
  /** Lanes (both directions). */
  ln?: number;
  /** One-way. */
  ow?: 1;
  /** Only carries the street's name (the asphalt is drawn from another line). */
  x?: 1;
};
export type CityArea = { r: number[]; k: AreaKind };
export type CityTile = {
  v: number;
  key: string;
  cx: number;
  cy: number;
  /** false: the generated fantasy village (no map data for this cell yet). */
  real: boolean;
  b: CityBuilding[];
  r: CityRoad[];
  a: CityArea[];
  p: Place[];
  /** Street furniture: [x, y, PROP kind] triples. */
  o?: number[];
  /** Sports pitches (lines and goals over the "pitch" area). */
  f?: CityPitch[];
};

/** A tile with a city pack's detail laid over it (the pack is the fuller, checked source). */
export const withDetail = (tile: CityTile, d: CityDetail): CityTile => ({ ...tile, o: d.o, f: d.f });

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
type OsmPt = { lat: number; lon: number };
type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OsmPt[];
  members?: { type: string; role: string; geometry?: OsmPt[] }[];
};

const MAJOR = /^(motorway|trunk|primary|secondary)(_link)?$/;
const MINOR = /^(tertiary|tertiary_link|unclassified|residential|living_street|road)$/;
const PATH = /^(service|pedestrian)$/;
const FOOT = /^(footway|cycleway|path|steps|track)$/;
const RAIL = /^(rail|tram|light_rail|narrow_gauge)$/;
const ROAD_W: Record<RoadKind, number> = { major: 12, minor: 8, path: 4.5, foot: 2.2, rail: 3 };
const LANE_W = 3.3;

const ROOFS: Record<string, RoofShape> = { flat: "flat", gabled: "gabled", saltbox: "gabled", gambrel: "gabled", mansard: "hipped", hipped: "hipped", half_hipped: "hipped", pyramidal: "pyramidal", dome: "dome", onion: "dome", round: "dome", skillion: "skillion", lean_to: "skillion" };
const NAMED_COLOURS: Record<string, string> = {
  white: "#f2f2ee", black: "#2b2b2b", grey: "#8f9296", gray: "#8f9296", lightgrey: "#c8c9cb", lightgray: "#c8c9cb", darkgrey: "#5a5c60", darkgray: "#5a5c60", silver: "#c0c2c6",
  red: "#a8443a", darkred: "#7a2b25", maroon: "#6b2a24", brown: "#7b5a43", tan: "#cdb28c", beige: "#e3d6b8", cream: "#efe6cc", ivory: "#f3eedd", wheat: "#e6d3a8",
  yellow: "#e2c66a", orange: "#d98a4a", pink: "#e2b0b0", green: "#6f8f5e", darkgreen: "#3f5a3a", blue: "#5a7fa8", lightblue: "#a9c3dc", navy: "#2f3f63", sandybrown: "#d8a76a", terracotta: "#b8603e",
};
/** An OSM colour tag ("#abc", "#aabbcc", "red", "light grey") as "#rrggbb", or undefined. */
export function osmColour(v: string | undefined) {
  if (!v) return undefined;
  const s = v.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return NAMED_COLOURS[s];
}

/** Underground or covered: nothing to draw at street level. */
const underground = (tags: Record<string, string>) => (!!tags.tunnel && tags.tunnel !== "no") || tags.location === "underground" || tags.covered === "yes" || parseFloat(tags.layer ?? "0") < 0;

/** A multipolygon's outer ways joined end to end into closed rings. */
function outerRings(members: NonNullable<OsmEl["members"]>): OsmPt[][] {
  const parts = members.filter((m) => m.type === "way" && m.role !== "inner" && m.geometry && m.geometry.length >= 2).map((m) => [...m.geometry!]);
  const same = (a: OsmPt, b: OsmPt) => a.lat === b.lat && a.lon === b.lon;
  const rings: OsmPt[][] = [];
  while (parts.length) {
    const ring = parts.shift()!;
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], end = ring[ring.length - 1];
        if (same(p[0], end)) ring.push(...p.slice(1));
        else if (same(p[p.length - 1], end)) ring.push(...p.reverse().slice(1));
        else continue;
        parts.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

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

/** Named places kept per cell. */
export const MAX_PLACES = 400;
/** OpenStreetMap tags of a named place we use (a restaurant, a shop, a park…). */
export const isNamedPlace = (tags: Record<string, string>) => !!catOfTags(tags) && !!(tags.name || tags["name:en"] || tags.brand);
/** The named place an element is: a node, or the centre of a building/area that is the place. */
export function placeOf(el: { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: OsmPt[] }): Place | null {
  const tags = el.tags ?? {};
  const cat = catOfTags(tags);
  const name = tags.name || tags["name:en"] || tags.brand;
  if (!cat || !name) return null;
  const at = el.type === "node" && el.lat != null && el.lon != null ? { lat: el.lat, lng: el.lon } : el.geometry?.length ? centroid(el.geometry) : null;
  if (!at) return null;
  return { id: `${el.type[0]}${el.id}`, name: name.slice(0, 60), cat, lat: Math.round(at.lat * Q) / Q, lng: Math.round(at.lng * Q) / Q, ...(tags.brand && tags.brand !== name ? { brand: tags.brand.slice(0, 40) } : {}) };
}

/** The street-furniture kind of a mapped point, or -1. */
export function propOfTags(tags: Record<string, string>): number {
  if (tags.natural === "tree") return PROP.tree;
  const hw = tags.highway;
  if (hw === "street_lamp") return PROP.lamp;
  if (hw === "traffic_signals") return PROP.signal;
  if (hw === "bus_stop" || (tags.public_transport === "platform" && tags.bus === "yes")) return PROP.bus;
  // Painted crossings (in Iran "uncontrolled" ones are zebras too); unmarked ones aren't drawn.
  if (hw === "crossing" || tags.railway === "crossing") return tags.crossing === "unmarked" || tags.crossing === "no" ? -1 : PROP.crossing;
  const am = tags.amenity;
  if (am === "bench" || tags.leisure === "picnic_table") return PROP.bench;
  if (am === "waste_basket" || am === "recycling") return PROP.bin;
  if (tags.emergency === "fire_hydrant") return PROP.hydrant;
  if (am === "drinking_water" || am === "fountain") return PROP.fountain;
  return -1;
}

const SPORTS: Record<string, Sport> = { soccer: "soccer", football: "soccer", futsal: "soccer", basketball: "basketball", tennis: "tennis", volleyball: "volleyball", beachvolleyball: "volleyball" };

/**
 * A pitch outline → its centre, size and heading: the smallest rectangle around it
 * (one side always lies along an edge of the outline's hull, so trying each edge works).
 */
export function pitchOf(geom: { lat: number; lon: number }[], tags: Record<string, string>, sw: LatLng): CityPitch | null {
  const c = centroid(geom);
  const kx = 111_320 * Math.cos((c.lat * Math.PI) / 180), ky = 110_540;
  const pts = geom.map((g) => [(g.lon - c.lng) * kx, (g.lat - c.lat) * ky] as const);
  let best: { area: number; l: number; w: number; a: number; mx: number; my: number } | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const ux = dx / len, uy = dy / len;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of pts) {
      const u = x * ux + y * uy, v = -x * uy + y * ux;
      (a0 = Math.min(a0, u)), (a1 = Math.max(a1, u)), (b0 = Math.min(b0, v)), (b1 = Math.max(b1, v));
    }
    const area = (a1 - a0) * (b1 - b0);
    if (best && area >= best.area) continue;
    const mu = (a0 + a1) / 2, mv = (b0 + b1) / 2;
    const mx = mu * ux - mv * uy, my = mu * uy + mv * ux;
    const ang = Math.atan2(uy, ux);
    best = a1 - a0 >= b1 - b0 ? { area, l: a1 - a0, w: b1 - b0, a: ang, mx, my } : { area, l: b1 - b0, w: a1 - a0, a: ang + Math.PI / 2, mx, my };
  }
  if (!best || best.l < 8 || best.w < 5 || best.l > 160) return null;
  const lat = c.lat + best.my / ky, lng = c.lng + best.mx / kx;
  const sport = (tags.sport ?? "").split(";").map((s) => SPORTS[s.trim()]).find(Boolean) ?? "other";
  const a = Math.round((((best.a % Math.PI) + Math.PI) % Math.PI) * 1000) / 1000;
  return { x: Math.round((lng - sw.lng) * Q), y: Math.round((lat - sw.lat) * Q), l: Math.round(best.l * 10) / 10, w: Math.round(best.w * 10) / 10, a, s: sport };
}

/**
 * Overpass `out geom` elements → this cell's tile. Every feature belongs to exactly one
 * tile (buildings and areas by their centre, road segments by their midpoint), so
 * neighbouring tiles never draw the same building twice.
 */
export function fromOverpass(elements: OsmEl[], cx: number, cy: number): CityTile {
  const sw = tileSW(cx, cy);
  const inside = (p: LatLng) => p.lat >= sw.lat && p.lat < sw.lat + TILE_DEG && p.lng >= sw.lng && p.lng < sw.lng + TILE_DEG;
  const tile: CityTile = { v: TILE_V, key: tileKey(cx, cy), cx, cy, real: true, b: [], r: [], a: [], p: [], o: [], f: [] };
  const props = tile.o!;
  const seenPlace = new Set<string>();
  const addBuilding = (geom: OsmPt[], tags: Record<string, string>, id: number) => {
    if (!inside(centroid(geom)) || tile.b.length >= 3000) return;
    const k = buildingKind(tags);
    const r = pack(geom, sw, true);
    if (r.length < 6) return;
    const h = heightOf(tags, k, id);
    const mh = parseFloat(tags.min_height ?? "") || (parseFloat(tags["building:min_level"] ?? "") || 0) * 3.2;
    const rf = ROOFS[tags["roof:shape"] ?? ""];
    const c = osmColour(tags["building:colour"]), rc = osmColour(tags["roof:colour"]);
    tile.b.push({
      r, h: Math.round(h * 10) / 10, k: h > 60 ? "tower" : k,
      ...(tags.name && (k === "church" || k === "civic" || h > 40) ? { n: tags.name.slice(0, 40) } : {}),
      ...(mh > 0 && mh < h - 1 ? { mh: Math.round(mh * 10) / 10 } : {}),
      ...(rf && rf !== "flat" ? { rf } : {}),
      ...(c ? { c } : {}),
      ...(rc ? { rc } : {}),
    });
  };
  for (const el of elements) {
    const tags = el.tags ?? {};
    const geom = el.geometry;
    // Street furniture: real trees, lamps, traffic lights, bus stops, crossings, benches…
    if (el.type === "node" && el.lat != null && el.lon != null && props.length < 6000) {
      const kind = propOfTags(tags);
      if (kind >= 0 && inside({ lat: el.lat, lng: el.lon })) props.push(Math.round((el.lon - sw.lng) * Q), Math.round((el.lat - sw.lat) * Q), kind);
    }
    const place = tile.p.length < MAX_PLACES ? placeOf(el) : null;
    if (place && inside(place) && !seenPlace.has(place.id)) {
      seenPlace.add(place.id);
      tile.p.push(place);
    }
    // Big buildings drawn as multipolygons (courtyards, malls, stations).
    if (el.type === "relation" && tags.building && tags.building !== "no" && el.members && !underground(tags)) {
      for (const ring of outerRings(el.members)) addBuilding(ring, tags, el.id);
      continue;
    }
    if (el.type !== "way" || !geom || geom.length < 2) continue;
    if (tags.building && tags.building !== "no" && geom.length >= 4) {
      if (!underground(tags)) addBuilding(geom, tags, el.id);
      continue;
    }
    const hw = tags.highway, rw = tags.railway;
    if ((hw || rw) && tags.area !== "yes") {
      const k: RoadKind | null = hw ? (MAJOR.test(hw) ? "major" : MINOR.test(hw) ? "minor" : PATH.test(hw) ? "path" : FOOT.test(hw) ? "foot" : null) : RAIL.test(rw) ? "rail" : null;
      if (!k || tile.r.length >= 2500 || underground(tags)) continue;
      const lanes = parseInt(tags.lanes ?? "", 10);
      const ow = tags.oneway === "yes" || tags.junction === "roundabout" || /^motorway/.test(hw ?? "");
      const w = k === "major" || k === "minor" ? Math.max(ROAD_W[k] * (ow ? 0.6 : 1), lanes > 0 ? Math.min(8, lanes) * LANE_W : 0) : ROAD_W[k];
      // Keep the runs of segments whose midpoint is in this tile.
      let run: { lat: number; lon: number }[] = [];
      const flush = () => {
        if (run.length >= 2)
          tile.r.push({
            l: pack(run, sw, false), w: Math.round(w * 10) / 10, k,
            ...(tags.name ? { n: tags.name.slice(0, 40) } : {}),
            ...(lanes > 0 ? { ln: Math.min(8, lanes) } : {}),
            ...(ow ? { ow: 1 as const } : {}),
          });
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
    const lu = tags.landuse;
    const area: AreaKind | null =
      tags.natural === "water" || tags.waterway === "riverbank" || lu === "reservoir" || lu === "basin" ? "water"
      : tags.leisure === "park" || tags.leisure === "garden" || lu === "recreation_ground" || lu === "village_green" ? "park"
      : tags.natural === "wood" || lu === "forest" ? "forest"
      : tags.leisure === "pitch" ? "pitch"
      : lu === "grass" || lu === "meadow" || tags.natural === "scrub" || tags.natural === "grassland" ? "grass"
      : tags.amenity === "parking" && tags.parking !== "underground" && tags.parking !== "multi-storey" ? "parking"
      : hw === "pedestrian" || tags.place === "square" || tags.amenity === "marketplace" ? "plaza"
      : tags.natural === "sand" || tags.natural === "beach" ? "sand"
      : lu === "farmland" || lu === "orchard" || lu === "vineyard" || lu === "allotments" ? "farm"
      : lu === "cemetery" || tags.amenity === "grave_yard" ? "cemetery"
      : lu === "residential" ? "residential"
      : lu === "commercial" || lu === "retail" ? "commercial"
      : lu === "industrial" || lu === "railway" ? "industrial"
      : null;
    if (area && geom.length >= 4 && inside(centroid(geom)) && tile.a.length < 400) {
      const r = pack(geom, sw, true);
      if (r.length >= 6) tile.a.push({ r, k: area });
      const pitch = area === "pitch" ? pitchOf(geom, tags, sw) : null;
      if (pitch) tile.f!.push(pitch);
    }
  }
  return tile;
}

/** The Overpass query for one tile. */
export function overpassQuery(cx: number, cy: number) {
  const sw = tileSW(cx, cy);
  const bb = `${sw.lat.toFixed(6)},${sw.lng.toFixed(6)},${(sw.lat + TILE_DEG).toFixed(6)},${(sw.lng + TILE_DEG).toFixed(6)}`;
  return `[out:json][timeout:60][bbox:${bb}];(
way["building"];
relation["building"]["type"="multipolygon"];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|service|pedestrian|footway|cycleway|path|steps|track)(_link)?$"];
way["railway"~"^(rail|tram|light_rail|narrow_gauge)$"];
way["leisure"~"^(park|garden|pitch)$"];
way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green|reservoir|basin|farmland|orchard|vineyard|allotments|cemetery|residential|commercial|retail|industrial|railway)$"];
way["natural"~"^(water|wood|scrub|grassland|sand|beach)$"];
way["amenity"~"^(parking|marketplace|grave_yard)$"];
way["place"="square"];
node["natural"="tree"];
node["highway"~"^(street_lamp|traffic_signals|bus_stop|crossing)$"];
node["amenity"~"^(bench|waste_basket|drinking_water|fountain)$"];
node["emergency"="fire_hydrant"];
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
  const tile: CityTile = { v: TILE_V, key: tileKey(cx, cy), cx, cy, real: false, b: [], r: [], a: [], p: [] };
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
