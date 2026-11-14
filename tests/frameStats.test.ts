import { test } from "node:test";
import assert from "node:assert/strict";
import { benchResult, benchTable, BUDGETS, frameStats, judge, SCENARIOS, scenarioUrl, whyNotSmooth } from "../src/lib/perf/frameStats";

const steady = (ms: number, n: number) => Array.from({ length: n }, () => ms);

test("a steady 60 fps run is smooth", () => {
  const s = frameStats(steady(1000 / 60, 600));
  assert.equal(s.frames, 600);
  assert.equal(s.fps, 60);
  assert.equal(s.janks, 0);
  assert.equal(s.hitches, 0);
  assert.equal(judge(s, BUDGETS.map), "smooth");
  assert.deepEqual(whyNotSmooth(s, BUDGETS.map), []);
});

test("percentiles, 1% low and stutters", () => {
  // 990 good frames, 10 at 60 ms: p99 catches them, 1% low is their fps.
  const s = frameStats([...steady(16, 990), ...steady(60, 10)]);
  assert.equal(s.p50, 16);
  assert.equal(s.p99, 16);
  assert.equal(s.worst, 60);
  assert.equal(s.low1, 16.7);
  assert.equal(s.janks, 10);
  assert.equal(s.hitches, 0);
  assert.ok(s.jankShare > 0.03 && s.jankShare < 0.04);
});

test("background gaps over a second are not lag", () => {
  const s = frameStats([...steady(16.7, 100), 5000, -1, NaN]);
  assert.equal(s.frames, 100);
  assert.equal(s.hitches, 0);
});

test("30 fps in 3D is ok, 20 fps or freezes are laggy", () => {
  assert.equal(judge(frameStats(steady(33, 600)), BUDGETS["3d"]), "ok");
  assert.equal(judge(frameStats(steady(50, 400)), BUDGETS["3d"]), "laggy");
  // A 200 ms freeze every 5 s at an otherwise perfect 60.
  const run = Array.from({ length: 4 }, () => [...steady(16.7, 300), 200]).flat();
  assert.equal(judge(frameStats(run), BUDGETS["3d"]), "laggy");
  assert.ok(whyNotSmooth(frameStats(run), BUDGETS["3d"]).includes("Freezes over 100 ms"));
  assert.equal(judge(frameStats([]), BUDGETS.map), "laggy");
});

test("every scenario has a page, known steps and a table row", () => {
  const ids = new Set(SCENARIOS.map((s) => s.id));
  assert.equal(ids.size, SCENARIOS.length);
  for (const s of SCENARIOS) {
    assert.match(scenarioUrl(s), s.kind === "map" ? /^\/play\?bench=/ : /^\/play\?drive=1&bench=/);
    assert.ok(s.steps.every((st) => st.at < s.seconds));
  }
  const r = benchResult(SCENARIOS[0], steady(16.7, 300));
  assert.equal(r.verdict, "smooth");
  const bad = benchResult(SCENARIOS[1], [], { longTasks: 0, longTaskMs: 0, error: "3D never finished loading" });
  assert.equal(bad.verdict, "laggy");
  const table = benchTable([r, bad]);
  assert.match(table, /^mode/);
  assert.match(table, /error.*3D never finished loading/);
});
