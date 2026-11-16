import { test } from "node:test";
import assert from "node:assert/strict";
import { billOf, cleanPlan, compareWays, driveOf, itinerary, legsOf, newPlan, roomsFor, stopDays, tripDays, type Plan } from "../src/lib/travel/plan";
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

test("itinerary: the trip day by day — travel, nights, home", () => {
  const p = { home: "tehran", stops: [{ city: "shiraz", nights: 2 }, { city: "isfahan", nights: 0 }, { city: "kashan", nights: 1 }], back: true, travellers: 2, start: "2026-11-20" };
  const days = itinerary(p);
  assert.deepEqual(days.map((d) => [d.date, d.n]), [["2026-11-20", 1], ["2026-11-21", 2], ["2026-11-22", 3], ["2026-11-23", 4]]);
  assert.deepEqual(days[0].items.map((i) => i.kind), ["go", "night"], "arrive in Shiraz, sleep there");
  const d3 = days[2].items;
  assert.deepEqual(d3.map((i) => (i.kind === "go" ? `${i.leg.from}>${i.leg.to}` : i.kind === "night" ? `night:${i.city}` : `home`)), ["shiraz>isfahan", "isfahan>kashan", "night:kashan"], "pass through Isfahan the same day");
  assert.deepEqual(days[3].items.map((i) => i.kind), ["go", "home"]);
  const n2 = days[1].items[0];
  assert.ok(n2.kind === "night" && n2.night === 2 && n2.of === 2);
  // One-way: no way back, no home.
  assert.ok(!itinerary({ ...p, back: false }).flatMap((d) => d.items).some((i) => i.kind === "home"));
});

test("outings at the destination count in the bill (only in cities still on the trip)", async () => {
  const { activitiesIn, ACTIVITIES } = await import("../src/lib/travel/activities");
  const { billOf, newPlan } = await import("../src/lib/travel/plan");
  const dive = activitiesIn("qeshm").find((a) => a.id === "qeshm:dive")!;
  assert.ok(dive && dive.price > 0);
  assert.ok(new Set(ACTIVITIES.map((a) => a.id)).size === ACTIVITIES.length, "ids are unique");
  const plan = { ...newPlan("tehran"), stops: [{ city: "qeshm", nights: 3 }], travellers: 2, acts: [{ id: dive.id, city: "qeshm", title: dive.title, emoji: dive.emoji, price: 1000, people: 2 }, { id: "kish:dive", city: "kish", title: "x", emoji: "", price: 5000, people: 1 }] };
  const b = billOf(plan, {}, {});
  assert.equal(b.acts, 2000);
  assert.equal(b.total, 2000);
  assert.equal(b.perPerson, 1000);
});

test("the trip on the map: flights bow, the rest go straight, unchosen legs have no way", async () => {
  const { tripRoutes, arcPoints } = await import("../src/lib/travel/routes");
  const plan = { ...newPlan("tehran"), stops: [{ city: "shiraz", nights: 2 }, { city: "kish", nights: 2 }] };
  const legs = legsOf(plan);
  const picks = { [`${legs[0].from}>${legs[0].to}@${legs[0].date}`]: { way: "flight" as const, trip: {} as never } };
  const r = tripRoutes(plan, picks);
  assert.equal(r.length, legs.length);
  assert.equal(r[0].way, "flight");
  assert.ok(r[0].points.length > 2, "an arc");
  assert.equal(r[1].way, null);
  assert.equal(r[1].points.length, 2, "a straight line");
  const arc = arcPoints({ lat: 0, lng: 0 }, { lat: 0, lng: 10 });
  assert.deepEqual(arc[0], [0, 0]);
  assert.deepEqual(arc.at(-1), [0, 10]);
  assert.ok(Math.abs(arc[12][0]) > 0.5, "bowed off the straight line");
});
