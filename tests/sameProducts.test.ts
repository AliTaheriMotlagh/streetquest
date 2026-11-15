import { test } from "node:test";
import assert from "node:assert/strict";
import { nameLikeness, sameProducts, type ProductHit } from "../src/lib/productSearch";

const hit = (id: string, title: string, store: string, price: number, over: Partial<ProductHit> = {}): ProductHit => ({ id, source: "torob", title, store, price, photo: "", ...over });

test("names alike by their words, not their order", () => {
  assert.equal(nameLikeness("گوشی سامسونگ A55 256GB", "سامسونگ A55 256GB گوشی"), 1);
  assert.ok(nameLikeness("Samsung A55 256GB", "Samsung A55 128GB") < 0.6);
  assert.equal(nameLikeness("", "x y"), 0);
});

test("the same product in several stores: cheapest first, how much the cheapest saves", () => {
  const groups = sameProducts([
    hit("1", "Samsung Galaxy A55 256GB", "Shop A", 30_000_000),
    hit("2", "Galaxy A55 256GB Samsung", "Shop B", 24_000_000),
    hit("3", "Samsung Galaxy A55 256GB", "Shop A", 31_000_000),
    hit("4", "Coffee beans 1kg", "Cafe", 900_000),
    hit("5", "Coffee beans 1kg", "Cafe", 950_000),
  ]);
  assert.equal(groups.length, 1); // the coffee is one store only
  assert.equal(groups[0].stores, 2);
  assert.deepEqual(groups[0].hits.map((h) => h.id), ["2", "1", "3"]);
  assert.equal(groups[0].save, Math.round((1 - 24 / 31) * 100));
});

test("no price, a 'from' price or another currency never joins a group", () => {
  const g = sameProducts([hit("1", "Pizza", "A", 0), hit("2", "Pizza", "B", 500_000, { from: true }), hit("3", "Pizza", "C", 400_000, { currency: "TRY" }), hit("4", "Pizza", "D", 300_000)]);
  assert.equal(g.length, 0);
});
