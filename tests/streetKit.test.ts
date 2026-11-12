// Iran's street kit (drive/streetKit.ts): post boxes, cabinets, payphones and the saqakhaneh on the
// pavement, railings down the middle of two-way main roads with gaps at the junctions, footbridges,
// and the arrow signs / motorway gantries before the junctions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_DEG, type CityTile } from "@/lib/city";
import { buildTileArrays } from "@/components/drive/tileMesh";
import { KIT_CAPS, lineDist } from "@/components/drive/streetKit";

const at = (lng: number, lat: number) => {
  const cx = Math.floor(lng / TILE_DEG), cy = Math.floor(lat / TILE_DEG);
  return { cx, cy, origin: { lat: cy * TILE_DEG + TILE_DEG / 2, lng: cx * TILE_DEG + TILE_DEG / 2 } };
};

/** A tile with a long two-way main road across it, a named street crossing it and a motorway further up. */
function tehran(dx = 0, roads?: CityTile["r"]) {
  const { cx, cy, origin } = at(51.42 + dx * TILE_DEG, 35.7);
  const tile: CityTile = {
    v: 2, key: `${cx}_${cy}`, cx, cy, real: true, b: [], a: [], p: [],
    r: roads ?? [
      { l: [100, 3000, 9900, 3000], w: 17, k: "major", n: "خیابان انقلاب\nEnqelab St" },
      { l: [5000, 100, 5000, 9900], w: 9, k: "minor", n: "خیابان حافظ\nHafez St" },
      { l: [100, 8000, 9900, 8000], w: 22, k: "major", n: "بزرگراه رسالت\nResalat Expy", ow: 1 },
      { l: [2000, 100, 2000, 2000], w: 8, k: "minor", n: "کوچه گل" },
    ],
  };
  return { tile, origin };
}

/** How far inside the asphalt of any street a point is (m; ≤ 0: off every street). */
function onStreet(a: ReturnType<typeof buildTileArrays>, x: number, z: number) {
  let worst = -Infinity;
  a.roads.forEach((p, ri) => (worst = Math.max(worst, a.roadWidths[ri] / 2 - lineDist(p, x, z))));
  return worst;
}
const spots = (a: ReturnType<typeof buildTileArrays>, kind: string) => {
  const p = a.props.find((q) => q.kind === kind);
  return p ? Array.from({ length: p.mats.length / 16 }, (_, i) => ({ x: p.mats[i * 16 + 12], z: p.mats[i * 16 + 14] })) : [];
};

describe("street kit on the pavement", () => {
  it("post boxes, cabinets and payphones stand off the asphalt, within their caps, and are solid", () => {
    let seen = 0;
    for (let dx = 0; dx < 4; dx++) {
      const { tile, origin } = tehran(dx);
      const a = buildTileArrays(tile, origin, "real", false);
      for (const kind of ["postbox", "power", "telecom", "phone", "saqa"] as const) {
        const list = spots(a, kind);
        seen += list.length;
        assert.ok(list.length <= KIT_CAPS[kind], `${kind}: ${list.length}`);
        for (const s of list) {
          assert.ok(onStreet(a, s.x, s.z) < -0.2, `${kind} on the asphalt`);
          assert.ok(a.obstacles.some((o) => s.x >= o.minX && s.x <= o.maxX && s.z >= o.minZ && s.z <= o.maxZ), `${kind} is solid`);
        }
      }
    }
    assert.ok(seen >= 8, `${seen} pieces of kit`);
  });

  it("rubbish bags lie beside some of the containers", () => {
    let bags = 0, bins = 0;
    for (let dx = 0; dx < 4; dx++) {
      const { tile, origin } = tehran(dx);
      const a = buildTileArrays(tile, origin, "real", false);
      const d = spots(a, "dumpster");
      bins += d.length;
      for (const b of spots(a, "bags")) (bags++, assert.ok(d.some((q) => Math.hypot(q.x - b.x, q.z - b.z) < 1.6), "beside a container"));
    }
    assert.ok(bins > 0 && bags > 0 && bags <= bins);
  });

  it("isn't drawn on lite phones, nor in the storybook city", () => {
    const { tile, origin } = tehran();
    for (const a of [buildTileArrays(tile, origin, "real", true), buildTileArrays(tile, origin, "toon", false)])
      for (const kind of ["postbox", "power", "telecom", "rail", "bridgeDeck"]) assert.equal(spots(a, kind).length, 0, kind);
  });
});

describe("median railings", () => {
  it("run down the middle of a two-way main road with a gap at the junction, never on a one-way road", () => {
    const { tile, origin } = tehran();
    const a = buildTileArrays(tile, origin, "real", false);
    const rails = spots(a, "rail");
    assert.ok(rails.length > 40, `${rails.length} panels`);
    const main = a.roads[0];
    for (const r of rails) assert.ok(lineDist(main, r.x, r.z) < 0.01, "on the centre line of the main road");
    const cross = a.roads[1];
    assert.ok(rails.every((r) => lineDist(cross, r.x, r.z) > 4.5 + 6), "a gap where the street crosses");
    assert.ok(a.obstacles.some((o) => o.maxX - o.minX > 50 && o.h < 1.5), "a long solid run");
  });

  it("are only an Iranian thing", () => {
    const { cx, cy, origin } = at(2.35, 48.85);
    const { tile } = tehran();
    const a = buildTileArrays({ ...tile, cx, cy, key: `${cx}_${cy}` }, origin, "real", false);
    assert.equal(spots(a, "rail").length, 0);
    assert.equal(spots(a, "saqa").length, 0);
  });
});

describe("footbridges", () => {
  it("cross a wide main road: deck pieces over it, a stair tower on each pavement", () => {
    let bridges = 0;
    for (let dx = 0; dx < 8; dx++) {
      const { tile, origin } = tehran(dx);
      const a = buildTileArrays(tile, origin, "real", false);
      const deck = spots(a, "bridgeDeck"), stairs = spots(a, "bridgeStair");
      if (!deck.length) continue;
      bridges++;
      assert.equal(stairs.length, 2);
      for (const s of stairs) assert.ok(onStreet(a, s.x, s.z) < 0, "stairs on the pavement");
      assert.ok(deck.some((d) => onStreet(a, d.x, d.z) > 3), "the deck spans the road");
      const high = a.obstacles.find((o) => o.mh > 4);
      assert.ok(high, "the deck is solid only up where it is");
    }
    assert.ok(bridges >= 1, "some tile has a bridge");
  });
});

describe("signs before the junctions", () => {
  it("a main road gets arrow signs on the right-hand pavement naming the cross street, a motorway green gantries", () => {
    const { tile, origin } = tehran(0, [
      { l: [100, 5000, 9900, 5000], w: 17, k: "major", n: "خیابان انقلاب\nEnqelab St" },
      { l: [5000, 100, 5000, 9900], w: 9, k: "minor", n: "خیابان حافظ\nHafez St" },
      { l: [100, 1500, 9900, 1500], w: 22, k: "major", n: "بزرگراه رسالت\nResalat Expy" },
      { l: [3000, 100, 3000, 3000], w: 12, k: "minor", n: "خیابان ری\nRey St" },
    ]);
    const a = buildTileArrays(tile, origin, "real", false);
    const arrows = a.labels.filter((l) => l.kind === "direction");
    assert.ok(arrows.length >= 2, `${arrows.length} arrow signs`);
    for (const l of arrows) {
      assert.ok(onStreet(a, l.x, l.z) < 0, "the post is on the pavement");
      assert.ok(l.plates!.length >= 1 && l.plates!.every((p) => p.text.includes("Hafez") && (p.dir === 1 || p.dir === -1)));
      // Facing the drivers: +z of the sign points back along the road, away from the junction.
      const fx = Math.sin(l.angle), fz = Math.cos(l.angle);
      const j = a.roads[1];
      assert.ok(lineDist(j, l.x + fx * 10, l.z + fz * 10) > lineDist(j, l.x, l.z), "faces away from the junction");
    }
    // A crossing street on both sides: one plate pointing each way.
    assert.ok(arrows.some((l) => l.plates!.length === 2 && l.plates![0].dir !== l.plates![1].dir));
    const gantries = a.labels.filter((l) => l.kind === "gantry");
    assert.ok(gantries.length >= 1, "a gantry on the motorway");
    for (const g of gantries) {
      assert.ok(g.plates!.some((p) => p.dir === 0 && p.text.includes("Resalat")), "straight on: the motorway itself");
      assert.ok(g.plates!.some((p) => p.dir !== 0 && /Rey|Hafez/.test(p.text)), "the exit");
      assert.ok(g.w > 4 && g.w <= 13, "the arm reaches over the lanes");
    }
  });

  it("corner name plates are Tehran's in Iran", () => {
    const { tile, origin } = tehran();
    const corners = buildTileArrays(tile, origin, "real", false).labels.filter((l) => l.kind === "corner");
    assert.ok(corners.length && corners.every((l) => l.ir));
  });
});

describe("trees keep off the road", () => {
  it("jube rows and roadside trees never stand on the asphalt, not even on the inside of a bend", () => {
    // A winding main road (sharp bends) and a straight one crossing it.
    const zig: number[] = [];
    for (let i = 0; i <= 20; i++) zig.push(100 + i * 480, 5000 + (i % 2 ? 900 : -900));
    let trees = 0;
    for (let dx = 0; dx < 4; dx++) {
      const { tile, origin } = tehran(dx, [
        { l: zig, w: 12, k: "major", n: "خیابان پیچ" },
        { l: [5000, 100, 5000, 9900], w: 9, k: "minor", n: "خیابان حافظ" },
      ]);
      const a = buildTileArrays(tile, origin, "real", false);
      for (const s of spots(a, "tree")) {
        trees++;
        assert.ok(onStreet(a, s.x, s.z) < -0.25, `a tree ${onStreet(a, s.x, s.z).toFixed(2)} m into the road`);
      }
    }
    assert.ok(trees > 20, `${trees} trees`);
  });
});
