import { test } from "node:test";
import assert from "node:assert/strict";
import { billOf, cleanPlan, compareWays, driveOf, legsOf, newPlan, roomsFor, stopDays, tripDays, type Plan } from "../src/lib/travel/plan";
import { cityByKey, type Stay, type Trip } from "../src/lib/travel";

const plan = (over: Partial<Plan> = {}): Plan => ({ home: "tehran", stops: [{ city: "isfahan", nights: 2 }, { city: "shiraz", nights: 3 }], back: true, travellers: 2, start: "2026-12-01", ...over });
const trip = (mode: Trip["mode"], price: number, minutes?: number, seats?: number): Trip => ({ id: `${mode}:${price}`, mode, from: "x", to: "y", depart: "2026-12-01T08:00:00", minutes, price, seats, company: "C", offers: [] });
const stay = (price: number, capacity?: number): Stay => ({ id: `s${price}`, source: "jabama", name: "S", kind: "hotel", city: "isfahan", price, capacity, url: "" } as Stay);

test("legs: home → each city → home, each on the day after the nights before it", () => {
  assert.deepEqual(legsOf(plan()), [
    { i: 0, from: "tehran", to: "isfahan", date: "2026-12-01" },
    { i: 1, from: "isfahan", to: "shiraz", date: "2026-12-03" },
    { i: 2, from: "shiraz", to: "tehran", date: "2026-12-06" },
  ]);
  assert.equal(tripDays(plan()), 5);
  assert.deepEqual(stopDays(plan())[1], { arrive: "2026-12-03", leave: "2026-12-06" });
});

test("one way: no leg back; a stop in the same city is no leg; nowhere yet is no legs", () => {
  assert.equal(legsOf(plan({ back: false })).length, 2);
  assert.equal(legsOf(plan({ stops: [{ city: "tehran", nights: 1 }, { city: "qom", nights: 0 }] })).length, 2);
  assert.deepEqual(legsOf(plan({ stops: [] })), []);
});

test("driving yourself: road distance, time and petrol for every car", () => {
  const d = driveOf(cityByKey("tehran"), cityByKey("isfahan"), 5)!;
  assert.ok(d.km > 380 && d.km < 520, `${d.km} km`);
  assert.equal(d.cars, 2);
  assert.ok(d.minutes > 240);
  assert.equal(d.fuel, d.litres * 3000 * 2);
});

test("the bill: tickets for everyone, fuel per car, stays for each night and enough rooms", () => {
  const p = plan();
  const b = billOf(p, { 0: { way: "train", trip: trip("train", 500_000) }, 1: { way: "car" } }, { 0: { stay: stay(1_000_000, 4) } });
  const fuel = driveOf(cityByKey("isfahan"), cityByKey("shiraz"), 2)!.fuel;
  assert.equal(b.tickets, 1_000_000);
  assert.equal(b.fuel, fuel);
  assert.equal(b.stays, 2_000_000);
  assert.equal(b.total, 3_000_000 + fuel);
  assert.equal(b.perPerson, Math.round(b.total / 2));
  assert.deepEqual(b.open, { legs: 1, stays: 1 });
  assert.equal(roomsFor(stay(1, 2), 5), 3);
});

test("comparing a leg: cheapest and fastest per way, with seats for everyone", () => {
  const ways = compareWays([trip("flight", 3_000_000, 60, 9), trip("flight", 2_000_000, 70, 1), trip("bus", 400_000, 420, 20)], cityByKey("tehran"), cityByKey("mashhad"), 2, ["train"]);
  const f = ways.find((w) => w.way === "flight")!;
  assert.equal(f.n, 1); // the 2 M one has a seat for one
  assert.equal(f.cheapest?.price, 3_000_000);
  assert.equal(ways.find((w) => w.way === "train")!.none, true);
  assert.ok(ways.find((w) => w.way === "car")!.drive!.km > 700);
});

test("a stored plan: unknown cities and odd numbers are dropped, a past start moves to tomorrow", () => {
  const now = Date.parse("2026-12-10T08:00:00Z");
  const p = cleanPlan({ home: "tehran", stops: [{ city: "atlantis", nights: 2 }, { city: "yazd", nights: 99 }], travellers: 40, start: "2026-01-01", back: false }, now)!;
  assert.deepEqual(p.stops, [{ city: "yazd", nights: 30 }]);
  assert.equal(p.travellers, 9);
  assert.equal(p.start, "2026-12-11");
  assert.equal(p.back, false);
  assert.equal(cleanPlan({ home: "nowhere" }), null);
  assert.equal(newPlan("tehran", now).start, "2026-12-11");
});
