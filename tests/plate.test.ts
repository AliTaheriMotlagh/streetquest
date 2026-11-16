import assert from "node:assert/strict";
import { test } from "node:test";
import { PLATE_CELLS, plateCell, plateFor, plateSeed, PLATE_TAXI, plateText, PLATE_LETTERS } from "../src/lib/plate";

test("number plates: the Iranian layout, stable per seed, taxis get ت", () => {
  const p = plateFor(1234);
  assert.deepEqual(p, plateFor(1234));
  assert.match(p.two, /^[1-9][0-9]$/);
  assert.match(p.three, /^[1-9][0-9]{2}$/);
  assert.match(p.region, /^[1-9][0-9]$/);
  assert.ok((PLATE_LETTERS as readonly string[]).includes(p.letter));
  assert.equal(plateFor(1234, true).letter, "ت");
  assert.notDeepEqual(plateFor(1), plateFor(2));
  assert.match(plateText(p), /^[۰-۹]{2} . [۰-۹]{3} \| [۰-۹]{2}$/);
});

test("traffic plates: a car keeps its cell of the sheet; taxis get the yellow cells, others never do", () => {
  const taxiFrom = PLATE_CELLS - PLATE_TAXI;
  for (const seed of [0, 1, 7, 63, 64, 1234, -5, 2 ** 31 - 1]) {
    const c = plateCell(seed, false), y = plateCell(seed, true);
    assert.equal(c, plateCell(seed, false));
    assert.ok(Number.isInteger(c) && c >= 0 && c < taxiFrom, `private ${seed} → ${c}`);
    assert.ok(y >= taxiFrom && y < PLATE_CELLS, `taxi ${seed} → ${y}`);
  }
  // Each cell is a real plate: the yellow ones say ت.
  assert.equal(plateFor(plateSeed(taxiFrom), true).letter, "ت");
  assert.notEqual(plateFor(plateSeed(0)).letter, "ت");
  // Different cars mostly look different.
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => plateCell(i * 31, false))).size > 20);
});
