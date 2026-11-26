// The police helicopter (lib/street/heli.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HELI_ALT, HELI_FAR, heliIn, heliSees, heliStep, ORBIT_R } from "@/lib/street/heli";

describe("police helicopter", () => {
  it("flies in from far out and settles into a circle over you at its height", () => {
    const me = { x: 0, z: 0 };
    const h = heliIn(me, 90);
    assert.ok(Math.abs(Math.hypot(h.x, h.z) - HELI_FAR) < 1e-6);
    assert.equal(heliSees(h, me, false), false, "too far to see you yet");
    for (let i = 0; i < 60 * 40; i++) heliStep(h, me, 1 / 60);
    const r = Math.hypot(h.x, h.z);
    assert.ok(Math.abs(r - ORBIT_R) < 6, `circling at ${r.toFixed(1)} m`);
    assert.ok(Math.abs(h.alt - HELI_ALT) < 1);
    assert.equal(heliSees(h, me, false), true);
    assert.equal(heliSees(h, me, true), false, "under cover");
  });
  it("follows you; leaving, it climbs away and is gone", () => {
    const h = heliIn({ x: 0, z: 0 }, 0);
    for (let i = 0; i < 60 * 40; i++) heliStep(h, { x: 0, z: 0 }, 1 / 60);
    for (let i = 0; i < 60 * 20; i++) heliStep(h, { x: 200, z: 0 }, 1 / 60);
    assert.ok(Math.hypot(h.x - 200, h.z) < ORBIT_R + 10, "kept up");
    h.leaving = true;
    assert.equal(heliSees(h, { x: 200, z: 0 }, false), false);
    let alive = true, t = 0;
    while (alive && t < 60) (alive = heliStep(h, { x: 200, z: 0 }, 1 / 30)), (t += 1 / 30);
    assert.equal(alive, false);
    assert.ok(t < 30, `gone after ${t.toFixed(1)} s`);
  });
});
