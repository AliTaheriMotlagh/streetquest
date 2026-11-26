// Knockable street furniture (lib/street/props.ts): a car's hit moves a bin far and a dumpster little,
// the car slows by what it gave, hard hits tip and break things, and everything comes to rest.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { carRigid, isLooseRef, knock, LOOSE, makeBody, stepBody, type LooseKind } from "@/lib/street/props";
import { massOf } from "@/lib/street/carPhysics";

const PRIDE = massOf({ len: 3.9, wid: 1.6, hgt: 1.4 });
/** A Pride driving north (−z) at `v` m/s into a body just ahead. */
function hit(kind: LooseKind, v: number) {
  const b = makeBody(kind, 0, -2.5, 0);
  const car = carRigid(0, 0, 0, 0, -v, PRIDE, 3.9, 1.6);
  const k = knock(b, car, { nx: 0, nz: -1, depth: 0.05, px: 0, pz: -2 });
  return { b, car, k };
}

describe("knockable props", () => {
  it("a bin flies off faster than the car came; a dumpster barely moves", () => {
    const bin = hit("bin", 10), dump = hit("dumpster", 10);
    assert.ok(-bin.b.vz > 10, `bin ${bin.b.vz}`);
    assert.ok(-dump.b.vz < 10 && -dump.b.vz > 1, `dumpster ${dump.b.vz}`);
  });
  it("the car keeps its momentum minus what it gave (a dumpster slows it most)", () => {
    const bin = hit("bin", 10), dump = hit("dumpster", 10);
    const before = PRIDE * 10;
    for (const h of [bin, dump]) assert.ok(Math.abs(PRIDE * -h.car.vz + LOOSE[h.b.kind].mass * -h.b.vz - before) < 1, "momentum kept");
    assert.ok(-dump.car.vz < -bin.car.vz);
  });
  it("tips and breaks only when hard enough", () => {
    assert.equal(hit("bench", 1).k.tipped, false);
    assert.equal(hit("bench", 12).k.tipped, true);
    assert.equal(hit("bin", 3).k.broke, false);
    assert.equal(hit("bin", 15).k.broke, true);
    assert.equal(hit("dumpster", 30).k.broke, false);
  });
  it("comes to rest, lying flat if it tipped", () => {
    const { b } = hit("bin", 12);
    let t = 0;
    while (stepBody(b, 1 / 60) && t < 20) t += 1 / 60;
    assert.ok(t < 10, `rested after ${t}s`);
    assert.equal(b.tip, 1);
    assert.ok(b.z < -5);
  });
  it("a cone or a chair flies and falls at a touch; a bolted post box only falls to a real hit", () => {
    assert.equal(hit("cone", 2).k.tipped, true);
    assert.equal(hit("chair", 2).k.tipped, true);
    assert.ok(-hit("cone", 8).b.vz > 8, "a cone flies off faster than the car");
    assert.equal(hit("postbox", 0.6).k.tipped, false);
    assert.equal(hit("postbox", 8).k.tipped, true);
    assert.equal(hit("cone", 40).k.broke, false, "cones never break");
    assert.equal(hit("telecom", 25).k.broke, true);
  });
  it("a body at rest can be hit again (it stays a body after it stops)", () => {
    const { b } = hit("bin", 6);
    while (stepBody(b, 1 / 60));
    const x = b.x, z = b.z;
    const car = carRigid(x, z + 2.5, 0, 0, -6, PRIDE, 3.9, 1.6);
    knock(b, car, { nx: 0, nz: -1, depth: 0.05, px: x, pz: z + 0.3 });
    assert.ok(b.vz < -1, "moving again");
  });
  it("recognises a loose obstacle's ref", () => {
    assert.ok(isLooseRef({ loose: "bin", key: "1_2", i: 0 }));
    assert.ok(isLooseRef({ loose: "cone", key: "1_2", i: 3 }));
    assert.ok(!isLooseRef({ loose: "tree", key: "1_2", i: 0 }));
    assert.ok(!isLooseRef(undefined));
  });
});
