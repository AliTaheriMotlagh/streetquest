import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHUTE_OPEN_S, stepChute, type Body } from "@/components/drive/physics";

const body = (alt: number): Body => ({ x: 0, z: 0, alt, cruise: alt, yaw: 0, vx: 0, vz: -20, vy: 0, speed: 20, steer: 0, roll: 0, pitch: 0, wheelSpin: 0 });
const fall = (b: Body, c = { gas: 0, brake: 0, steer: 0 }, until = Infinity) => {
  let t = 0;
  while (b.alt > 0 && t < until) (stepChute(b, c, 1 / 60, t), (t += 1 / 60));
  return t;
};

describe("parachute", () => {
  it("falls free for a moment, then the canopy slows it to a gentle glide", () => {
    const b = body(150);
    fall(b, undefined, CHUTE_OPEN_S);
    assert.ok(b.vy < -8, `free fall ${b.vy}`);
    fall(b, undefined, CHUTE_OPEN_S + 6);
    assert.ok(b.vy > -5 && b.vy < -3.5, `under canopy ${b.vy}`);
    assert.ok(Math.hypot(b.vx, b.vz) > 5, "glides forward");
  });
  it("lands on the ground, stopped falling", () => {
    const b = body(80);
    const t = fall(b);
    assert.equal(b.alt, 0);
    assert.equal(b.vy, 0);
    assert.ok(t > 10 && t < 30, `took ${t.toFixed(1)} s from 80 m`);
  });
  it("gas dives faster, brake flares slower, steering turns", () => {
    const dive = body(120), flare = body(120), turn = body(120);
    const td = fall(dive, { gas: 1, brake: 0, steer: 0 }), tf = fall(flare, { gas: 0, brake: 1, steer: 0 });
    assert.ok(td < tf, `dive ${td.toFixed(1)} s < flare ${tf.toFixed(1)} s`);
    fall(turn, { gas: 0, brake: 0, steer: 1 }, 6);
    assert.ok(Math.abs(turn.yaw) > 2, "turned");
  });
});
