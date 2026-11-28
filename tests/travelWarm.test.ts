import { test } from "node:test";
import assert from "node:assert/strict";
import { iranDay, warmCities, warmSearches, WARM_DAYS, WARM_FROM_TEHRAN, WARM_OTHER } from "../src/lib/travel/warm";
import { cityByKey } from "../src/lib/travel";

test("warm-up: busy routes both ways for today and the next days, soonest first, every city known", () => {
  // 2026-11-28 22:00 UTC is already the 29th in Iran (01:30).
  const now = Date.parse("2026-11-28T22:00:00Z");
  assert.equal(iranDay(now), "2026-11-29");
  assert.equal(iranDay(now, 2), "2026-12-01");
  const list = warmSearches(now);
  const perDay = (WARM_FROM_TEHRAN.length + WARM_OTHER.length) * 2;
  assert.equal(list.length, perDay * WARM_DAYS, "every route and city is known to the planner");
  assert.ok(list.slice(0, perDay).every((s) => s.date === "2026-11-29"), "today first");
  assert.ok(list.some((s) => s.from === "tehran" && s.to === "kish") && list.some((s) => s.from === "kish" && s.to === "tehran"));
  assert.equal(new Set(list.map((s) => `${s.from}>${s.to}@${s.date}`)).size, list.length, "no search twice");
  assert.ok(list.every((s) => s.from !== s.to && cityByKey(s.from) && cityByKey(s.to)));
  assert.ok(warmCities().includes("kish") && warmCities().every((c) => cityByKey(c)));
});
