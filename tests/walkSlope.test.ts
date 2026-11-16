import { test } from "node:test";
import assert from "node:assert/strict";
import { easeSlope, slopePose, SLOPE_MAX } from "../src/lib/walkSlope";

test("the walk follows the ground's slope, eased, capped, and only while walking", () => {
  let a = 0;
  for (let i = 0; i < 120; i++) a = easeSlope(a, 0.25, 1, 1 / 60, true);
  assert.ok(Math.abs(a - Math.atan(0.25)) < 0.01, `ramp → ${a}`);
  // Stairs or a wall's edge: no more than SLOPE_MAX.
  let s = 0;
  for (let i = 0; i < 240; i++) s = easeSlope(s, 5, 1, 1 / 60, true);
  assert.ok(s <= SLOPE_MAX + 1e-9);
  // One frame barely moves it (a kerb doesn't jerk the body).
  assert.ok(easeSlope(0, 0.15, 0.9, 1 / 60, true) < 0.02);
  // Standing still or in the air: back towards upright.
  assert.ok(easeSlope(0.3, 0.25, 1, 0.5, false) < 0.1);
  assert.equal(easeSlope(0, NaN, 1, 1, true), 0);
});

test("uphill the torso leans forward, downhill a little back; the spine takes back most of the body's tip", () => {
  const up = slopePose(0.3), down = slopePose(-0.3), flat = slopePose(0);
  assert.deepEqual(flat, { tilt: 0, spine: 0, shift: 0 });
  assert.ok(up.tilt > 0 && up.tilt + up.spine > 0 && up.tilt + up.spine < up.tilt, "climb: leaning in, less than the legs");
  assert.ok(down.tilt < 0 && down.tilt + down.spine < 0 && Math.abs(down.tilt + down.spine) < Math.abs(up.tilt + up.spine), "descent: sitting back a little");
  assert.ok(up.shift > 0 && down.shift < 0);
});
