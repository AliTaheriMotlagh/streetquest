// Storefront kinds, typical hours, sign detail and caps (lib/storeKinds.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultWeek, menuHighlights, neonFlicker, signDetail, STORE_KINDS, STORE_LOOK, storeKind, storefrontCap, storeOpen } from "@/lib/storeKinds";

describe("storeKind", () => {
  it("maps classes from every vocabulary", () => {
    assert.equal(storeKind("pharmacy"), "pharmacy");
    assert.equal(storeKind("fast_food"), "fastfood");
    assert.equal(storeKind("burger"), "fastfood");
    assert.equal(storeKind("cafe"), "cafe");
    assert.equal(storeKind("greengrocer"), "produce");
    assert.equal(storeKind("mobile_phone"), "tech");
    assert.equal(storeKind("clothes"), "fashion");
    assert.equal(storeKind("nothing-known"), "general");
  });
  it("the name sharpens a vague class", () => {
    assert.equal(storeKind("restaurant", "پیتزا رُم"), "fastfood");
    assert.equal(storeKind("shop", "نانوایی سنگکی"), "bakery");
    assert.equal(storeKind("supermarket", "قصابی آقا رضا"), "butcher");
    assert.equal(storeKind("", "کافه نادری"), "cafe");
  });
  it("a specific class is not overridden by the name", () => {
    assert.equal(storeKind("pharmacy", "کافه داروخانه"), "pharmacy");
  });
  it("every kind has a look", () => {
    for (const k of STORE_KINDS) assert.ok(STORE_LOOK[k].emoji && STORE_LOOK[k].glow);
  });
});

describe("opening", () => {
  // 2026-11-11 is a Wednesday; Tehran is UTC+3:30 (no DST).
  const at = (h: number, m = 0, day = 11) => new Date(Date.UTC(2026, 10, day, h, m) - 3.5 * 3_600_000);
  it("typical hours", () => {
    assert.equal(storeOpen("market", null, at(12)), true);
    assert.equal(storeOpen("market", null, at(3)), false);
    assert.equal(storeOpen("fastfood", null, at(0, 30, 12)), true, "runs past midnight");
  });
  it("real hours win", () => {
    const week = defaultWeek("cafe").map(() => [[900, 960]] as [number, number][]);
    assert.equal(storeOpen("cafe", week, at(12)), false);
    assert.equal(storeOpen("cafe", week, at(15, 30)), true);
  });
  it("butchers shut on Friday", () => {
    assert.equal(storeOpen("butcher", null, at(12, 0, 13)), false);
  });
});

describe("detail and caps", () => {
  it("text only near", () => {
    assert.equal(signDetail(40), "text");
    assert.equal(signDetail(120), "bar");
    assert.equal(signDetail(300), "none");
  });
  it("lite is the smallest", () => {
    assert.ok(storefrontCap("lite").signs < storefrontCap("high").signs);
    assert.equal(storefrontCap("lite").steam, 0);
  });
  it("menu highlights take priced items across sections", () => {
    const h = menuHighlights([{ items: [{ title: "a", price: 10, priceNow: 8 }, { title: "free", price: 0, priceNow: 0 }] }, { items: [{ title: "b", price: 20, priceNow: 0 }] }], 3);
    assert.deepEqual(h, [{ title: "a", price: 8 }, { title: "b", price: 20 }]);
  });
  it("neon is mostly steady", () => {
    let dim = 0;
    for (let i = 0; i < 2000; i++) if (neonFlicker(3, i * 0.05) < 1) dim++;
    assert.ok(dim < 200);
  });
});
