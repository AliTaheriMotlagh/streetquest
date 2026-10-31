// Flying low enough for pick-ups (lib/vehicles.ts lowEnough): the line has a little
// give on the way back up, so hovering at it over uneven roofs doesn't flip the HUD.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAND_ALT_M, LAND_HYSTERESIS_M, lowEnough } from "@/lib/vehicles";

describe("low enough to pick things up", () => {
  it("always, for anything that doesn't fly", () => {
    assert.equal(lowEnough(false, 500, false), true);
  });

  it("comes down under the line, climbs back out a little above it", () => {
    assert.equal(lowEnough(true, LAND_ALT_M + 1, false), false);
    assert.equal(lowEnough(true, LAND_ALT_M, false), true);
    assert.equal(lowEnough(true, LAND_ALT_M + 1, true), true, "a bump over a roof keeps it");
    assert.equal(lowEnough(true, LAND_ALT_M + LAND_HYSTERESIS_M + 0.1, true), false);
  });

  it("holds steady while the altitude wobbles around the line", () => {
    let low = false, flips = 0;
    for (let i = 0; i < 200; i++) {
      const next = lowEnough(true, LAND_ALT_M + Math.sin(i * 0.7) * 2, low);
      if (next !== low) flips++;
      low = next;
    }
    assert.ok(flips <= 1, `${flips} flips`);
  });
});
