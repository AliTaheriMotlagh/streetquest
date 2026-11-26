import { test } from "node:test";
import assert from "node:assert/strict";
import { BENCH_TTL_MS, BENCH_VERSION, benchFresh as fresh, benchKey, benchTier, combineTier, maskedGpu, nextBatch, scoreBatches, type SavedBench } from "../src/lib/perf/tier";

test("a benchmark score maps to a tier ceiling; a run that never drew gives none", () => {
  assert.equal(benchTier({ mpxPerMs: 0.088, draws: 70 }), "low"); // SwiftShader (measured)
  assert.equal(benchTier({ mpxPerMs: 0.2, draws: 40 }), "low"); // A10, iPad 7th gen
  assert.equal(benchTier({ mpxPerMs: 0.45, draws: 80 }), "medium"); // A12–A13
  assert.equal(benchTier({ mpxPerMs: 1.85, draws: 1600 }), "high"); // M1 (measured, Chrome and WebKit)
  assert.equal(benchTier({ mpxPerMs: 5, draws: 3000 }), "ultra"); // desktop GPU
  assert.equal(benchTier({ mpxPerMs: 5, draws: 0 }), null);
  assert.equal(benchTier({ mpxPerMs: NaN, draws: 4 }), null);
});

test("the benchmark only lowers a named GPU's tier; with a masked name it may lift a cautious guess one step", () => {
  assert.equal(combineTier("high", "low", true), "low"); // iPad 7: "Apple GPU" said high
  assert.equal(combineTier("ultra", "high", false), "high");
  assert.equal(combineTier("medium", "ultra", false), "medium"); // a known GPU keeps its name's ceiling
  assert.equal(combineTier("medium", "ultra", true), "high"); // masked: one step up at most
  assert.equal(combineTier("high", "ultra", true), "high"); // …and never to ultra by itself
  assert.equal(combineTier("low", "ultra", true), "medium");
  assert.equal(combineTier("low", "low", true), "low");
  assert.equal(combineTier("high", null, true), "high"); // no benchmark: the name decides
  assert.ok(maskedGpu("apple gpu") && maskedGpu("") && maskedGpu("webkit webgl"));
  assert.ok(!maskedGpu("angle (apple, angle metal renderer: apple m1, unspecified version)") && !maskedGpu("adreno (tm) 640"));
});

// The type guard narrows `saved` to never after a failed check; the test wants a plain yes/no.
const benchFresh = (s: SavedBench | null, k: string, now: number): boolean => fresh(s, k, now);

test("a kept result stands for the same device, browser build and benchmark version, for a month", () => {
  const key = benchKey("apple gpu", "Safari/17");
  const saved = { mpxPerMs: 1, ms: 120, draws: 50, v: BENCH_VERSION, key, at: 1000 };
  assert.ok(benchFresh(saved, key, 1000 + BENCH_TTL_MS - 1));
  assert.ok(!benchFresh(saved, key, 1000 + BENCH_TTL_MS));
  assert.ok(!benchFresh(saved, benchKey("apple gpu", "Safari/18"), 2000)); // browser update → re-run
  assert.ok(!benchFresh({ ...saved, v: BENCH_VERSION + 1 }, key, 2000));
  assert.ok(!benchFresh({ ...saved, draws: 0 }, key, 2000));
  assert.ok(!benchFresh(null, key, 2000));
  assert.ok(!benchFresh(saved, key, 500)); // clock went backwards
});

test("batches start tiny, double until timeable, and never blow the time budget", () => {
  assert.equal(nextBatch(null, 0), 2);
  assert.equal(nextBatch({ draws: 2, ms: 0.5 }, 1), 4);
  assert.equal(nextBatch({ draws: 64, ms: 9 }, 40), 64); // long enough: repeat the size
  assert.equal(nextBatch({ draws: 64, ms: 9 }, 245, 250), 0); // wouldn't fit
  assert.equal(nextBatch({ draws: 1, ms: 200 }, 210, 250), 0); // a slow GPU: one draw is enough
  assert.equal(nextBatch({ draws: 4, ms: 7 }, 100, 110), 0); // the doubled batch (~14 ms) wouldn't fit
  assert.equal(nextBatch({ draws: 2, ms: 0 }, 300, 250), 0);
  // A simulated GPU at 0.05 ms a draw: the run ends inside the budget with batches worth timing.
  let spent = 0, prev: { draws: number; ms: number } | null = null;
  const done: { draws: number; ms: number }[] = [];
  for (let n = nextBatch(prev, spent); n; n = nextBatch(prev, spent)) (prev = { draws: n, ms: n * 0.05 }), (spent += prev.ms), done.push(prev);
  assert.ok(spent <= 250 && done.some((b) => b.ms >= 8));
  const s = scoreBatches(done, 512 * 512, spent);
  assert.equal(s.mpxPerMs, Math.round(((512 * 512) / 1e6 / 0.05) * 1000) / 1000);
});

test("scoring trusts long batches only, else the longest; nothing drawn → no score", () => {
  const s = scoreBatches([{ draws: 2, ms: 1 }, { draws: 100, ms: 10 }, { draws: 100, ms: 10 }], 1e6, 30);
  assert.equal(s.mpxPerMs, 10);
  assert.equal(s.draws, 200);
  assert.equal(scoreBatches([{ draws: 1, ms: 2 }, { draws: 1, ms: 4 }], 1e6, 6).mpxPerMs, 0.25);
  assert.equal(scoreBatches([], 1e6, 5).draws, 0);
});
