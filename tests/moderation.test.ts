// Listing pre-checks (lib/stores/moderation.ts): what is refused outright, what waits for a moderator,
// what goes live at once, and how the review state moves after an edit.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOLD_FIRST, changesText, fold, preCheck, reviewAfter, sameness, type SellerCtx } from "@/lib/stores/moderation";

const trusted: SellerCtx = { approved: 10, others: [] };
const fresh: SellerCtx = { approved: 0, others: [] };
const item = (title: string, description = "", price = 100) => ({ title, description, price, currency: "coins" as const });

describe("moderation pre-check: blocks", () => {
  for (const [title, cat] of [
    ["AK-47 for sale", "weapons"],
    ["اسلحه کمری نو", "weapons"],
    ["تریاک درجه یک", "drugs"],
    ["Fresh cocaine", "drugs"],
    ["ودکا روسی", "alcohol"],
    ["Red wine 2019", "alcohol"],
    ["کازینو آنلاین", "gambling"],
    ["مدرک جعلی دانشگاه", "fakes"],
    ["Fake passport", "fakes"],
  ] as const)
    it(`refuses "${title}" (${cat})`, () => {
      const v = preCheck(item(title), trusted);
      assert.equal(v.verdict, "block");
      assert.equal(v.cat, cat);
      assert.equal(v.reasons.length, 1);
    });

  for (const title of ["Toy gun for kids", "تفنگ آبپاش", "Non-alcoholic beer", "ماءالشعیر بدون الکل", "Wine glass set", "Glue gun 20W", "اسکین کلت توی بازی", "Massage gun"])
    it(`lets a harmless "${title}" through`, () => assert.notEqual(preCheck(item(title), trusted).verdict, "block"));

  it("doesn't match inside longer words", () => {
    assert.equal(preCheck(item("The season has begun"), trusted).verdict, "ok");
    assert.equal(preCheck(item("شرابه پرده"), trusted).verdict, "ok");
  });

  it("folds Arabic letters and digits before matching", () => {
    assert.equal(fold("كتاب ي ۱۲۳"), "کتاب ی 123");
    assert.equal(preCheck(item("مشروب"), trusted).verdict, "block");
  });
});

describe("moderation pre-check: holds", () => {
  it(`holds a new seller's first ${HOLD_FIRST} listings`, () => {
    for (let n = 0; n < HOLD_FIRST; n++) assert.equal(preCheck(item("Handmade cup"), { approved: n, others: [] }).verdict, "hold");
    assert.equal(preCheck(item("Handmade cup"), { approved: HOLD_FIRST, others: [] }).verdict, "ok");
  });
  it("trusts a verified seller from the first listing", () => assert.equal(preCheck(item("Handmade cup"), { ...fresh, trusted: true }).verdict, "ok"));

  it("holds phone numbers, also grouped and in Persian digits", () => {
    for (const d of ["call 09123456789", "۰۹۱۲ ۳۴۵ ۶۷۸۹", "+98 912 345 6789", "021-88776655"])
      assert.equal(preCheck(item("Cup", d), trusted).verdict, "hold", d);
  });
  it("holds links and handles", () => {
    for (const d of ["see https://x.example", "t.me/shop", "پیام در تلگرام", "@my_shop_ir", "www.cups.ir"])
      assert.equal(preCheck(item("Cup", d), trusted).verdict, "hold", d);
  });
  it("holds shouting and repeated marks", () => {
    assert.equal(preCheck(item("BEST CUPS EVER"), trusted).verdict, "hold");
    assert.equal(preCheck(item("Cups!!!"), trusted).verdict, "hold");
    assert.equal(preCheck(item("Cuuuuuuups"), trusted).verdict, "hold");
    assert.equal(preCheck(item("Cups by Ali"), trusted).verdict, "ok");
  });
  it("holds a copy of another listing", () => {
    const ctx: SellerCtx = { approved: 10, others: [{ title: "Blue handmade cup", description: "Glazed clay cup, 300 ml", price: 100, currency: "coins" }] };
    assert.equal(preCheck(item("Blue handmade cup", "Glazed clay cup, 300 ml"), ctx).verdict, "hold");
    assert.equal(preCheck(item("Wooden spoon", "Carved walnut"), ctx).verdict, "ok");
    assert.ok(sameness("red cup", "red cup") === 1 && sameness("", "x") === 0);
  });
  it("holds a price 10× off the seller's range, only in the same currency", () => {
    const others = [80, 100, 120].map((price) => ({ title: `cup ${price}`, description: "", price, currency: "coins" as const }));
    const ctx: SellerCtx = { approved: 10, others };
    assert.equal(preCheck(item("Plate", "", 5000), ctx).verdict, "hold");
    assert.equal(preCheck(item("Plate", "", 5), ctx).verdict, "hold");
    assert.equal(preCheck(item("Plate", "", 300), ctx).verdict, "ok");
    assert.equal(preCheck({ ...item("Plate", "", 5000), currency: "toman" }, ctx).verdict, "ok");
  });
});

describe("moderation review state", () => {
  const ok = { verdict: "ok" as const, reasons: [] }, hold = { verdict: "hold" as const, reasons: ["x"] };
  it("ok goes live, a hold waits", () => {
    assert.equal(reviewAfter(ok, null), "ok");
    assert.equal(reviewAfter(hold, "ok"), "pending");
  });
  it("a turned-down listing goes back to the queue after an edit", () => assert.equal(reviewAfter(ok, "rejected"), "pending"));
  it("only text and price edits are checked again", () => {
    const before = { title: "Cup", description: "Clay", price: 100 };
    assert.equal(changesText(before, { title: "Cup" }), false);
    assert.equal(changesText(before, { price: 120 }), true);
    assert.equal(changesText(before, { description: "Glass" }), true);
  });
});
