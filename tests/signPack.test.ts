import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packAlong } from "@/lib/signPack";

const overlaps = (o: { at: number; w: number; row: number }[], gap = 0.3) => {
  for (let i = 0; i < o.length; i++)
    for (let j = i + 1; j < o.length; j++)
      if (o[i].row >= 0 && o[i].row === o[j].row && Math.abs(o[i].at - o[j].at) < (o[i].w + o[j].w) / 2 + gap - 1e-6) return true;
  return false;
};

describe("shop signs on one wall", () => {
  it("a lone sign stays over its door, inside the wall", () => {
    const [a] = packAlong([{ at: 5, w: 3 }], 20);
    assert.deepEqual(a, { at: 5, w: 3, row: 0 });
    const [b] = packAlong([{ at: 0.2, w: 3 }], 20);
    assert.ok(b.at - b.w / 2 >= 0.2 - 1e-9, "not hanging off the corner");
  });

  it("two shops next door slide apart side by side instead of stacking", () => {
    const o = packAlong([{ at: 10, w: 4 }, { at: 10.5, w: 4 }], 30);
    assert.equal(o[0].row, 0);
    assert.equal(o[1].row, 0);
    assert.ok(!overlaps(o));
    assert.ok(o[0].at < o[1].at, "order along the wall is kept");
    assert.ok(Math.abs((o[0].at + o[1].at) / 2 - 10.25) < 0.01, "the pair stays centred on their doors");
  });

  it("a crowded wall shrinks the boards before using a second row", () => {
    const o = packAlong([{ at: 3, w: 4 }, { at: 4, w: 4 }, { at: 5, w: 4 }], 9);
    assert.ok(o.every((x) => x.row === 0));
    assert.ok(o.every((x) => x.w >= 1.8 && x.w < 4));
    assert.ok(!overlaps(o));
    assert.ok(o.every((x) => x.at - x.w / 2 >= 0.2 - 1e-6 && x.at + x.w / 2 <= 8.8 + 1e-6));
  });

  it("too many for one band: the rest go up a row, spread over the wall; past two rows, no board", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ at: 1 + i * 0.5, w: 3 }));
    const o = packAlong(items, 8.5);
    assert.ok(!overlaps(o));
    const r0 = o.filter((x) => x.row === 0).length, r1 = o.filter((x) => x.row === 1).length, none = o.filter((x) => x.row < 0).length;
    assert.equal(r0, 4);
    assert.equal(r1, 4);
    assert.equal(none, 1);
  });

  it("a wall too short for any board keeps the shops without one", () => {
    assert.ok(packAlong([{ at: 0.5, w: 3 }], 1.5).every((x) => x.row === -1));
  });
});
