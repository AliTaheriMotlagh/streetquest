import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBuses, buildNetwork, cityAt, cleanLine, cleanStation, hoursOf, minutesOf, modeOf, type RawNode, type RawRel } from "@/lib/transit/network";
import { departures, localMinutes, nearStations, planTrip } from "@/lib/transit/plan";
import { busOf, etaMin, soapBody, soapJson } from "@/lib/transit/iett";

// A small Tehran: Line 1 runs north–south through A B C D, Line 2 west–east through E C F;
// they meet at C. Each station has two stop nodes (the two platforms), ~40 m apart.
const LAT = 35.7, LNG = 51.4, STEP = 0.01; // ~1.1 km north, ~0.9 km east
let id = 1;
const nodes = new Map<number, RawNode>();
const stop = (name: string, lat: number, lng: number, en = "") => {
  const a = id++, b = id++;
  nodes.set(a, { id: a, lat, lon: lng, tags: { name, ...(en ? { "name:en": en } : {}), public_transport: "stop_position" } });
  nodes.set(b, { id: b, lat: lat + 0.0003, lon: lng, tags: { name, public_transport: "platform" } });
  return [a, b];
};
const A = stop("الف", LAT + 3 * STEP, LNG, "Alef"), B = stop("ب", LAT + 2 * STEP, LNG), C = stop("ج", LAT + STEP, LNG, "Jim"), D = stop("د", LAT, LNG);
const E = stop("ه", LAT + STEP, LNG - STEP), F = stop("و", LAT + STEP, LNG + 2 * STEP);
// Line 2's stop at C is its own node with the same name, 100 m off: still one station (the interchange).
const C2 = stop("ج", LAT + STEP + 0.0009, LNG);
const route = (rid: number, tags: Record<string, string>, ...ss: number[][]): RawRel => ({ id: rid, tags: { type: "route", ...tags }, members: ss.flatMap(([s, p]) => [{ type: "node", ref: s, role: "stop" }, { type: "node", ref: p, role: "platform" }]) });
const rels: RawRel[] = [
  route(100, { route: "subway", ref: "1", name: "خط ۱: الف ← د", colour: "#E0001B" }, A, B, C, D),
  route(101, { route: "subway", ref: "1", name: "خط ۱: د ← الف" }, D, C, B), // shorter direction: ignored
  route(200, { route: "subway", ref: "2", name: "خط ۲", colour: "#2F4389" }, E, C2, F),
  { id: 300, tags: { type: "route_master", route: "subway", ref: "2", interval: "00:04", opening_hours: "Mo-Su 05:30-23:00" }, members: [{ type: "relation", ref: 200, role: "" }] },
  route(400, { route: "train", ref: "X", name: "Freight" }, A, D), // not the metro
];
const net = buildNetwork("tehran", rels, nodes, "2026-11-14");
const line = (ref: string) => net.lines.find((l) => l.ref === ref)!;
const sta = (name: string) => net.stations.find((s) => s.name === name)!;

describe("transit: reading OSM", () => {
  it("knows the city, the metro's modes and OSM's times", () => {
    assert.equal(cityAt({ lat: 35.69, lng: 51.39 }), "tehran");
    assert.equal(cityAt({ lat: 41.01, lng: 28.98 }), "istanbul");
    assert.equal(cityAt({ lat: 52.5, lng: 13.4 }), null);
    assert.equal(modeOf({ route: "subway" }), "subway");
    assert.equal(modeOf({ route: "train", name: "Marmaray" }), "train");
    assert.equal(modeOf({ route: "train", name: "Freight" }), null);
    assert.equal(minutesOf("00:05"), 5);
    assert.equal(minutesOf("7"), 7);
    assert.equal(minutesOf("PT10M"), 10);
    assert.equal(minutesOf("soon"), null);
    assert.deepEqual(hoursOf("Mo-Su 05:30-23:00"), { from: 330, to: 1380 });
    assert.deepEqual(hoursOf("06:00-00:30"), { from: 360, to: 1470 });
    assert.equal(cleanStation("ایستگاه مترو شهید کلاهدوز"), "شهید کلاهدوز");
    assert.equal(cleanStation("Shahid Kolahdouz metro station"), "Shahid Kolahdouz");
    assert.equal(cleanStation("Taksim İstasyonu"), "Taksim");
    assert.equal(cleanLine("Line 5 eastbound"), "Line 5");
    assert.equal(cleanLine("M2: Yenikapı → Hacıosman"), "M2");
    assert.equal(cleanLine("M4 Kadıköy → Sabiha Gökçen"), "M4 Kadıköy");
  });
  it("one line per ref (its longest direction), stations merged across platforms and lines", () => {
    assert.deepEqual(net.lines.map((l) => l.ref), ["1", "2"]);
    assert.equal(line("1").stations.length, 4);
    assert.equal(line("1").name, "خط ۱");
    assert.equal(line("1").colour, "#E0001B");
    assert.equal(net.stations.length, 6);
    // C is one station on both lines.
    assert.deepEqual(sta("ج").lines.sort(), ["subway:1", "subway:2"]);
    assert.equal(sta("ج").en, "Jim");
  });
  it("times from the route master, else the city's usual (flagged)", () => {
    assert.deepEqual([line("2").headway, line("2").from, line("2").to, line("2").mapped], [4, 330, 1380, true]);
    assert.deepEqual([line("1").headway, line("1").mapped], [7, false]);
  });
  it("bus stops with every line calling there; both poles of a stop are one stop", () => {
    const bnodes = new Map<number, RawNode>([
      [1, { id: 1, lat: 35.7, lon: 51.4, tags: { name: "Vanak", highway: "bus_stop" } }],
      [2, { id: 2, lat: 35.7002, lon: 51.4001, tags: { name: "Vanak", highway: "bus_stop" } }],
      [3, { id: 3, lat: 35.71, lon: 51.41, tags: { name: "Tajrish", highway: "bus_stop" } }],
    ]);
    const bus = (rid: number, ref: string, ...ns: number[]): RawRel => ({ id: rid, tags: { type: "route", route: "bus", ref, from: "A", to: "B" }, members: ns.map((n) => ({ type: "node", ref: n, role: "platform" })) });
    const b = buildBuses("tehran", [bus(1, "128", 1, 3), bus(2, "BRT 7", 2), bus(4, "101;901", 3), { id: 3, tags: { type: "route_master", route: "bus", ref: "128", interval: "10" }, members: [{ type: "relation", ref: 1, role: "" }] }], bnodes, "x");
    assert.equal(b.stops.length, 2);
    assert.deepEqual(b.stops.find((s) => s.name === "Vanak")!.lines, ["128", "BRT 7"]);
    assert.deepEqual(b.stops.find((s) => s.name === "Tajrish")!.lines, ["101", "128", "901"]);
    assert.deepEqual([b.lines["128"].headway, b.lines["128"].mapped, b.lines["BRT 7"].headway], [10, true, 15]);
  });
});

describe("transit: getting about", () => {
  it("nearest stations with the walk", () => {
    const n = nearStations(net, { lat: LAT + 3 * STEP + 0.002, lng: LNG });
    assert.equal(n[0].station.name, "الف");
    assert.ok(n[0].m > 150 && n[0].m < 300, String(n[0].m));
    assert.ok(n[0].walk >= 3 && n[0].walk <= 5);
  });
  it("next trains every headway while it runs; the first train when it doesn't", () => {
    const l2 = line("2"); // every 4 min from 05:30
    assert.deepEqual(departures(l2, 330 + 9).next, [3, 7, 11]);
    assert.deepEqual(departures(l2, 330 + 8).next, [0, 4, 8]);
    const night = departures(l2, 60);
    assert.equal(night.running, false);
    assert.equal(night.first, 330);
    // The last trains: nothing after the end of service.
    assert.deepEqual(departures(l2, 1379).next, []);
  });
  it("reads the local clock in the city's time zone", () => {
    assert.equal(localMinutes(new Date("2026-11-14T10:00:00Z"), "Asia/Tehran"), 13 * 60 + 30);
    assert.equal(localMinutes(new Date("2026-11-14T10:00:00Z"), "Europe/Istanbul"), 13 * 60);
  });
  it("plans a trip with a change where the lines meet", () => {
    const from = { lat: LAT + 3 * STEP, lng: LNG + 0.001 }, to = { lat: LAT + STEP, lng: LNG + 2 * STEP + 0.001 };
    const trip = planTrip(net, from, to)!;
    assert.ok(trip);
    assert.equal(trip.changes, 1);
    const rides = trip.legs.filter((l) => l.kind === "ride");
    assert.deepEqual(rides.map((r) => r.kind === "ride" && [r.line, r.stops]), [["subway:1", 2], ["subway:2", 1]]);
    assert.equal(trip.legs[0].kind, "walk");
    assert.equal(trip.legs[trip.legs.length - 1].kind, "walk");
    assert.ok(trip.minutes > 10 && trip.minutes < 40, String(trip.minutes));
  });
  it("no trip when walking is quicker, or nothing is in reach", () => {
    assert.equal(planTrip(net, { lat: LAT, lng: LNG }, { lat: LAT + 0.001, lng: LNG }), null);
    assert.equal(planTrip(net, { lat: 30, lng: 50 }, { lat: LAT, lng: LNG }), null);
  });
});

describe("transit: Istanbul's live buses (IETT)", () => {
  it("asks in SOAP and reads the JSON inside the answer", () => {
    const body = soapBody("GetHatOtoKonum_json", { HatKodu: "500T" });
    assert.match(body, /<GetHatOtoKonum_json xmlns="http:\/\/tempuri.org\/"><HatKodu>500T<\/HatKodu><\/GetHatOtoKonum_json>/);
    const rows = [{ kapino: "A-1234", boylam: "28.98", enlem: "41.03", hatkodu: "500T", yon: "TUZLA", son_konum_zamani: "2026-11-14 13:05:00", yakinDurakKodu: "301471" }];
    const xml = `<soap:Envelope><soap:Body><GetHatOtoKonum_jsonResponse><GetHatOtoKonum_jsonResult>${JSON.stringify(rows).replace(/"/g, "&quot;")}</GetHatOtoKonum_jsonResult></GetHatOtoKonum_jsonResponse></soap:Body></soap:Envelope>`;
    const got = soapJson(xml, "GetHatOtoKonum_json");
    assert.equal(got.length, 1);
    assert.deepEqual(busOf(got[0]), { id: "A-1234", lat: 41.03, lng: 28.98, line: "500T", towards: "TUZLA", near: "301471", at: Date.UTC(2026, 10, 14, 10, 5, 0) });
    assert.deepEqual(soapJson("<html>blocked</html>", "GetHatOtoKonum_json"), []);
  });
  it("reads the fleet's rows (other names, speed) and drops buses with no real position", () => {
    assert.deepEqual(busOf({ Operator: "IETT", KapiNo: "C-501", Boylam: 29.01, Enlem: 41.0, Hiz: 32, Saat: "10:00:00" }, Date.UTC(2026, 10, 14, 8, 0, 0)), { id: "C-501", lat: 41, lng: 29.01, kmh: 32, at: Date.UTC(2026, 10, 14, 7, 0, 0) });
    assert.equal(busOf({ KapiNo: "X", Boylam: 0, Enlem: 0 }), null);
    assert.equal(busOf({ Boylam: 29, Enlem: 41 }), null);
  });
  it("estimates minutes to a stop from where the bus is", () => {
    const bus = { id: "a", lat: 41.0, lng: 29.0 };
    assert.equal(etaMin(bus, bus), 0);
    // ~1.1 km away ×1.4 at 17 km/h → about 5–6 minutes.
    const m = etaMin(bus, { lat: 41.01, lng: 29.0 });
    assert.ok(m >= 5 && m <= 6, String(m));
  });
});
