// Takhfifan's nearby map and vendor page: a list row → a deal on the map, a vendor page (+ its
// deals) → the store card (toman, hours, phones, cashback), its comments, and the map's box.
// Fixtures are trimmed from real answers (2026-11-11) of /v6/api/taxonomy/collections/nearby/vendors/nearby,
// /v5/api/magento/vendors/<id>[/products] and /v4/api/commentify/entities/core/vendor/<id>/comments.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dealInfoOf, dealOfPoi, dealReviewsOf, htmlText, nearbyBox, openState, weekFromTakhfifan, zoneOf } from "@/lib/localData";

const poi = {
  id: 53670, name: "رستوران هتل اَورین", catalog_category_name: "رستوران و کافی شاپ", coordinates: { lat: 35.7021562582, lon: 51.3904890922 },
  image: "https://cdn.takhfifan.com/images/1.0?id=vendor/a.jpg&width=100", images: ["https://cdn.takhfifan.com/images/1.0?id=vendor/a.jpg&width=100", "https://cdn.takhfifan.com/images/1.0?id=vendor/b.jpg&width=100"],
  location: "فلسطین - انقلاب", city: "تهران", rate: "4.4", rate_count: 366, discount: 20.0, max_cashback_percent: 7.5,
};
const timing = JSON.stringify(["شنبه", "یکشنبه", "دوشنبه", "سه شنبه", "چهارشنبه", "پنج شنبه", "جمعه"].map((day) => ({ day, service_time: day === "جمعه" ? "-" : "8:30-10:45" })));
const vendor = {
  data: {
    attributes: {
      name: "رستوران هتل اَورین", address: "استان تهران، انقلاب ، ابتدای کارگر شمالی،کوچه مجد |", area: "منطقه 6", city: "تهران", district: null, latitude: "35.7021562582", longitude: "51.3904890922",
      business_days: "همه روزه و باهماهنگی قبلی", business_timing: timing, phone_v2: "02166591059", image: "https://cdn.takhfifan.com/images/1.0?id=/vendor/logo.jpg",
      image_gallery: [{ url: "https://cdn.takhfifan.com/images/1.0?id=vendor/a.jpg", type: "cover" }, { url: "https://cdn.takhfifan.com/images/1.0?id=vendor/a.jpg" }, { url: "ftp://nope" }],
      sale_count: 5985, features: [{ label: "جای پارک", value: "متوسط" }, { label: "ظرفیت", value: "" }], max_discount_percentage: 20, offline_max_cashback_percent: 7.5,
      offline_cashback_extra: { payment_types: [{ bank_title: "آسان پرداخت", max_cashback_percent: 7.5 }, { bank_title: "بی‌بازگشت", max_cashback_percent: 0 }] },
      takhfifan_pay_discount_percentage: 20.0, website: null, vendor_id: 53670,
    },
  },
  rating: { rate: "4.4", rate_count: 366 },
  categories: [{ attributes: { name: "بوفه" }, children: [{ attributes: { name: "بوفه صبحانه" } }] }],
};
const products = {
  data: [
    {
      attributes: {
        name: "پکیج ویژه بوفه صبحانه", product_id: 295995, image: "https://cdn.takhfifan.com/images/1.0?id=/295995/p.jpg", price_regular: 4950000, price_deal: 4455000, deal_discount: 10, deal_qty_sold: 457,
        deal_date_to: "2026-11-21 00:00:00", description: "<h3>مقدمه</h3><p>شامل :</p><p>&nbsp;نان ،پنیر</p>", deal_fine_print: "<h4>تاریخ استفاده تا 30 روز</h4>هماهنگی الزامی است",
      },
    },
    { attributes: { name: "تمام‌شده", product_id: 2, price_regular: 100, price_deal: 90, deal_date_to: "2026-01-01 00:00:00" } },
    { attributes: { name: "بی‌قیمت", product_id: 3, price_deal: 0 } },
  ],
  meta: { total: { value: 3 } },
};
const NOW = Date.parse("2026-11-11T12:00:00+03:30");

describe("Takhfifan nearby map", () => {
  it("a list row becomes a deal: bigger photos, neighbourhood, best % off, cashback", () => {
    const d = dealOfPoi(poi)!;
    assert.equal(d.id, 53670);
    assert.equal(d.off, 20);
    assert.equal(d.cashback, 7.5);
    assert.equal(d.rating, 4.4);
    assert.equal(d.district, "فلسطین - انقلاب");
    assert.equal(d.category, "رستوران و کافی شاپ");
    assert.deepEqual(d.photos, ["https://cdn.takhfifan.com/images/1.0?id=vendor/a.jpg&width=640", "https://cdn.takhfifan.com/images/1.0?id=vendor/b.jpg&width=640"]);
    assert.equal(d.url, "https://takhfifan.com/vendor/53670");
  });

  it("nothing off, no real spot or no name is no deal", () => {
    assert.equal(dealOfPoi({ ...poi, discount: 0, max_cashback_percent: 0 }), null);
    assert.equal(dealOfPoi({ ...poi, discount: 0, max_cashback_percent: 1 })!.cashback, 1);
    assert.equal(dealOfPoi({ ...poi, coordinates: { lat: 0.1, lon: 0.1 } }), null);
    assert.equal(dealOfPoi({ ...poi, name: " " }), null);
  });

  it("the box round a point has the top-left and bottom-right corners, about halfM each way", () => {
    const b = nearbyBox({ lat: 35.7, lng: 51.4 }, 3000);
    assert.ok(Number(b.top_left_lat) > 35.7 && Number(b.bottom_right_lat) < 35.7);
    assert.ok(Number(b.top_left_lng) < 51.4 && Number(b.bottom_right_lng) > 51.4);
    assert.ok(Math.abs((Number(b.top_left_lat) - 35.7) * 111_320 - 3000) < 20);
  });
});

describe("Takhfifan vendor page", () => {
  const info = dealInfoOf(vendor, products, NOW)!;

  it("the store: logo, gallery (https only, once), address, phone, rating, cashback by bank", () => {
    assert.equal(info.id, 53670);
    assert.equal(info.name, "رستوران هتل اَورین");
    assert.equal(info.logo, "https://cdn.takhfifan.com/images/1.0?id=/vendor/logo.jpg");
    assert.deepEqual(info.photos, ["https://cdn.takhfifan.com/images/1.0?id=vendor/a.jpg"]);
    assert.equal(info.district, "منطقه 6");
    assert.deepEqual(info.phones, [{ number: "02166591059", source: "takhfifan" }]);
    assert.equal(info.rating, 4.4);
    assert.equal(info.reviews, 366);
    assert.equal(info.cashback, 7.5);
    assert.equal(info.payDiscount, 20);
    assert.deepEqual(info.banks, [{ name: "آسان پرداخت", cashback: 7.5 }]);
    assert.deepEqual(info.categories, ["بوفه", "بوفه صبحانه"]);
    assert.deepEqual(info.features, [{ label: "جای پارک", value: "متوسط" }]);
    assert.equal(info.website, "");
    assert.equal(info.url, "https://takhfifan.com/vendor/53670");
  });

  it("deals: rials to toman, ISO end in Tehran time, plain text terms; ended and priceless ones dropped", () => {
    assert.equal(info.items.length, 1);
    const i = info.items[0];
    assert.equal(i.price, 445500);
    assert.equal(i.retail, 495000);
    assert.equal(i.off, 10);
    assert.equal(i.sold, 457);
    assert.equal(i.ends, "2026-11-21T00:00:00+03:30");
    assert.equal(i.about, "مقدمه\nشامل :\nنان ،پنیر");
    assert.equal(i.terms, "تاریخ استفاده تا 30 روز\nهماهنگی الزامی است");
    assert.equal(info.itemsTotal, 3, "the total is Takhfifan's own count");
    assert.equal(info.off, 20);
  });

  it("a page with no name is nothing; no deals still gives the store", () => {
    assert.equal(dealInfoOf({ data: { attributes: {} } }), null);
    assert.equal(dealInfoOf(null), null);
    assert.equal(dealInfoOf(vendor, null, NOW)!.items.length, 0);
  });

  it("hours: Saturday first, a '-' day closed, open now in Tehran", () => {
    const week = info.week!;
    assert.deepEqual(week[0], [[510, 645]]);
    assert.deepEqual(week[6], []);
    assert.equal(openState(week, new Date("2026-11-14T09:00:00+03:30"), zoneOf({ lat: 35.73, lng: 51.53 })).open, true);
  });

  it("weekFromTakhfifan: spans past midnight, 24 hours, junk", () => {
    const w = weekFromTakhfifan(JSON.stringify([{ day: "شنبه", service_time: "06:00-00:00" }, { day: "پنجشنبه", service_time: "۱۰:۰۰-۱۴:۰۰ , ۱۶:۰۰-۲۰:۰۰" }, { day: "جمعه", service_time: "24 ساعته" }]))!;
    assert.deepEqual(w[0], [[360, 1440]]);
    assert.deepEqual(w[5], [[600, 840], [960, 1200]]);
    assert.deepEqual(w[6], [[0, 1440]]);
    assert.equal(weekFromTakhfifan("not json"), null);
    assert.equal(weekFromTakhfifan("[]"), null);
    assert.equal(weekFromTakhfifan(null), null);
  });

  it("htmlText keeps line breaks and bullets, drops tags and entities", () => {
    assert.equal(htmlText("<p>a&nbsp;b</p><ul><li>x</li><li>y &amp; z</li></ul>line<br/>two"), "a b\n• x\n• y & z\nline\ntwo");
    assert.equal(htmlText(null), "");
  });
});

describe("Takhfifan comments", () => {
  const page = dealReviewsOf({
    meta: { total: 279, rate_average: 4.4 },
    data: [
      { id: 103484, body: "خوب بود", rate: 4.0, created_at: "2026-11-04T12:32:12.466+03:30", is_buyer: true, status: "published", replies: [{ body: "با سلام بسیار خرسندیم\n\n" }] },
      { id: 2, body: " ", rate: 0 },
      { id: 3, body: "hidden", rate: 5, status: "rejected" },
      { id: 4, body: "", rate: 5.4 },
    ],
  });

  it("stars, text, the store's reply; empty and unpublished ones left out", () => {
    assert.deepEqual(page.reviews.map((r) => r.id), [103484, 4]);
    assert.equal(page.reviews[0].reply, "با سلام بسیار خرسندیم");
    assert.equal(page.reviews[0].rate, 4);
    assert.equal(page.reviews[0].buyer, true);
    assert.equal(page.reviews[1].rate, 5);
    assert.equal(page.count, 279);
    assert.equal(page.avg, 4.4);
  });
});
