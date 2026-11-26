import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attachExits, buildBuses, buildNetwork, cityAt, cleanLine, cleanStation, hoursOf, minutesOf, modeOf, orderStops, type Network, type RawNode, type RawRel } from "@/lib/transit/network";
import { clockOf, departures, localMinutes, nearStations, planTrip, planTrips, rideStops, timeline } from "@/lib/transit/plan";
import { fareRule, tripFare } from "@/lib/transit/fares";
import { focusOf, metroPaths, onFocus } from "@/lib/transit/draw";
import { arrivalsAt, asmxJson, busesNear, busOf, etaMin, soapBody, soapJson } from "@/lib/transit/iett";
import { csvRow, csvTable, departuresAt, gtfsMinutes, TimetableBuilder, weekBits } from "@/lib/transit/gtfs";

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
  it("a trip as a timetable: each step's clock times, the stations each ride passes", () => {
    const from = { lat: LAT + 3 * STEP, lng: LNG + 0.001 }, to = { lat: LAT + STEP, lng: LNG + 2 * STEP + 0.001 };
    const trip = planTrip(net, from, to)!;
    const steps = timeline(trip, 23 * 60 + 50);
    assert.equal(steps.length, trip.legs.length);
    for (let i = 1; i < steps.length; i++) assert.equal(steps[i].start, steps[i - 1].end);
    assert.equal(clockOf(steps[0].start), "23:50");
    assert.equal(clockOf(24 * 60 + 5), "00:05", "past midnight wraps");
    const ride = trip.legs.find((l) => l.kind === "ride")!;
    if (ride.kind !== "ride") throw new Error();
    const stops = rideStops(line(ride.line.split(":")[1]), ride.from, ride.to);
    assert.equal(stops.length, ride.stops + 1);
    assert.equal(stops[0], ride.from);
    assert.equal(stops[stops.length - 1], ride.to);
  });
  it("no trip when walking is quicker, or nothing is in reach", () => {
    assert.equal(planTrip(net, { lat: LAT, lng: LNG }, { lat: LAT + 0.001, lng: LNG }), null);
    assert.equal(planTrip(net, { lat: 30, lng: 50 }, { lat: LAT, lng: LNG }), null);
  });
});

// A slow tram straight from X to Y, and two fast metro lines X→M, M→Y meeting at M.
const X = { id: "x", name: "X", en: "X", lat: 35.7, lng: 51.3, lines: ["tram:T", "subway:A"] };
const Y = { id: "y", name: "Y", en: "Y", lat: 35.7, lng: 51.366, lines: ["tram:T", "subway:B"] };
const M = { id: "m", name: "M", en: "M", lat: 35.695, lng: 51.333, lines: ["subway:A", "subway:B"] };
const T = [1, 2, 3, 4].map((i) => ({ id: `t${i}`, name: `T${i}`, en: "", lat: 35.705, lng: 51.3 + i * 0.0132, lines: ["tram:T"] }));
const lineOf = (id: string, mode: "tram" | "subway", stations: string[], headway: number) => ({ id, ref: id.split(":")[1], name: id, en: id, mode, colour: "#123456", stations, headway, from: 300, to: 1400, mapped: false });
const two: Network = {
  city: "tehran", built: "x", tz: "Asia/Tehran",
  stations: [X, ...T, M, Y],
  lines: [lineOf("tram:T", "tram", ["x", "t1", "t2", "t3", "t4", "y"], 6), lineOf("subway:A", "subway", ["x", "m"], 4), lineOf("subway:B", "subway", ["m", "y"], 4)],
};

describe("transit: RAPTOR trips, fares, the map, exits", () => {
  it("the Pareto set: the direct (slower) ride and the faster one with a change", () => {
    const trips = planTrips(two, X, Y);
    assert.equal(trips.length, 2);
    assert.deepEqual(trips.map((x) => x.changes), [0, 1]);
    assert.ok(trips[1].minutes < trips[0].minutes, `${trips[1].minutes} < ${trips[0].minutes}`);
    const rides = trips[1].legs.filter((l) => l.kind === "ride");
    assert.deepEqual(rides.map((r) => r.kind === "ride" && [r.line, r.from, r.to, r.towards]), [["subway:A", "x", "m", "m"], ["subway:B", "m", "y", "y"]]);
    // planTrip is the fastest of them.
    assert.equal(planTrip(two, X, Y)!.minutes, trips[1].minutes);
  });
  it("the timeline adds up to the trip (less the corridor and exit minutes)", () => {
    const fast = planTrips(two, X, Y)[1];
    const steps = timeline(fast, 600);
    assert.ok(steps[steps.length - 1].end - 600 <= fast.minutes);
    assert.ok(fast.minutes - (steps[steps.length - 1].end - 600) <= 6);
  });
  it("a direct ride slower than walking all the way isn't offered", () => {
    // A tram every 200 min (a 100-min wait) loses to the ~94-min walk: only the change trip remains.
    const slow: Network = { ...two, lines: [{ ...two.lines[0], headway: 200 }, two.lines[1], two.lines[2]] };
    const trips = planTrips(slow, X, Y);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].changes, 1);
  });
  it("fares: Iran pays once at the gate, Istanbul each boarding at the transfer fare", () => {
    const s = { metroFareToman: 4000, metroFareOtherToman: 2500, metroFareTry: 35, metroTransferTry: 24 };
    assert.equal(tripFare({ changes: 2 }, fareRule("tehran", s)), 4000);
    assert.equal(tripFare({ changes: 0 }, fareRule("mashhad", s)), 2500);
    assert.deepEqual(fareRule("istanbul", s).currency, "TRY");
    assert.equal(tripFare({ changes: 1 }, fareRule("istanbul", s)), 59);
    assert.equal(tripFare({ changes: 0 }, fareRule("tehran", { ...s, metroFareToman: 0 })), 0);
  });
  it("the map: every line drawn; a tapped station's lines bold and on top, the rest faded", () => {
    const all = metroPaths(two);
    assert.equal(all.length, 3);
    assert.ok(all.every((p) => !p.focus && p.points.length >= 2));
    const f = focusOf(M)!;
    const focused = metroPaths(two, f);
    assert.deepEqual(focused.slice(-2).map((p) => p.id).sort(), ["subway:A", "subway:B"]);
    const tram = focused.find((p) => p.id === "tram:T")!;
    const sub = focused.find((p) => p.id === "subway:A")!;
    assert.ok(sub.weight > tram.weight && sub.opacity > tram.opacity);
    assert.equal(onFocus(T[0], f), false);
    assert.equal(onFocus(X, f), true);
    assert.equal(focusOf(null), null);
  });
  it("exits hang on the nearest station (its name wins), sorted by sign, duplicates dropped", () => {
    const e = (id: number, lat: number, lon: number, tags: Record<string, string>): RawNode => ({ id, lat, lon, tags: { railway: "subway_entrance", ...tags } });
    const out = attachExits(two, [
      e(1, 35.7005, 51.3, { ref: "2", name: "Azadi St", wheelchair: "yes" }),
      e(2, 35.6995, 51.3, { ref: "1", elevator: "yes" }),
      e(3, 35.69951, 51.30001, { ref: "1" }), // the same entrance again
      e(4, 35.6952, 51.333, { ref: "A", "railway:station": "M" }),
      e(5, 36.5, 52, { ref: "9" }), // nowhere near
      { id: 6, lat: 35.7, lon: 51.3, tags: { highway: "bus_stop" } }, // not an entrance
    ]);
    const x = out.stations.find((s) => s.id === "x")!;
    assert.deepEqual(x.exits!.map((ex) => [ex.ref, ex.name, !!ex.lift, !!ex.stepFree]), [["1", "", true, false], ["2", "Azadi St", false, true]]);
    assert.deepEqual(out.stations.find((s) => s.id === "m")!.exits!.map((ex) => ex.ref), ["A"]);
    assert.equal(out.stations.find((s) => s.id === "y")!.exits, undefined);
    assert.equal(two.stations[0].exits, undefined, "the input isn't changed");
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

describe("transit: Istanbul's buses from the phone (no relay)", () => {
  it("reads ASMX's HTTP GET answer as well as the SOAP one", () => {
    const rows = [{ kapino: "X-1", enlem: "41.01", boylam: "29.0" }];
    const xml = `<?xml version="1.0"?><string xmlns="http://tempuri.org/">${JSON.stringify(rows).replace(/"/g, "&quot;")}</string>`;
    assert.equal(asmxJson(xml, "GetFiloAracKonum_json").length, 1);
    assert.deepEqual(asmxJson("<html>no</html>", "GetFiloAracKonum_json"), []);
  });
  it("arrivals: live lines by their nearest bus, the rest every headway, soonest first", () => {
    const stop = { lat: 41.0, lng: 29.0 };
    const a = arrivalsAt(stop, ["500T", "15F", "E-10"], [[{ id: "a", lat: 41.01, lng: 29.0 }, { id: "far", lat: 41.5, lng: 29.0 }], null, []], { "500T": 10, "15F": 12, "E-10": 20 });
    assert.deepEqual(a.map((x) => [x.line, x.live, x.minutes === null ? null : x.minutes > 0]), [["500T", true, true], ["15F", false, null], ["E-10", true, null]]);
  });
  it("keeps the buses round a point, nearest first", () => {
    const at = { lat: 41.0, lng: 29.0 };
    const near = busesNear([{ id: "b", lat: 41.02, lng: 29.0 }, { id: "a", lat: 41.001, lng: 29.0 }, { id: "x", lat: 42, lng: 29 }], at);
    assert.deepEqual(near.map((b) => b.id), ["a", "b"]);
  });
});

describe("transit: real timetables (GTFS)", () => {
  // A tiny feed: line 500T Tuzla → Kadıköy (3 stops), weekdays 07:00, 07:20, 23:50; Sundays 09:00.
  const feed = () => {
    const b = new TimetableBuilder("Europe/Istanbul", "test");
    b.routes(csvTable("route_id,route_short_name\nR1,500T"));
    b.tripsTable(csvTable("route_id,service_id,trip_id,trip_headsign\nR1,WK,t1,Kadıköy\nR1,WK,t2,Kadıköy\nR1,WK,t3,Kadıköy\nR1,SU,t4,Kadıköy\nR1,WK,x1,"));
    b.stopsTable(csvTable('stop_id,stop_name,stop_lat,stop_lon\nA,"Tuzla, İskele",40.8,29.3\nB,Pendik,40.9,29.2\nC,Kadıköy,40.99,29.02'));
    b.calendar(csvTable("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday\nWK,1,1,1,1,1,0,0\nSU,0,0,0,0,0,0,1"));
    for (const [id, start] of [["t1", "07:00:00"], ["t2", "07:20:00"], ["t3", "23:50:00"], ["t4", "09:00:00"]] as const) {
      const s = gtfsMinutes(start)!;
      const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
      b.trip(id, [{ seq: 3, stop: "C", time: hm(s + 50) }, { seq: 1, stop: "A", time: hm(s) }, { seq: 2, stop: "B", time: hm(s + 20) }]);
    }
    return b.result("2026-11-14");
  };
  it("reads CSV with quotes and a byte-order mark; times past midnight", () => {
    assert.deepEqual(csvRow('a,"b, c","say ""hi"""'), ["a", "b, c", 'say "hi"']);
    assert.deepEqual(csvTable("﻿x,y\n1,2")[0], { x: "1", y: "2" });
    assert.equal(gtfsMinutes("25:10:00"), 1510);
    assert.equal(weekBits({ monday: "1", sunday: "1" }), 1 | 64);
  });
  it("one pattern per way a line runs, with the minutes to each stop and departures by days", () => {
    const tt = feed();
    const [p] = tt.lines["500T"];
    assert.equal(p.headsign, "Kadıköy");
    assert.deepEqual(p.names, ["Tuzla, İskele", "Pendik", "Kadıköy"]);
    assert.deepEqual(p.offsets, [0, 20, 50]);
    assert.deepEqual(p.days["31"], [420, 440, 1430]);
    assert.deepEqual(p.days["64"], [540]);
  });
  it("the next buses at a stop on its own day, yesterday's late bus after midnight, first and last", () => {
    const tt = feed(), pendik = { lat: 40.9, lng: 29.2 };
    // Monday 2026-11-16 07:05 in Istanbul (UTC+3) → 04:05 UTC: the 07:20 and 07:40 at Pendik (+20).
    const [d] = departuresAt(tt.lines["500T"], pendik, new Date("2026-11-16T04:05:00Z"), tt.tz);
    assert.deepEqual([d.headsign, d.left, d.toEnd], ["Kadıköy", 1, 30]);
    assert.deepEqual(d.next, [440, 460, 1450]);
    assert.deepEqual([d.first, d.last], [440, 1450]);
    assert.deepEqual(d.ahead, [{ name: "Kadıköy", min: 30 }]);
    // Tuesday 00:05: Monday's 23:50 from Tuzla passes Pendik at 00:10.
    assert.deepEqual(departuresAt(tt.lines["500T"], pendik, new Date("2026-11-16T21:05:00Z"), tt.tz)[0].next.slice(0, 1), [10]);
    // Sunday: only the 09:00 (Pendik 09:20).
    assert.deepEqual(departuresAt(tt.lines["500T"], pendik, new Date("2026-11-15T05:00:00Z"), tt.tz)[0].next, [560]);
    // The end of the line isn't a place to board; a stop far away isn't on it.
    assert.equal(departuresAt(tt.lines["500T"], { lat: 40.99, lng: 29.02 }, new Date(), tt.tz).length, 0);
    assert.equal(departuresAt(tt.lines["500T"], { lat: 41.2, lng: 28.9 }, new Date(), tt.tz).length, 0);
  });
  it("bus lines keep their stops in order each way (the stop card's stops ahead)", () => {
    const n = new Map<number, RawNode>([
      [1, { id: 1, lat: 41.0, lon: 29.0, tags: { name: "A" } }],
      [2, { id: 2, lat: 41.01, lon: 29.0, tags: { name: "B" } }],
      [3, { id: 3, lat: 41.02, lon: 29.0, tags: { name: "C" } }],
    ]);
    const way = (id: number, ...ns: number[]): RawRel => ({ id, tags: { type: "route", route: "bus", ref: "15F", operator: "İETT", opening_hours: "06:00-23:30" }, members: ns.map((x) => ({ type: "node", ref: x, role: "platform" })) });
    const b = buildBuses("istanbul", [way(1, 1, 2, 3), way(2, 3, 2, 1), way(3, 1, 2)], n, "x");
    const l = b.lines["15F"];
    assert.deepEqual(l.routes, [["b1", "b2", "b3"], ["b3", "b2", "b1"]]);
    assert.equal(l.operator, "İETT");
    assert.deepEqual(l.hours, { from: 360, to: 1410 });
  });
});

describe("transit: a route's stops in the order a bus meets them", () => {
  const p = (name: string, lat: number) => ({ name, lat, lng: 29 });
  const line = ["A", "B", "C", "D", "E", "F"].map((n, i) => p(n, 41 + i * 0.004));
  it("keeps an order that's already right; chains a scrambled one from its `from`", () => {
    assert.deepEqual(orderStops(line, "A").map((s) => s.name), ["A", "B", "C", "D", "E", "F"]);
    const scrambled = [line[3], line[0], line[5], line[1], line[4], line[2]];
    assert.deepEqual(orderStops(scrambled, "A").map((s) => s.name), ["A", "B", "C", "D", "E", "F"]);
    assert.deepEqual(orderStops(scrambled, "F").map((s) => s.name), ["F", "E", "D", "C", "B", "A"]);
    // No usable `from`: from an end, in the direction its first listed stop suggests.
    assert.deepEqual(orderStops([line[4], line[0], line[5], line[1], line[3], line[2]], "nowhere").map((s) => s.name).join(""), "FEDCBA");
  });
});
