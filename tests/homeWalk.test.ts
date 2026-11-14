import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distanceM } from "@/lib/geo";
import { homeSpeedKmh, pointAlong, restOf, stepWalk, walkOf } from "@/lib/homeWalk";

const A = { lat: 35.7, lng: 51.4 };
const B = { lat: 35.701, lng: 51.4 }; // ~111 m north
const C = { lat: 35.701, lng: 51.401 }; // then ~90 m east

describe("play from home: walking a path", () => {
  it("no route: straight there", () => {
    const w = walkOf(A, B);
    assert.equal(w.path.length, 2);
    assert.ok(Math.abs(w.total - distanceM(A, B)) < 0.01);
  });

  it("along the route's corner, never cutting across it", () => {
    const w = walkOf(A, C, [[B.lat, B.lng]]);
    assert.equal(w.path.length, 3);
    assert.ok(w.total > distanceM(A, C) + 10);
    // Halfway along the first leg is on the line A→B (same longitude).
    const p = pointAlong(w, 50).at;
    assert.ok(Math.abs(p.lng - A.lng) < 1e-9);
    // Past the corner: on B→C (same latitude as B).
    const q = pointAlong(w, distanceM(A, B) + 20).at;
    assert.ok(Math.abs(q.lat - B.lat) < 1e-9);
  });

  it("steps add up and end exactly at the destination", () => {
    let w = walkOf(A, C, [[B.lat, B.lng]]);
    let arrived = false, n = 0, at = A;
    while (!arrived && n++ < 1000) ({ at, walk: w, arrived } = stepWalk(w, 7));
    assert.ok(arrived);
    assert.ok(distanceM(at, C) < 0.01);
    assert.equal(Math.ceil(walkOf(A, C, [[B.lat, B.lng]]).total / 7), n);
  });

  it("what's left starts where you are and keeps the corners ahead", () => {
    const w = stepWalk(walkOf(A, C, [[B.lat, B.lng]]), 30).walk;
    const r = restOf(w);
    assert.equal(r.length, 3);
    assert.ok(Math.abs(distanceM(A, r[0]) - 30) < 0.5);
    assert.deepEqual(r[2], C);
  });
});

describe("play from home: speed by distance", () => {
  it("walks short hops, speeds up for long trips, respects the cap", () => {
    assert.equal(homeSpeedKmh(100, 40), 6);
    assert.equal(homeSpeedKmh(500, 40), 30);
    assert.equal(homeSpeedKmh(5000, 40), 40);
    assert.equal(homeSpeedKmh(100, 4), 4);
  });
});
