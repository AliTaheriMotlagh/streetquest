// A destination's guide (lib/travel/guide.ts) and the "before you go" checklist (lib/travel/prep.ts): Kish's places
// on the island, linked to real outings; the checklist built from what the plan holds, its ticks kept in the plan.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUIDE_KIND_KEYS, GUIDES, guideCounts, guideName, guideOf, guidePlaces, hasGuide } from "@/lib/travel/guide";
import { prepDone, prepFor, PREP_GROUP_KEYS } from "@/lib/travel/prep";
import { ACTIVITIES } from "@/lib/travel/activities";
import { cleanPlan, type LegPick, type Plan } from "@/lib/travel/plan";
import { cityByKey } from "@/lib/travel";
import { EXPLORE_PLACES } from "@/lib/explore";
import { CITIES as PACKS } from "@/lib/cityPack";
import { distanceM } from "@/lib/geo";

const acts = new Set(ACTIVITIES.map((a) => a.id));

const plan = (over: Partial<Plan> = {}): Plan => ({ home: "tehran", stops: [{ city: "kish", nights: 3 }], back: true, travellers: 2, start: "2026-12-10", ...over });
const ids = (p: Plan, picks: Record<number, LegPick | undefined> = {}) => prepFor(p, picks).map((x) => x.id);

describe("destination guide", () => {
  it("every guide is a travel city, its places unique, on the island, each kind known", () => {
    for (const [city, g] of Object.entries(GUIDES)) {
      assert.ok(cityByKey(city), city);
      const seen = new Set<string>();
      for (const p of g.places) {
        assert.ok(!seen.has(p.id), `twice: ${p.id}`);
        seen.add(p.id);
        assert.ok(p.id.startsWith(`${city}:`) && p.city === city);
        assert.ok(GUIDE_KIND_KEYS.includes(p.kind));
        assert.ok(p.fa && p.en);
        assert.ok(distanceM(g.centre, p) < g.reachKm * 1000, `${p.id} is far from ${city}`);
        if (p.act) assert.ok(acts.has(p.act) && p.act.startsWith(`${city}:`), `${p.id} → ${p.act}`);
      }
    }
  });
  it("the big cities have guides with fun in them, each linked to outings", () => {
    for (const city of ["tehran", "mashhad", "isfahan", "shiraz", "tabriz", "yazd", "qeshm"]) {
      const g = guideOf(city)!;
      assert.ok(g && g.places.length >= 15, city);
      assert.ok(g.places.filter((p) => p.kind === "fun" || p.kind === "beach").length >= 3, `${city}: fun`);
      assert.ok(g.places.some((p) => p.kind === "go"), `${city}: how to get there`);
      assert.ok(g.places.filter((p) => p.act).length >= 3, `${city}: outings`);
    }
    // At Isfahan's Si-o-se-pol, the bridge itself comes first.
    assert.equal(guidePlaces("isfahan", "all", { lat: 32.6446, lng: 51.6675 })[0].id, "isfahan:si-o-se");
  });
  it("Kish: beaches, sights, fun, malls, parks, the airport and a hospital — each place's outing exists", () => {
    const g = guideOf("kish")!;
    assert.ok(hasGuide("kish") && !hasGuide("rasht") && guideOf("rasht") === null);
    for (const k of GUIDE_KIND_KEYS) assert.ok(g.places.some((p) => p.kind === k), `no ${k}`);
    assert.ok(g.places.length >= 50);
    const acts = new Set(ACTIVITIES.map((a) => a.id));
    for (const p of g.places) if (p.act) assert.ok(acts.has(p.act), `${p.id} → ${p.act}`);
    assert.equal(guideName(g.places.find((p) => p.id === "kish:greek-ship")!, "fa"), "کشتی یونانی");
    assert.equal(guideName(g.places.find((p) => p.id === "kish:greek-ship")!, "en"), "Greek Ship");
  });
  it("filters by kind, sorts nearest first, counts by kind", () => {
    const beaches = guidePlaces("kish", "beach");
    assert.ok(beaches.length >= 4 && beaches.every((p) => p.kind === "beach"));
    const near = guidePlaces("kish", "all", { lat: 26.5263, lng: 53.9081 }); // at the Greek ship
    assert.equal(near[0].id, "kish:greek-ship");
    const counts = guideCounts("kish");
    assert.equal(counts.reduce((n, c) => n + c.n, 0), guideOf("kish")!.places.length);
    assert.deepEqual(guidePlaces("nowhere"), []);
  });
  it("Kish is a quick jump on the map and a 3D city pack holding the whole guide", () => {
    assert.ok(EXPLORE_PLACES.some((x) => x.id === "kish"));
    const pack = PACKS.find((c) => c.slug === "kish")!;
    for (const p of guideOf("kish")!.places) assert.ok(p.lat >= pack.south && p.lat <= pack.north && p.lng >= pack.west && p.lng <= pack.east, p.id);
  });
});

describe("before you go", () => {
  it("basics always; a flight is assumed to an island until a way is picked", () => {
    const l = ids(plan());
    for (const id of ["id-card", "cards", "charger", "meds", "weather", "tell", "tickets-offline", "airport-early", "baggage", "check-in", "swim", "sun"]) assert.ok(l.includes(id), id);
    assert.ok(!l.includes("car-check"));
  });
  it("Kish's own items: free zone, separate beaches, duty-free, getting around", () => {
    const l = ids(plan());
    for (const id of ["kish-visa", "kish-beaches", "kish-shopping", "kish-around"]) assert.ok(l.includes(id), id);
    assert.ok(!ids(plan({ stops: [{ city: "isfahan", nights: 2 }] })).some((x) => x.startsWith("kish-")));
  });
  it("by car: the car check, its papers and — to Kish — the car ferry; no flight items", () => {
    const l = ids(plan(), { 0: { way: "car" }, 1: { way: "car" } });
    for (const id of ["car-check", "car-papers", "fuel-card", "kish-car-ferry"]) assert.ok(l.includes(id), id);
    assert.ok(!l.includes("airport-early") && !l.includes("tickets-offline"));
  });
  it("the south's hot months, and no flying straight after diving", () => {
    assert.ok(ids(plan({ start: "2027-07-01" })).includes("heat"));
    assert.ok(!ids(plan({ start: "2026-12-10" })).includes("heat"));
    assert.ok(!ids(plan({ start: "2027-07-01", stops: [{ city: "tabriz", nights: 2 }] })).includes("heat"), "north is fine");
    const dive = plan({ acts: [{ id: "kish:dive", city: "kish", title: "Scuba diving", emoji: "🤿", price: 1, people: 2 }] });
    assert.ok(ids(dive).includes("no-fly-dive"));
  });
  it("each item once, grouped in order; ticks count", () => {
    const items = prepFor(plan({ stops: [{ city: "kish", nights: 2 }, { city: "kish", nights: 1 }] }));
    assert.equal(new Set(items.map((x) => x.id)).size, items.length);
    const order = items.map((x) => PREP_GROUP_KEYS.indexOf(x.group));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(prepDone(items, ["id-card", "swim", "not-there"]), 2);
  });
  it("the ticks are kept in the plan: strings only, no repeats", () => {
    const p = cleanPlan({ ...plan(), start: "2099-01-01", prep: ["id-card", "id-card", 5, "Bad Id!", "swim"] })!;
    assert.deepEqual(p.prep, ["id-card", "swim"]);
    assert.equal(cleanPlan({ ...plan(), start: "2099-01-01" })!.prep, undefined);
  });
});
