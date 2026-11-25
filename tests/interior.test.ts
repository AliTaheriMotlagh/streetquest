import { test } from "node:test";
import assert from "node:assert/strict";
import { atDoor, blockedAt, footprint, isDrink, layoutRoom, shapeOf, standFor, walk, WALK_R, yawTo } from "../src/lib/interior";
import { STORE_KINDS } from "../src/lib/storeKinds";

const menu = [
  { title: "چلوکباب کوبیده", section: "غذای اصلی" },
  { title: "جوجه کباب", section: "غذای اصلی" },
  { title: "نوشابه خانواده", section: "نوشیدنی" },
  { title: "دوغ محلی", section: "نوشیدنی" },
  { title: "سالاد شیرازی", section: "پیش غذا" },
];

test("every kind of store gets a room you can stand in, with its keeper behind the counter", () => {
  for (const kind of STORE_KINDS) {
    const r = layoutRoom(kind, menu, 7);
    assert.ok(r.w >= 6 && r.d >= 7, kind);
    assert.equal(blockedAt(r, r.spawn.x, r.spawn.z), false, `${kind}: spawn is free`);
    assert.ok(r.keeper.z < footprint(r.fixtures[0]).z0, `${kind}: keeper behind the counter`);
    assert.ok(r.fixtures.length >= 3, kind);
    // Nothing sticks out of the walls.
    for (const f of r.fixtures) {
      const b = footprint(f);
      assert.ok(b.x0 >= -r.w / 2 - 0.01 && b.x1 <= r.w / 2 + 0.01 && b.z0 >= -0.01 && b.z1 <= r.d + 0.01, `${kind}: ${f.type} inside`);
    }
  }
});

test("each listed thing gets one spot, drinks in the fridge, the rest stocked", () => {
  const r = layoutRoom("restaurant", menu, 3);
  const listed = r.slots.filter((s) => s.item >= 0);
  assert.equal(listed.length, menu.length);
  assert.equal(r.placed, menu.length);
  assert.deepEqual(new Set(listed.map((s) => s.item)).size, menu.length);
  const fridge = r.fixtures.find((f) => f.type === "fridge")!;
  const fb = footprint(fridge);
  for (const s of listed.filter((s) => isDrink(menu[s.item]))) assert.ok(s.x >= fb.x0 - 0.1 && s.x <= fb.x1 + 0.1 && s.z >= fb.z0 - 0.1 && s.z <= fb.z1 + 0.1, "drink in the fridge");
  assert.ok(r.slots.some((s) => s.item < 0), "plain stock fills the rest");
  assert.ok(listed.every((s) => s.tag));
});

test("a supermarket with a big catalogue grows and shows more of it", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ title: `کالا ${i}` }));
  const small = layoutRoom("market", many.slice(0, 10), 1), big = layoutRoom("market", many, 1);
  assert.ok(big.w > small.w && big.placed > 60, `placed ${big.placed}`);
  assert.equal(small.placed, 10);
});

test("the same store is the same room each visit", () => {
  assert.deepEqual(layoutRoom("bakery", menu, 42), layoutRoom("bakery", menu, 42));
});

test("shapes come from the words, else the trade", () => {
  assert.equal(shapeOf("restaurant", { title: "نوشابه" }), "can");
  assert.equal(shapeOf("cafe", { title: "لاته" }), "cup");
  assert.equal(shapeOf("bakery", { title: "نان سنگک" }), "loaf");
  assert.equal(shapeOf("tech", { title: "Galaxy A55" }), "phone");
  assert.equal(shapeOf("restaurant", { title: "قورمه سبزی" }), "plate");
  assert.equal(shapeOf("pharmacy", { title: "ژلوفن" }), "pill");
});

test("walking stays inside, slides along fixtures, never goes behind the counter", () => {
  const r = layoutRoom("market", menu, 5);
  const p = walk(r, 0, r.d - 1, 0, -5);
  assert.ok(p.z > footprint(r.fixtures[0]).z1, "stopped by the counter line");
  const q = walk(r, 0, r.d - 1, 99, r.d - 1);
  assert.ok(q.x <= r.w / 2 - WALK_R + 1e-9);
  assert.ok(atDoor(r, 0, r.d - WALK_R));
  assert.ok(!atDoor(r, r.w / 2 - 0.4, r.d - WALK_R), "the wall beside the door isn't the door");
});

test("you stand in front of a thing to look at it", () => {
  const r = layoutRoom("pharmacy", menu, 9);
  for (const s of r.slots.filter((x) => x.item >= 0)) {
    const at = standFor(r, s);
    assert.equal(blockedAt(r, at.x, at.z), false);
    assert.ok(Math.abs(at.yaw - yawTo(at.x, at.z, s.x, s.z)) < 1e-9);
  }
});

test("a player's shop gets its room from its name, else its category", async () => {
  const { roomKindForShop } = await import("../src/lib/interior");
  assert.equal(roomKindForShop("other", "نانوایی سنگک بربری"), "bakery");
  assert.equal(roomKindForShop("tech", "علی"), "tech");
  assert.equal(roomKindForShop("beauty", "x"), "pharmacy");
  assert.equal(roomKindForShop("nonsense", "x"), "general");
});
