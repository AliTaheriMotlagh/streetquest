// How frightened someone is (lib/street/threat.ts): shopkeepers don't run from a crash down the road or a car
// driving past, do run from shots beside them or a car coming straight at them, and calm down with hysteresis.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CALM, CALM_AT, carThreat, FLEE_AT, freshScares, mayReturn, MIN_INSIDE_S, scareThreat, stepFear, threatOf, type Fear, type ScareEvent, type ThreatCtx } from "@/lib/street/threat";

const me = (o: Partial<ThreatCtx["me"]> = {}): ThreatCtx["me"] => ({ x: 0, z: 0, vx: 0, vz: 0, inCar: false, gunDrawn: false, ...o });
const ctx = (o: Partial<ThreatCtx> = {}): ThreatCtx => ({ x: 10, z: 0, me: me(), stars: 0, events: [], now: 100, keeper: true, ...o });
const ev = (kind: ScareEvent["kind"], x: number, r: number, at = 100): ScareEvent => ({ kind, x, z: 0, r, at });
/** The fear after `secs` of a steady threat. */
const settle = (threat: number, secs: number, f: Fear = CALM) => {
  for (let t = 0; t < secs; t += 1 / 30) f = stepFear(f, threat, 1 / 30);
  return f;
};

describe("threatOf", () => {
  it("is nothing on a quiet street", () => assert.equal(threatOf(ctx()), 0));

  it("a car driving past, not at them, isn't a threat; one coming straight at them is", () => {
    assert.equal(threatOf(ctx({ me: me({ inCar: true, vz: 15 }) })), 0, "parallel");
    assert.ok(threatOf(ctx({ me: me({ inCar: true, vx: 16 }) })) > FLEE_AT, "10 m away at 16 m/s, head on");
    assert.ok(threatOf(ctx({ x: 60, me: me({ inCar: true, vx: 16 }) })) < CALM_AT, "still far");
    assert.ok(threatOf(ctx({ me: me({ inCar: true, vx: 3 }) })) < CALM_AT, "crawling");
  });

  it("a shot beside a shopkeeper makes them run; one far off doesn't; a crash never alone", () => {
    assert.ok(threatOf(ctx({ events: [ev("shot", 8, 45)] })) > FLEE_AT);
    assert.ok(threatOf(ctx({ events: [ev("shot", 45, 45)] })) < FLEE_AT);
    assert.ok(threatOf(ctx({ events: [ev("crash", 12, 30)] })) < CALM_AT);
    assert.ok(threatOf(ctx({ events: [ev("dodge", 10, 4.5)] })) < 0.01, "a car swerving past, right there");
    assert.ok(threatOf(ctx({ x: 40, events: [ev("blast", 0, 70)] })) > FLEE_AT, "a blast 40 m off");
  });

  it("several shots add up; an old one fades", () => {
    const one = threatOf(ctx({ events: [ev("shot", 40, 45)] }));
    const three = threatOf(ctx({ events: [ev("shot", 40, 45), ev("shot", 40, 45), ev("shot", 40, 45)] }));
    assert.ok(three > one);
    assert.ok(threatOf(ctx({ now: 115, events: [ev("shot", 10, 45)] })) < CALM_AT, "15 s ago");
  });

  it("shopkeepers are braver than passers-by", () => {
    const c = ctx({ me: me({ gunDrawn: true, x: 5 }) });
    assert.ok(threatOf(c) < threatOf({ ...c, keeper: false }));
    assert.ok(threatOf(c) < FLEE_AT, "a gun drawn alone doesn't empty a shop");
  });

  it("a gun drawn close by and a wanted player together do", () => {
    assert.ok(threatOf(ctx({ me: me({ gunDrawn: true, x: 7 }), stars: 4 })) > FLEE_AT);
    assert.ok(threatOf(ctx({ me: me({ x: -60 }), stars: 5 })) === 0, "wanted but far");
  });

  it("parts behave at the edges", () => {
    assert.equal(carThreat(0.1, 0, 0, 0), 1, "on top of them");
    assert.equal(scareThreat(ev("shot", 0, 10), 13, 0), 0, "out of earshot");
    assert.equal(scareThreat(ev("shot", 0, 10), 1, -1), 0, "not yet");
    assert.deepEqual(freshScares([ev("shot", 0, 1, 50), ev("shot", 0, 1, 90)], 100).map((e) => e.at), [90]);
  });
});

describe("stepFear", () => {
  it("rises fast and flips to afraid above FLEE_AT", () => {
    const f = settle(0.9, 0.5);
    assert.equal(f.afraid, true);
  });
  it("a brief scare under the line never flips", () => assert.equal(settle(0.65, 3).afraid, false));
  it("calms slowly and only below CALM_AT (hysteresis)", () => {
    const scared = settle(1, 1);
    const half = settle(0.5, 10, scared);
    assert.equal(half.afraid, true, "0.5 is between the lines: still afraid");
    const calmer = settle(0, 1, scared);
    assert.equal(calmer.afraid, true, "falls slowly");
    const calm = settle(0, 4, scared);
    assert.equal(calm.afraid, false);
  });
  it("lets a keeper back out only once calm and inside a while", () => {
    assert.equal(mayReturn({ level: 0.1, afraid: false }, MIN_INSIDE_S), true);
    assert.equal(mayReturn({ level: 0.1, afraid: false }, MIN_INSIDE_S - 1), false);
    assert.equal(mayReturn({ level: 0.4, afraid: false }, 60), false);
    assert.equal(mayReturn({ level: 0.2, afraid: true }, 60), false);
  });
});
