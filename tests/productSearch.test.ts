// Product search across the store sites: matching, price range, sorting, the one-tap price caps.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offset } from "@/lib/geo";
import type { Deal, Menu } from "@/lib/localData";
import { basalamHits, dealHits, filterProducts, menuHits, menusToRead, offOf, onceTitle, priceSteps, productRank, spreadStores, torobHits, type ProductHit } from "@/lib/productSearch";

const here = { lat: 35.7355, lng: 51.531 };
const menu = (code: string, title: string, m: number, rating: number, items: [string, number, number?, string?][]): Menu => ({
  vendor: { code, title, kind: "food", ...offset(here, m, 90), rating, logo: "", url: "", open: true, about: "" },
  cover: "", address: "", fetchedAt: "",
  sections: [{ title: "", items: items.map(([t, price, now, about], i) => ({ id: `${code}${i}`, title: t, about: about ?? "", price, priceNow: now ?? price, photo: "" })) }],
});
const near = menu("aaaaaa", "تله پیتزا", 300, 9.2, [["پیتزا پپرونی پیتزا پپرونی", 500_000, 400_000], ["سس کچاپ", 7_000], ["نان سیر", 90_000, undefined, "کنار پیتزا عالیه"]]);
const far = menu("bbbbbb", "فست فود شب", 1500, 7, [["پيتزا مخصوص", 280_000], ["برگر", 250_000], ["پیتزا بدون قیمت", 0]]);
const hitsFor = (q: string): ProductHit[] => [...menuHits(near, q, here), ...menuHits(far, q, here)];
const ids = (h: ProductHit[]) => h.map((x) => x.title);

describe("product search", () => {
  it("ranks a name that starts with the words first, then a word, then anywhere, then the description — never the store's name", () => {
    assert.equal(productRank("پیتزا پپرونی", "پیتزا"), 0);
    assert.equal(productRank("مینی پیتزا", "پیتزا"), 1);
    assert.equal(productRank("ساندویچ‌پیتزایی", "پیتزا"), 2);
    assert.equal(productRank("نان سیر", "پیتزا", "کنار پیتزا عالیه"), 3);
    assert.equal(productRank("سس کچاپ", "پیتزا"), -1);
    // Every word typed, in any order; Arabic letters and Persian digits folded.
    assert.equal(productRank("پیتزا پپرونی خانواده", "پپرونی پیتزا"), 1);
    assert.equal(productRank("پيتزا ۲ نفره", "پیتزا 2"), 0);
    assert.equal(productRank("anything", ""), 0);
  });

  it("reads a menu: each dish once, its price now and before, its vendor's spot and rating out of five", () => {
    const h = menuHits(near, "پیتزا", here);
    assert.deepEqual(ids(h), ["پیتزا پپرونی", "نان سیر"]);
    assert.equal(onceTitle("کباب کباب"), "کباب");
    assert.equal(onceTitle("کباب برگ"), "کباب برگ");
    const p = h[0];
    assert.deepEqual([p.price, p.was, offOf(p), p.code, p.rating, p.source], [400_000, 500_000, 20, "aaaaaa", 4.6, "food"]);
    assert.ok(Math.abs(p.dist! - 300) < 5);
    assert.equal(menuHits(near, "", here).length, 3, "no words: the whole menu");
  });

  it("a food under a price, cheapest first: only what's priced and in range, description-only matches left out", () => {
    const r = filterProducts(hitsFor("پیتزا"), { q: "پیتزا", max: 450_000, sort: "cheap" });
    assert.deepEqual(ids(r.hits), ["پيتزا مخصوص", "پیتزا پپرونی"]);
    assert.equal(r.total, 2);
    // By best match the garlic bread "for your pizza" is listed, last; with no price filter the unpriced pizza is too.
    assert.deepEqual(ids(filterProducts(hitsFor("پیتزا"), { q: "پیتزا" }).hits), ["پیتزا پپرونی", "پيتزا مخصوص", "پیتزا بدون قیمت", "نان سیر"]);
    // Priced before unpriced when sorting by price, either way.
    assert.equal(ids(filterProducts(hitsFor("پیتزا"), { q: "پیتزا", sort: "dear" }).hits).at(-1), "پیتزا بدون قیمت");
    assert.deepEqual(ids(filterProducts(hitsFor("پیتزا"), { q: "پیتزا", min: 300_000 }).hits), ["پیتزا پپرونی"]);
    // Nothing typed: anything under a price near me.
    assert.deepEqual(ids(filterProducts(hitsFor(""), { max: 100_000, sort: "near" }).hits), ["سس کچاپ", "نان سیر"]);
  });

  it("sorts by distance, rating and discount; filters to what's discounted and to sources; cuts to the limit", () => {
    const all = [...hitsFor(""), ...torobHits([{ title: "پیتزا پز برقی", price: 3_000_000, from: true, shop: "۱۲ فروشگاه", photo: "", url: "https://torob.com/p/1" }]), ...basalamHits([{ id: "9", name: "خمیر پیتزا خانگی", price: 60_000, img: "", url: "https://basalam.com/p/9", rating: 4.8, votes: 10, seller: "خانه نان", city: "تهران", site: "basalam" }])];
    assert.equal(filterProducts(all, { sort: "near" }).hits[0].store, "تله پیتزا");
    assert.equal(filterProducts(all, { sort: "near" }).hits.at(-1)!.dist, undefined, "stores with no spot come last by distance");
    assert.equal(filterProducts(all, { sort: "rating" }).hits[0].source, "basalam");
    assert.deepEqual(ids(filterProducts(all, { sort: "off" }).hits.slice(0, 1)), ["پیتزا پپرونی"]);
    assert.deepEqual(ids(filterProducts(all, { onlyOff: true }).hits), ["پیتزا پپرونی"]);
    assert.deepEqual(filterProducts(all, { q: "پیتزا", sources: ["torob", "basalam"], sort: "cheap" }).hits.map((h) => h.source), ["basalam", "torob"]);
    const cut = filterProducts(all, { limit: 2 });
    assert.equal(cut.hits.length, 2);
    assert.equal(cut.total, all.length);
    assert.equal(filterProducts([...all, ...all], {}).total, all.length, "each product once");
  });

  it("deals answer by their own name; the price caps are round and each leaves something in and out", () => {
    const deal: Deal = { id: 5, name: "رستوران شب", lat: here.lat, lng: here.lng, district: "", category: "رستوران", rating: 4.1, reviews: 3, off: 40, cashback: 0, photos: ["https://x/p.jpg"], items: [{ id: 1, name: "بوفه شام", price: 600_000, retail: 1_000_000, off: 40, photo: "", ends: "" }], url: "https://takhfifan.com/v/5" };
    assert.deepEqual(dealHits([deal], "شام", here).map((h) => [h.title, h.price, h.was, h.photo, h.dist]), [["بوفه شام", 600_000, 1_000_000, "https://x/p.jpg", 0]]);
    assert.deepEqual(dealHits([deal], "شب", here), [], "the store's name alone doesn't make it a hit");
    const prices = [20, 45, 80, 120, 150, 210, 260, 320, 480, 950].map((k, i) => ({ id: `x${i}`, source: "food" as const, title: "x", price: k * 1000, photo: "", store: "s" }));
    const steps = priceSteps(prices);
    assert.ok(steps.length >= 2 && steps.length <= 4, String(steps));
    for (const s of steps) {
      assert.ok(prices.some((p) => p.price <= s) && prices.some((p) => p.price > s), `${s} splits the list`);
      assert.equal(s % 5000, 0, `${s} is round`);
    }
    assert.deepEqual(priceSteps(prices.slice(0, 3)), []);
  });

  it("reads the menus a search named first, then the nearest, each once, up to the cap", () => {
    assert.deepEqual(menusToRead(["c", "a"], [{ code: "a" }, { code: "b" }, { code: "c" }, { code: "d" }], 3), ["c", "a", "b"]);
  });
});

describe("best match spreads the stores", () => {
  it("each store gets two in before any gets a third, within a match tier, order otherwise kept", () => {
    const h = (store: string, n: number, rank = 0) => ({ store, rank, id: `${store}${n}` });
    const list = [h("a", 1), h("a", 2), h("a", 3), h("a", 4), h("b", 1), h("b", 2), h("b", 3), h("c", 1), h("a", 5, 1)];
    assert.deepEqual(spreadStores(list).map((x) => x.id), ["a1", "a2", "b1", "b2", "c1", "a3", "a4", "b3", "a5"]);
  });
  it("browsing with nothing typed no longer opens with one restaurant's whole menu", () => {
    const big = menu("cccccc", "سبزی پلاس", 60, 8, Array.from({ length: 12 }, (_, i) => [`سبزی ${i}`, 100_000 + i] as [string, number]));
    const all = [...menuHits(big, "", here), ...menuHits(near, "", here), ...menuHits(far, "", here)];
    const top = filterProducts(all, {}).hits.slice(0, 6).map((x) => x.store);
    assert.ok(new Set(top).size === 3, top.join(","));
  });
});
