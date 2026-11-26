// After an arrest or a knock-out in the open city (lib/street/setback.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outside, setbackFine, setbackPlace } from "@/lib/street/setback";
import type { CivicKind } from "@/lib/storeKinds";

const places: { x: number; z: number; kind: CivicKind | null; name: string }[] = [
  { x: 100, z: 0, kind: "police", name: "Kalantari 12" },
  { x: 900, z: 0, kind: "police", name: "far station" },
  { x: 0, z: 300, kind: "clinic", name: "Darmangah" },
  { x: 0, z: 800, kind: "hospital", name: "Hospital" },
  { x: 10, z: 10, kind: null, name: "a café" },
  { x: 5, z: 5, kind: "mosque", name: "Masjed" },
];

describe("setbacks", () => {
  it("arrested: the nearest police station; knocked out: the nearest hospital or clinic; none in reach: null", () => {
    assert.equal(setbackPlace("busted", places, { x: 0, z: 0 })?.name, "Kalantari 12");
    assert.equal(setbackPlace("down", places, { x: 0, z: 0 })?.name, "Darmangah");
    assert.equal(setbackPlace("down", places, { x: 0, z: 0 }, 200), null);
    assert.equal(setbackPlace("busted", [], { x: 0, z: 0 }), null);
  });
  it("set down outside, toward where you were, facing the door", () => {
    const o = outside({ x: 100, z: 0 }, { x: 0, z: 0 });
    assert.deepEqual([Math.round(o.x), Math.round(o.z)], [94, 0]);
    // Forward is (−sin, −cos): facing +x, at the station.
    assert.ok(Math.abs(-Math.sin(o.yaw) - 1) < 1e-9 && Math.abs(Math.cos(o.yaw)) < 1e-9);
  });
  it("fines: none by default; per star when arrested; never more than you have", () => {
    const off = { bustFinePerStar: 0, hospitalBill: 0 };
    assert.equal(setbackFine("busted", 3, 1000, off), 0);
    const on = { bustFinePerStar: 50, hospitalBill: 120 };
    assert.equal(setbackFine("busted", 3, 1000, on), 150);
    assert.equal(setbackFine("busted", 0, 1000, on), 50, "at least one star's worth");
    assert.equal(setbackFine("down", 4, 1000, on), 120);
    assert.equal(setbackFine("down", 0, 80, on), 80);
    assert.equal(setbackFine("down", 0, 0, on), 0);
  });
});
