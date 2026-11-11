import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSiktir, cleanSiktir, dislikeKey, siktirAllowed, SIKTIR_LIMITS, topReasons } from "../src/lib/siktir";

test("validation", () => {
  assert.ok("error" in cleanSiktir({ lat: 91, lng: 0, reason: "dirty" }));
  assert.ok("error" in cleanSiktir({ lat: 1, lng: 0, reason: "nope" }));
  assert.ok("error" in cleanSiktir({ lat: 1, lng: 0, reason: "dirty", note: "x".repeat(281) }));
  const r = cleanSiktir({ lat: 35.700049, lng: 51.4, reason: "rude", note: "  a   b ", placeName: " Cafe  X " });
  assert.ok("ok" in r && r.ok.note === "a b" && r.ok.placeName === "Cafe X" && r.ok.key === "ll:35.7000,51.4000");
});

test("keys: a store id wins over coordinates, nearby taps share a key", () => {
  assert.equal(dislikeKey("abc", { lat: 1, lng: 2 }), "p:abc");
  assert.equal(dislikeKey(null, { lat: 35.70002, lng: 51.40001 }), dislikeKey("", { lat: 35.70004, lng: 51.39999 }));
  assert.notEqual(dislikeKey(null, { lat: 35.7, lng: 51.4 }), dislikeKey(null, { lat: 35.701, lng: 51.4 }));
});

test("rate rules", () => {
  const now = 1e12;
  assert.equal(siktirAllowed([], now).ok, true);
  assert.equal(siktirAllowed(Array(SIKTIR_LIMITS.perHour).fill(now - 1000), now).ok, false);
  assert.equal(siktirAllowed(Array(SIKTIR_LIMITS.perHour).fill(now - 2 * 3_600_000), now).ok, true);
  assert.equal(siktirAllowed(Array(SIKTIR_LIMITS.perDay).fill(now - 5 * 3_600_000), now).ok, false);
});

test("aggregation by place", () => {
  const row = (key: string, reason: string, name = "") => ({ key, lat: 1, lng: 2, placeKey: null, placeName: name, reason });
  const out = aggregateSiktir([row("a", "dirty", "A"), row("a", "dirty", "A"), row("a", "rude"), row("b", "scam"), row("c", "bogus")]);
  assert.equal(out.length, 2);
  assert.equal(out[0].key, "a");
  assert.equal(out[0].count, 3);
  assert.equal(out[0].name, "A");
  assert.deepEqual(out[0].top, ["dirty", "rude"]);
  assert.deepEqual(topReasons({ noisy: 2, dirty: 2, scam: 1 }, 2), ["dirty", "noisy"]);
});
