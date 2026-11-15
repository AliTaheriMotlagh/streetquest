import { test } from "node:test";
import assert from "node:assert/strict";
import { LIST_TABS, parseListTab } from "../src/lib/listTabs";

test("list view sections: every key parses back, anything else is the stores", () => {
  for (const s of LIST_TABS) assert.equal(parseListTab(s.key), s.key);
  assert.equal(parseListTab(null), "stores");
  assert.equal(parseListTab("map"), "stores");
  assert.equal(new Set(LIST_TABS.map((s) => s.key)).size, LIST_TABS.length);
});

import { catOfTags, PLACE_CATS } from "../src/lib/places";
import { typeOf } from "../src/lib/stores/directory";

test("every kind of shop gets its own category on the map (cigarette shops too)", () => {
  assert.equal(catOfTags({ shop: "tobacco" }), "tobacco");
  assert.equal(catOfTags({ shop: "e-cigarette" }), "tobacco");
  assert.equal(catOfTags({ shop: "hairdresser" }), "beauty");
  assert.equal(catOfTags({ shop: "hardware" }), "home");
  assert.equal(catOfTags({ shop: "car_repair" }), "auto");
  assert.equal(catOfTags({ shop: "florist" }), "gifts");
  assert.equal(catOfTags({ amenity: "veterinary" }), "pets");
  assert.equal(catOfTags({ amenity: "dentist" }), "health");
  assert.equal(catOfTags({ shop: "something_new" }), "shop", "anything else is still a shop");
  for (const c of ["tobacco", "beauty", "home", "auto", "gifts", "pets", "health"] as const) assert.ok(PLACE_CATS[c].emoji);
  assert.equal(typeOf("سیگار فروشی آرش"), "tobacco");
  assert.equal(typeOf("کافه قلیان سنتی"), "cafe", "a hookah café is a café");
});
