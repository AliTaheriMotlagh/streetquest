// Filters in the page address (lib/urlState.ts): round trips, defaults left out, junk ignored.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bool, listOf, num, oneOf, text, withParams } from "@/lib/urlState";

describe("url state codecs", () => {
  it("numbers: round trip, default left out, junk ignored", () => {
    const c = num();
    assert.equal(c.parse(c.show(1_500_000)), 1_500_000);
    assert.equal(c.show(0), null);
    for (const bad of ["-5", "1e3", "abc", "", null]) assert.equal(c.parse(bad), undefined);
    assert.equal(num(0, 100).parse("101"), undefined);
  });
  it("on/off and text", () => {
    assert.equal(bool.show(false), null);
    assert.equal(bool.parse(bool.show(true)), true);
    assert.equal(text(5).parse("abcdefgh"), "abcde");
    assert.equal(text().show("   "), null);
    assert.equal(text().show(" تهران "), "تهران");
  });
  it("one of a set", () => {
    const c = oneOf(["cheap", "fast"] as const, "cheap");
    assert.equal(c.show("cheap"), null);
    assert.equal(c.parse("fast"), "fast");
    assert.equal(c.parse("evil"), undefined);
  });
  it("lists keep only known values", () => {
    const c = listOf(["bus", "train"] as const);
    assert.deepEqual(c.parse("bus,plane,train"), ["bus", "train"]);
    assert.equal(c.show([]), null);
    assert.deepEqual(listOf().parse(c.show(["bus", "train"])), ["bus", "train"]);
    assert.deepEqual(listOf().parse(listOf().show(["a,b"])), ["a b"]);
  });
  it("withParams sets and removes keys, keeps the rest", () => {
    assert.equal(withParams("?a=1&b=2", { b: null, c: "x y" }), "?a=1&c=x+y");
    assert.equal(withParams("?a=1", { a: null }), "");
    assert.equal(withParams("", { q: "تهران" }), `?q=${encodeURIComponent("تهران")}`);
  });
});
