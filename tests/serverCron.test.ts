import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRun } from "../docker/cron.mjs";

const at = (s: string) => Date.parse(s);

test("one-server cleanup runs at 04:00 UTC the same day when it's earlier", () => {
  assert.equal(nextRun(at("2026-11-28T01:30:00Z")), at("2026-11-28T04:00:00Z"));
});

test("one-server cleanup moves to tomorrow at or after 04:00 UTC", () => {
  assert.equal(nextRun(at("2026-11-28T04:00:00Z")), at("2026-11-29T04:00:00Z"));
  assert.equal(nextRun(at("2026-11-28T23:59:59Z")), at("2026-11-29T04:00:00Z"));
  assert.equal(nextRun(at("2026-12-31T05:00:00Z")), at("2027-01-01T04:00:00Z"));
});

test("one-server cleanup hour is configurable", () => {
  assert.equal(nextRun(at("2026-11-28T01:00:00Z"), 3), at("2026-11-28T03:00:00Z"));
});
