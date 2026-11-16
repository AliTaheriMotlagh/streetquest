import assert from "node:assert/strict";
import { test } from "node:test";
import { plateFor, plateText, PLATE_LETTERS } from "../src/lib/plate";

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
