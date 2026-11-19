import { test } from "node:test";
import assert from "node:assert/strict";
import { hreflang, langPath, ldJson, metaDescription, pageAlternates, shopLd, sitemapEntry, tomanOffer } from "../src/lib/seo";

test("langPath adds ?lang= and keeps the rest of the query", () => {
  assert.equal(langPath("/", "fa"), "/?lang=fa");
  assert.equal(langPath("/events", "tr"), "/events?lang=tr");
  assert.equal(langPath("/x?a=1&lang=en", "fa"), "/x?a=1&lang=fa");
});

test("each language version is its own canonical page; the plain URL is x-default", () => {
  const a = pageAlternates("/events", "fa");
  assert.equal(a.canonical, "/events?lang=fa");
  assert.deepEqual(a.languages, { en: "/events?lang=en", "fa-IR": "/events?lang=fa", "tr-TR": "/events?lang=tr", "x-default": "/events" });
  assert.equal(pageAlternates("/", "en").canonical, "/?lang=en");
  assert.equal(pageAlternates("/", "tr", "https://sq.example").canonical, "https://sq.example/?lang=tr");
  assert.equal(pageAlternates("/", "tr", "https://sq.example").languages["x-default"], "https://sq.example/");
  assert.equal(hreflang("fa"), "fa-IR");
});

test("sitemap rows carry absolute language alternates", () => {
  const e = sitemapEntry("https://sq.example", "/s/abc", { priority: 0.6 });
  assert.equal(e.url, "https://sq.example/s/abc");
  assert.equal(e.priority, 0.6);
  assert.equal(e.alternates.languages["fa-IR"], "https://sq.example/s/abc?lang=fa");
  assert.equal(e.alternates.languages["x-default"], "https://sq.example/s/abc");
});

test("ldJson can't be broken out of by user text, and still parses back the same", () => {
  const evil = { name: "</script><script>alert(1)</script> & <!--  x " };
  const out = ldJson(evil);
  assert.ok(!out.includes("<") && !out.includes(">") && !out.includes("&"));
  assert.ok(!out.includes(" ") && !out.includes(" "));
  assert.deepEqual(JSON.parse(out), evil);
});

test("metaDescription: one line, cut on a word, ellipsis", () => {
  assert.equal(metaDescription("  short\n text "), "short text");
  const long = "word ".repeat(60);
  const d = metaDescription(long, 50);
  assert.ok(d.length <= 50, d);
  assert.ok(d.endsWith("…") && !d.endsWith(" …"));
});

test("shopLd: a Store with only its toman products as offers, in rials", () => {
  assert.deepEqual(tomanOffer(85_000), { price: "850000", priceCurrency: "IRR" });
  const shop = { id: "s1", name: "Sara", about: "Fresh bread", address: "Next to the pharmacy", lat: 35.7000049, lng: 51.4, coverId: null };
  const base = { description: "", stock: 3, photos: [], over: false };
  const ld = shopLd("https://sq.example", shop, [
    { ...base, id: "a", title: "Pride", currency: "toman", priceNow: 285_000_000, photos: ["img1"] },
    { ...base, id: "b", title: "Scarf", currency: "coins", priceNow: 120 },
    { ...base, id: "c", title: "Ask me", currency: "toman", priceNow: 0 },
    { ...base, id: "d", title: "Old show", currency: "toman", priceNow: 50_000, over: true },
    { ...base, id: "e", title: "Gone", currency: "toman", priceNow: 10_000, stock: 0 },
  ]);
  assert.equal(ld["@type"], "Store");
  assert.equal(ld.url, "https://sq.example/s/s1");
  assert.equal(ld.geo.latitude, 35.7);
  assert.equal(ld.image, undefined);
  const offers = ld.makesOffer!;
  assert.deepEqual(offers.map((o) => o.itemOffered.name), ["Pride", "Gone"]);
  assert.equal(offers[0].price, "2850000000");
  assert.equal(offers[0].url, "https://sq.example/s/s1#p-a");
  assert.equal(offers[0].itemOffered.image, "https://sq.example/shop-img/img1");
  assert.equal(offers[1].availability, "https://schema.org/OutOfStock");
  assert.equal(shopLd("https://sq.example", shop, []).makesOffer, undefined);
});
