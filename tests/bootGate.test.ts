// The 3D city's loading screen: start once the streets round you are drawn and the car is on one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOOT_MIN_MS, bootProgress, GIVE_UP_MS, PLAY_ANYWAY_MS } from "@/lib/bootGate";

describe("loading the 3D city", () => {
  const at = (o: Partial<Parameters<typeof bootProgress>[0]>) => bootProgress({ near: 4, drawn: 0, real: 0, placed: false, elapsedMs: 2000, ...o });
  it("goes map → streets → car → ready, and only then lets you play", () => {
    assert.equal(at({}).stage, "map");
    assert.equal(at({ drawn: 2, real: 2 }).stage, "streets");
    assert.equal(at({ drawn: 4, real: 4 }).stage, "car");
    const r = at({ drawn: 4, real: 4, placed: true });
    assert.equal(r.stage, "ready");
    assert.ok(r.done && r.pct === 100);
    assert.ok(!at({ drawn: 4, real: 4 }).done, "never in mid-air: the car must be on a street");
  });
  it("progress only grows, and stays under 100 until it's done", () => {
    const steps = [at({}), at({ drawn: 1 }), at({ drawn: 2, real: 1 }), at({ drawn: 4, real: 2 }), at({ drawn: 4, real: 4 }), at({ drawn: 4, real: 4, placed: true })].map((x) => x.pct);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1], steps.join(","));
    assert.ok(steps.slice(0, -1).every((p) => p < 100));
  });
  it("a warm start doesn't flash; a slow connection gets a Play now button, then starts by itself", () => {
    assert.ok(!at({ drawn: 4, real: 4, placed: true, elapsedMs: BOOT_MIN_MS - 1 }).done);
    assert.ok(!at({ elapsedMs: PLAY_ANYWAY_MS - 1 }).canSkip);
    assert.ok(at({ elapsedMs: PLAY_ANYWAY_MS }).canSkip);
    assert.ok(at({ elapsedMs: GIVE_UP_MS }).done);
  });
});
