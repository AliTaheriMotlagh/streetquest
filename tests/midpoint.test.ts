import test from "node:test";
import assert from "node:assert/strict";
import { geometricMedian, memberDistances, midpoint, minimaxPoint, rankPlaces, sphericalCentroid } from "../src/lib/midpoint";
import { distanceM } from "../src/lib/geo";

const A = { lat: 35.70, lng: 51.30 }, B = { lat: 35.70, lng: 51.50 }, C = { lat: 35.80, lng: 51.40 };

test("no members, one member, identical members", () => {
  assert.equal(midpoint([]), null);
  assert.deepEqual(geometricMedian([A]), A);
  const same = geometricMedian([A, A, A])!;
  assert.ok(distanceM(same, A) < 1);
  assert.equal(midpoint([A, A])!.maxM, 0);
});

test("two members meet halfway", () => {
  const m = midpoint([A, B])!;
  assert.ok(Math.abs(m.distances[0] - m.distances[1]) < 5);
  assert.ok(distanceM(m.point, A) + distanceM(m.point, B) - distanceM(A, B) < 5);
});

test("centroid crosses the date line", () => {
  const c = sphericalCentroid([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }])!;
  assert.ok(Math.abs(Math.abs(c.lng) - 180) < 0.01);
});

test("median is robust to an outlier, centroid is not", () => {
  const far = { lat: 36.6, lng: 52.5 };
  const pts = [A, { lat: 35.701, lng: 51.301 }, { lat: 35.699, lng: 51.299 }, far];
  const med = midpoint(pts, "median")!, cen = midpoint(pts, "centroid")!;
  assert.ok(med.distances[0] < cen.distances[0]);
});

test("median never worse in total distance than centroid; fairest never worse in max", () => {
  const pts = [A, B, C, { lat: 35.62, lng: 51.45 }, { lat: 35.9, lng: 51.2 }];
  const med = midpoint(pts, "median")!, cen = midpoint(pts, "centroid")!, fair = midpoint(pts, "fairest")!;
  assert.ok(med.totalM <= cen.totalM + 5);
  assert.ok(fair.maxM <= med.maxM + 5);
  assert.ok(fair.maxM <= cen.maxM + 5);
});

test("fairest of two is the middle", () => {
  const f = minimaxPoint([A, B])!;
  assert.ok(Math.abs(distanceM(f, A) - distanceM(f, B)) < 10);
});

test("distances and place ranking", () => {
  assert.equal(memberDistances(A, [A, B])[0], 0);
  const places = [{ lat: 35.7, lng: 51.4, id: "mid" }, { lat: 35.7, lng: 51.31, id: "edge" }];
  assert.equal(rankPlaces(places, [A, B], 1)[0].id, "mid");
});

test("ignores bad coordinates", () => {
  assert.deepEqual(midpoint([A, { lat: NaN, lng: 1 }])!.point, A);
});
