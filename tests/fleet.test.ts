// Iran's street traffic and the garage built on it: what drives around, how often, and
// that every drivable street car has a model and sensible size.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLEET, FLEET_KEYS, heavy, pickFleet, pickPaint, roomBetween, TAXI_YELLOW } from "@/lib/fleet";
import { applySettings, S } from "@/lib/settings";
import { allowedVehicle, GARAGE_KEYS, unlocked, VEHICLE_KEYS, VEHICLES } from "@/lib/vehicles";

/** A fixed sequence of "random" numbers. */
const seq = (xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("street traffic", () => {
  it("is mostly Prides and Peugeots, buses and minibuses only on main roads", () => {
    const n: Record<string, number> = {};
    const r = Math.random;
    for (let i = 0; i < 4000; i++) {
      const k = pickFleet(r, false);
      n[k] = (n[k] ?? 0) + 1;
    }
    assert.equal(n.bus ?? 0, 0, "no bus down a side street");
    assert.equal(n.minibus ?? 0, 0, "no minibus either");
    assert.ok((n.khavar ?? 0) > 0, "Khavar trucks go everywhere");
    assert.ok((n.pride ?? 0) > (n.peykan ?? 0) * 2, "more Prides than Peykans");
    assert.ok(FLEET_KEYS.every((k) => FLEET[k].majorOnly || (n[k] ?? 0) > 0), "every other model turns up");
    const main: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const k = pickFleet(r, true);
      main[k] = (main[k] ?? 0) + 1;
    }
    assert.ok(main.bus > 0 && main.minibus > 0, "buses and minibuses on the main roads");
  });

  it("walks the shares in order (the first pick on a 0)", () => {
    assert.equal(pickFleet(seq([0]), true), FLEET_KEYS[0]);
    assert.equal(pickFleet(seq([0.999999]), true), FLEET_KEYS[FLEET_KEYS.length - 1]);
  });

  it("paints a taxi yellow and others in their usual colours", () => {
    assert.equal(pickPaint("taxi", Math.random), TAXI_YELLOW);
    for (const k of FLEET_KEYS) assert.ok(FLEET[k].paints.includes(pickPaint(k, seq([0.5]))));
  });

  it("keeps a gap bumper to bumper (a bus needs more room than a Pride)", () => {
    const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
    near(roomBetween(10, "pride", "pride"), 10 - FLEET.pride.len);
    assert.ok(roomBetween(10, "pride", "bus") < roomBetween(10, "pride", "pride"));
    near(roomBetween(10, "pride", 4), 10 - FLEET.pride.len / 2 - 2);
  });

  it("knows the big, slow ones", () => {
    assert.ok(heavy("bus") && heavy("minibus") && heavy("khavar"));
    assert.ok(!heavy("pride") && !heavy("vanet") && !heavy("bikeBox"));
  });
});

describe("the garage", () => {
  it("lists every vehicle once, new ones after the old (Street Arena sends the index)", () => {
    assert.deepEqual([...GARAGE_KEYS].sort(), [...VEHICLE_KEYS].sort());
    assert.deepEqual(VEHICLE_KEYS.slice(0, 6), ["car", "moto", "pickup", "drone", "sports", "heli"]);
  });

  it("builds each street car from its model, its collision circles inside its length", () => {
    for (const k of VEHICLE_KEYS) {
      const v = VEHICLES[k];
      if (!v.model) continue;
      const len = FLEET[v.model].len;
      for (const p of v.probes ?? []) assert.ok(Math.abs(p) + v.radius <= len / 2 + 0.5, `${k}: a circle sticks out of the car`);
    }
  });

  it("opens every vehicle from level 1 while the garage is free, by level otherwise", () => {
    try {
      applySettings({});
      assert.equal(S.garageFree, true);
      assert.ok(unlocked("heli", 1) && unlocked("drone", 1));
      assert.equal(allowedVehicle("heli", 1), "heli");
      applySettings({ garageFree: false });
      assert.ok(!unlocked("heli", 1) && unlocked("heli", VEHICLES.heli.level));
      assert.equal(allowedVehicle("heli", 1), "car");
    } finally {
      applySettings({});
    }
  });
});
