// Explore mode: when the map has moved far enough to load again, the trip cooldown, and the north is there.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPLORE_PLACES, EXPLORE_REFETCH_M, exploreMoved, searchPlaces, travelWaitMin } from "@/lib/explore";
import type { Place } from "@/lib/places";
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
  it("search finds a store by name however it's spelt, best match then nearest first", () => {
    const here = { lat: 35.7, lng: 51.4 };
    const at = (m: number) => offset(here, m, 90);
    const places: Place[] = [
      { id: "far-burger", name: "برگرلند", cat: "burger", ...at(2000) },
      { id: "near-burger", name: "برگر لند (شعبه تهرانپارس)", cat: "burger", ...at(300) },
      { id: "kebab", name: "چلوكباب علي", cat: "restaurant", ...at(100) },
      { id: "inside", name: "کافه برگرلندیها", cat: "cafe", ...at(50) },
      { id: "drug", name: "دکتر رضایی", cat: "pharmacy", ...at(400) },
      { id: "nameless", name: "", cat: "pharmacy", ...at(10) },
    ];
    // Spaced or not, it's one name; the nearer branch first, a name that only contains it last.
    assert.deepEqual(searchPlaces(places, "برگرلند", here).map((p) => p.id), ["near-burger", "far-burger", "inside"]);
    assert.deepEqual(searchPlaces(places, "برگر لند", here).map((p) => p.id), ["near-burger", "far-burger", "inside"]);
    // Arabic ي / ك typed for Persian ی / ک.
    assert.deepEqual(searchPlaces(places, "چلوکباب علی", here).map((p) => p.id), ["kebab"]);
    // A kind, in the player's language, through labelOf.
    assert.deepEqual(searchPlaces(places, "داروخانه", here, { labelOf: (c) => (c === "pharmacy" ? "داروخانه" : "") }).map((p) => p.id), ["drug"]);
    // A kind alone lists it by distance; nothing typed and no kind is nothing.
    assert.deepEqual(searchPlaces(places, "", here, { cats: ["burger"] }).map((p) => p.id), ["near-burger", "far-burger"]);
    assert.deepEqual(searchPlaces(places, " ", here), []);
    const hit = searchPlaces(places, "رضایی", here, { max: 1 })[0];
    assert.equal(hit.id, "drug");
    assert.ok(Math.abs(hit.dist - 400) < 5 && !("rank" in hit));
  });
});
