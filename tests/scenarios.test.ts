// Scenarios (lib/scenarios): the validator, the six starters, anchors, the state machine step by
// step (win, fail, checkpoints, retry) and the server's plausibility rules.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveScenario, type Probe } from "@/lib/scenarios/anchors";
import { abandon, hud, newRun, retry, slide, start, tick, type Effect, type Run, type Signals } from "@/lib/scenarios/machine";
import { checkFinish, checkStart, legsM, minSeconds } from "@/lib/scenarios/plausibility";
import { STARTERS } from "@/lib/scenarios/starters";
import type { Scenario, Step } from "@/lib/scenarios/types";
import { validateScenario } from "@/lib/scenarios/validate";

const L = (s: string) => ({ fa: s, en: s });
const base = (steps: Step[], extra: Partial<Scenario> = {}): Scenario => ({
  id: "test-run", title: L("T"), brief: L("B"), emoji: "🚗", difficulty: 1, giver: { name: L("G"), at: { at: "start" } }, steps, reward: { coins: 10, xp: 10 }, enabled: true, ...extra,
});
const sig = (o: Partial<Signals> = {}): Signals => ({ x: 0, z: 0, fx: 0, fz: 1, vx: 0, vz: 0, onFoot: false, inCar: true, carKey: "pride", tookCar: null, carWrecked: false, down: false, stars: 0, kills: 0, target: null, ...o });
const kinds = (e: Effect[]) => e.map((x) => x.kind);

function play(scn: Scenario, places: ({ x: number; z: number } | null)[] = scn.steps.map(() => null)) {
  const run = newRun(scn, places);
  const fx = start(run, sig());
  return { run, fx };
}

describe("scenario validator", () => {
  it("accepts every starter", () => {
    assert.equal(STARTERS.length, 6);
    for (const s of STARTERS) {
      const r = validateScenario(s);
      assert.ok(r.ok, `${s.id}: ${JSON.stringify(r.ok ? [] : r.errors)}`);
    }
  });
  it("covers every kind of step across the starters", () => {
    const seen = new Set(STARTERS.flatMap((s) => s.steps.map((x) => x.type)));
    for (const k of ["goto", "car", "pickup", "deliver", "chase", "evade", "survive", "hostiles", "photo", "drift"]) assert.ok(seen.has(k as never), k);
  });
  it("reports where each problem is", () => {
    const bad = { ...base([{ type: "goto", at: { at: "fixed", lat: 91, lng: 0 } }, { type: "survive", seconds: 0 }]), id: "x", title: { fa: "", en: "a" } };
    const r = validateScenario(bad);
    assert.ok(!r.ok);
    const paths = r.ok ? [] : r.errors.map((e) => e.path);
    for (const p of ["id", "title", "steps.0.at.lat", "steps.1.seconds"]) assert.ok(paths.includes(p), p);
  });
  it("a delivery needs a pickup first, and a pickup needs a delivery", () => {
    const d = validateScenario(base([{ type: "deliver", at: { at: "along", dist: 500 } }]));
    assert.ok(!d.ok && d.errors.some((e) => e.path === "steps.0"));
    const p = validateScenario(base([{ type: "pickup", what: "person", at: { at: "along", dist: 500 } }]));
    assert.ok(!p.ok);
    assert.ok(validateScenario(base([{ type: "pickup", what: "person", at: { at: "along", dist: 500 } }, { type: "deliver", at: { at: "along", dist: 500 } }])).ok);
  });
  it("rejects nonsense: no steps, unknown types, bad cars, a min above the max", () => {
    assert.ok(!validateScenario(base([])).ok);
    assert.ok(!validateScenario(base([{ type: "teleport" } as unknown as Step])).ok);
    assert.ok(!validateScenario(base([{ type: "car", car: "tank" as never }])).ok);
    assert.ok(!validateScenario(base([{ type: "goto", at: { at: "junction", min: 900, max: 100 } }])).ok);
    assert.ok(!validateScenario(null).ok);
    assert.ok(!validateScenario(base([{ type: "survive", seconds: 10 }], { reward: { coins: -1, xp: 0 } })).ok);
  });
  it("drops unknown fields and survives a JSON round trip", () => {
    const r = validateScenario({ ...base([{ type: "survive", seconds: 10, extra: 1 } as unknown as Step]), junk: 1, starter: true });
    assert.ok(r.ok && !("junk" in r.value) && !("starter" in r.value) && !("extra" in r.value.steps[0]));
    assert.ok(r.ok);
    const again = validateScenario(JSON.parse(JSON.stringify(r.ok ? r.value : null)));
    assert.ok(again.ok);
  });
});

describe("anchors", () => {
  // A flat world: junctions every 300 m on a grid, shops at fixed spots.
  const probe: Probe = {
    toXZ: (lat, lng) => ({ x: lng * 1000, z: lat * 1000 }),
    junction: (from, min, max) => {
      for (let r = min; r <= max; r += 50) for (const s of [1, -1]) if (r >= min) return { x: Math.round((from.x + s * r) / 300) * 300, z: from.z };
      return null;
    },
    store: (kind, from) => (kind === "none" ? null : { x: from.x + 220, z: from.z + 100 }),
    landmark: () => null,
    snap: (p) => p,
  };
  it("resolves relative to the player, chaining from the previous place", () => {
    const s = base([{ type: "goto", at: { at: "along", dist: 1000 } }, { type: "goto", at: { at: "along", dist: 500 } }, { type: "goto", at: { at: "start" } }]);
    const r = resolveScenario(s, { x: 0, z: 0 }, probe, () => 0.25);
    assert.ok(Math.abs(Math.hypot(r.places[0]!.x, r.places[0]!.z) - 850) < 1);
    assert.ok(Math.abs(Math.hypot(r.places[1]!.x - r.places[0]!.x, r.places[1]!.z - r.places[0]!.z) - 425) < 1);
    assert.deepEqual(r.places[2], { x: 0, z: 0 });
  });
  it("fixed places come straight from the lat/lng; missing kinds fall back to a street spot", () => {
    const s = base([{ type: "goto", at: { at: "fixed", lat: 2, lng: 3 } }, { type: "goto", at: { at: "store", kind: "none", min: 200, max: 400 } }, { type: "goto", at: { at: "landmark" } }]);
    const r = resolveScenario(s, { x: 0, z: 0 }, probe, () => 0.5);
    assert.deepEqual(r.places[0], { x: 3000, z: 2000 });
    for (const i of [1, 2]) assert.ok(Number.isFinite(r.places[i]!.x));
  });
  it("every starter resolves to a place for each placed step", () => {
    for (const s of STARTERS) {
      const r = resolveScenario(s, { x: 0, z: 0 }, probe, () => 0.3);
      s.steps.forEach((st, i) => assert.equal(!!r.places[i], ["goto", "pickup", "deliver", "photo"].includes(st.type), `${s.id}.${i}`));
    }
    assert.ok(legsM({ lat: 0, lng: 0 }, [{ lat: 0, lng: 0.01 }, null, { lat: 0.01, lng: 0.01 }]) > 2000);
  });
});

describe("machine", () => {
  it("goto: wins on arrival and says so", () => {
    const { run, fx } = play(base([{ type: "goto", at: { at: "start" } }]), [{ x: 100, z: 0 }]);
    assert.deepEqual(kinds(fx), ["step", "waypoint"]);
    assert.deepEqual(tick(run, 1, sig({ x: 60 })), []);
    const e = tick(run, 1, sig({ x: 90 }));
    assert.deepEqual(e.at(-1), { kind: "end", result: "won", reason: null });
    assert.equal(run.result, "won");
    assert.deepEqual(tick(run, 1, sig()), []);
  });
  it("step clock and total clock fail the run", () => {
    const a = play(base([{ type: "goto", at: { at: "start" }, timeLimitS: 10 }]), [{ x: 500, z: 0 }]).run;
    tick(a, 9, sig());
    assert.equal(tick(a, 2, sig()).at(-1)?.kind, "end");
    assert.equal(a.reason, "stepTime");
    const b = play(base([{ type: "survive", seconds: 100 }], { fail: { timeLimitS: 20 } })).run;
    tick(b, 21, sig());
    assert.equal(b.reason, "time");
  });
  it("car: stealing any car, or a specific model, counts; already sitting in the wrong one does not", () => {
    const any = play(base([{ type: "car", car: "any" }])).run;
    tick(any, 1, sig());
    assert.equal(any.result, null, "already in a car is not stealing one");
    tick(any, 1, sig({ tookCar: "pride" }));
    assert.equal(any.result, "won");
    const taxi = play(base([{ type: "car", car: ["taxi", "bus"] }])).run;
    tick(taxi, 1, sig({ tookCar: "pride" }));
    assert.equal(taxi.result, null);
    tick(taxi, 1, sig({ tookCar: "taxi" }));
    assert.equal(taxi.result, "won");
    const sitting = play(base([{ type: "car", car: "taxi" }])).run;
    tick(sitting, 1, sig({ carKey: "taxi" }));
    assert.equal(sitting.result, "won");
  });
  it("pickup then deliver: needs a stop, carries between, and the clock only runs on the delivery", () => {
    const s = base([{ type: "pickup", what: "package", at: { at: "start" } }, { type: "deliver", at: { at: "start" }, timeLimitS: 60 }]);
    const { run } = play(s, [{ x: 0, z: 0 }, { x: 400, z: 0 }]);
    tick(run, 1, sig({ vx: 20 }));
    assert.equal(run.i, 0, "too fast to pick up");
    tick(run, 1, sig());
    assert.equal(run.i, 1);
    assert.equal(run.carrying, "package");
    assert.equal(run.st, 0);
    tick(run, 61, sig({ x: 300 }));
    assert.equal(run.reason, "stepTime");
  });
  it("chase: wrecked wins, gone or far fails, no car at all fails after a grace", () => {
    const mk = () => play(base([{ type: "chase", escapeM: 200 }])).run;
    const a = mk();
    assert.deepEqual(tick(a, 1, sig({ target: { x: 50, z: 0, wrecked: false, gone: false } })), []);
    tick(a, 1, sig({ target: { x: 50, z: 0, wrecked: true, gone: false } }));
    assert.equal(a.result, "won");
    const b = mk();
    tick(b, 1, sig({ target: { x: 250, z: 0, wrecked: false, gone: false } }));
    assert.equal(b.reason, "targetEscaped");
    const c = mk();
    tick(c, 1, sig({ target: { x: 20, z: 0, wrecked: false, gone: true } }));
    assert.equal(c.reason, "targetEscaped");
    const d = mk();
    tick(d, 3, sig());
    assert.equal(d.result, null);
    tick(d, 4, sig());
    assert.equal(d.reason, "targetEscaped");
    assert.ok(kinds(play(base([{ type: "chase" }])).fx).includes("spawnTarget"));
  });
  it("evade: raises the stars, done once they're gone", () => {
    const { run, fx } = play(base([{ type: "evade", stars: 3 }]));
    assert.ok(fx.some((e) => e.kind === "stars" && e.n === 3));
    tick(run, 1, sig({ stars: 0 }));
    assert.equal(run.result, null, "not lost before they were after me");
    assert.ok(tick(run, 3, sig({ stars: 0 })).some((e) => e.kind === "stars"), "asks again");
    tick(run, 1, sig({ stars: 3 }));
    tick(run, 1, sig({ stars: 1 }));
    assert.equal(run.result, null);
    tick(run, 1, sig({ stars: 0 }));
    assert.equal(run.result, "won");
  });
  it("survive and hostiles", () => {
    const s = play(base([{ type: "survive", seconds: 30 }])).run;
    tick(s, 29, sig());
    assert.equal(s.result, null);
    tick(s, 2, sig());
    assert.equal(s.result, "won");
    const h = play(base([{ type: "hostiles", count: 3 }])).run;
    tick(h, 1, sig({ kills: 2 }));
    assert.equal(h.result, null);
    assert.equal(hud(h, sig({ kills: 2 }))?.progress?.have, 2);
    tick(h, 1, sig({ kills: 3 }));
    assert.equal(h.result, "won");
    // Kills before the step began don't count.
    const early = newRun(base([{ type: "hostiles", count: 1 }]), [null]);
    start(early, sig({ kills: 5 }));
    tick(early, 1, sig({ kills: 5 }));
    assert.equal(early.result, null);
  });
  it("photo: close, facing it and still for a moment; looking away resets", () => {
    const { run } = play(base([{ type: "photo", at: { at: "start" }, radius: 70 }]), [{ x: 0, z: 100 }]);
    tick(run, 1, sig({ z: 50 }));
    tick(run, 0.5, sig({ z: 50, fx: 1, fz: 0 }));
    assert.equal(run.hold, 0);
    tick(run, 1, sig({ z: 50 }));
    assert.equal(run.result, null);
    const e = tick(run, 0.5, sig({ z: 50 }));
    assert.ok(kinds(e).includes("photo"));
    assert.equal(run.result, "won");
    const far = play(base([{ type: "photo", at: { at: "start" }, radius: 70 }]), [{ x: 0, z: 300 }]).run;
    tick(far, 5, sig());
    assert.equal(far.result, null);
  });
  it("drift: only a held slide counts", () => {
    assert.ok(slide({ vx: 10, vz: 6, fx: 0, fz: 1 }).drifting);
    assert.ok(!slide({ vx: 0, vz: 15, fx: 0, fz: 1 }).drifting);
    assert.ok(!slide({ vx: 2, vz: 1, fx: 0, fz: 1 }).drifting);
    const { run } = play(base([{ type: "drift", meters: 50 }]));
    tick(run, 5, sig({ vz: 20 }));
    assert.equal(run.meters, 0);
    for (let i = 0; i < 4; i++) tick(run, 1, sig({ vx: 12, vz: 5 }));
    assert.equal(run.result, "won");
  });
  it("fail rules: wrecked car, player down, abandoned; and they can be switched off", () => {
    const a = play(base([{ type: "survive", seconds: 99 }])).run;
    tick(a, 1, sig({ carWrecked: true }));
    assert.equal(a.reason, "carDestroyed");
    const b = play(base([{ type: "survive", seconds: 99 }])).run;
    tick(b, 1, sig({ down: true }));
    assert.equal(b.reason, "playerDown");
    const c = play(base([{ type: "survive", seconds: 99 }], { fail: { carDestroyed: false, playerDown: false } })).run;
    tick(c, 1, sig({ carWrecked: true, down: true }));
    assert.equal(c.result, null);
    assert.equal(abandon(c).at(-1)?.kind, "end");
    assert.equal(c.reason, "abandoned");
  });
  it("checkpoints: a retry starts at the last one, with the clock and the load it had", () => {
    const s = base(
      [{ type: "pickup", what: "person", at: { at: "start" }, checkpoint: true }, { type: "goto", at: { at: "start" }, checkpoint: true }, { type: "survive", seconds: 50 }],
      { fail: { timeLimitS: 100 } },
    );
    const run: Run = newRun(s, [{ x: 0, z: 0 }, { x: 0, z: 0 }, null]);
    start(run, sig());
    const e1 = tick(run, 10, sig());
    assert.ok(kinds(e1).includes("checkpoint"));
    tick(run, 5, sig());
    assert.equal(run.i, 2);
    assert.deepEqual(run.cp, { i: 2, t: 15, d: 0 });
    tick(run, 200, sig());
    assert.equal(run.reason, "time");
    const fx = retry(run, sig());
    assert.equal(run.i, 2);
    assert.equal(run.t, 15);
    assert.equal(run.result, null);
    assert.equal(run.carrying, "person");
    assert.ok(fx.some((e) => e.kind === "step" && e.index === 2));
    tick(run, 51, sig());
    assert.equal(run.result, "won");
  });
  it("dialogue plays when a step starts and the outro when it ends", () => {
    const line = { speaker: L("A"), text: L("hi") };
    const s = base([{ type: "survive", seconds: 5, say: [line] }], { outro: { won: [line] } });
    const { run, fx } = play(s);
    assert.ok(fx.some((e) => e.kind === "say"));
    assert.ok(kinds(tick(run, 6, sig())).includes("say"));
  });
  it("tracks the distance travelled for the server", () => {
    const { run } = play(base([{ type: "survive", seconds: 99 }]));
    tick(run, 10, sig({ vx: 15 }));
    assert.equal(Math.round(run.travelled), 150);
  });
});

describe("server plausibility", () => {
  const here = { lat: 35.7, lng: 51.4 };
  const p1 = { lat: 35.7, lng: 51.41 }; // ≈ 900 m east
  const scn = base([{ type: "goto", at: { at: "along", dist: 900 } }]);
  const claim = { giver: here, places: [p1] };
  it("accepts the places a scenario could produce", () => {
    assert.ok(checkStart(scn, claim, here).ok);
  });
  it("refuses places that can't be right", () => {
    assert.ok(!checkStart(scn, { giver: here, places: [] }, here).ok);
    assert.ok(!checkStart(scn, { giver: here, places: [{ lat: 40, lng: 51.4 }] }, here).ok, "500 km away");
    const pinned = base([{ type: "goto", at: { at: "fixed", lat: 35.71, lng: 51.4 } }]);
    assert.ok(!checkStart(pinned, { giver: here, places: [{ lat: 35.72, lng: 51.4 }] }, here).ok, "not where the admin pinned it");
    assert.ok(checkStart(pinned, { giver: here, places: [{ lat: 35.71, lng: 51.4 }] }, here).ok);
  });
  it("a run can't beat the fastest vehicle, nor skip the road", () => {
    const max = 90;
    const min = minSeconds(scn, here, [p1], max);
    assert.ok(min > 9 && min < 11);
    const ok = checkFinish(scn, claim, here, { elapsedS: 60, travelledM: 1000 }, p1, { at: p1, radius: 25 }, max);
    assert.ok(ok.ok);
    assert.ok(!checkFinish(scn, claim, here, { elapsedS: 3, travelledM: 1000 }, p1, null, max).ok, "too fast");
    assert.ok(!checkFinish(scn, claim, here, { elapsedS: 60, travelledM: 100 }, p1, null, max).ok, "didn't go the distance");
    assert.ok(!checkFinish(scn, claim, here, { elapsedS: 20, travelledM: 5000 }, p1, null, max).ok, "faster than any car");
    assert.ok(!checkFinish(scn, claim, here, { elapsedS: 60, travelledM: 1000 }, here, { at: p1, radius: 25 }, max).ok, "not at the end");
    const timed = base([{ type: "goto", at: { at: "along", dist: 900 } }], { fail: { timeLimitS: 100 } });
    assert.ok(!checkFinish(timed, claim, here, { elapsedS: 300, travelledM: 1000 }, p1, null, max).ok, "after the limit");
  });
  it("survive steps need their time on the server too", () => {
    const s = base([{ type: "survive", seconds: 60 }]);
    assert.ok(!checkFinish(s, { giver: here, places: [null] }, here, { elapsedS: 20, travelledM: 0 }, here, null, 90).ok);
    assert.ok(checkFinish(s, { giver: here, places: [null] }, here, { elapsedS: 61, travelledM: 0 }, here, null, 90).ok);
  });
});
