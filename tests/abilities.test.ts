// Slow motion, dead-eye and nitro rules (lib/abilities.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEADEYE_SCALE, FOCUS_SCALE, focusDepth, newAbilities, stepAbilities, steerCompensation, type AbilityIn } from "@/lib/abilities";

const run = (a: ReturnType<typeof newAbilities>, secs: number, i: Partial<AbilityIn>) => {
  for (let t = 0; t < secs; t += 1 / 60) stepAbilities(a, { dt: 1 / 60, enabled: true, mode: "car", focusHold: false, nitroHold: false, aiming: false, ...i });
  return a;
};

describe("abilities", () => {
  it("holding focus eases the world to ~0.3x and releasing eases back", () => {
    const a = newAbilities();
    run(a, 1, { focusHold: true });
    assert.ok(Math.abs(a.scale - FOCUS_SCALE) < 0.01);
    assert.ok(a.focus < 1);
    run(a, 2, {});
    assert.equal(a.scale, 1);
  });
  it("time eases rather than snapping", () => {
    const a = newAbilities();
    run(a, 0.05, { focusHold: true });
    assert.ok(a.scale < 1 && a.scale > 0.6);
  });
  it("the meter drains, locks at empty, and recharges", () => {
    const a = newAbilities();
    run(a, 8, { focusHold: true });
    assert.ok(a.focus < 0.1);
    assert.ok(a.focusLock && !a.focusOn);
    assert.equal(a.scale, 1, "back to normal time when empty");
    run(a, 1, { focusHold: true });
    assert.equal(a.focusOn, false, "can't re-trigger while locked");
    run(a, 12, {});
    assert.ok(a.focus > 0.25 && !a.focusLock);
    run(a, 30, {});
    assert.equal(a.focus, 1);
  });
  it("is off in arena matches and while flying", () => {
    const a = newAbilities();
    run(a, 1, { focusHold: true, nitroHold: true, enabled: false });
    assert.equal(a.scale, 1);
    assert.equal(a.focus, 1);
    assert.equal(a.nitroOn, false);
    run(a, 1, { focusHold: true, mode: "air" });
    assert.equal(a.scale, 1);
  });
  it("dead-eye needs the sights up and is a little less slow", () => {
    const a = newAbilities();
    run(a, 1, { mode: "foot", focusHold: true });
    assert.equal(a.scale, 1);
    run(a, 1, { mode: "foot", focusHold: true, aiming: true });
    assert.ok(Math.abs(a.scale - DEADEYE_SCALE) < 0.01);
  });
  it("nitro has its own meter and needs a moving car", () => {
    const a = newAbilities();
    run(a, 0.5, { nitroHold: true, moving: false });
    assert.equal(a.nitroOn, false);
    run(a, 1, { nitroHold: true });
    assert.ok(a.nitroOn && a.nitro < 1 && a.focus === 1 && a.scale === 1);
    run(a, 5, { nitroHold: true });
    assert.ok(a.nitroLock);
  });
  it("steering is compensated in slow motion", () => {
    assert.equal(steerCompensation(1), 1);
    assert.ok(Math.abs(steerCompensation(0.3) - 1 / 0.3) < 1e-9);
    assert.equal(focusDepth(1), 0);
    assert.equal(focusDepth(FOCUS_SCALE), 1);
  });
});
