import { test } from "node:test";
import assert from "node:assert/strict";
import { CAP_FPS, IDLE_FPS, IDLE_MS, lowBattery, pace, Pacer, type PaceIn } from "../src/lib/perf/pace";

const base: PaceIn = { tier: "high", saver: false, sinceActive: 0, busy: false, covered: false, hidden: false };

test("high/ultra run at the screen's rate and measure; low/medium and the battery saver cap at 30", () => {
  assert.deepEqual(pace(base), { fps: 0, draw: true, measure: true });
  assert.deepEqual(pace({ ...base, tier: "ultra" }), { fps: 0, draw: true, measure: true });
  for (const tier of ["low", "medium"] as const) assert.deepEqual(pace({ ...base, tier }), { fps: CAP_FPS, draw: true, measure: true });
  assert.equal(pace({ ...base, saver: true }).fps, CAP_FPS);
});

test("idle (no input, standing still) drops to 20 fps and stops measuring; a match or flight is never idle", () => {
  assert.deepEqual(pace({ ...base, sinceActive: IDLE_MS }), { fps: IDLE_FPS, draw: true, measure: false });
  assert.equal(pace({ ...base, sinceActive: IDLE_MS - 1 }).fps, 0);
  assert.equal(pace({ ...base, sinceActive: IDLE_MS * 5, busy: true }).fps, 0);
});

test("a side menu caps at 30 without measuring; a full-screen one keeps the city ticking but draws nothing", () => {
  assert.deepEqual(pace({ ...base, covered: true }), { fps: CAP_FPS, draw: true, measure: false });
  assert.deepEqual(pace({ ...base, covered: true, hidden: true }), { fps: IDLE_FPS, draw: false, measure: false });
});

const run = (hz: number, fps: number, ms: number, jitter = 0) => {
  const p = new Pacer();
  let n = 0;
  for (let i = 0, t = 1000; t < 1000 + ms; i++, t = 1000 + i * (1000 / hz) + (i % 2 ? jitter : -jitter)) if (p.ready(t, fps)) n++;
  return n;
};

test("the pacer lets 30 frames a second through on 60 and 120 Hz screens, with jitter, without drifting", () => {
  for (const hz of [60, 120]) {
    const n = run(hz, 30, 10_000, 0.8);
    assert.ok(n >= 299 && n <= 301, `${hz} Hz → ${n}`);
  }
  assert.ok(Math.abs(run(120, 20, 10_000) - 200) <= 1);
  assert.equal(run(60, 0, 1000), 60);
});

test("after a long pause the pacer starts over instead of catching up", () => {
  const p = new Pacer();
  assert.equal(p.ready(0, 30), true);
  assert.equal(p.ready(5000, 30), true);
  assert.equal(p.ready(5016, 30), false);
  assert.equal(p.ready(5034, 30), true);
});

test("low battery is ≤ 20 % and not charging", () => {
  assert.equal(lowBattery({ level: 0.15, charging: false }), true);
  assert.equal(lowBattery({ level: 0.15, charging: true }), false);
  assert.equal(lowBattery({ level: 0.5, charging: false }), false);
  assert.equal(lowBattery(null), false);
});
