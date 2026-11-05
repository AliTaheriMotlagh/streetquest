// Explore mode: when the map has moved far enough to load again, the trip cooldown, and the north is there.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPLORE_PLACES, EXPLORE_REFETCH_M, exploreMoved, travelWaitMin } from "@/lib/explore";
import { offset } from "@/lib/geo";
import { CITIES } from "@/lib/cityPack";

describe("explore mode", () => {
  it("reloads only after a real pan", () => {
    const a = { lat: 36.58, lng: 51.96 };
    assert.equal(exploreMoved(null, a), true);
    assert.equal(exploreMoved(a, offset(a, EXPLORE_REFETCH_M / 2, 90)), false);
    assert.equal(exploreMoved(a, offset(a, EXPLORE_REFETCH_M * 1.5, 90)), true);
  });
  it("quick jumps include the north (Mazandaran, Royan) and each has a city pack nearby", () => {
    const ids = EXPLORE_PLACES.map((p) => p.id);
    for (const id of ["sari", "babol", "amol", "royan", "chalus", "rasht"]) assert.ok(ids.includes(id), id);
    for (const p of EXPLORE_PLACES) assert.ok(CITIES.some((c) => c.slug !== "iran" && p.lat >= c.south - 0.05 && p.lat <= c.north + 0.05 && p.lng >= c.west - 0.05 && p.lng <= c.east + 0.05), `${p.id} has no city pack`);
  });
  it("travel to a friend waits out the cooldown", () => {
    const now = 1_000_000_000;
    assert.equal(travelWaitMin(null, 10, now), 0);
    assert.equal(travelWaitMin(now - 3 * 60_000, 10, now), 7);
    assert.equal(travelWaitMin(now - 11 * 60_000, 10, now), 0);
    assert.equal(travelWaitMin(now, 0, now), 0);
  });
});
