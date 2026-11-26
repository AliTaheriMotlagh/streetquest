import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOf, cheapestDay, nextAvailable, shortToman, windowDays } from "../src/lib/travel/calendar";
import type { Trip } from "../src/lib/travel";

const trip = (mode: Trip["mode"], price: number, seats?: number): Trip => ({ id: `${mode}:${price}`, mode, from: "tehran", to: "shiraz", depart: "2026-12-01T08:00:00", price, seats, company: "x", offers: [] });

test("the days searched ahead: nearest first, inside the strip, never before its first day", () => {
  assert.deepEqual(windowDays("2026-12-10", "2026-12-01", "2026-12-21"), ["2026-12-10", "2026-12-11", "2026-12-09", "2026-12-12", "2026-12-08", "2026-12-13", "2026-12-07"]);
  assert.deepEqual(windowDays("2026-12-01", "2026-12-01", "2026-12-21"), ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
  assert.deepEqual(windowDays("2026-12-21", "2026-12-01", "2026-12-21", 1, 3), ["2026-12-21", "2026-12-20"]);
  // Across a month end.
  assert.ok(windowDays("2026-12-31", "2026-12-01", "2027-01-10").includes("2027-01-02"));
});

test("a day's cell: the cheapest per way with enough seats for everyone", () => {
  const c = cellOf([trip("bus", 900_000, 20), trip("bus", 700_000, 1), trip("flight", 3_000_000), trip("train", 1_200_000, 0)], 2);
  assert.deepEqual(c.bus, { min: 900_000, n: 1 }); // the 700k bus has one seat for two people
  assert.deepEqual(c.flight, { min: 3_000_000, n: 1 }); // seats unknown: counted
  assert.equal(c.train, undefined); // sold out
  assert.deepEqual(cellOf([]), {});
});

test("next available and the cheapest day for the way picked", () => {
  const days = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"];
  const cells = { "2026-12-01": {}, "2026-12-02": { bus: { min: 800_000, n: 3 } }, "2026-12-04": { bus: { min: 650_000, n: 1 }, flight: { min: 2e6, n: 2 } } };
  assert.equal(nextAvailable(cells, days, "bus", "2026-12-01"), "2026-12-02");
  assert.equal(nextAvailable(cells, days, "bus", "2026-12-02"), "2026-12-04");
  assert.equal(nextAvailable(cells, days, "train", "2026-12-01"), null);
  assert.equal(cheapestDay(cells, days, "bus"), "2026-12-04");
  assert.equal(cheapestDay(cells, days, "flight"), null); // one known day: nothing to compare
});

test("short prices for the chips", () => {
  assert.deepEqual(shortToman(1_250_000), { n: 1.25, unit: "M" });
  assert.deepEqual(shortToman(12_345_678), { n: 12.3, unit: "M" });
  assert.deepEqual(shortToman(870_400), { n: 870, unit: "K" });
  assert.deepEqual(shortToman(950), { n: 950, unit: "" });
});
