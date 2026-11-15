import { test } from "node:test";
import assert from "node:assert/strict";
import { menuFromReadModel } from "../src/lib/localData";

// Shapes as apigw.snappfood.ir/menu-read-model answered on 2026-11-15 (vendor 3kvm8g, trimmed).
const det = { data: { code: "3kvm8g", title: "نان سحر (نمایندگی گیشا)", logo: "l.jpg", cover: "c.jpg", minOrder: 100000, isOpen: true, isOpenNow: true, address: { area: "كوی نصر", address: "گیشا، پلاک ۳۰۶", latitude: 35.734747, longitude: 51.37722 }, schedules: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ startHour: "07:30:00", stopHour: "21:45:00", weekday })), type: { code: "CONFECTIONERY" } } };
const menu = { data: { menuCategories: [
  { title: "پرطرفدارها", products: [{ id: null, title: "لقمه فلافل", description: "  تازه ", images: [{ src: "big.jpg", thumbnailSrc: "small.jpg" }], variations: [{ id: 38290784, title: "", price: 240000, discount: { amount: 24000, ratio: 10 }, active: true }] }] },
  { title: "نان", products: [{ title: "نان جو", variations: [{ id: 1, title: "بزرگ", price: 50000, discount: null }] }, { title: "بی‌قیمت", variations: [] }] },
  { title: "خالی", products: [] },
] } };
const rev = { data: { rate: 9.24147, reviewCount: 6737, rateDiversity: { one: 3, two: 2, three: 7, four: 15, five: 73 } } };

test("Snappfood menu-read-model → the store card's menu", () => {
  const m = menuFromReadModel(det, menu, rev, new Date("2026-11-15T10:00:00Z"))!;
  assert.equal(m.vendor.code, "3kvm8g");
  assert.equal(m.vendor.kind, "sweets");
  assert.equal(m.vendor.rating, 9.2);
  assert.equal(m.vendor.lat, 35.734747);
  assert.equal(m.reviews, 6737);
  assert.deepEqual(m.stars, [3, 2, 7, 15, 73]);
  assert.equal(m.minOrder, 100000);
  assert.deepEqual(m.sections.map((s) => s.title), ["پرطرفدارها", "نان"], "empty sections and unpriced dishes go");
  const [falafel] = m.sections[0].items;
  assert.deepEqual([falafel.price, falafel.priceNow, falafel.photo, falafel.image, falafel.about], [240000, 216000, "small.jpg", "big.jpg", "تازه"]);
  assert.equal(m.sections[1].items[0].title, "نان جو (بزرگ)", "a named variation is part of the name");
  assert.ok(m.week, "opening hours read");
});

test("menu-read-model: no vendor (or no position) → no menu", () => {
  assert.equal(menuFromReadModel(null, menu), null);
  assert.equal(menuFromReadModel({ data: { code: "x", title: "y" } }, menu), null);
});

test("menu-read-model: placeholder area dropped", () => {
  const m = menuFromReadModel({ data: { ...det.data, address: { ...det.data.address, area: "FIXME" } } }, menu)!;
  assert.equal(m.area, "");
});
