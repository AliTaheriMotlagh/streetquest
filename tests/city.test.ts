// The 3D city's buildings (drive/tileMesh.ts): what each is made of and coloured, the
// façade every wall vertex wears, balconies and rooftop kit only where they're affordable,
// mosques with domes and minarets, kerbs, jubes and street trees along the streets, and a
// dense block staying inside a triangle budget.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tileSW, TILE_DEG, type CityBuilding, type CityTile } from "@/lib/city";
import { buildingLook, buildTileArrays, clearRuns, FACADES, KERB_H, middleEast, type Layer } from "@/components/drive/tileMesh";

/** A tile in Tehranpars, so the Middle East's flat roofs, stone and mosques apply. */
const cx = Math.floor(51.53 / TILE_DEG), cy = Math.floor(35.73 / TILE_DEG);
const sw = tileSW(cx, cy);
const origin = { lat: sw.lat + TILE_DEG / 2, lng: sw.lng + TILE_DEG / 2 };
/** A building's ring, `w` × `d` packed units (millionths of a degree) from (x, y). */
const rect = (x: number, y: number, w: number, d: number) => [x, y, x + w, y, x + w, y + d, x, y + d];
/** A row of blocks of flats along one street (≈ 20 m wide each, 5 storeys), and that street. */
function street(n: number, extra: CityBuilding[] = []): CityTile {
  const b: CityBuilding[] = Array.from({ length: n }, (_, i) => ({ r: rect(300 + i * 240, 1000, 220, 130), h: 16.5, k: "apartments", rf: "flat" }));
  return { v: 2, key: `${cx}_${cy}`, cx, cy, real: true, b: [...b, ...extra], r: [{ l: [100, 900, 300 + n * 240 + 200, 900], w: 8, k: "minor", n: "Test St" }], a: [], p: [] };
}
const layer = (layers: Layer[], name: string) => layers.find((l) => l.name === name);
const tris = (layers: Layer[]) => layers.reduce((n, l) => n + l.idx.length / 3, 0);

describe("what buildings are made of", () => {
  it("takes the map's material, and reads OpenMapTiles' material colours as materials", () => {
    assert.deepEqual(buildingLook({ k: "house", m: "brick" }, 1, "world"), { facade: "brick", colour: null, glass: false });
    assert.deepEqual(buildingLook({ k: "office", m: "glass" }, 1, "me"), { facade: "plaster", colour: null, glass: true });
    // #b4a995 is how OpenMapTiles paints a stone building: stone, not a paint colour.
    assert.deepEqual(buildingLook({ k: "apartments", c: "#b4a995" }, 1, "me"), { facade: "stone", colour: null, glass: false });
    // A real paint colour stays, on a guessed material.
    assert.equal(buildingLook({ k: "apartments", c: "#ff0000" }, 7, "me").colour, "#ff0000");
  });

  it("guesses the same way every time, and differently by region", () => {
    const seen = (region: "me" | "world") => new Set(Array.from({ length: 200 }, (_, s) => buildingLook({ k: "apartments" }, s, region).facade));
    assert.deepEqual(buildingLook({ k: "house" }, 42, "me"), buildingLook({ k: "house" }, 42, "me"));
    assert.ok(seen("me").has("stone"), "Tehran's travertine blocks");
    assert.ok(!seen("me").has("metal"), "no metal-clad flats");
    assert.ok(buildingLook({ k: "industrial" }, 3, "world").facade === "metal" || buildingLook({ k: "industrial" }, 3, "world").facade === "concrete");
  });

  it("knows where the Middle East is", () => {
    assert.ok(middleEast(35.7, 51.4));
    assert.ok(!middleEast(48.8, 2.35));
  });
});

describe("drawing a street", () => {
  it("gives every wall vertex a façade, shops on the ground floor facing the street", () => {
    const { layers } = buildTileArrays(street(10), origin, "real", false);
    const walls = layer(layers, "walls")!;
    assert.ok(walls.fac, "façades other than plaster are tagged");
    assert.equal(walls.fac!.length, walls.pos.length / 3);
    const used = new Set(Array.from(walls.fac!));
    assert.ok([...used].every((f) => f >= 0 && f < FACADES.length));
    assert.ok(used.has(FACADES.indexOf("shopfront")), "some blocks have shops below");
  });

  it("adds balconies and rooftop coolers and tanks in full detail only", () => {
    const full = buildTileArrays(street(10), origin, "real", false).layers;
    const trim = layer(full, "trim");
    assert.ok(trim && trim.idx.length > 0, "balconies and rooftop kit");
    // Every trim vertex is on the buildings: above street level, up to roof kit height.
    for (let i = 1; i < trim!.pos.length; i += 3) assert.ok(trim!.pos[i] >= 3 && trim!.pos[i] <= 16.5 + 1.3);
    assert.equal(layer(buildTileArrays(street(10), origin, "real", true).layers, "trim"), undefined, "lite phones");
    const toon = buildTileArrays(street(10), origin, "toon", false).layers;
    assert.equal(layer(toon, "trim"), undefined, "the storybook city keeps its look");
    assert.equal(layer(toon, "walls")!.fac, undefined);
  });

  it("draws a mosque with a dome and minarets, not a spire", () => {
    const mosque: CityBuilding = { r: rect(1200, 2000, 400, 300), h: 12, k: "church", rf: "flat", n: "Masjid" };
    const roofs = layer(buildTileArrays(street(0, [mosque]), origin, "real", false).layers, "roofs")!;
    let top = 0;
    for (let i = 1; i < roofs.pos.length; i += 3) top = Math.max(top, roofs.pos[i]);
    // Minarets rise at least 12 m over the roof, with a cap and finial on top.
    assert.ok(top >= 12 + 12, `top ${top}`);
  });

  it("keeps a dense neighbourhood inside a triangle and time budget", () => {
    const rows: CityBuilding[] = [];
    for (let row = 0; row < 12; row++) for (let i = 0; i < 14; i++) rows.push({ r: rect(200 + i * 240, 1000 + row * 300, 220, 160), h: 13 + (i % 4) * 3.3, k: "apartments", rf: "flat" });
    const tile: CityTile = { ...street(0, rows), r: Array.from({ length: 12 }, (_, row) => ({ l: [100, 900 + row * 300, 3700, 900 + row * 300], w: 8, k: "minor" as const })) };
    const t0 = performance.now();
    const { layers } = buildTileArrays(tile, origin, "real", false);
    const ms = performance.now() - t0;
    assert.ok(tris(layers) < 250_000, `${tris(layers)} triangles`);
    assert.ok(ms < 4000, `${Math.round(ms)} ms`);
  });
});

/** Distance from (x, z) to the nearest point of a polyline. */
function toLine(l: Float32Array, x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i + 3 < l.length; i += 2) {
    const dx = l[i + 2] - l[i], dz = l[i + 3] - l[i + 1], l2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - l[i]) * dx + (z - l[i + 1]) * dz) / l2));
    best = Math.min(best, Math.hypot(l[i] + dx * k - x, l[i + 1] + dz * k - z));
  }
  return best;
}

describe("the street's edge", () => {
  it("has kerbs, the jube and a raised pavement, in full detail only", () => {
    const kerbs = layer(buildTileArrays(street(4), origin, "real", false).layers, "kerbs");
    assert.ok(kerbs && kerbs.idx.length > 0);
    const ys = Array.from({ length: kerbs!.pos.length / 3 }, (_, i) => kerbs!.pos[i * 3 + 1]);
    assert.ok(ys.every((y) => y >= 0 && y <= 0.075 + KERB_H + 1e-6), "between the ground and the kerb's top");
    assert.ok(ys.some((y) => y < 0.075), "the jube sits below the street");
    assert.equal(layer(buildTileArrays(street(4), origin, "real", true).layers, "kerbs"), undefined, "lite phones");
    assert.equal(layer(buildTileArrays(street(4), origin, "toon", false).layers, "kerbs"), undefined, "the storybook city");
  });

  it("stops at a cross street instead of running over it", () => {
    const tile: CityTile = { ...street(0), r: [{ l: [100, 900, 2400, 900], w: 8, k: "minor" }, { l: [1200, 100, 1200, 1900], w: 11, k: "minor" }] };
    const a = buildTileArrays(tile, origin, "real", false);
    const kerbs = layer(a.layers, "kerbs")!;
    for (let i = 0; i < kerbs.pos.length; i += 3)
      a.roads.forEach((l, r) => assert.ok(toLine(l, kerbs.pos[i], kerbs.pos[i + 2]) >= a.roadWidths[r] / 2 - 0.05, "a kerb on the asphalt"));
  });

  it("lines Iranian streets with trees growing out of the jube", () => {
    const tile: CityTile = { ...street(0), r: Array.from({ length: 12 }, (_, row) => ({ l: [100, 900 + row * 300, 3700, 900 + row * 300], w: 8, k: "minor" as const })) };
    const a = buildTileArrays(tile, origin, "real", false);
    const trees = a.props.find((p) => p.kind === "tree")!;
    let inJube = 0;
    for (let i = 0; i < trees.mats.length; i += 16) {
      const d = Math.min(...a.roads.map((l) => toLine(l, trees.mats[i + 12], trees.mats[i + 14])));
      if (d > 4 + 0.2 && d < 4 + 0.7) inJube++;
    }
    assert.ok(inJube > 30, `${inJube} trees in the jube`);
  });

  it("cuts a line into the stretches that stay clear", () => {
    const runs = clearRuns(new Float32Array([0, 0, 10, 0, 10, 10]), (x, z) => !(z === 0 && x > 3 && x < 6));
    assert.equal(runs.length, 2);
    assert.deepEqual(Array.from(runs[0]), [0, 0, 3, 0]);
    assert.deepEqual(Array.from(runs[1]), [6, 0, 10, 0, 10, 10]);
    assert.equal(clearRuns(new Float32Array([0, 0, 5, 0]), () => false).length, 0);
  });
});
