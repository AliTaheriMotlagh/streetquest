import { test } from "node:test";
import assert from "node:assert/strict";
import { cityExperiencesUrl, experienceUrl, fromJabamaEvents, jabamaCity, matchExperience, type Experience } from "../src/lib/travel/experiences";

// Rows as api.jabama.events/events?city=… answers them (2026-11-16), trimmed.
const ROWS = {
  items: [
    { id: "legacy-615", title: "رزرو آنلاین گشت VIP تخت جمشید، پاسارگاد و نقش رستم با ناهار", duration: "۹ ساعت", category: { label: "تور و گشت" }, coverImage: "https://cdn.jabama.events/a.jpg", pricePerPerson: 2600000, minPriceAfterDiscount: 2600000, rating: "۵.۰", reviewCount: 8, firstAvailableSessionStartIso: "2026-11-16T04:30:00.000Z", locationLabel: "تخت جمشید، پاسارگاد و نقش رستم", organizerName: "پارس مسافر شیراز", active: true, linkOnly: false },
    { id: "legacy-821", title: "رزرو آنلاین پیاده‌روی در محله رنگارنگ و دیدار با حافظ و سعدی", duration: "۴ ساعت", pricePerPerson: 850000, rating: "۴.۸", reviewCount: 3, firstAvailableSessionStartIso: null, active: true },
    { id: "legacy-195", title: "رزرو آنلاین تجربه کار با چوب در بازار وکیل", pricePerPerson: 900000, minPriceAfterDiscount: 700000, rating: null, reviewCount: 0, active: true },
    { id: "x-off", title: "Gone", active: false },
    { id: "x-link", title: "Elsewhere", linkOnly: true },
    { title: "no id" },
  ],
  nextCursor: "abc",
};

test("Jabama Events rows: toman prices (after discount), Persian digits read, 'book online' dropped, inactive left out", () => {
  const l = fromJabamaEvents(ROWS);
  assert.deepEqual(l.map((e) => e.id), ["legacy-615", "legacy-821", "legacy-195"]);
  const [p, h, w] = l;
  assert.equal(p.title, "گشت VIP تخت جمشید، پاسارگاد و نقش رستم با ناهار");
  assert.equal(p.price, 2600000);
  assert.equal(p.rating, 5);
  assert.equal(p.reviews, 8);
  assert.equal(p.next, "2026-11-16T04:30:00.000Z");
  assert.equal(p.host, "پارس مسافر شیراز");
  assert.equal(h.next, null);
  assert.equal(w.price, 700000, "the price after its discount");
  assert.equal(w.rating, null);
  assert.deepEqual(fromJabamaEvents(null), []);
  assert.deepEqual(fromJabamaEvents({ items: "x" }), []);
});

test("an outing finds the experience that is it — by its words, not by the city's name or filler words", () => {
  const l: Experience[] = fromJabamaEvents(ROWS);
  assert.equal(matchExperience({ q: "تور تخت جمشید" }, l, "شیراز")?.id, "legacy-615");
  // "حافظ" stands for "حافظیه".
  assert.equal(matchExperience({ q: "حافظیه" }, l, "شیراز")?.id, "legacy-821");
  // Nothing about it there; the city's name alone or "historic fabric" alone doesn't count.
  assert.equal(matchExperience({ q: "باغ ارم شیراز" }, l, "شیراز"), null);
  assert.equal(matchExperience({ q: "بافت تاریخی شیراز" }, l, "شیراز"), null);
  assert.equal(matchExperience({ q: "تور" }, l), null);
  // Arabic ي / ك and zero-width joiners read the same.
  assert.equal(matchExperience({ q: "بازار وكيل" }, l)?.id, "legacy-195");
});

test("only the cities Jabama Events has; links to the experience and the city's list", () => {
  assert.equal(jabamaCity("shiraz"), "shiraz");
  assert.equal(jabamaCity("kish"), null);
  assert.equal(experienceUrl({ id: "legacy-615" }), "https://jabama.events/events/legacy-615");
  assert.equal(cityExperiencesUrl("shiraz"), "https://jabama.events/all?city=shiraz");
});
