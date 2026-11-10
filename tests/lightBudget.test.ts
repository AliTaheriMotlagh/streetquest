// The night-light pool's rules (lib/lightBudget.ts): how many lights, and which candidates get them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lightBudget, pickLights, score, type Candidate } from "@/lib/lightBudget";

const eye = { x: 0, z: 0 }, fwd = { x: 0, z: -1 };
const lamp = (id: string, x: number, z: number): Candidate => ({ id, kind: "lamp", x, z });

describe("light budget", () => {
  it("is nothing by day, fills as it gets dark, never past the pool", () => {
    assert.equal(lightBudget(8, 0).total, 0);
    assert.equal(lightBudget(8, 0.2).total, 0);
    const dusk = lightBudget(8, 0.4).total, night = lightBudget(8, 1).total;
    assert.ok(dusk > 0 && dusk < night);
    assert.equal(night, 8);
    assert.equal(lightBudget(0, 1).total, 0);
  });
  it("splits the pool between kinds without overspending", () => {
    for (const total of [1, 2, 4, 6, 8, 12]) {
      const b = lightBudget(total, 1);
      assert.equal(b.lamp + b.head + b.brake, b.total);
      assert.ok(b.lamp >= b.head && b.brake >= 0, `${total}`);
    }
  });
});

describe("picking lights", () => {
  it("gives the lights to the nearest, ahead of equally near ones behind", () => {
    const cands = [lamp("far", 0, -80), lamp("near", 5, -10), lamp("behind", 0, 10), lamp("ahead", 0, -10.5)];
    const got = pickLights(cands, eye, fwd, { total: 2, lamp: 2, head: 0, brake: 0 }, new Set()).map((c) => c.id);
    assert.deepEqual(got.sort(), ["ahead", "near"]);
  });
  it("never lights more than the pool or what's out of range", () => {
    const cands = Array.from({ length: 50 }, (_, i) => lamp(`l${i}`, i * 3, -i * 2));
    const b = lightBudget(6, 1);
    const got = pickLights(cands, eye, fwd, b, new Set());
    assert.ok(got.length <= 6);
    assert.ok(got.every((c) => Math.hypot(c.x, c.z) <= 90));
    assert.deepEqual(pickLights(cands, eye, fwd, lightBudget(6, 0), new Set()), []);
  });
  it("keeps a lit lamp over one that's about as near, so lights don't flicker between them", () => {
    const a = lamp("a", 10, -20), b = lamp("b", -10.5, -20);
    const first = pickLights([a, b], eye, fwd, { total: 1, lamp: 1, head: 0, brake: 0 }, new Set(["b"]));
    assert.equal(first[0].id, "b");
    const second = pickLights([a, b], eye, fwd, { total: 1, lamp: 1, head: 0, brake: 0 }, new Set(["a"]));
    assert.equal(second[0].id, "a");
  });
  it("is deterministic for ties and scores behind the camera worse", () => {
    const x = lamp("x", 8, 0), y = lamp("y", -8, 0);
    assert.equal(pickLights([x, y], eye, fwd, { total: 1, lamp: 1, head: 0, brake: 0 }, new Set())[0].id, "x");
    assert.ok(score(lamp("b", 0, 10), eye, fwd, false) > score(lamp("f", 0, -10), eye, fwd, false) * 1.9);
  });
  it("spends per kind: a crowd of lamps can't take the headlights' share", () => {
    const cands: Candidate[] = [...Array.from({ length: 20 }, (_, i) => lamp(`l${i}`, i, -5)), { id: "car", kind: "head", x: 30, z: -30, yaw: 0 }];
    const got = pickLights(cands, eye, fwd, lightBudget(8, 1), new Set());
    assert.ok(got.some((c) => c.id === "car"));
  });
});
