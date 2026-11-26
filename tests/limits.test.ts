// Per-player limits (lib/limits.ts): a sliding window, and how long until the next one is allowed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, waitMinutes } from "@/lib/limits";

const NOW = 10_000_000_000, MIN = 60_000, HOUR = 60 * MIN;

describe("limits", () => {
  it("allowed under the cap; old ones drop out of the window", () => {
    assert.equal(waitMinutes([], 3, HOUR, NOW), 0);
    assert.equal(waitMinutes([NOW - MIN, NOW - 2 * MIN], 3, HOUR, NOW), 0);
    assert.equal(waitMinutes([NOW - MIN, NOW - 2 * MIN, NOW - 2 * HOUR], 3, HOUR, NOW), 0, "one is outside the window");
  });
  it("at the cap: wait until the oldest in the window leaves it (at least a minute)", () => {
    assert.equal(waitMinutes([NOW - 10 * MIN, NOW - 20 * MIN, NOW - 50 * MIN], 3, HOUR, NOW), 10);
    assert.equal(waitMinutes([NOW - 1000, NOW - 2000, NOW - HOUR + 1000], 3, HOUR, NOW), 1);
    assert.equal(waitMinutes([NOW - 5 * MIN, NOW - 6 * MIN, NOW - 7 * MIN, NOW - 30 * MIN], 3, HOUR, NOW), 53, "two must leave: the 30-min one, then the 7-min one");
  });
  it("every limit is sane and says how long", () => {
    for (const l of Object.values(LIMITS)) {
      assert.ok(l.max >= 1 && l.windowMs >= MIN);
      assert.match(l.text, /\{n\}/);
    }
  });
});
