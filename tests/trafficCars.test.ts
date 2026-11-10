// The street's cars as a whole (components/drive/traffic.ts, run here without a browser):
// a parked car knocked off the kerb becomes exactly one loose car — however it was hit, and
// however many of this frame's footprints still point at where it stood.
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { TrafficCars, type TrafficFeed } from "@/components/drive/traffic";
import type { TileMeshes } from "@/components/drive/world3d";

type Kerb = { key: string; x: number; z: number; yaw: number };
type Loose = { parked: boolean; x: number; z: number; kind: string };
const carsOf = (t: TrafficCars) => (t as unknown as { cars: Loose[] }).cars;
const offKerb = (t: TrafficCars) => carsOf(t).filter((c) => c.parked);

/** One straight side street, 300 m long, with a row of parked cars; nobody driving on it. */
function street() {
  const frame = { toLatLng: (x: number, z: number) => ({ lat: 35.7 - z * 1e-5, lng: 51.5 + x * 1e-5 }) } as unknown as Frame;
  const feed = { empty: true, speedAt: () => null } as unknown as TrafficFeed;
  const t = new TrafficCars(new THREE.Scene(), frame, feed, "real", false);
  const tile = () => ({ signals: [], roads: [new Float32Array([0, 0, 0, 300])], roadKinds: ["minor"], roadWidths: [8], roadDrawn: [true] }) as unknown as TileMeshes;
  t.sync([tile()]);
  // No traffic: only what comes off the kerb moves.
  (t as unknown as { spawn: () => void }).spawn = () => {};
  const tick = (n = 1) => {
    let f: ReturnType<TrafficCars["tick"]> = [];
    for (let i = 0; i < n; i++) f = t.tick(1 / 60, 0, 150);
    return f;
  };
  /** The parked cars drawn now, by their footprints' handles, nearest first. */
  const parked = () => tick().map((f) => f.ref as unknown as Kerb).filter((r) => r && "key" in r);
  /** The same street's tile arriving again (as when you drive away and come back). */
  const reread = () => t.sync([tile()]);
  return { t, tick, parked, reread };
}

describe("a parked car knocked off the kerb", () => {
  before(() => {
    // The soft shadow under each car is painted on a canvas: a blank one will do here.
    const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: "" };
    (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    // The real car models can't be fetched here (the drawn ones stand in, as they do offline).
    mock.method(console, "warn", () => {});
  });

  it("is one loose car, whichever side it's hit from", () => {
    // Across the car both ways, along it both ways, and on the slant: each on a car of its own.
    for (const turn of [Math.PI / 2, -Math.PI / 2, 0, Math.PI, 0.6, -2.4]) {
      const { t, tick, parked } = street();
      const p = parked()[0];
      assert.ok(p, "the street has parked cars");
      const rows = parked().length;
      t.bump(p, -Math.sin(p.yaw + turn) * 6, -Math.cos(p.yaw + turn) * 6, 5);
      tick(3);
      // Hit along the row it may shunt its neighbour off too — but never more cars than left the kerb.
      const loose = offKerb(t).length, left = rows - parked().length;
      assert.equal(loose, left, `turn ${turn}: ${loose} loose cars from ${left} parked ones`);
      if (Math.abs(Math.sin(turn)) === 1) assert.equal(loose, 1, "pushed straight out of the row: it alone");
      tick(120);
      assert.equal(offKerb(t).length, rows - parked().length, "and none appear later");
    }
  });

  it("stays one car when hit again through its old footprint in the same frame", () => {
    const { t, tick, parked } = street();
    const p = parked()[0];
    t.bump(p, 3, 0, 5);
    t.bump(p, 3, 0, 5);
    t.shoot(p, 5);
    assert.equal(t.kindOf(p), p.key, "the old handle still says what it is");
    tick(60);
    assert.equal(offKerb(t).length, 1);
  });

  it("is gone from the kerb at once, and for good when the streets are re-read", () => {
    const { t, tick, parked, reread } = street();
    const p = parked()[0], rows = parked().length;
    t.shoot(p, 5);
    assert.equal(t.nearestToTake(p.x, p.z), 0, "the loose car is there to take");
    for (const again of [false, true]) {
      if (again) reread();
      tick(2);
      assert.equal(parked().length, rows - 1);
      assert.ok(!parked().some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.5));
      assert.equal(offKerb(t).length, 1);
    }
    // A blast among the row: each car thrown is one car.
    const q = parked()[3];
    t.blast(q.x, q.z, (d) => ({ damage: 10, push: Math.max(0, 9 - d) }));
    tick(90);
    assert.equal(offKerb(t).length, rows - parked().length);
  });
});
