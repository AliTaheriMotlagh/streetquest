// Skydiving (lib/skydive.ts): freefall speeds, the cord and the auto-open, the canopy and the
// flare, rings, the landing grade and the jump's stars.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTO_OPEN_M, courseFor, DROP_ALT, FALL, landingOf, passRings, scoreJump, startSky, stepSky, type SkyBody } from "@/lib/skydive";

const body = (alt = DROP_ALT): SkyBody => ({ x: 0, z: 0, alt, vx: 0, vz: 0, vy: 0, yaw: 0, steer: 0 });
const run = (b: SkyBody, s = startSky(), secs: number, c = { gas: 0, brake: 0, steer: 0, pull: false }, floor = 0) => {
  const events: string[] = [];
  for (let i = 0; i < secs * 60 && b.alt > floor; i++) {
    const e = stepSky(b, s, c, 1 / 60, floor);
    b.x += b.vx / 60;
    b.z += b.vz / 60;
    if (e) events.push(e);
  }
  return { s, events };
};

describe("skydive", () => {
  it("falls to a skydiver's terminal speed; a dive is faster, spreading out slower", () => {
    const belly = body(), dive = body(), spread = body();
    run(belly, startSky(), 12);
    run(dive, startSky(), 12, { gas: 1, brake: 0, steer: 0, pull: false });
    run(spread, startSky(), 12, { gas: 0, brake: 1, steer: 0, pull: false });
    assert.ok(Math.abs(belly.vy + FALL.belly) < 1.5, `belly ${belly.vy}`);
    assert.ok(dive.vy < belly.vy - 10 && spread.vy > belly.vy + 6);
    // Tracking carries you forward (−z at yaw 0).
    assert.ok(dive.z < belly.z - 50);
  });
  it("pulling the cord opens it; otherwise it opens by itself low down, and the jolt slows the fall hard", () => {
    const b = body(), s = startSky();
    run(b, s, 6);
    const e = stepSky(b, s, { gas: 0, brake: 0, steer: 0, pull: true }, 1 / 60);
    assert.equal(e, "opened");
    run(b, s, 4);
    assert.ok(b.vy > -7, `canopy sink ${b.vy}`);
    const late = body(400), ls = startSky();
    const r = run(late, ls, 60);
    assert.deepEqual(r.events.slice(0, 1), ["auto-opened"]);
    assert.ok(ls.auto && ls.phase === "open");
    assert.ok(late.alt <= 0.001, "reached the ground under the canopy");
  });
  it("lands on what's under it (a roof); flaring at the bottom makes it soft", () => {
    const b = body(200), s = startSky();
    stepSky(b, s, { gas: 0, brake: 0, steer: 0, pull: false }, 0.5);
    stepSky(b, s, { gas: 0, brake: 0, steer: 0, pull: true }, 1 / 60);
    run(b, s, 120, { gas: 0, brake: 0, steer: 0, pull: false }, 30);
    assert.equal(b.alt, 30);
    const flared = body(60), fs = { ...startSky(), phase: "open" as const, openedAt: -5 };
    flared.vy = -4.4;
    run(flared, fs, 60, { gas: 0, brake: 1, steer: 0, pull: false });
    assert.equal(landingOf(fs, flared.vy, Math.hypot(flared.vx, flared.vz)), "perfect");
    assert.equal(landingOf(fs, -7, 12), "hard");
    assert.equal(landingOf(startSky(), -50, 9), "crash");
  });
  it("rings on the way down, passed when you fall through them; the score's stars", () => {
    const c = courseFor(0, 0, DROP_ALT, 0, { x: 0, z: -300 }, 7);
    assert.equal(c.rings.length, 6);
    assert.ok(c.rings.every((r, i) => i === 0 || r.alt < c.rings[i - 1].alt));
    assert.ok(c.rings[c.rings.length - 1].alt > AUTO_OPEN_M);
    const r = c.rings[0];
    assert.equal(passRings(c, { x: r.x + 3, z: r.z, alt: r.alt + 2 }, { x: r.x + 3, z: r.z, alt: r.alt - 2 }), 1);
    assert.equal(passRings(c, { x: r.x, z: r.z, alt: r.alt + 2 }, { x: r.x, z: r.z, alt: r.alt - 2 }), 0, "once");
    const r2 = c.rings[1];
    assert.equal(passRings(c, { x: r2.x + 40, z: r2.z, alt: r2.alt + 2 }, { x: r2.x + 40, z: r2.z, alt: r2.alt - 2 }), 0, "outside the ring");
    for (const x of c.rings) x.hit = true;
    const best = scoreJump(c, { x: 1, z: -301 }, "perfect");
    assert.deepEqual([best.rings, best.dist, best.stars], [6, 1, 5]);
    assert.equal(scoreJump(c, { x: 500, z: 500 }, "crash").stars, 0);
    assert.equal(scoreJump(null, { x: 0, z: 0 }, "good").stars, 1);
  });
});

describe("skydive pays like a street job", () => {
  it("25 coins and 20 XP a star, 1 to 5", async () => {
    const { jobReward, STREET_JOB_KINDS } = await import("@/lib/street/jobs");
    assert.ok((STREET_JOB_KINDS as readonly string[]).includes("skydive"));
    assert.deepEqual(jobReward("skydive", 5), { xp: 100, coins: 125 });
    assert.deepEqual(jobReward("skydive", 0), { xp: 20, coins: 25 });
  });
});
