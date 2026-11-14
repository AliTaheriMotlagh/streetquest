import { test } from "node:test";
import assert from "node:assert/strict";
import { alternatives, amount, asciiDigits, nearWord, parseQuery, scaleBare, shopQuery, typoDistance, withoutPart } from "../src/lib/search/query";
import { filterProducts, productRank, type ProductHit } from "../src/lib/productSearch";

test("prices said in Persian, English and Turkish", () => {
  const p = parseQuery("پیتزا زیر ۳۰۰ هزار");
  assert.equal(p.words, "پیتزا");
  assert.equal(p.max, 300_000);
  assert.deepEqual(parseQuery("pizza under 300k").max, 300_000);
  assert.deepEqual([parseQuery("کفش بین ۱ تا ۲ میلیون").min, parseQuery("کفش بین ۱ تا ۲ میلیون").max], [1_000_000, 2_000_000]);
  assert.deepEqual([parseQuery("burger 200-400 bin").min, parseQuery("burger 200-400 bin").max], [200_000, 400_000]);
  assert.equal(parseQuery("over 1.5m laptop").min, 1_500_000);
  assert.equal(parseQuery("پیتزا تا 250,000 تومن").max, 250_000);
  const tr = parseQuery("döner 300 TL altı en yakın");
  assert.deepEqual([tr.words, tr.max, tr.sort, tr.bare], ["döner", 300, "near", false]);
  // "iphone 13 and 14" is not a price.
  assert.equal(parseQuery("iphone 13 and 14").words, "iphone 13 and 14");
  assert.equal(parseQuery("iphone 13 and 14").min, undefined);
});

test("a bare number means thousands of toman, but lira as said", () => {
  const p = parseQuery("قهوه زیر ۸۰");
  assert.ok(p.bare);
  assert.deepEqual(scaleBare(p, false), { min: undefined, max: 80_000 });
  assert.deepEqual(scaleBare(p, true), { min: undefined, max: 80 });
});

test("order, discounts, trips and undoing one", () => {
  const p = parseQuery("ارزان‌ترین پیتزا تخفیف‌دار");
  assert.deepEqual([p.words, p.sort, p.onlyOff], ["پیتزا", "cheap", true]);
  assert.deepEqual(p.parts.map((x) => x.kind), ["sort", "off"]);
  assert.equal(withoutPart("ارزان‌ترین پیتزا تخفیف‌دار", p.parts[1].text), "ارزان‌ترین پیتزا");
  assert.equal(parseQuery("بلیط مشهد").trip?.city.key, "mashhad");
  assert.equal(parseQuery("hotel in shiraz").trip?.kind, "hotel");
  assert.equal(parseQuery("pizza").trip, undefined);
});

test("digits and amounts", () => {
  assert.equal(asciiDigits("۲٬۵۰۰"), "2,500");
  assert.equal(amount("2.5", "میلیون"), 2_500_000);
  assert.equal(amount("300,000"), 300_000);
  assert.equal(amount("1.500.000"), 1_500_000);
});

test("the same thing in every language, and typos", () => {
  assert.ok(alternatives("pizza").includes("پیتزا"));
  assert.ok(alternatives("kebap").includes("کباب"));
  assert.equal(shopQuery("pizza"), "پیتزا");
  assert.equal(shopQuery("پیتزا"), "پیتزا");
  assert.equal(shopQuery("phone case"), "قاب گوشی");
  assert.equal(typoDistance("piza", "pizza"), 1);
  assert.equal(typoDistance("pzzia", "pizza"), 2);
  assert.ok(nearWord("piza", "pizza margarita"));
  assert.ok(!nearWord("pi", "pizza"), "short words need to be exact");
  // Product ranks: English finds the Persian menu, a typo still finds it (last).
  assert.equal(productRank("پیتزا مخصوص", "pizza"), 0);
  assert.equal(productRank("Pizza Margherita", "piza"), 4);
  assert.equal(productRank("نوشابه", "pizza"), -1);
});

test("rating and distance filters, and counts per source", () => {
  const h = (id: string, source: ProductHit["source"], rating: number, dist?: number): ProductHit => ({ id, source, title: "پیتزا", price: 100, photo: "", store: id, rating, dist });
  const hits = [h("a", "food", 4.6, 300), h("b", "food", 3.9, 800), h("c", "deal", 4.2, 2500), h("d", "torob", 0)];
  const r = filterProducts(hits, { q: "pizza", minRating: 4 });
  assert.deepEqual(r.hits.map((x) => x.id).sort(), ["a", "c"]);
  assert.deepEqual(filterProducts(hits, { maxDist: 1000 }).hits.map((x) => x.id).sort(), ["a", "b"]);
  const only = filterProducts(hits, { sources: ["deal"] });
  assert.equal(only.total, 1);
  assert.deepEqual(only.bySource, { food: 2, deal: 1, torob: 1 });
});
