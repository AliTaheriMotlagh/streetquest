// Walking inside a store's 3D scan (lib/scanFloor.ts): shelves and walls block, the floor doesn't, you start by the
// street and the keeper stands at the back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { floorGrid, free, keeperSpot, startSpot, step } from "@/lib/scanFloor";

/** A 4 × 6 m room (x −2…2, z −3…3, the street at +z): points on the floor everywhere, a shelf along the left wall. */
function room() {
  const pts: number[] = [];
  for (let x = -2; x <= 2; x += 0.1) for (let z = -3; z <= 3; z += 0.1) pts.push(x, 0, z); // floor
  for (let z = -3; z <= 3; z += 0.05) for (const y of [0.5, 1.2]) pts.push(-1.8, y, z); // shelf on the left
  for (let x = -0.5; x <= 0.5; x += 0.05) pts.push(x, 1, 0); // a display table in the middle
  return floorGrid(pts, { x0: -2, x1: 2, z0: -3, z1: 3 });
}

describe("scan floor", () => {
  const g = room();
  it("the floor is free; the shelf, the table and outside the room aren't", () => {
    assert.ok(free(g, 1, 1));
    assert.ok(!free(g, -1.8, 0), "the shelf");
    assert.ok(!free(g, 0, 0), "the table");
    assert.ok(!free(g, 2.5, 0), "outside");
    assert.ok(!free(g, 1.9, 0), "too close to the edge for a body");
  });
  it("walking: blocked by the table, sliding along it", () => {
    assert.deepEqual(step(g, 0, 1, 0, 0.2), { x: 0, z: 1 }, "straight into the table: stays");
    const s = step(g, 0.9, 0.5, 0.8, 0.1);
    assert.ok(s.z === 0.1 || s.x === 0.8, "slides along one axis");
    assert.deepEqual(step(g, 1, 1, 1.1, 1.2), { x: 1.1, z: 1.2 });
  });
  it("start by the street, keeper at the back, both on free floor", () => {
    const st = startSpot(g)!, kp = keeperSpot(g)!;
    assert.ok(st.z > 2 && kp.z < -2, `start ${st.z}, keeper ${kp.z}`);
    assert.ok(free(g, st.x, st.z) && free(g, kp.x, kp.z));
    assert.equal(startSpot(floorGrid([0, 1, 0], { x0: 0, x1: 0.2, z0: 0, z1: 0.2 })), null, "nothing clear");
  });
});
