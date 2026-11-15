import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMsg, groupErrors, parseRow, rowOf, uaSummary } from "../src/lib/clientLog";

test("messages lose what makes each copy different (ids, numbers, URLs) but keep the host", () => {
  assert.equal(cleanMsg("Loading chunk 4821 failed. (https://streetquest-free.vercel.app/_next/static/chunks/4821-a1b2c3d4e5f6a7b8.js?dpl=dpl_7Sag)"), "Loading chunk # failed. (streetquest-free.vercel.app)");
  assert.equal(cleanMsg("x".repeat(400)).length, 150);
});

test("browsers in a few words: OS, browser and version, in-app browsers by app", () => {
  assert.equal(uaSummary("Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"), "Android Chrome 130");
  assert.equal(uaSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"), "iOS Safari 17");
  assert.equal(uaSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0"), "Instagram (iOS)");
  assert.equal(uaSummary("Mozilla/5.0 (Linux; Android 12) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36"), "Android Samsung 24");
});

test("rows round-trip and group by error, with countries and browsers counted", () => {
  const row = rowOf({ kind: "ws", msg: "realtime server unreachable", host: "37-32-28-215.sslip.io", page: "/play" });
  assert.equal(row, "ws|realtime server unreachable @37-32-28-215.sslip.io ‹/play›");
  assert.deepEqual(parseRow(row), { kind: "ws", msg: "realtime server unreachable @37-32-28-215.sslip.io ‹/play›" });
  assert.equal(parseRow("garbage").kind, "error");
  const g = groupErrors([
    { path: row, source: "TR", campaign: "Android Chrome 130", createdAt: "2026-11-15T10:00:00Z" },
    { path: row, source: "TR", campaign: "iOS Safari 17", createdAt: "2026-11-15T12:00:00Z" },
    { path: row, source: "DE", campaign: "Android Chrome 130", createdAt: "2026-11-15T11:00:00Z" },
    { path: "crash|boom", source: null, campaign: null, createdAt: new Date("2026-11-15T09:00:00Z") },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].n, 3);
  assert.deepEqual(g[0].countries, { TR: 2, DE: 1 });
  assert.equal(g[0].browsers["Android Chrome 130"], 2);
  assert.equal(g[0].last, "2026-11-15T12:00:00Z");
  assert.deepEqual(g[1].countries, { "??": 1 });
});
