import { test } from "node:test";
import assert from "node:assert/strict";
import { favourite, offers, shopSay, type ShopCtx } from "../src/lib/street/shopTalk";
import type { Week } from "../src/lib/localData";

const sections = [
  { title: "پیتزا", items: [{ id: "1", title: "پیتزا پپرونی", about: "", price: 400000, priceNow: 400000, photo: "" }, { id: "2", title: "پیتزا مخصوص", about: "", price: 500000, priceNow: 400000, photo: "" }] },
  { title: "پرطرفدارها", items: [{ id: "3", title: "برگر ذغالی", about: "", price: 300000, priceNow: 270000, photo: "" }] },
];
// 10:00–23:00 every day.
const week: Week = Array.from({ length: 7 }, () => [[600, 1380]] as [number, number][]);
const num = (n: number) => n.toLocaleString("en-US");
const ctx = (iso: string, p: Partial<ShopCtx> = {}): ShopCtx => ({ store: "Pizza Rome", sections, week, at: new Date(iso), timeZone: "Asia/Tehran", num, ...p });

test("the favourite is the top of the popular list; offers biggest first", () => {
  assert.equal(favourite(sections)?.title, "برگر ذغالی");
  assert.equal(favourite([sections[0]])?.title, "پیتزا پپرونی");
  assert.deepEqual(offers(sections).map((o) => [o.title, o.off]), [["پیتزا مخصوص", 20], ["برگر ذغالی", 10]]);
});

test("welcome by the time of day, or closed with when it opens", () => {
  // 09:00 Tehran (05:30 UTC): closed, opens at 10:00.
  assert.deepEqual(shopSay("welcome", ctx("2026-11-15T05:30:00Z")), { key: "Sorry, we're closed — we open again at {time}.", params: { time: "10:00" } });
  assert.equal(shopSay("welcome", ctx("2026-11-15T07:30:00Z")).key, "Good morning, welcome to {store}!");
  assert.equal(shopSay("welcome", ctx("2026-11-15T11:30:00Z")).key, "Hello, welcome to {store}!");
  assert.equal(shopSay("welcome", ctx("2026-11-15T16:30:00Z")).key, "Good evening, welcome to {store}!");
  assert.equal(shopSay("welcome", ctx("2026-11-15T16:30:00Z", { week: null })).params?.store, "Pizza Rome");
});

test("hours, offers, prices and the bill", () => {
  assert.deepEqual(shopSay("hours", ctx("2026-11-15T11:30:00Z")), { key: "We're open until {time} today.", params: { time: "23:00" } });
  assert.equal(shopSay("hours", ctx("2026-11-15T11:30:00Z", { week: null })).key, "I'm not sure about today's hours, sorry.");
  assert.equal(shopSay("offers", ctx("2026-11-15T11:30:00Z")).params?.n, 1);
  assert.equal(shopSay("offers", ctx("2026-11-15T11:30:00Z", { sections: [sections[0]].map((s) => ({ ...s, items: [s.items[0]] })) })).key, "No discounts today, sorry — but the prices are good.");
  assert.deepEqual(shopSay("price", ctx("2026-11-15T11:30:00Z", { item: sections[0].items[1] })).params, { item: "پیتزا مخصوص", price: "400,000" });
  assert.deepEqual(shopSay("checkout", ctx("2026-11-15T11:30:00Z", { basket: { n: 3, total: 1070000 } })).params, { n: 3, total: "1,070,000" });
  assert.equal(shopSay("recommend", ctx("2026-11-15T11:30:00Z", { sections: [] })).key, "Have a look around, everything's fresh today.");
});

test("the shopkeeper at the door says the store's name (and its best dish when known)", async () => {
  const { doorGreeting, panicLine, PANIC_LINES } = await import("../src/lib/street/shopTalk");
  const a = doorGreeting("Nayeb", "Koobideh", 0);
  assert.deepEqual(a.params, { store: "Nayeb", item: "Koobideh" });
  assert.equal(doorGreeting("Nayeb", null, 2).params?.store, "Nayeb");
  assert.ok(!("item" in (doorGreeting("Nayeb", null, 2).params ?? {})));
  assert.ok(PANIC_LINES.includes(panicLine(7)));
});

test("a player's shop prices in coins", () => {
  const c: ShopCtx = { store: "S", sections: [{ title: "x", items: [{ id: "1", title: "Tea", about: "", price: 40, priceNow: 40, photo: "" }] }], week: null, at: new Date(), num: String, coins: true };
  assert.deepEqual(shopSay("price", { ...c, item: { title: "Tea", price: 40, priceNow: 40 } }), { key: "{item}: {price} coins.", params: { item: "Tea", price: "40" } });
  assert.equal(shopSay("recommend", c).key, "Everyone orders our {item} — {price} coins.");
  assert.equal(shopSay("checkout", { ...c, basket: { n: 2, total: 80 } }).key, "That's {n} things — {total} coins altogether.");
  assert.equal(shopSay("price", { ...c, coins: false, item: { title: "Tea", price: 40, priceNow: 40 } }).key, "{item}: {price} toman.");
});
