// One street-map vector tile (zoom 14, OpenMapTiles schema — see app/api/vt) → the 3D
// city's cells (lib/city CityTile). Pure, runs in the build worker.
//
//  - Geometry is exact: tile coordinates are converted straight to latitude/longitude,
//    and every feature is first clipped to the tile's own square, so the buffer the
//    tiles carry around their edges never draws a building or street twice.
//  - Each feature goes to the one cell its centre falls in (roads: each segment run by
//    its midpoint), like the Overpass tiles (lib/city fromOverpass).
//  - Names follow the player's choice (NameMode): their language when the map has it
//    (Persian in Tehran), the local name as written on the street, or both — two lines
//    joined by "\n", theirs first.
//  - Street frontage: where OpenStreetMap has no buildings mapped along a street in a
//    built-up area (common in Tehran), blocks of flats are filled in along the real
//    kerb line — never on a road, park or water, never over a mapped building. They're
//    marked `g` (generated) in the data.
//  - Named shops, offices, banks… become storefront signs (`s`), house numbers `hn`.
import { classifyRings, VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { hashStr, rng } from "@/lib/geo";
import { PROP, TILE_DEG, TILE_V, tileKey, type AreaKind, type BuildingKind, type CityArea, type CityBuilding, type CityRoad, type CityTile, type RoadKind } from "@/lib/city";

export const VT_ZOOM = 14;
const Q = 1e6;

type P = { x: number; y: number };
type Geom = P[][];

/** Which zoom-14 tiles a cell overlaps (usually one, at most four). */
export function vtTilesForCell(cx: number, cy: number) {
  const n = 2 ** VT_ZOOM;
  const tx = (lng: number) => Math.floor(((lng + 180) / 360) * n);
  const ty = (lat: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const west = cx * TILE_DEG, east = (cx + 1) * TILE_DEG - 1e-9, south = cy * TILE_DEG, north = (cy + 1) * TILE_DEG - 1e-9;
  const out: { x: number; y: number }[] = [];
  for (let x = tx(west); x <= tx(east); x++) for (let y = ty(north); y <= ty(south); y++) out.push({ x, y });
  return out;
}
export const vtKey = (x: number, y: number) => `${x}/${y}`;

// ---------------------------------------------------------------- clipping
/** Sutherland–Hodgman against the square [0, E]². */
function clipRing(ring: P[], E: number): P[] {
  let pts = ring;
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p.x >= 0, (a, b) => ({ x: 0, y: a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= E, (a, b) => ({ x: E, y: a.y + ((b.y - a.y) * (E - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= 0, (a, b) => ({ x: a.x + ((b.x - a.x) * (0 - a.y)) / (b.y - a.y), y: 0 })],
    [(p) => p.y <= E, (a, b) => ({ x: a.x + ((b.x - a.x) * (E - a.y)) / (b.y - a.y), y: E })],
  ];
  for (const [inside, cut] of edges) {
    if (!pts.length) break;
    const out: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    pts = out;
  }
  return pts;
}

/** A polyline cut to the square: the runs that lie inside it (Liang–Barsky per segment). */
function clipLine(line: P[], E: number): P[][] {
  const runs: P[][] = [];
  let run: P[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1;
    const ok = [[-dx, a.x], [dx, E - a.x], [-dy, a.y], [dy, E - a.y]].every(([p, q]) => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      return t0 <= t1;
    });
    if (!ok) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    // Entering from outside (or after a gap) starts a new run.
    if (!run.length || t0 > 0) {
      if (run.length > 1) runs.push(run);
      run = [{ x: a.x + dx * t0, y: a.y + dy * t0 }];
    }
    run.push({ x: a.x + dx * t1, y: a.y + dy * t1 });
    if (t1 < 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// ---------------------------------------------------------------- the tile
const ROAD: Record<string, { k: RoadKind; w: number } | undefined> = {
  motorway: { k: "major", w: 22 }, trunk: { k: "major", w: 20 }, primary: { k: "major", w: 17 }, secondary: { k: "major", w: 14 },
  tertiary: { k: "minor", w: 11 }, minor: { k: "minor", w: 7.5 }, busway: { k: "minor", w: 7 }, service: { k: "path", w: 4.5 },
  track: { k: "foot", w: 2.6 }, path: { k: "foot", w: 2.2 }, rail: { k: "rail", w: 3 },
};
const AREA: Record<string, AreaKind | undefined> = {
  park: "park", garden: "park", playground: "park", nature_reserve: "park", grass: "grass", grassland: "grass", meadow: "grass", scrub: "grass", wetland: "grass",
  wood: "forest", forest: "forest", farmland: "farm", farm: "farm", orchard: "farm", vineyard: "farm", allotments: "farm", sand: "sand", beach: "sand",
  pitch: "pitch", stadium: "pitch", residential: "residential", suburb: "residential", neighbourhood: "residential", commercial: "commercial", retail: "commercial",
  industrial: "industrial", railway: "industrial", cemetery: "cemetery", parking: "parking", square: "plaza",
};
/** Areas where nothing gets built along the street. */
const OPEN: AreaKind[] = ["park", "grass", "forest", "farm", "sand", "pitch", "cemetery", "water", "parking", "plaza"];
const URBAN: AreaKind[] = ["residential", "commercial", "industrial"];
/** Roofs in this part of the world are flat (Iran, the Gulf, the Levant…). */
const flatRoofRegion = (lat: number, lng: number) => lat > 12 && lat < 42 && lng > 25 && lng < 75;

export type Storefront = { x: number; y: number; n: string; c: string };
export type HouseNumber = { x: number; y: number; n: string };
export type VtCell = CityTile & { s?: Storefront[]; hn?: HouseNumber[] };
/** Which name streets and shops show: the player's language, the local one, or both. */
export type NameMode = "mine" | "local" | "both";
export const NAME_MODES: NameMode[] = ["mine", "local", "both"];

export function sliceVectorTile(buf: ArrayBuffer, tx: number, ty: number, locale: string, opts: { infill: boolean; names?: NameMode }): VtCell[] {
  const vt = new VectorTile(new Pbf(new Uint8Array(buf)) as unknown as ConstructorParameters<typeof VectorTile>[0]);
  const n = 2 ** VT_ZOOM;
  const lngOf = (x: number, E: number) => ((tx + x / E) / n) * 360 - 180;
  const latOf = (y: number, E: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + y / E)) / n))) * 180) / Math.PI;
  const midLat = latOf(2048, 4096);
  const flat = flatRoofRegion(midLat, lngOf(2048, 4096));
  const cells = new Map<string, VtCell>();
  const cellAt = (lat: number, lng: number) => {
    const cx = Math.floor(lng / TILE_DEG), cy = Math.floor(lat / TILE_DEG);
    const k = tileKey(cx, cy);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { v: TILE_V, key: k, cx, cy, real: true, b: [], r: [], a: [], p: [], o: [], s: [], hn: [] }));
    return c;
  };
  const pack = (c: VtCell, pts: P[], E: number) => {
    const out: number[] = [];
    let px = NaN, py = NaN;
    for (const p of pts) {
      const x = Math.round((lngOf(p.x, E) - c.cx * TILE_DEG) * Q), y = Math.round((latOf(p.y, E) - c.cy * TILE_DEG) * Q);
      if (Math.abs(x - px) + Math.abs(y - py) < 5) continue; // ≈ 0.5 m
      out.push(x, y);
      px = x;
      py = y;
    }
    return out;
  };
  const centre = (pts: P[]) => {
    let x = 0, y = 0;
    for (const p of pts) (x += p.x), (y += p.y);
    return { x: x / pts.length, y: y / pts.length };
  };
  const names = opts.names ?? "mine";
  const nameOf = (props: Record<string, unknown>) => {
    const s = (k: string) => (typeof props[k] === "string" && (props[k] as string).trim()) || "";
    // `name` is what's written on the street; the rest are translations.
    const local = s("name");
    const english = s("name:en") || s("name_en");
    const mine = locale === "fa" ? s("name:fa") || local : s(`name:${locale}`) || english || s("name_int") || local;
    if (names === "local") return (local || mine).slice(0, 48);
    if (names === "both") {
      // Theirs, then the local name — or English when the two are the same (Tehran's signs are bilingual too).
      const second = local && local !== mine ? local : english && english !== mine ? english : "";
      if (mine && second) return `${mine.slice(0, 40)}\n${second.slice(0, 40)}`;
    }
    return mine.slice(0, 48);
  };
  // Metres per tile unit (Mercator is uniform enough across 2 km).
  const tileM = (360 / n) * 111_320 * Math.cos((midLat * Math.PI) / 180);

  // Everything in metres too, for the frontage fill.
  type Poly = { pts: P[]; minX: number; maxX: number; minY: number; maxY: number; b?: CityBuilding };
  const realBuildings: Poly[] = [], openAreas: Poly[] = [], urbanAreas: Poly[] = [];
  const roadSegs: { a: P; b: P; half: number; fill: boolean }[] = [];
  const toM = (p: P, E: number): P => ({ x: (p.x / E) * tileM, y: (p.y / E) * tileM });
  const poly = (pts: P[]): Poly => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) (minX = Math.min(minX, p.x)), (maxX = Math.max(maxX, p.x)), (minY = Math.min(minY, p.y)), (maxY = Math.max(maxY, p.y));
    return { pts, minX, maxX, minY, maxY };
  };
  const inside = (pts: P[], x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      if (pts[i].y > y !== pts[j].y > y && x < ((pts[j].x - pts[i].x) * (y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) hit = !hit;
    return hit;
  };
  const areaOf = (pts: P[]) => {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    return Math.abs(a / 2);
  };

  // ---- buildings
  const bl = vt.layers.building;
  for (let i = 0; i < (bl?.length ?? 0); i++) {
    const f = bl.feature(i);
    const props = f.properties;
    if (props.hide_3d) continue;
    for (const polygon of (classifyRings(f.loadGeometry()) as Geom[])) {
      const ring = clipRing(polygon[0], bl.extent);
      if (ring.length < 3) continue;
      const m = ring.map((p) => toM(p, bl.extent));
      const area = areaOf(m);
      if (area < 6) continue;
      const ctr = centre(ring);
      const c = cellAt(latOf(ctr.y, bl.extent), lngOf(ctr.x, bl.extent));
      const r = pack(c, ring, bl.extent);
      if (r.length < 6) continue;
      let h = Number(props.render_height) || 0;
      const mh = Number(props.render_min_height) || 0;
      // 5 m is the tiles' "unknown" height: guess from the footprint instead.
      if (!h || h === 5) {
        const seed = hashStr(`${c.key}|${r[0]}|${r[1]}`) % 100;
        h = area < 90 ? 6 + seed / 25 : area < 450 ? 10 + seed / 12 : area < 1500 ? 13 + seed / 9 : 16 + seed / 6;
      }
      const k: BuildingKind = h > 60 ? "tower" : area < 140 && h <= 9 ? "house" : "apartments";
      const colour = typeof props.colour === "string" && /^#[0-9a-f]{6}$/i.test(props.colour) ? props.colour : undefined;
      const b: CityBuilding = { r, h: Math.round(h * 10) / 10, k, ...(mh > 0 && mh < h - 1 ? { mh } : {}), ...(colour ? { c: colour } : {}), ...(flat ? { rf: "flat" as const } : {}) };
      c.b.push(b);
      realBuildings.push({ ...poly(m), b });
    }
  }

  // ---- streets, rail and paths (geometry), then their names (label-only lines)
  const tl = vt.layers.transportation;
  for (let i = 0; i < (tl?.length ?? 0); i++) {
    const f = tl.feature(i);
    const p = f.properties;
    if (p.brunnel === "tunnel" || Number(p.layer) < 0) continue;
    const cls = String(p.class ?? "").replace(/_construction$/, "");
    const def = cls === "transit" || cls === "rail" ? (/(rail|tram|light_rail|narrow_gauge)/.test(String(p.subclass ?? "rail")) ? ROAD.rail : undefined) : ROAD[cls];
    if (!def || f.type !== 2) continue;
    const oneway = Number(p.oneway) === 1 || Number(p.oneway) === -1;
    const w = p.ramp ? 6.5 : def.k === "major" && oneway ? def.w * 0.55 : def.w;
    for (const line of f.loadGeometry() as Geom)
      for (const run of clipLine(line, tl.extent)) {
        // Split into one run per cell by segment midpoints.
        let cur: P[] = [], curCell: VtCell | null = null;
        const flush = () => {
          if (curCell && cur.length >= 2) {
            const l = pack(curCell, cur, tl.extent);
            if (l.length >= 4) curCell.r.push({ l, w: Math.round(w * 10) / 10, k: def.k, ...(oneway ? { ow: 1 as const } : {}) });
          }
          cur = [];
        };
        for (let s = 1; s < run.length; s++) {
          const mid = { x: (run[s - 1].x + run[s].x) / 2, y: (run[s - 1].y + run[s].y) / 2 };
          const cell = cellAt(latOf(mid.y, tl.extent), lngOf(mid.x, tl.extent));
          if (cell !== curCell) {
            flush();
            curCell = cell;
            cur.push(run[s - 1]);
          }
          cur.push(run[s]);
          const a = toM(run[s - 1], tl.extent), b = toM(run[s], tl.extent);
          roadSegs.push({ a, b, half: w / 2, fill: def.k === "major" || def.k === "minor" || (def.k === "path" && w >= 4.5) });
        }
        flush();
      }
  }
  const nl = vt.layers.transportation_name;
  for (let i = 0; i < (nl?.length ?? 0); i++) {
    const f = nl.feature(i);
    const name = nameOf(f.properties);
    const def = ROAD[String(f.properties.class ?? "")];
    if (!name || !def || def.k === "rail" || f.type !== 2) continue;
    for (const line of f.loadGeometry() as Geom)
      for (const run of clipLine(line, nl.extent)) {
        const ctr = run[Math.floor(run.length / 2)];
        const c = cellAt(latOf(ctr.y, nl.extent), lngOf(ctr.x, nl.extent));
        const l = pack(c, run, nl.extent);
        if (l.length >= 4) c.r.push({ l, w: def.w, k: def.k, n: name, x: 1 } as CityRoad);
      }
  }

  // ---- land: parks, water, land use
  const addAreas = (layerName: string, kindOf: (p: Record<string, unknown>) => AreaKind | undefined) => {
    const l = vt.layers[layerName];
    for (let i = 0; i < (l?.length ?? 0); i++) {
      const f = l.feature(i);
      if (f.type !== 3) continue;
      const k = kindOf(f.properties);
      if (!k) continue;
      for (const polygon of (classifyRings(f.loadGeometry()) as Geom[])) {
        const ring = clipRing(polygon[0], l.extent);
        if (ring.length < 3) continue;
        const m = poly(ring.map((p) => toM(p, l.extent)));
        if (OPEN.includes(k)) openAreas.push(m);
        if (URBAN.includes(k)) urbanAreas.push(m);
        const ctr = centre(ring);
        const c = cellAt(latOf(ctr.y, l.extent), lngOf(ctr.x, l.extent));
        const r = pack(c, ring, l.extent);
        if (r.length >= 6 && c.a.length < 500) c.a.push({ r, k } satisfies CityArea);
      }
    }
  };
  addAreas("landuse", (p) => AREA[String(p.class)]);
  addAreas("landcover", (p) => AREA[String(p.subclass)] ?? AREA[String(p.class)]);
  addAreas("park", (p) => AREA[String(p.class)] ?? "park");
  addAreas("water", () => "water");

  // ---- named places: storefront signs; bus stops; house numbers
  const pl = vt.layers.poi;
  for (let i = 0; i < (pl?.length ?? 0); i++) {
    const f = pl.feature(i);
    const p = f.properties;
    const g = (f.loadGeometry() as Geom)[0]?.[0];
    if (!g || g.x < 0 || g.y < 0 || g.x > pl.extent || g.y > pl.extent) continue;
    const c = cellAt(latOf(g.y, pl.extent), lngOf(g.x, pl.extent));
    const [x, y] = pack(c, [g], pl.extent);
    if (x == null) continue;
    const cls = String(p.class ?? ""), sub = String(p.subclass ?? "");
    // A place of worship marks its building (a mosque in the Middle East: dome and minarets).
    if (cls === "place_of_worship") {
      const at = toM(g, pl.extent);
      const home = realBuildings.find((r) => r.b && at.x >= r.minX && at.x <= r.maxX && at.y >= r.minY && at.y <= r.maxY && inside(r.pts, at.x, at.y));
      if (home?.b) {
        home.b.k = "church";
        const name = nameOf(p);
        if (name) home.b.n = name.split("\n")[0].slice(0, 40);
      }
    }
    if (sub === "bus_stop") {
      c.o!.push(x, y, PROP.bus);
      continue;
    }
    if (/^(bollard|gate|toilets|lift_gate|entrance|bench|waste_basket|atm|parking_entrance|subway|tram_stop|station)$/.test(sub)) continue;
    const name = nameOf(p);
    if (name && c.s!.length < 400) c.s!.push({ x, y, n: name, c: sub && sub !== "undefined" ? sub : cls });
  }
  const hl = vt.layers.housenumber;
  for (let i = 0; i < (hl?.length ?? 0); i++) {
    const f = hl.feature(i);
    const g = (f.loadGeometry() as Geom)[0]?.[0];
    const num = String(f.properties.housenumber ?? "").slice(0, 8);
    if (!g || !num || g.x < 0 || g.y < 0 || g.x > hl.extent || g.y > hl.extent) continue;
    const c = cellAt(latOf(g.y, hl.extent), lngOf(g.x, hl.extent));
    const [x, y] = pack(c, [g], hl.extent);
    if (x != null && c.hn!.length < 300) c.hn!.push({ x, y, n: num });
  }

  if (opts.infill) fillFrontage();

  // Every cell this tile covers comes back, empty or not, so the caller knows it's done.
  const west = lngOf(0, 1), east = lngOf(1, 1), north = latOf(0, 1), south = latOf(1, 1);
  for (let cx = Math.floor(west / TILE_DEG); cx <= Math.floor((east - 1e-9) / TILE_DEG); cx++)
    for (let cy = Math.floor(south / TILE_DEG); cy <= Math.floor((north - 1e-9) / TILE_DEG); cy++) cellAt((cy + 0.5) * TILE_DEG, (cx + 0.5) * TILE_DEG);
  return [...cells.values()];

  /**
   * Blocks of flats along streets that have no buildings mapped, in built-up areas:
   * lots 9–15 m wide and 12–22 m deep, set back from the kerb, 3–7 storeys.
   */
  function fillFrontage() {
    const G = 32;
    const grid = <T,>() => new Map<string, T[]>();
    const put = <T,>(g: Map<string, T[]>, minX: number, maxX: number, minY: number, maxY: number, v: T) => {
      for (let gx = Math.floor(minX / G); gx <= Math.floor(maxX / G); gx++)
        for (let gy = Math.floor(minY / G); gy <= Math.floor(maxY / G); gy++) {
          const k = `${gx}_${gy}`;
          const l = g.get(k);
          if (l) l.push(v);
          else g.set(k, [v]);
        }
    };
    const near = <T,>(g: Map<string, T[]>, x: number, y: number) => g.get(`${Math.floor(x / G)}_${Math.floor(y / G)}`) ?? [];
    const bGrid = grid<Poly>(), oGrid = grid<Poly>(), uGrid = grid<Poly>(), sGrid = grid<(typeof roadSegs)[number]>(), fGrid = grid<Poly>();
    for (const b of realBuildings) put(bGrid, b.minX, b.maxX, b.minY, b.maxY, b);
    for (const a of openAreas) put(oGrid, a.minX, a.maxX, a.minY, a.maxY, a);
    for (const a of urbanAreas) put(uGrid, a.minX, a.maxX, a.minY, a.maxY, a);
    for (const s of roadSegs) put(sGrid, Math.min(s.a.x, s.b.x) - s.half, Math.max(s.a.x, s.b.x) + s.half, Math.min(s.a.y, s.b.y) - s.half, Math.max(s.a.y, s.b.y) + s.half, s);
    const inPoly = (pts: P[], x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
        if (pts[i].y > y !== pts[j].y > y && x < ((pts[j].x - pts[i].x) * (y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside;
      return inside;
    };
    const inAny = (g: Map<string, Poly[]>, x: number, y: number) => near(g, x, y).some((a) => x >= a.minX && x <= a.maxX && y >= a.minY && y <= a.maxY && inPoly(a.pts, x, y));
    const onRoad = (x: number, y: number) =>
      near(sGrid, x, y).some((s) => {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy || 1;
        const k = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / l2));
        return Math.hypot(s.a.x + dx * k - x, s.a.y + dy * k - y) < s.half + 2;
      });
    /** Built-up here: inside urban land use, or with several mapped buildings around. */
    const urban = (x: number, y: number) => inAny(uGrid, x, y) || [...near(bGrid, x, y), ...near(bGrid, x + G, y), ...near(bGrid, x - G, y), ...near(bGrid, x, y + G), ...near(bGrid, x, y - G)].length >= 4;
    const rand = rng(hashStr(`frontage|${tx}|${ty}`));
    let made = 0;
    for (const s of roadSegs) {
      if (!s.fill || made > 6000) continue;
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, len = Math.hypot(dx, dy);
      if (len < 12) continue;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const big = s.half >= 6;
      for (const side of [1, -1]) {
        for (let at = 4 + rand() * 4; at < len - 4; ) {
          const w = 9 + rand() * 6, d = big ? 14 + rand() * 9 : 12 + rand() * 7;
          const back = s.half + 2.6;
          const cxm = s.a.x + ux * (at + w / 2), cym = s.a.y + uy * (at + w / 2);
          at += w + 0.4;
          const corner = (along: number, out: number): P => ({ x: cxm + ux * along + nx * side * out, y: cym + uy * along + ny * side * out });
          const q = [corner(-w / 2, back), corner(w / 2, back), corner(w / 2, back + d), corner(-w / 2, back + d)];
          const probes = [...q, corner(0, back + d / 2), corner(0, back + 0.5), corner(-w / 2 + 0.5, back + d / 2), corner(w / 2 - 0.5, back + d / 2)];
          const mid = probes[4];
          if (mid.x < 0 || mid.y < 0 || mid.x > tileM || mid.y > tileM) continue;
          if (!urban(mid.x, mid.y)) continue;
          if (probes.some((p) => inAny(bGrid, p.x, p.y) || inAny(oGrid, p.x, p.y) || inAny(fGrid, p.x, p.y) || onRoad(p.x, p.y))) continue;
          // A mapped building partly inside the lot also blocks it.
          if (near(bGrid, mid.x, mid.y).some((b) => b.pts.some((p) => inPoly(q, p.x, p.y)))) continue;
          const lot = poly(q);
          put(fGrid, lot.minX, lot.maxX, lot.minY, lot.maxY, lot);
          const E = 1, tilePts = q.map((p) => ({ x: p.x / tileM, y: p.y / tileM }));
          const ctr = centre(tilePts);
          const c = cellAt(latOf(ctr.y, E), lngOf(ctr.x, E));
          const r = pack(c, tilePts, E);
          if (r.length < 6) continue;
          const floors = big ? 4 + Math.floor(rand() * 4) : 3 + Math.floor(rand() * 3);
          c.b.push({ r, h: Math.round((floors * 3.2 + 0.8) * 10) / 10, k: "apartments", g: 1, ...(flat ? { rf: "flat" as const } : {}) } as CityBuilding);
          made++;
        }
      }
    }
  }
}
