// On foot: the body turns to where it walks (third person), squares up to aim, and sprints.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { faceYaw, newFoot, stepFoot, type FootInput } from "@/components/arena/foot";

const open = (x: number, z: number) => ({ x, z, hit: null });
const inp = (o: Partial<FootInput>): FootInput => ({ mx: 0, mz: 0, sprint: false, crouch: false, aim: false, jump: false, ...o });
const settle = (cur: number, cam: number, vx: number, vz: number, squared: boolean) => {
  for (let i = 0; i < 120; i++) cur = faceYaw(cur, cam, vx, vz, squared, 1 / 60);
  return cur;
};
const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.02;

describe("walking, GTA-style", () => {
  it("the body turns to where it's going, whichever way the camera looks", () => {
    // Camera looks north (-z); walking east (+x) turns the body east (yaw -90°).
    assert.ok(near(settle(0, 0, 4, 0, false), -Math.PI / 2));
    // Walking toward the camera turns it right round — by the shortest way, never the long one.
    assert.ok(near(settle(0, 0, 0, 4, false), Math.PI));
    // Facing 3 rad, going where -3 rad points: 0.28 rad on through 180°, not 6 rad back through 0.
    const step = faceYaw(3, 0, -Math.sin(-3) * 4, -Math.cos(-3) * 4, false, 1 / 60);
    assert.ok(step > 3 && step - 3 < 0.2, `eases across ±180° instead of spinning back through 0 (${step})`);
  });
  it("standing still it keeps facing as it stopped; aiming or firing squares it up with the camera, faster", () => {
    assert.equal(faceYaw(1.2, 0, 0, 0, false, 1 / 60), 1.2);
    assert.ok(near(settle(1.2, 0.3, 0, 0, true), 0.3));
    assert.ok(near(settle(1.2, 0.3, 4, 0, true), 0.3), "even while strafing");
    const free = Math.abs(faceYaw(1, 0, 0, -4, false, 1 / 60) - 1), sq = Math.abs(faceYaw(1, 0, 0, -4, true, 1 / 60) - 1);
    assert.ok(sq > free);
  });
  it("sprints any way when the body turns to where it goes; only forward when aiming down the camera", () => {
    const run = (o: Partial<FootInput>) => {
      const b = newFoot(0, 0, 0);
      let v = 0;
      for (let i = 0; i < 90; i++) v = stepFoot(b, inp(o), 1 / 60, 1, open);
      return { v, b };
    };
    const side = run({ mx: 1, sprint: true, free: true });
    assert.ok(side.b.sprint && side.v > 6, `sideways sprint in third person (${side.v.toFixed(1)})`);
    assert.ok(side.b.x > 5 && Math.abs(side.b.z) < 0.01);
    const strafe = run({ mx: 1, sprint: true });
    assert.ok(!strafe.b.sprint && strafe.v < 4.5, "a strafe in first person is a jog");
    assert.ok(run({ mz: 1, sprint: true }).b.sprint);
    assert.ok(!run({ mz: 1, sprint: true, aim: true, free: true }).b.sprint, "never while aiming");
  });
});

it("with a floor, feet step up a kerb smoothly, walk down it, and fall off a roof's edge", async () => {
  const { newFoot, stepFoot, STEP_UP } = await import("../src/components/arena/foot");
  // A 0.2 m kerb from x > 2, a 3 m roof from x > 10.
  const floor = (x: number, _z: number, y: number) => (x > 10 && y >= 3 ? 3 : x > 2 && y >= 0.2 ? 0.2 : 0);
  const open = (x: number, z: number) => ({ x, z, hit: null });
  const b = newFoot(0, 0, -Math.PI / 2); // facing +x
  const go = { mx: 0, mz: 1, sprint: false, crouch: false, aim: false, jump: false };
  let maxJump = 0, prev = 0;
  for (let i = 0; i < 60; i++) {
    stepFoot(b, go, 1 / 60, 1, open, floor);
    maxJump = Math.max(maxJump, b.y - prev);
    prev = b.y;
  }
  assert.ok(b.x > 2.5, `walked on: ${b.x}`);
  assert.ok(Math.abs(b.y - 0.2) < 1e-6, `on the kerb: ${b.y}`);
  assert.ok(maxJump < 0.2, "eased up, not snapped");
  assert.equal(b.air, false);
  // Off a 3 m roof: a fall, not a staircase.
  const r = newFoot(11, 0, Math.PI / 2); // facing −x, toward the edge at x = 10
  r.y = 3;
  for (let i = 0; i < 30 && !r.air; i++) stepFoot(r, go, 1 / 60, 1, open, floor);
  assert.equal(r.air, true, "stepped off the edge into the air");
  assert.ok(3 > STEP_UP);
});
