import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botBuy, buy, costOf, earn, lossPay, MAX_MONEY, PRICES, START_MONEY } from "@/lib/arena/economy";
import { PRIMARIES, SECONDARIES } from "@/lib/arena/weapons";

describe("bomb mode money", () => {
  it("prices every gun; the free kit costs nothing", () => {
    for (const w of [...PRIMARIES, ...SECONDARIES]) assert.ok(PRICES[w] >= 0, w);
    assert.equal(PRICES.smg + PRICES.pistol, 0);
  });
  it("buys only what you can afford; what you hold is free", () => {
    assert.equal(buy(START_MONEY, ["smg", "pistol"], "rifle"), null);
    assert.equal(buy(3000, ["smg", "pistol"], "rifle"), 300);
    assert.equal(costOf(["rifle", "pistol"], "rifle"), 0);
    assert.equal(buy(0, ["smg", "pistol"], "smg"), 0);
  });
  it("a losing side earns more each round in a row, up to a cap; money never passes the cap", () => {
    assert.ok(lossPay(1) < lossPay(2) && lossPay(2) < lossPay(3));
    assert.equal(lossPay(10), 3400);
    assert.equal(earn(MAX_MONEY - 100, 3250), MAX_MONEY);
  });
  it("bots buy the best of what they can afford", () => {
    assert.equal(botBuy(500), "smg");
    assert.equal(botBuy(1200), "shotgun");
    assert.equal(botBuy(9000), "rifle");
  });
});
