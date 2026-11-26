// The following camera (lib/cameraClear.ts): never a wall between it and the car — lifted over a low
// building, pulled in in front of a tower, kept where it is when nothing's in the way.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearCamera, lineClear, type Solid } from "@/lib/cameraClear";

/** A building from x 5…10 (any z), `h` m tall. */
const block = (h: number): Solid => (x, _z, y) => x >= 5 && x <= 10 && y < h;
const car = { x: 0, y: 1.6, z: 0 };
const want = { x: 24, y: 15, z: 0 }; // the far camera, behind the car across the building

describe("camera clearing", () => {
  it("nothing in the way: stays where it wants to be", () => {
    const c = clearCamera(car, { x: -24, y: 15, z: 0 }, block(30));
    assert.deepEqual([c.x, c.y, c.how], [-24, 15, "clear"]);
    assert.ok(lineClear(car, { x: 0, y: 15, z: 24 }, block(30)));
  });
  it("a low building in the way: lifted so it looks over the roof", () => {
    const c = clearCamera(car, want, block(8));
    assert.equal(c.how, "lift");
    assert.ok(c.y > 15 && c.x === 24);
    assert.ok(lineClear(car, c, block(8)));
  });
  it("a tower in the way: pulled in to the last clear point, never closer than the minimum", () => {
    const c = clearCamera(car, want, block(200));
    assert.equal(c.how, "pull");
    assert.ok(c.x < 5 && c.x >= 3, `x ${c.x}`);
    const close = clearCamera(car, want, (x) => x >= 1 && x <= 50);
    assert.ok(Math.hypot(close.x - car.x, close.z - car.z) >= 3 - 1e-9, "at least 3 m back");
  });
});
