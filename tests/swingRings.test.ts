// Sky Rings (lib/swingRings.ts): the course, passing rings in order, the clock and the stars.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobReward } from "@/lib/street/jobs";
import { passSwing, scoreSwing, SWING_GAP, SWING_LIMIT_S, SWING_PAR_S, SWING_RING_R, SWING_RINGS, SWING_Y, swingCourse, tickSwing } from "@/lib/swingRings";

describe("sky rings", () => {
  it("strings the rings ahead, spaced and inside the height band; the same seed draws the same course", () => {
    const c = swingCourse(0, 0, 0, 7);
    assert.equal(c.rings.length, SWING_RINGS);
    assert.ok(c.rings[0].z < 0, "ahead is -z");
    let px = 0, pz = 0;
    for (const r of c.rings) {
      const gap = Math.hypot(r.x - px, r.z - pz);
      assert.ok(gap >= SWING_GAP.min - 0.01 && gap <= SWING_GAP.max + 0.01, `gap ${gap}`);
      assert.ok(r.y >= SWING_Y.min && r.y <= SWING_Y.max);
      (px = r.x), (pz = r.z);
    }
    assert.deepEqual(swingCourse(0, 0, 0, 7), c);
    assert.notDeepEqual(swingCourse(0, 0, 0, 8).rings, c.rings);
  });
  it("lifts a ring out of a building over its roof", () => {
    const c = swingCourse(0, 0, 0, 3, () => 50);
    for (const r of c.rings) assert.ok(r.y >= 50 + SWING_RING_R + 3 - 1e-9);
  });
  it("counts only the next ring, crossed inside its radius", () => {
    const c = swingCourse(0, 0, 0, 2);
    const through = (r: (typeof c.rings)[number], off = 0) => {
      const nx = -Math.sin(r.yaw), nz = -Math.cos(r.yaw);
      return passSwing(c, { x: r.x - nx + off, y: r.y, z: r.z - nz }, { x: r.x + nx + off, y: r.y, z: r.z + nz });
    };
    assert.equal(through(c.rings[1]), -1, "the second ring before the first doesn't count");
    assert.equal(through(c.rings[0], SWING_RING_R + 1), -1, "beside the ring");
    assert.equal(through(c.rings[0]), 0);
    assert.equal(c.next, 1);
    assert.equal(through(c.rings[0]), -1, "once is enough");
    for (let i = 1; i < c.rings.length; i++) assert.equal(through(c.rings[i]), i);
    assert.ok(c.done);
  });
  it("the clock ends it; stars follow rings and time", () => {
    const c = swingCourse(0, 0, 0, 4);
    assert.equal(tickSwing(c, SWING_LIMIT_S - 1), false);
    assert.equal(tickSwing(c, 2), true);
    assert.ok(c.done);
    assert.equal(scoreSwing(c).stars, 0);
    const all = (t: number) => ({ ...swingCourse(0, 0, 0, 4), t, rings: swingCourse(0, 0, 0, 4).rings.map((r) => ({ ...r, hit: true })) });
    assert.equal(scoreSwing(all(SWING_PAR_S - 1)).stars, 5);
    assert.equal(scoreSwing(all(SWING_PAR_S * 1.4)).stars, 4);
    assert.equal(scoreSwing(all(SWING_PAR_S * 3)).stars, 3);
    const half = { ...c, rings: c.rings.map((r, i) => ({ ...r, hit: i < SWING_RINGS / 2 })) };
    assert.equal(scoreSwing(half).stars, 2);
    assert.deepEqual(jobReward("swing", 5), jobReward("skydive", 5));
  });
});
