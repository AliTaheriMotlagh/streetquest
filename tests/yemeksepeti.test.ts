import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dishesOfYs, getirSearch, isYsCode, menuOfYs, reviewsOfYs, VENDOR_CODE, vendorOfYs, ysCode, ysKind, ysRaw, type RawYsReview, type RawYsVendor } from "@/lib/yemeksepeti";

const vendor: RawYsVendor = {
  code: "x3nw",
  name: "Take Sushi ",
  latitude: 41.04,
  longitude: 28.99,
  rating: 4.64,
  review_number: 334,
  logo: "https://images.deliveryhero.io/logo.jpg",
  hero_image: "https://images.deliveryhero.io/hero.jpg",
  web_path: "https://yemeksepeti.com/restaurant/x3nw/take-sushi",
  address: "Kemankeş Cd. 19",
  customer_phone: "+905301258795",
  minimum_order_amount: 250,
  minimum_delivery_fee: 0,
  cuisines: [{ name: "Uzak Doğu" }, { name: "Suşi" }],
  metadata: { is_delivery_available: true, is_temporary_closed: false },
};
const dish = (id: string, title: string, unitPrice: number) => ({ id, defaultTitle: title, unitPrice, product: { id: `p${id}`, defaultTitle: title, description: `${title} desc`, imageUrls: [`https://img/${id}.jpg`] } });
const reviews: RawYsReview[] = [
  { uuid: "a", createdAt: "2026-11-13T18:22:33Z", text: "Çok iyi", reviewerName: "...n", ratings: [{ topic: "overall", score: 5 }], replies: [{ text: "Teşekkürler" }], productVariations: [dish("1", "California Roll", 1043.75), dish("2", "Miso Soup", 300)] },
  { uuid: "b", createdAt: "2026-11-10T10:00:00Z", text: "", isAnonymous: true, reviewerName: "Ali", ratings: [{ topic: "restaurant_food", score: 2 }, { topic: "overall", score: 1 }], productVariations: [dish("2", "Miso Soup", 280)] },
  { uuid: "c", createdAt: "2026-11-09T10:00:00Z", text: "ok", ratings: [], productVariations: [{ id: "3", defaultTitle: "" }] },
];

describe("Yemeksepeti on the store card", () => {
  it("keeps its codes apart from Snappfood's", () => {
    assert.equal(ysCode("X3NW"), "ys-x3nw");
    assert.ok(isYsCode("ys-x3nw") && !isYsCode("abc123"));
    assert.equal(ysRaw("ys-x3nw"), "x3nw");
    for (const ok of ["abc123", "ys-x3nw", "ys-f8kt"]) assert.ok(VENDOR_CODE.test(ok), ok);
    for (const bad of ["ys-", "ab12", "ys-../x", "YS-x3nw", "abc1234"]) assert.ok(!VENDOR_CODE.test(bad), bad);
  });

  it("reads a vendor: its own page link, open when it delivers, kind by cuisine", () => {
    const v = vendorOfYs(vendor)!;
    assert.equal(v.code, "ys-x3nw");
    assert.equal(v.title, "Take Sushi");
    assert.equal(v.rating, 4.6);
    assert.equal(v.url, "https://yemeksepeti.com/restaurant/x3nw/take-sushi");
    assert.ok(v.open);
    assert.equal(v.about, "Uzak Doğu, Suşi");
    assert.equal(vendorOfYs({ ...vendor, metadata: { is_temporary_closed: true } })!.open, false);
    // A link that isn't Yemeksepeti's own is never followed.
    assert.equal(vendorOfYs({ ...vendor, web_path: "https://evil.example/x" })!.url, "https://www.yemeksepeti.com/restaurant/x3nw");
    assert.equal(vendorOfYs({ ...vendor, latitude: undefined }), null);
    assert.equal(ysKind(["Kahve & İçecek"]), "cafe");
    assert.equal(ysKind(["Pastane & Fırın"]), "sweets");
    assert.equal(ysKind(["Döner"]), "food");
  });

  it("turns reviews into ours: overall stars, date, dishes, the answer; anonymous has no name", () => {
    const [a, b] = reviewsOfYs(reviews);
    assert.deepEqual(a, { id: "a", who: "n", date: "2026-11-13", rate: 5, text: "Çok iyi", foods: ["California Roll", "Miso Soup"], reply: "Teşekkürler" });
    assert.equal(b.who, "");
    assert.equal(b.rate, 1);
  });

  it("builds the menu from what was ordered: each dish once, newest price, most ordered first", () => {
    const [s] = dishesOfYs(reviews);
    assert.deepEqual(s.items.map((i) => [i.title, i.price]), [["Miso Soup", 300], ["California Roll", 1043.75]]);
    assert.equal(s.items[1].photo, "https://img/1.jpg");
    assert.deepEqual(dishesOfYs([]), []);
  });

  it("makes a menu in lira with the vendor's phone and terms", () => {
    const m = menuOfYs(vendor, reviews, new Date("2026-11-14T00:00:00Z"))!;
    assert.equal(m.currency, "TRY");
    assert.equal(m.source, "yemeksepeti");
    assert.equal(m.phone, "+905301258795");
    assert.equal(m.reviews, 334);
    assert.equal(m.minOrder, 250);
    assert.equal(m.deliveryFee, 0);
    assert.equal(m.cover, "https://images.deliveryhero.io/hero.jpg");
    assert.equal(m.sections[0].items.length, 2);
    assert.equal(menuOfYs(null, reviews), null);
  });

  it("searches Getir for the store without its branch suffix", () => {
    assert.equal(getirSearch("Köfteci Yusuf (Kadıköy)"), `https://www.google.com/search?q=${encodeURIComponent("Köfteci Yusuf getir yemek")}`);
  });
});
