import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanDetails,
  cleanPayLink,
  cleanPhone,
  contactOf,
  currencyOf,
  detailRows,
  expired,
  KINDS,
  kindLine,
  kindOf,
  parseShopRoom,
  priceProblem,
  PRODUCT_KIND_KEYS,
  shopRoom,
} from "../src/lib/shopKinds";

const fmt = { num: (n: number) => n.toLocaleString("en-US"), date: (ms: number) => new Date(ms).toISOString().slice(0, 10) };
const DAY = 86_400_000;

test("unknown kinds and currencies fall back to an item in coins", () => {
  assert.equal(kindOf("ticket"), "ticket");
  assert.equal(kindOf("weapon"), "item");
  assert.equal(kindOf(undefined), "item");
  assert.equal(currencyOf("toman"), "toman");
  assert.equal(currencyOf("usd"), "coins");
});

test("every kind has a label, a stock word and fields with unique keys", () => {
  for (const k of PRODUCT_KIND_KEYS) {
    const def = KINDS[k];
    assert.ok(def.label && def.stock && def.emoji, k);
    const keys = def.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${k} has a duplicate field`);
  }
});

test("cleanDetails keeps only the kind's fields, trimmed, clipped and typed", () => {
  const { details, problem } = cleanDetails("item", { brand: "  Samsung   Galaxy ", model: "x".repeat(99), condition: "broken", warranty: "", hacker: "<script>", color: 5 });
  assert.equal(problem, null);
  assert.equal(details.brand, "Samsung Galaxy");
  assert.equal((details.model as string).length, 40);
  assert.equal(details.condition, undefined, "a choice not in the list is dropped");
  assert.equal(details.warranty, undefined, "empty text is dropped");
  assert.equal(details.hacker, undefined, "fields of no kind are dropped");
  assert.equal(details.color, "5");
});

test("numbers read Persian digits, stay whole and capped; bools only when true", () => {
  const { details } = cleanDetails("food", { prepMin: "۲۵ دقیقه", size: "Large", veg: true, spicy: "yes" });
  assert.equal(details.prepMin, 25);
  assert.equal(details.veg, true);
  assert.equal(details.spicy, undefined);
  assert.equal(cleanDetails("food", { prepMin: 99999 }).details.prepMin, 240);
  assert.equal(cleanDetails("food", { prepMin: -3 }).details.prepMin, undefined);
});

test("a ticket needs its date; dates come in as ms or ISO text", () => {
  assert.equal(cleanDetails("ticket", { venue: "Azadi" }).problem, "Pick the date and time");
  const when = Date.UTC(2027, 0, 5, 18);
  assert.equal(cleanDetails("ticket", { when }).details.when, when);
  assert.equal(cleanDetails("ticket", { when: "2027-01-05T18:00:00Z" }).details.when, when);
  assert.equal(cleanDetails("ticket", { when: 1000 }).problem, "Pick the date and time", "1970 isn't a show date");
});

test("ad facts are short pairs, empty ones and extras dropped; the phone is digits", () => {
  const facts = [{ k: "Area", v: "85 m²" }, { k: "", v: "x" }, ...Array.from({ length: 20 }, (_, i) => ({ k: `k${i}`, v: "v" }))];
  const { details } = cleanDetails("ad", { facts, phone: "۰۹۱۲ ۱۲۳-۴۵۶۷", negotiable: true, category: "realestate" });
  const pairs = details.facts as { k: string; v: string }[];
  assert.equal(pairs.length, 10);
  assert.deepEqual(pairs[0], { k: "Area", v: "85 m²" });
  assert.equal(details.phone, "09121234567");
  assert.equal(cleanDetails("ad", { phone: "12" }).details.phone, undefined);
});

test("prices: coins at least 1 and capped, toman from 0 (ask the seller)", () => {
  assert.equal(priceProblem("coins", 0, 5000), "The price must be at least 1 coin");
  assert.equal(priceProblem("coins", 6000, 5000), "The highest price allowed is {n} coins");
  assert.equal(priceProblem("coins", 100, 5000), null);
  assert.equal(priceProblem("toman", 0, 5000), null);
  assert.equal(priceProblem("toman", 2_500_000, 5000), null, "the coin cap doesn't apply to toman");
  assert.equal(priceProblem("toman", 1.5, 5000), "Set a price");
  assert.equal(priceProblem("toman", 200_000_000_000, 5000), "That price is too high");
});

test("detailRows: labels as keys to translate, choices and yes marked, pairs as their own rows, no phone", () => {
  const rows = detailRows("ad", { category: "vehicle", negotiable: true, facts: [{ k: "Year", v: "1399" }], area: "Tehranpars", phone: "09121234567" }, fmt);
  assert.deepEqual(rows, [
    { label: "Category", value: "Vehicles", tr: true },
    { label: "Price negotiable", value: "Yes", tr: true },
    { label: "Year", value: "1399" },
    { label: "Neighbourhood", value: "Tehranpars" },
  ]);
  const food = detailRows("food", { prepMin: 15 }, fmt);
  assert.deepEqual(food, [{ label: "Ready in", value: "15", unit: "min" }]);
});

test("kindLine: a ticket's date and route, a dish's section, an item's brand and model", () => {
  const when = Date.UTC(2027, 2, 1, 8);
  assert.equal(kindLine("ticket", { when, from: "Tehran", to: "Shiraz", venue: "Terminal" }, fmt), "2027-03-01 · Tehran → Shiraz");
  assert.equal(kindLine("ticket", { when, venue: "Milad Tower" }, fmt), "2027-03-01 · Milad Tower");
  assert.equal(kindLine("food", { section: "Pizzas" }, fmt), "Pizzas");
  assert.equal(kindLine("item", { brand: "Apple", model: "iPhone 13" }, fmt), "Apple iPhone 13");
  assert.equal(kindLine("service", { minutes: 30 }, fmt), "");
});

test("expired: a ticket after it ends (or starts, without an end), a deal after its date", () => {
  const now = Date.UTC(2027, 0, 10);
  assert.equal(expired("ticket", { when: now - DAY }, now), true);
  assert.equal(expired("ticket", { when: now - DAY, ends: now + DAY }, now), false, "still running");
  assert.equal(expired("ticket", { when: now + DAY }, now), false);
  assert.equal(expired("deal", { until: now - 1 }, now), true);
  assert.equal(expired("deal", {}, now), false, "no end date");
  assert.equal(expired("item", { when: now - DAY }, now), false);
});

test("seller contact: phone cleaned, payment links https only, the ad's phone first", () => {
  assert.equal(cleanPhone("+98 912 000 1111"), "+989120001111");
  assert.equal(cleanPhone("12+34+567"), "1234567", "a + only at the start");
  assert.equal(cleanPhone("call me"), "");
  assert.equal(cleanPayLink(""), "");
  assert.equal(cleanPayLink(" https://zarinp.al/sara "), "https://zarinp.al/sara");
  assert.equal(cleanPayLink("http://zarinp.al/sara"), null);
  assert.equal(cleanPayLink("javascript:alert(1)"), null);
  assert.equal(cleanPayLink("https://user:pw@evil.example/pay"), null);
  assert.equal(cleanPayLink("https://localhost/pay"), null);
  assert.equal(cleanPayLink(`https://a.ir/${"x".repeat(300)}`), null);
  const shop = { phone: "02122223333", payLink: "https://idpay.ir/sara" };
  assert.deepEqual(contactOf("ad", { phone: "09125556666" }, shop), { phone: "09125556666", payLink: "https://idpay.ir/sara" });
  assert.deepEqual(contactOf("item", { phone: "09125556666" }, shop), { phone: "02122223333", payLink: "https://idpay.ir/sara" }, "only an ad carries its own phone");
  assert.deepEqual(contactOf("item", {}, { phone: "", payLink: "http://bad" }), { phone: "", payLink: "" });
});

test("shop chat rooms round-trip and refuse anything else", () => {
  const room = shopRoom("cm1shop", "cm2buyer");
  assert.equal(room, "shop:cm1shop:cm2buyer");
  assert.deepEqual(parseShopRoom(room), { shopId: "cm1shop", buyerId: "cm2buyer" });
  assert.equal(parseShopRoom("shop:a:b:c"), null);
  assert.equal(parseShopRoom("dm:a:b"), null);
  assert.equal(parseShopRoom("shop::b"), null);
});
