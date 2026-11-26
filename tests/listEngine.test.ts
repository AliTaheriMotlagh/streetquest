// The shared list engine (lib/listEngine.ts) and a shop's products declared for it (lib/shopList.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chipCounts, matches, priceSpan, runList, words } from "@/lib/listEngine";
import { PRODUCT_LIST, type ListedProduct } from "@/lib/shopList";

const p = (title: string, priceNow: number, over: Partial<ListedProduct> = {}): ListedProduct => ({ title, priceNow, deal: 0, stock: 3, sold: 0, ...over });
const shelf = [
  p("کیک شکلاتی", 120_000, { sold: 9 }),
  p("کيك وانیلی", 90_000, { deal: 20 }), // Arabic ي and ك, as some keyboards type them
  p("Chocolate cookies", 60_000, { stock: 0, sold: 30 }),
  p("نان بربری ۲ عدد", 15_000, { description: "تازه، هر صبح" }),
];
const titles = (l: ListedProduct[]) => l.map((x) => x.title);

describe("list engine: search", () => {
  it("folds Persian/Arabic letters and digits; every word, any order", () => {
    assert.deepEqual(words(" کیک  شکلاتی "), ["کیک", "شکلاتی"]);
    assert.ok(matches("کيك وانیلی", words("کیک")));
    assert.ok(matches("نان بربری ۲ عدد", words("2 بربری")));
    assert.ok(!matches("کیک شکلاتی", words("کیک نان")));
    assert.ok(matches("anything", []));
  });
  it("finds by title, description and across scripts' spellings", () => {
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { q: "کیک" })), ["کیک شکلاتی", "کيك وانیلی"]);
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { q: "تازه" })), ["نان بربری ۲ عدد"]);
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { q: "CHOCO" })), ["Chocolate cookies"]);
  });
});

describe("list engine: sort, chips, price", () => {
  it("sorts (sold out always last, ties keep the server's order)", () => {
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { sort: "cheap" })), ["نان بربری ۲ عدد", "کيك وانیلی", "کیک شکلاتی", "Chocolate cookies"]);
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { sort: "popular" })).slice(0, 2), ["کیک شکلاتی", "کيك وانیلی"], "the best seller is sold out: last");
    assert.equal(titles(runList(shelf, PRODUCT_LIST, { sort: "new" })).at(-1), "Chocolate cookies");
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { sort: "deal" }))[0], "کيك وانیلی");
  });
  it("chips filter together; their counts say what each would show with the rest of the query", () => {
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { on: ["sale"] })), ["کيك وانیلی"]);
    assert.equal(runList(shelf, PRODUCT_LIST, { on: ["inStock"] }).length, 3);
    assert.deepEqual(chipCounts(shelf, PRODUCT_LIST), { sale: 1, inStock: 3 });
    assert.deepEqual(chipCounts(shelf, PRODUCT_LIST, { q: "cookies" }), { sale: 0, inStock: 0 });
    assert.deepEqual(chipCounts(shelf, PRODUCT_LIST, { on: ["sale"] }), { sale: 1, inStock: 1 }, "a chip's own count ignores itself");
  });
  it("a price range, and the span for its hints", () => {
    assert.deepEqual(titles(runList(shelf, PRODUCT_LIST, { min: 50_000, max: 100_000 })), ["کيك وانیلی", "Chocolate cookies"]);
    assert.deepEqual(priceSpan(shelf, (x) => x.priceNow), { min: 15_000, max: 120_000 });
    assert.equal(priceSpan([], (x: ListedProduct) => x.priceNow), null);
  });
  it("leaves the input alone", () => {
    const before = titles(shelf);
    runList(shelf, PRODUCT_LIST, { sort: "cheap", q: "کیک" });
    assert.deepEqual(titles(shelf), before);
  });
});
