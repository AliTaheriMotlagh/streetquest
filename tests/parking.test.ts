// Cars parked along Iran's kerbs (lib/parking.ts): which streets have rows, where the
// traffic drives past them, and the rows themselves — at the kerb, nose to tail without
// touching, gapped at junctions, the same every time.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLEET, heavy } from "@/lib/fleet";
import { rng } from "@/lib/geo";
import { JUNCTION_CLEAR_M, Junctions, laneOffset, parkedRow, parkingSides, ROW_M, type Parked } from "@/lib/parking";

describe("which streets have parked cars", () => {
  it("none on expressways or in narrow lanes, one row on a side street, both on wider streets", () => {
    assert.deepEqual(parkingSides(22, 1), [false, false]);
    assert.deepEqual(parkingSides(5, 1), [false, false]);
    assert.deepEqual(parkingSides(14, 1), [true, true]);
    const a = parkingSides(7.5, 1), b = parkingSides(7.5, 2);
    assert.equal(a.filter(Boolean).length, 1);
    assert.notDeepEqual(a, b, "which side depends on the street");
  });
});

describe("where the traffic drives", () => {
  const W = 1.8;
  it("keeps the middle of its half of a street with no parking (both ways alike)", () => {
    assert.equal(laneOffset(7.5, [false, false], 1), 7.5 / 4);
    assert.equal(laneOffset(7.5, [false, false], -1), 7.5 / 4);
  });

  it("passes a row of parked cars without touching it, and oncoming traffic too", () => {
    for (const dir of [1, -1] as const) {
      const park: [boolean, boolean] = [true, false];
      const mine = laneOffset(7.5, park, dir), theirs = -laneOffset(7.5, park, dir === 1 ? -1 : 1);
      // In the line's terms: the row is on the right, from 7.5/2 − ROW_M to the kerb.
      const at = dir * mine;
      assert.ok(at + W / 2 <= 7.5 / 2 - ROW_M + 0.15, `dir ${dir}: clips the parked cars`);
      assert.ok(at - W / 2 >= -7.5 / 2, `dir ${dir}: over the far kerb`);
      assert.ok(Math.abs(at - dir * theirs) >= W, "room for both ways");
    }
  });

  it("drives down the middle where parked cars leave too little for two", () => {
    assert.equal(laneOffset(7, [true, true], 1), 0);
  });

  it("puts a bike out by the kerb, or by the parked cars", () => {
    assert.ok(laneOffset(10, [false, false], 1, true) > laneOffset(10, [false, false], 1));
    assert.ok(laneOffset(10, [true, false], 1, true) <= 10 / 2 - ROW_M - 0.6 + 1e-9);
  });
});

describe("a row of parked cars", () => {
  const line = [0, 0, 120, 0];
  const row = (seed: number, free: (x: number, z: number) => boolean = () => true) => parkedRow(line, 7.5, 1, rng(seed), free);

  it("stands at the kerb, facing the traffic's way, never a bus, a truck or a bike", () => {
    const cars = row(7);
    assert.ok(cars.length >= 12, `${cars.length} cars on 120 m`);
    for (const c of cars) {
      const d = FLEET[c.key];
      assert.ok(!d.bike && !heavy(c.key), c.key);
      // Right of the line's direction (+x): the +z side, the car's far side by the kerb.
      assert.ok(c.z > 0 && c.z + d.wid / 2 <= 7.5 / 2 && c.z - d.wid / 2 >= 7.5 / 2 - ROW_M, `${c.key} at z ${c.z}`);
      assert.ok(Math.abs(Math.atan2(Math.sin(c.yaw - Math.atan2(-1, 0)), Math.cos(c.yaw - Math.atan2(-1, 0)))) < 1e-9, "facing +x");
    }
  });

  it("parks nose to tail without touching", () => {
    const cars = [...row(3)].sort((a, b) => a.x - b.x);
    for (let i = 1; i < cars.length; i++) {
      const gap = cars[i].x - cars[i - 1].x - (FLEET[cars[i].key].len + FLEET[cars[i - 1].key].len) / 2;
      assert.ok(gap >= 0.5 - 1e-9, `gap ${gap}`);
    }
  });

  it("leaves a junction clear, and is the same every time", () => {
    const clear = (x: number) => Math.abs(x - 60) > 12;
    const cars = row(5, (x: number) => clear(x));
    const reach = (c: Parked) => [c.x - FLEET[c.key].len / 2, c.x + FLEET[c.key].len / 2];
    assert.ok(cars.every((c) => reach(c).every(clear)), "no car on the junction");
    assert.deepEqual(row(5), row(5));
    assert.notDeepEqual(row(5), row(6));
  });
});

describe("junctions, roundabouts and bends", () => {
  const W = 7.5;
  /** The ends of a parked car, along its street (+x here). */
  const ends = (c: Parked) => [c.x - FLEET[c.key].len / 2, c.x + FLEET[c.key].len / 2];

  it("keeps a crossing clear even when the two streets share no point", () => {
    const main = [0, 0, 120, 0], cross = [60, -50, 60, 50];
    const j = new Junctions([{ line: main, w: W }, { line: cross, w: 9 }]);
    const cars = parkedRow(main, W, 1, rng(4), (x, z) => j.clear(x, z, main), 1);
    assert.ok(cars.length >= 10);
    for (const c of cars) for (const x of ends(c)) assert.ok(Math.abs(x - 60) >= 9 / 2 + JUNCTION_CLEAR_M - 1e-9, `car end at x ${x}`);
  });

  it("keeps the mouth of a side street clear (a T from the parking side)", () => {
    const main = [0, 0, 120, 0], side = [60, 0, 60, 60];
    const j = new Junctions([{ line: main, w: W }, { line: side, w: 7 }]);
    const cars = parkedRow(main, W, 1, rng(9), (x, z) => j.clear(x, z, main), 1);
    for (const c of cars) for (const x of ends(c)) assert.ok(Math.abs(x - 60) >= 7 / 2 + JUNCTION_CLEAR_M - 1e-9, `car end at x ${x}`);
  });

  it("doesn't leave a gap where the same street just goes on as another line", () => {
    const a = [0, 0, 60, 0], b = [60, 0, 120, 0];
    const j = new Junctions([{ line: a, w: W }, { line: b, w: W }]);
    assert.ok(j.clear(58, W / 2 - 1, a) && j.clear(62, W / 2 - 1, b));
  });

  it("parks nobody on a roundabout", () => {
    const ring: number[] = [];
    for (let k = 0; k <= 24; k++) ring.push(Math.cos((k / 24) * Math.PI * 2) * 40, Math.sin((k / 24) * Math.PI * 2) * 40);
    assert.equal(parkedRow(ring, 10, 1, rng(1), () => true, 1).length, 0);
  });

  it("doesn't pile cars into each other on the inside of a bend", () => {
    const bend = [0, 0, 60, 0, 60, 60];
    for (const side of [1, -1] as const) {
      const cars = parkedRow(bend, W, side, rng(2), () => true, 1);
      for (let i = 0; i < cars.length; i++)
        for (let k = i + 1; k < cars.length; k++) {
          const a = cars[i], b = cars[k];
          const reach = (FLEET[a.key].len + FLEET[b.key].len) / 2;
          // Cars on different legs of the bend must not overlap.
          if (Math.abs(Math.cos(a.yaw - b.yaw)) < 0.5) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= reach * 0.75, `side ${side}: cars ${i} and ${k} overlap`);
        }
    }
  });
});
