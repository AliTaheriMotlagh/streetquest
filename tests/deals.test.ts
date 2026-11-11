// Takhfifan deals on the map: a store row from its search → a deal (toman, best % off,
// cashback), and only the stores really near you, each once.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dealOf, dealsNear } from "@/lib/localData";

// Trimmed from a real /v4/api/universal_search/search row.
const row = {
  id: 5586,
  name: "رستوران هتل بلوط ولنجک",
  review_rate: 4.6,
  review_count: 191,
  max_discount_percentage: 15.0,
  max_cashback_percentage: 0.0,
  category: { name: "رستوران و کافی شاپ" },
  location: { lat: 35.7985872217, lon: 51.4044392238, area: "منطقه 1", district: "ولنجک" },
  images: [{ url: "https://cdn.takhfifan.com/a.png" }, { url: "" }],
  products: [
    { id: 291391, name: "بوفه صبحانه", price: 8202500, retail_price: 9650000, discount_percentage: 15.0, image: "https://cdn.takhfifan.com/p.jpg", deal_end_date: "2026-11-21T07:34:00.000+00:00" },
    { id: 1, name: "free", price: 0 },
  ],
};

describe("Takhfifan deals", () => {
  it("a store row: rials to toman, its best discount, photos and deals", () => {
    const d = dealOf(row)!;
    assert.equal(d.off, 15);
    assert.equal(d.district, "ولنجک");
    assert.deepEqual(d.photos, ["https://cdn.takhfifan.com/a.png"]);
    assert.equal(d.items.length, 1, "a deal with no price is left out");
    assert.equal(d.items[0].price, 820250);
    assert.equal(d.items[0].retail, 965000);
    assert.equal(d.url, "https://takhfifan.com/vendor/5586");
  });

  it("cashback-only stores count; nothing off, or no real spot (Takhfifan's 0.1, 0.1), is no deal", () => {
    assert.equal(dealOf({ ...row, max_discount_percentage: 0, products: [], max_cashback_percentage: 5 })!.cashback, 5);
    assert.equal(dealOf({ ...row, max_discount_percentage: 0, products: [], max_cashback_percentage: 0 }), null);
    assert.equal(dealOf({ ...row, location: { lat: 0.1, lon: 0.1 } }), null);
    assert.equal(dealOf({ ...row, name: " " }), null);
  });

  it("dealsNear: within the radius, each store once, nearest first", () => {
    const here = { lat: 35.7985, lng: 51.4044 };
    const a = dealOf(row)!, far = { ...a, id: 2, lat: 35.9 }, near2 = { ...a, id: 3, lat: 35.7995 };
    assert.deepEqual(dealsNear([near2, a, far, a], here, 2500).map((d) => d.id), [5586, 3]);
  });
});
