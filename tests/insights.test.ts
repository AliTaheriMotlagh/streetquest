import { test } from "node:test";
import assert from "node:assert/strict";
import { countBy, niceStep, priceBands, productGlance, REST, shares, storeGlance } from "../src/lib/insights";

test("price bands: round widths, outliers folded into the ends, every price counted", () => {
  const prices = [50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 120_000, 150_000, 9_000_000, 0, -1];
  const b = priceBands(prices, 10)!;
  assert.ok(b);
  assert.equal(b.bands.reduce((s, x) => s + x.n, 0), 9); // 0 and -1 aren't prices
  const w = b.bands[0].to - b.bands[0].from;
  assert.ok([1, 2, 5, 10].includes(w / 10 ** Math.floor(Math.log10(w))));
  // The 9,000,000 outlier doesn't stretch the axis to millions.
  assert.ok(b.bands[b.bands.length - 1].to < 9_000_000);
  assert.equal(b.max, 9_000_000);
  assert.equal(b.median, 90_000);
  assert.equal(b.peak, Math.max(...b.bands.map((x) => x.n)));
  assert.equal(priceBands([10, 20]), null);
  // All the same price: one band.
  assert.equal(priceBands([5, 5, 5])!.bands.reduce((s, x) => s + x.n, 0), 3);
});

test("nice steps are 1, 2 or 5 × 10ⁿ", () => {
  assert.equal(niceStep(1000, 10), 100);
  assert.equal(niceStep(1500, 10), 200);
  assert.equal(niceStep(4000, 10), 500);
  assert.equal(niceStep(0, 10), 1);
});

test("shares: largest first, the tail folded under a key no list uses", () => {
  const s = shares(new Map([["food", 50], ["cafe", 30], ["other", 10], ["bank", 6], ["gym", 4]]), 3);
  assert.deepEqual(s.map((x) => x.key), ["food", "cafe", "other", REST]);
  assert.equal(Math.round(s.reduce((a, x) => a + x.pct, 0)), 100);
  assert.equal(s[3].n, 10);
  assert.deepEqual(shares(new Map([["a", 0]])), []);
});

test("counting by one key or several", () => {
  const m = countBy([{ s: ["a", "b"] }, { s: ["a"] }, { s: null }], (r) => r.s);
  assert.deepEqual([...m], [["a", 2], ["b", 1]]);
});

test("the stores' and products' numbers", () => {
  const g = storeGlance([
    { open: true, off: 0, rating: 4, m: 300 },
    { open: false, off: 20, rating: 5, m: 90 },
    { open: null, off: 0, rating: 0, m: null },
  ]);
  assert.deepEqual(g, { total: 3, open: 1, known: 2, deals: 1, rated: 2, avgRating: 4.5, nearM: 90 });
  const p = productGlance([
    { price: 100, store: "A" },
    { price: 80, was: 100, store: "B" },
    { price: 0, store: "B" },
    { price: 300, was: 400, store: "C" },
  ]);
  assert.deepEqual(p, { total: 4, priced: 3, cheapest: 80, median: 100, discounted: 2, bestOff: 25, stores: 3 });
});
