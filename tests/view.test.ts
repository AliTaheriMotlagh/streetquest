// How the 3D city fits a screen (lib/view.ts): field of view by screen shape, sharpening by render scale.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fovFor, horizontalFov, MAX_VERTICAL_FOV, NARROW_ASPECT, sharpenFor } from "@/lib/view";

describe("field of view", () => {
  it("is left alone on wide screens: a wider screen just shows more to the sides", () => {
    for (const aspect of [4 / 3, 16 / 10, 16 / 9, 19.5 / 9, 21 / 9, 32 / 9, 0.75]) assert.equal(fovFor(62, aspect), 62);
    assert.ok(horizontalFov(62, 21 / 9) > horizontalFov(62, 16 / 9));
    assert.ok(Math.abs(horizontalFov(62, 16 / 9) - 93.7) < 0.2);
  });
  it("opens up on a phone held upright, to what a 2:3 screen would show", () => {
    const before = horizontalFov(62, 9 / 19.5), after = horizontalFov(fovFor(62, 9 / 19.5), 9 / 19.5);
    assert.ok(before < 32); // the tunnel
    assert.ok(Math.abs(after - horizontalFov(62, NARROW_ASPECT)) < 1e-6);
    assert.ok(after > before * 1.35);
  });
  it("never jumps as the window is resized, and never stretches past the cap", () => {
    assert.ok(Math.abs(fovFor(62, NARROW_ASPECT - 1e-6) - 62) < 1e-3);
    let last = 62;
    for (let a = NARROW_ASPECT; a > 0.2; a -= 0.01) {
      const f = fovFor(62, a);
      assert.ok(f >= last - 1e-9 && f - last < 3 && f <= MAX_VERTICAL_FOV);
      last = f;
    }
    assert.equal(fovFor(72, 0.3), MAX_VERTICAL_FOV);
    assert.equal(fovFor(95, 0.4), 95); // already wider than the cap: untouched
  });
  it("keeps a scope's zoom a zoom", () => {
    const hip = fovFor(72, 0.46), scope = fovFor(15, 0.46);
    assert.ok(scope < hip / 3 && scope > 15);
  });
  it("survives a zero-size canvas", () => {
    assert.equal(fovFor(62, 0), 62);
    assert.equal(fovFor(62, NaN), 62);
  });
});

describe("sharpening", () => {
  it("is light at the screen's own resolution and grows as the picture is drawn smaller", () => {
    assert.equal(sharpenFor(2, 2), 0.15);
    assert.equal(sharpenFor(3, 2), 0.15);
    assert.ok(sharpenFor(1.75, 3) > sharpenFor(2.5, 3));
    assert.ok(sharpenFor(0.6, 3) <= 0.45);
    assert.equal(sharpenFor(0, 0), 0.15);
  });
});
