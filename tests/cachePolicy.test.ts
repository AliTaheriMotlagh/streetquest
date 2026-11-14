import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheAction, staleWindow, STALE_MAX_MS } from "../src/lib/cachePolicy";

const MIN = 60_000, HOUR = 60 * MIN;

test("fresh copies are served without asking the site", () => {
  assert.equal(cacheAction(5 * MIN, 20 * MIN), "fresh");
});

test("a stale copy is served at once while it refreshes, within its window", () => {
  // Tickets (20 min TTL): served for up to 4 h while refreshing; older, wait for the site.
  assert.equal(staleWindow(20 * MIN), 4 * HOUR);
  assert.equal(cacheAction(30 * MIN, 20 * MIN), "stale");
  assert.equal(cacheAction(5 * HOUR, 20 * MIN), "wait");
  // Live planes (10 s): two minutes at most — an hour-old plane is no plane.
  assert.equal(cacheAction(90_000, 10_000), "stale");
  assert.equal(cacheAction(HOUR, 10_000), "wait");
  // A day's TTL is capped at a week.
  assert.equal(staleWindow(24 * HOUR), STALE_MAX_MS);
});

test("nothing cached, or SWR off: wait", () => {
  assert.equal(cacheAction(Infinity, HOUR), "wait");
  assert.equal(cacheAction(2 * HOUR, HOUR, { swr: false }), "wait");
});
