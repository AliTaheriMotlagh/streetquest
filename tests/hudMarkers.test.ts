import { test } from "node:test";
import assert from "node:assert/strict";
import { colorForKind, edgeArrow, iconForEmoji, markerFade, markerScale, MARKER_COLORS, rarityOf, shortDistance } from "../src/lib/hudMarkers";
import { ICON_PATHS } from "../src/lib/iconPaths";

test("markerFade: faint on top, full mid range, gone far away", () => {
  assert.equal(markerFade(0), 0);
  assert.ok(markerFade(8) > 0 && markerFade(8) < 1);
  assert.equal(markerFade(100), 1);
  assert.equal(markerFade(700), 0);
  assert.ok(markerFade(500) < markerFade(200));
});

test("markerScale: thin when near, full when far", () => {
  assert.equal(markerScale(0), 0.35);
  assert.equal(markerScale(200), 1);
  assert.ok(markerScale(30) > markerScale(15));
});

test("edgeArrow: on-screen points stay put, off-screen ones pin to the edge", () => {
  const on = edgeArrow(0, 0, false, 400, 800, 20);
  assert.deepEqual([on.x, on.y, on.edge], [200, 400, false]);
  const right = edgeArrow(3, 0, false, 400, 800, 20);
  assert.equal(right.edge, true);
  assert.equal(right.x, 380);
  assert.equal(right.y, 400);
  assert.ok(Math.abs(right.angle) < 1e-9);
  const up = edgeArrow(0, 5, false, 400, 800, 20);
  assert.equal(up.y, 20);
  assert.ok(Math.abs(up.angle + Math.PI / 2) < 1e-9);
});

test("edgeArrow: behind the camera points the way to turn, never inside the screen", () => {
  const b = edgeArrow(0.5, 0.2, true, 400, 800, 20);
  assert.equal(b.edge, true);
  assert.ok(b.x < 200); // right and behind: mirrored, so the arrow sits on the left
  const dead = edgeArrow(0, 0, true, 400, 800, 20);
  assert.equal(dead.edge, true);
  assert.equal(dead.y, 780);
});

test("edgeArrow reuses the output object", () => {
  const out = { x: 0, y: 0, angle: 0, edge: false };
  assert.equal(edgeArrow(2, 0, false, 100, 100, 10, out), out);
});

test("shortDistance", () => {
  assert.deepEqual(shortDistance(432), { value: "430", unit: "m" });
  assert.deepEqual(shortDistance(1234), { value: "1.2", unit: "km" });
  assert.deepEqual(shortDistance(24000), { value: "24", unit: "km" });
});

test("rarity, icons and colours", () => {
  assert.equal(rarityOf({ drop: { label: "x", sponsor: null }, tier: 0 }), "epic");
  assert.equal(rarityOf({ drop: null, tier: 2 }), "rare");
  assert.equal(rarityOf({ drop: null, tier: 1 }), "common");
  assert.equal(iconForEmoji("🍔"), "food");
  assert.equal(iconForEmoji("🦄"), "pin");
  assert.equal(colorForKind("visit"), MARKER_COLORS.visit);
  for (const name of ["food", "cup", "cart", "bank", "film", "fuel", "pill", "gift", "flag", "building", "bag", "key", "star", "pin"]) assert.ok(name in ICON_PATHS, name);
});
