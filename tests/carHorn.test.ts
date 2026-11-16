import assert from "node:assert/strict";
import { test } from "node:test";
import { hornFor } from "../src/lib/street/carHorn";

test("each vehicle keeps its own horn: bikes beep high, buses blare low", () => {
  assert.deepEqual(hornFor("peykan"), hornFor("peykan"));
  assert.ok(hornFor("moto").rate > hornFor("pride").rate);
  assert.ok(hornFor("pride").rate > hornFor("bus").rate);
  assert.ok(hornFor("bus").vol > hornFor("pride").vol);
  assert.equal(hornFor("heli").rate, 1);
});
