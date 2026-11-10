// Stores in the 3D city (lib/storefront.ts): the card offers the store you're passing — the
// nearest, ahead of you a little more than behind, without flickering between neighbours —
// and a store's pole sign stands on the pavement in front of it, facing the street.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEAR_STORE_M, nearStore, signSpot, type StoreSpot } from "@/lib/storefront";

const shop = (id: string, x: number, z: number): StoreSpot => ({ id, x, z, name: id });

describe("the store card", () => {
  it("the nearest store in reach, none past it", () => {
    const l = [shop("a", 10, 0), shop("b", 18, 0), shop("far", NEAR_STORE_M + 5, 0)];
    assert.equal(nearStore(l, 0, 0, 0, 0)?.store.id, "a");
    assert.equal(nearStore([shop("far", NEAR_STORE_M + 5, 0)], 0, 0, 0, 0), null);
  });

  it("one ahead counts a little nearer than one just behind", () => {
    // Heading −z: "ahead" at z −11 beats "behind" at z +10.
    assert.equal(nearStore([shop("behind", 0, 10), shop("ahead", 0, -11)], 0, 0, 0, -1)?.store.id, "ahead");
  });

  it("the one shown stays until another is clearly nearer (no flicker)", () => {
    const l = [shop("a", 8, 0), shop("b", 7, 0)];
    assert.equal(nearStore(l, 0, 0, 0, 0, "a")?.store.id, "a");
    assert.equal(nearStore([shop("a", 20, 0), shop("b", 3, 0)], 0, 0, 0, 0, "a")?.store.id, "b");
  });
});

describe("a store's pole sign", () => {
  // One street along x (z = 0), 10 m wide.
  const lines = [new Float32Array([-100, 0, 100, 0])], widths = [10];

  it("a store mapped in the street gets its sign on the pavement, on its own side, facing the street", () => {
    const s = signSpot(lines, widths, 4, 2)!;
    assert.ok(Math.abs(s.z - (5 + 1.3)) < 1e-6 && s.x === 4, JSON.stringify(s));
    // Facing the street: the sign's direction (sin, cos of the angle) points back to z = 0.
    assert.ok(Math.cos(s.angle) < -0.99);
    const other = signSpot(lines, widths, 4, -1)!;
    assert.ok(other.z < -5, "the other side of the street");
  });

  it("a shop behind a building line gets its sign at the kerb; one at the pavement keeps its spot", () => {
    const back = signSpot(lines, widths, 0, 30)!;
    assert.ok(Math.abs(back.z - 6.3) < 1e-6);
    const at = signSpot(lines, widths, 0, 8)!;
    assert.equal(at.z, 8);
  });

  it("no street near: no spot", () => {
    assert.equal(signSpot(lines, widths, 0, 500), null);
  });
});
