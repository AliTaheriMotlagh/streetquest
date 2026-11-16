import { test } from "node:test";
import assert from "node:assert/strict";
import { dealPercent, ignition, REVEAL_S, WINDOW_SCENE } from "../src/lib/storeReveal";
import { STORE_KINDS } from "../src/lib/storeKinds";

test("a sign ignites like neon: stutters, surges past normal, settles back exactly", () => {
  assert.equal(ignition(-1), 1);
  assert.equal(ignition(REVEAL_S), 1);
  assert.equal(ignition(NaN), 1);
  const early = [0, 0.06, 0.12, 0.18, 0.24].map(ignition);
  assert.ok(early.some((x) => x < 0.3) && early.some((x) => x > 1.5), "on-off stutters");
  assert.ok(ignition(0.4) > 2.4, "the surge");
  let prev = Infinity;
  for (let t = 0.4; t < REVEAL_S; t += 0.1) {
    const v = ignition(t);
    assert.ok(v <= prev && v >= 1, `settling at ${t}`);
    prev = v;
  }
  assert.ok(ignition(REVEAL_S - 0.01) < 1.01);
});

test("a store's deal: its listed one or its menu's biggest cut, whole %, nothing under 5", () => {
  assert.equal(dealPercent(undefined), null);
  assert.equal(dealPercent({ deal: 30 }), 30);
  assert.equal(dealPercent({ deal: 3 }), null);
  const menu = [{ items: [{ price: 100_000, priceNow: 100_000 }, { price: 200_000, priceNow: 150_000 }, { price: 0, priceNow: 0 }] }];
  assert.equal(dealPercent({ menuSections: menu }), 25);
  assert.equal(dealPercent({ deal: 40, menuSections: menu }), 40);
  assert.equal(dealPercent({ deal: 99 }), 90);
});

test("every trade has a window interior", () => {
  for (const k of STORE_KINDS) assert.ok(WINDOW_SCENE[k]?.colors.length, k);
});
