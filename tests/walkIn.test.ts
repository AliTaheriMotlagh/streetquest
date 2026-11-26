import { test } from "node:test";
import assert from "node:assert/strict";
import { REARM_M, WALK_IN_M, walksIn, type WalkInState } from "../src/lib/walkIn";

const door = { id: "s1", x: 0, z: 0 };

test("walking at the door goes in; standing or walking past doesn't", () => {
  const st: WalkInState = { left: null };
  assert.equal(walksIn({ x: 0, z: 2, vx: 0, vz: -1.4 }, door, st), true);
  assert.equal(walksIn({ x: 0, z: 2, vx: 0, vz: 0 }, door, st), false, "standing");
  assert.equal(walksIn({ x: 0, z: 2, vx: 1.4, vz: 0 }, door, st), false, "passing by");
  assert.equal(walksIn({ x: 0, z: WALK_IN_M + 1, vx: 0, vz: -1.4 }, door, st), false, "too far");
});

test("after leaving, no bounce until you step away", () => {
  const st: WalkInState = { left: "s1" };
  assert.equal(walksIn({ x: 0, z: 1, vx: 0, vz: -1.4 }, door, st), false);
  assert.equal(walksIn({ x: 0, z: REARM_M + 1, vx: 0, vz: 1 }, door, st), false);
  assert.equal(st.left, null, "re-armed");
  assert.equal(walksIn({ x: 0, z: 2, vx: 0, vz: -1.4 }, door, st), true);
});
