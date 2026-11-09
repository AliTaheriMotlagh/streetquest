// Iran's street traffic and the garage built on it: what drives around, how often, and
// that every drivable street car has a model and sensible size.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLEET, FLEET_KEYS, heavy, pickFleet, pickPaint, roomBetween, TAXI_YELLOW } from "@/lib/fleet";
import { applySettings, S } from "@/lib/settings";
import { allowedVehicle, carToTake, drivableOf, drivenVehicle, GARAGE_KEYS, TAKE_MAX_MPS, TAKE_REACH_M, toBody, unlocked, VEHICLE_KEYS, VEHICLES } from "@/lib/vehicles";

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
  it("lists every vehicle but the street-only ones once, new ones after the old (Street Arena sends the index)", () => {
    assert.deepEqual([...GARAGE_KEYS].sort(), VEHICLE_KEYS.filter((k) => !VEHICLES[k].street).sort());
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

describe("taking a car off the street", () => {
  it("drives every street model as a vehicle of its own (a loaded pickup as the pickup, a box bike as the courier)", () => {
    for (const k of FLEET_KEYS) {
      const v = VEHICLES[drivableOf(k)];
      assert.ok(v.model === k || (k === "vanetLoad" && v.key === "vanet") || (k === "bikeBox" && v.key === "courier"), `${k} → ${v.key}`);
      assert.equal(!!v.bike, !!FLEET[k].bike, `${k}: a bike drives as a bike`);
      assert.ok(!v.flies);
    }
  });

  it("never offers the street-only cars in the garage, but lets anyone report driving one", () => {
    try {
      applySettings({ garageFree: false });
      for (const k of VEHICLE_KEYS.filter((v) => VEHICLES[v].street)) {
        assert.equal(allowedVehicle(k, 99), "car", `${k} isn't a garage pick`);
        assert.equal(drivenVehicle(k, 1), k, `${k} can be taken at level 1`);
      }
      // A bus taken off the street, at level 1; the garage's flyers still need their level.
      assert.equal(drivenVehicle("bus", 1), "bus");
      assert.equal(drivenVehicle("heli", 1), "car");
      assert.equal(drivenVehicle("sports", 1), "car");
      assert.equal(drivenVehicle("nope", 1), "car");
    } finally {
      applySettings({});
    }
  });

  it("measures to the car's body, not its middle", () => {
    const bus = { x: 0, z: 0, yaw: 0, len: 12, wid: 2.5 };
    assert.equal(toBody(bus, 0, 5.9), 0);
    assert.ok(Math.abs(toBody(bus, 0, 7) - 1) < 1e-9, "a metre past its tail");
    assert.ok(Math.abs(toBody(bus, 2.25, 0) - 1) < 1e-9, "a metre off its side");
    // Turned a quarter: its length now runs along x.
    assert.ok(Math.abs(toBody({ ...bus, yaw: Math.PI / 2 }, 7, 0) - 1) < 1e-9);
  });

  it("gets into the nearest car in reach that isn't driving off", () => {
    const cars = [
      { id: "far", x: 10, z: 0, yaw: 0, len: 4, wid: 1.7 },
      { id: "near", x: 2, z: 0, yaw: 0, len: 4, wid: 1.7 },
      { id: "moving", x: 1.2, z: 0, yaw: 0, len: 4, wid: 1.7, v: TAKE_MAX_MPS + 1 },
    ];
    assert.equal(carToTake(cars, 0, 0)?.car.id, "near");
    assert.ok(Math.abs(carToTake(cars, 0, 0)!.d - (2 - 0.85)) < 1e-9);
    assert.equal(carToTake(cars, 0, -20), null);
    assert.equal(carToTake([cars[1]], 2 + 0.85 + TAKE_REACH_M + 0.1, 0), null);
  });
});
