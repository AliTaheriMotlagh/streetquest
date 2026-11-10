// A car blowing up (lib/street/blast.ts, drawn by drive/blast3d.ts): the fireball swells
// fast and rises, the smoke column outlives it, everything has cleared in time, and the
// pieces thrown off fly, bounce and lie down on the road.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ballAt, BLAST_CLEAR_S, planBlast, stepPart } from "@/lib/street/blast";

/** A repeatable stand-in for Math.random. */
function seeded(n = 7) {
  let s = n;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe("a car blowing up", () => {
  it("a hot core, lobes and a smoke column — fewer on phones", () => {
    const full = planBlast(seeded(), false), lite = planBlast(seeded(), true);
    const fire = (b: typeof full.balls) => b.filter((x) => !x.smoke).length;
    assert.ok(fire(full.balls) >= 5 && full.balls.length - fire(full.balls) >= 3);
    assert.ok(lite.balls.length < full.balls.length && lite.parts.length < full.parts.length);
    assert.ok(fire(lite.balls) >= 2, "still a fireball on a phone");
    assert.equal(full.balls[0].heat, 1, "the core starts white hot");
    assert.ok(full.parts.some((p) => p.kind === "bonnet") && full.parts.some((p) => p.kind === "wheel"));
  });

  it("the fireball swells in a fraction of a second and rises; the smoke outlasts it", () => {
    const { balls } = planBlast(seeded(3));
    const core = balls[0];
    const a = ballAt(core, 0.02)!, b = ballAt(core, 0.4)!, c = ballAt(core, 1.5)!;
    assert.ok(b.r > core.r0 + (core.r1 - core.r0) * 0.8, "most of its size within 0.4 s");
    assert.ok(a.y < b.y && b.y < c.y, "rising");
    assert.ok(c.k > b.k && b.k > a.k);
    const smoke = balls.filter((x) => x.smoke);
    assert.equal(ballAt(smoke[0], 0), null, "the smoke comes after the flash");
    const lastFire = Math.max(...balls.filter((x) => !x.smoke).map((x) => x.delay + x.life));
    const lastSmoke = Math.max(...smoke.map((x) => x.delay + x.life));
    assert.ok(lastSmoke > lastFire + 2);
    assert.ok(ballAt(smoke[0], smoke[0].delay + smoke[0].life * 0.9)!.y > 6, "the column climbs well above the street");
  });

  it("everything has cleared by BLAST_CLEAR_S", () => {
    for (let s = 1; s < 30; s++) for (const b of planBlast(seeded(s)).balls) assert.equal(ballAt(b, BLAST_CLEAR_S), null);
  });

  it("a thrown piece flies up, comes down, bounces and lies still on the road", () => {
    const p = {
      x: 0,
      y: 1,
      z: 0,
      vx: 3,
      vy: 10,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      wx: 5,
      wy: 1,
      wz: 4,
      rest: false,
      half: 0.025,
    };
    let top = 0, bounced = false, wasDown = false;
    for (let i = 0; i < 600 && !p.rest; i++) {
      stepPart(p, 1 / 60);
      top = Math.max(top, p.y);
      if (p.y <= p.half) wasDown = true;
      if (wasDown && p.vy > 0) bounced = true;
    }
    assert.ok(top > 5, `up ${top.toFixed(1)} m`);
    assert.ok(bounced, "it bounces");
    assert.ok(p.rest && p.y === p.half, "and lies on the road");
    assert.ok(p.x > 3, "having flown out");
    const x = p.x;
    stepPart(p, 1);
    assert.equal(p.x, x, "lying still");
  });
});
