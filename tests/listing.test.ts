// Every store as one listing: merging the same shop across sites, the one filter, the one order.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offset } from "@/lib/geo";
import type { Deal, TorobPlace, Vendor } from "@/lib/localData";
import type { DirStore } from "@/lib/stores/directory";
import { filterCount, filterListings, fromDeal, fromDir, fromSpot, fromTorob, fromVendor, hayOf, mergeListings, type Listing } from "@/lib/stores/listing";

const here = { lat: 35.7355, lng: 51.531 };
const at = (m: number, deg = 90) => offset(here, m, deg);
const vendor = (code: string, title: string, m: number, o: Partial<Vendor> = {}): Vendor => ({ code, title, kind: "food", ...at(m), rating: 8.6, logo: "logo.png", url: "", open: true, about: "", ...o });
const dir = (id: string, name: string, m: number, o: Partial<DirStore> = {}): DirStore => ({ id: `okala:${id}`, site: "okala", name, ...at(m), type: "grocery", cat: "سوپرمارکت", rating: 0, url: "", ...o });
const torob = (id: number, name: string, m: number): TorobPlace => ({ id, name, ...at(m), city: "تهران", address: "", photo: "", week: null, sells: ["گوشی موبایل"] });
const deal = (id: number, name: string, m: number, off: number): Deal => ({ id, name, ...at(m), district: "", category: "رستوران", rating: 4.2, reviews: 30, off, cashback: 0, photos: ["d.jpg"], items: [], url: "" });
const label = (s: string) => s;
const hay = (l: Listing) => hayOf(l, label);
const keys = (rows: { l: Listing }[]) => rows.map((r) => r.l.key);

describe("one listing per store, whatever the site", () => {
  it("the same shop on Snappfood and Takhfifan is one row with both badges and the best of each", () => {
    const list = mergeListings([fromVendor(vendor("abc", "پیتزا تله", 100))], [fromDeal(deal(7, "پیتزا تله", 130, 25))]);
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].sources, ["snappfood", "takhfifan"]);
    assert.equal(list[0].ref.type, "vendor", "opens the menu");
    assert.equal(list[0].off, 25);
    assert.equal(list[0].rating, 4.3, "Snappfood's 8.6 of 10 is 4.3 of 5");
  });
  it("different shops nearby, or one name far apart, stay apart; a source's own repeat goes", () => {
    const list = mergeListings(
      [fromVendor(vendor("a", "پیتزا تله", 100)), fromVendor(vendor("b", "کافه نادری", 110)), fromVendor(vendor("c", "پیتزا تله", 2000))],
      [fromDir(dir("1", "کافه نادری", 112)), fromDir(dir("2", "کافه نادری", 125))],
      [fromSpot({ id: "x", name: "", cat: "shop", ...at(5) })],
    );
    assert.deepEqual(list.map((l) => l.key), ["snappfood:a", "snappfood:b", "snappfood:c"]);
    assert.deepEqual(list[1].sources, ["snappfood", "okala"]);
  });
  it("kinds come from what the site says the store sells", () => {
    assert.equal(fromTorob(torob(1, "موبایل آرش", 50)).type, "digital");
    assert.equal(fromDir(dir("3", "نانوایی سنگک", 5, { type: "bakery" })).type, "bakery");
  });
});

describe("the one filter", () => {
  const list = mergeListings(
    [fromVendor(vendor("a", "پیتزا تله", 300)), fromVendor(vendor("b", "کافه نادری", 100, { kind: "cafe", open: false, rating: 9.4 }))],
    [fromTorob(torob(1, "موبایل آرش", 50))],
    [fromDeal(deal(9, "کبابی رضا", 800, 40))],
    [fromDir(dir("4", "هایپر افق", 600, { rating: 3.1 }))],
  );
  it("nearest first by default; words match name, category or type", () => {
    assert.deepEqual(keys(filterListings(list, {}, here, hay).rows), ["torob:1", "snappfood:b", "snappfood:a", "okala:4", "takhfifan:9"]);
    assert.deepEqual(keys(filterListings(list, { q: "پيتزا" }, here, hay).rows), ["snappfood:a"], "Arabic yeh finds Persian yeh");
    assert.deepEqual(keys(filterListings(list, { q: "سوپرمارکت" }, here, hay).rows), ["okala:4"]);
  });
  it("open now, rating, deals and sources narrow it; chip counts ignore their own filter", () => {
    assert.deepEqual(keys(filterListings(list, { openNow: true }, here, hay).rows), ["snappfood:a"]);
    assert.deepEqual(keys(filterListings(list, { minRating: 4.5 }, here, hay).rows), ["snappfood:b"]);
    assert.deepEqual(keys(filterListings(list, { deals: true }, here, hay).rows), ["takhfifan:9"]);
    const f = filterListings(list, { sources: ["snappfood"] }, here, hay);
    assert.equal(f.rows.length, 2);
    assert.equal(f.bySource.get("torob"), 1, "the Torob chip still says what tapping it would add");
    assert.equal(f.byType.get("digital"), undefined, "types count only what the chosen sources have");
  });
  it("sorts by rating, discount or name; counts the filters set", () => {
    assert.equal(filterListings(list, { sort: "rating" }, here, hay).rows[0].l.key, "snappfood:b");
    assert.equal(filterListings(list, { sort: "off" }, here, hay).rows[0].l.key, "takhfifan:9");
    assert.equal(filterCount({ q: "x", sort: "name" }), 0);
    assert.equal(filterCount({ sources: ["torob"], openNow: true, deals: true }), 3);
  });
});
