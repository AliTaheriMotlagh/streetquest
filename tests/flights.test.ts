import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, along, bearing, cruiseAlt, fromAdsb, iranTime, mergePlanes, scheduledPlane, skyPlace } from "../src/lib/flights";
import { distanceM } from "../src/lib/geo";

test("ADS-B planes: feet and knots to metres, the ones with a position", () => {
  const now = 1_800_000_000_000;
  const p = fromAdsb({ ac: [
    { hex: "4bbd14", flight: "TKJ2RY  ", r: "TC-OHT", t: "B38M", alt_baro: 29850, alt_geom: 30625, gs: 374.1, track: 261.5, geom_rate: -992, lat: 40.31, lon: 27.61, seen_pos: 2 },
    { hex: "abc", alt_baro: "ground", gs: 5, lat: 41, lon: 29 },
    { hex: "nopos", alt_baro: 1000 },
  ] }, now);
  assert.equal(p.length, 2);
  assert.equal(p[0].call, "TKJ2RY");
  assert.equal(p[0].alt, Math.round(30625 * 0.3048));
  assert.ok(Math.abs(p[0].speed - 192.45) < 0.1);
  assert.ok(p[0].vs < 0);
  assert.equal(p[0].at, now - 2000);
  assert.ok(p[1].ground && p[1].alt === 0);
});

test("a plane flies on along its heading", () => {
  const p = { id: "x", call: "X", lat: 35, lng: 51, alt: 10000, track: 90, speed: 250, vs: 0, ground: false, source: "live" as const, at: 0 };
  const q = advance(p, 60);
  assert.ok(Math.abs(distanceM(p, q) - 15000) < 50, "250 m/s for a minute");
  assert.ok(q.lng > p.lng && Math.abs(q.lat - p.lat) < 0.01, "east");
  const parked = { ...p, ground: true };
  assert.equal(advance(parked, 60), parked, "a plane on the ground stays put");
});

test("scheduled flights are placed on their route by the clock", () => {
  const thr = { lat: 35.69, lng: 51.31 }, mhd = { lat: 36.23, lng: 59.64 };
  const dep = iranTime("2026-11-20T08:00:00"), arr = iranTime("2026-11-20T09:30:00");
  assert.equal(new Date(dep).toISOString(), "2026-11-20T04:30:00.000Z");
  const f = { number: "B9960", airline: "Iran Airtour", from: "THR", to: "MHD", fromAt: thr, toAt: mhd, depart: dep, arrive: arr };
  assert.equal(scheduledPlane(f, dep - 1), null);
  assert.equal(scheduledPlane(f, arr + 1), null);
  const mid = scheduledPlane(f, (dep + arr) / 2)!;
  const half = distanceM(thr, mhd) / 2;
  assert.ok(Math.abs(distanceM(thr, mid) - half) < 2000, "halfway at half time");
  assert.equal(mid.alt, Math.round(cruiseAlt(distanceM(thr, mhd) / 1000)), "cruising");
  assert.ok(mid.track > 60 && mid.track < 100, "heading east-ish");
  const climbing = scheduledPlane(f, dep + 5 * 60_000)!;
  assert.ok(climbing.alt < mid.alt && climbing.vs > 0);
  const landing = scheduledPlane(f, arr - 5 * 60_000)!;
  assert.ok(landing.vs < 0);
  assert.ok(Math.abs(bearing(thr, mhd) - mid.track) < 5);
  assert.ok(distanceM(along(thr, mhd, 0), thr) < 1);
});

test("a live plane hides its own scheduled copy", () => {
  const base = { lat: 0, lng: 0, alt: 0, track: 0, speed: 0, vs: 0, ground: false, at: 0 };
  const live = [{ ...base, id: "a", call: "IRA403", source: "live" as const }];
  const sched = [{ ...base, id: "b", call: "IRA 403", source: "schedule" as const }, { ...base, id: "c", call: "W5 1061", source: "schedule" as const }];
  assert.deepEqual(mergePlanes(live, sched).map((p) => p.id), ["a", "c"]);
});

test("the 3D sky: far planes pulled in along the line of sight, still visible", () => {
  const near = skyPlace(300, 400, 0, 2000);
  assert.deepEqual([near.x, near.y, near.z, near.scale], [300, 0, 400, 1]);
  const far = skyPlace(40_000, 0, 10_000, 2000);
  assert.ok(Math.abs(Math.hypot(far.x, far.y, far.z) - 2000) < 1e-6);
  assert.ok(Math.abs(far.y / far.x - 10_000 / 40_000) < 1e-9, "same angle above the horizon");
  assert.ok(far.scale > 2000 / Math.hypot(40_000, 10_000), "drawn at least a few pixels big");
});
