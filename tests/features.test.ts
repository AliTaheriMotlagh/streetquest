import { test } from "node:test";
import assert from "node:assert/strict";
import { CUTS, liteCity, offCuts } from "../src/lib/perf/features";

test("the lite city follows the player's switch and the low tier", () => {
  assert.equal(liteCity(true, "ultra"), true);
  assert.equal(liteCity(false, "low"), true);
  for (const t of ["medium", "high", "ultra"] as const) assert.equal(liteCity(false, t), false);
});

test("Settings lists every cut on the lite city and none on the full one", () => {
  assert.deepEqual(offCuts(false, "high"), []);
  assert.deepEqual(offCuts(false, "low"), CUTS.map((c) => c.id));
  assert.deepEqual(offCuts(true, "ultra"), CUTS.map((c) => c.id));
  assert.equal(new Set(CUTS.map((c) => c.id)).size, CUTS.length);
});
