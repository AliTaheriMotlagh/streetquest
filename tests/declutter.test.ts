// The map with every layer on: which markers keep their name and which shrink to a dot.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { declutter, labelPx, type Mark } from "@/components/game/declutter";

const m = (id: string, x: number, y: number, o: Partial<Mark> = {}): Mark => ({ id, x, y, r: 20, label: 60, ...o });

describe("declutter", () => {
  it("names everything when nothing overlaps", () => {
    const r = declutter([m("a", 0, 0), m("b", 200, 0), m("c", 0, 200)]);
    assert.deepEqual([...r.named].sort(), ["a", "b", "c"]);
    assert.equal(r.dots.size, 0);
  });

  it("shrinks a place sitting on a game marker to a dot, never the game marker", () => {
    const r = declutter([m("money", 0, 0), m("cafe", 8, 6, { dot: true }), m("job", 12, 4)]);
    assert.deepEqual([...r.dots], ["cafe"]);
    // The job overlaps the money too, but it may not shrink: both stay full markers.
    assert.ok(!r.dots.has("money") && !r.dots.has("job"));
  });

  it("keeps the first name where two labels would collide", () => {
    // Side by side, icons apart, names wide enough to overlap.
    const r = declutter([m("near", 0, 0, { label: 120 }), m("far", 70, 0, { label: 120 })]);
    assert.deepEqual([...r.named], ["near"]);
  });

  it("hides a name that would run under another icon", () => {
    const r = declutter([m("icon", 0, 42, { label: 0 }), m("named", 0, 0, { label: 80 })]);
    assert.ok(!r.named.has("named"));
  });

  it("past the budget, places become dots (the first ones stay full)", () => {
    const list = Array.from({ length: 10 }, (_, i) => m(`p${i}`, i * 300, 0, { dot: true }));
    const r = declutter(list, 4);
    assert.deepEqual([...r.dots], ["p4", "p5", "p6", "p7", "p8", "p9"]);
  });

  it("sizes labels by name, capped", () => {
    assert.ok(labelPx("Cafe") < labelPx("Cafe Nadri on Lalehzar"));
    assert.equal(labelPx("x".repeat(200)), 140);
  });
});

describe("a calm map: dots and names have a budget too", () => {
  it("a dot on another dot or under a pin isn't drawn; past the dot budget none are; names stop at their cap", () => {
    const m = (id: string, x: number, y: number, dot = true, label = 0) => ({ id, x, y, r: 14, label, dot });
    const marks = [m("pin", 0, 0, false, 60), m("a", 3, 0), m("b", 200, 0, true, 60), m("c", 230, 0), m("d", 233, 3), m("e", 400, 0), m("f", 600, 0), m("g", 800, 0, false, 60)];
    const r = declutter(marks, { pins: 2, dots: 2, names: 1 });
    assert.deepEqual([...r.dots].sort(), ["c", "e"]);
    assert.deepEqual([...r.hidden].sort(), ["a", "d", "f"]);
    assert.deepEqual([...r.named], ["pin"]);
  });
});
