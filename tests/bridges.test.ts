import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_DEG, type CityTile } from "@/lib/city";
import { buildTileArrays } from "@/components/drive/tileMesh";

// Over the Bosphorus: a road across the tile, as a bridge or not, and a suspension span over it.
const cx = Math.floor(29.035 / TILE_DEG), cy = Math.floor(41.045 / TILE_DEG);
const origin = { lat: cy * TILE_DEG + TILE_DEG / 2, lng: cx * TILE_DEG + TILE_DEG / 2 };
const road = (br: boolean): CityTile["r"][number] => ({ l: [100, 5000, 9900, 5000], w: 14, k: "major", ...(br ? { br: 1 as const } : {}) });
const tile = (br: boolean, span = false): CityTile => ({
  v: 3, key: `${cx}_${cy}`, cx, cy, real: true, b: [], a: [], p: [], r: [road(br)],
  ...(span ? { bs: [{ l: [100, 5000, 5000, 5000, 9900, 5000], h: [90, 4, 90], w: 14 }], bt: [{ l: [100, 5000, 150, 5000], h: 95, w: 14 }] } : {}),
});
const verts = (t: CityTile, layer: string, lite = false) => buildTileArrays(t, origin, "real", lite).layers.find((l) => l.name === layer)?.pos.length ?? 0;
const top = (t: CityTile) => Math.max(...buildTileArrays(t, origin, "real", false).layers.flatMap((l) => Array.from(l.pos.filter((_, i) => i % 3 === 1))));

describe("bridges in the 3D city", () => {
  it("a bridge road gets parapets, a deck edge and piers; an ordinary road doesn't", () => {
    assert.ok(verts(tile(true), "trim") > verts(tile(false), "trim"), "parapets");
    assert.ok(verts(tile(true), "walls") > verts(tile(false), "walls"), "deck edge and piers");
    // Lite phones: the parapets and deck, no piers.
    assert.ok(verts(tile(true), "walls", true) < verts(tile(true), "walls"));
  });
  it("a suspension span stands its towers and cables high over the deck", () => {
    assert.ok(top(tile(true)) < 5);
    assert.ok(top(tile(true, true)) >= 90);
  });
});
