// Hero moves (lib/hero.ts) in a toy city: one block 20 × 20 m and 30 m tall, its south face at z = -20.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aimLine, chainPump, HERO, newHero, stepHero, ZIP_TAP_S, type HeroBody, type HeroInput, type HeroWorld } from "@/lib/hero";

const B = { x0: -10, x1: 10, z0: -40, z1: -20, h: 30 };
const world: HeroWorld = {
  collide: (x, z, r, y) => {
    if (y >= B.h || x < B.x0 - r || x > B.x1 + r || z < B.z0 - r || z > B.z1 + r) return { x, z, hit: null };
    // Out by the nearest face.
    const d = [x - (B.x0 - r), B.x1 + r - x, z - (B.z0 - r), B.z1 + r - z];
    const i = d.indexOf(Math.min(...d));
    if (i === 0) return { x: B.x0 - r, z, hit: { nx: -1, nz: 0 } };
    if (i === 1) return { x: B.x1 + r, z, hit: { nx: 1, nz: 0 } };
    if (i === 2) return { x, z: B.z0 - r, hit: { nx: 0, nz: -1 } };
    return { x, z: B.z1 + r, hit: { nx: 0, nz: 1 } };
  },
  floor: (x, z, y) => (x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1 && y >= B.h - 0.5 ? B.h : 0),
  ray: (o, d, max) => {
    for (let t = 0; t < max; t += 0.25) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1 && y <= B.h) return t;
    }
    return Infinity;
  },
};
const idle: HeroInput = { mx: 0, mz: 0, camYaw: 0, camPitch: 0, jump: false, jumpPressed: false, grapple: false };
const run = (b: HeroBody, s = newHero(), secs: number, inp: Partial<HeroInput> = {}) => {
  const events: string[] = [];
  for (let i = 0; i < secs * 60; i++) {
    const e = stepHero(b, s, { ...idle, ...inp }, 1 / 60, world);
    if (e) events.push(e.kind);
  }
  return { s, events };
};

describe("hero moves", () => {
  it("a line fired at the block catches on its wall; over open ground it hooks high in the sky", () => {
    const a = aimLine({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 }, { camYaw: 0, camPitch: 0 }, world);
    assert.ok(Math.abs(a.z - B.z1) < 0.5 && a.y > 5 && a.y <= B.h, JSON.stringify(a));
    const sky = aimLine({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 }, { camYaw: Math.PI, camPitch: 0 }, world);
    assert.ok(sky.y >= HERO.skyHook && sky.z > 0);
  });
  it("swinging on the line keeps you within its length and carries you forward; letting go flings you up", () => {
    const b: HeroBody = { x: 0, y: 0, z: 60, vx: 0, vy: 0, vz: -8, yaw: 0 };
    const s = newHero();
    const r = run(b, s, 1.5, { grapple: true, mz: 1 });
    assert.equal(r.events[0], "fire");
    assert.equal(s.mode, "swing");
    const a = s.anchor!;
    assert.ok(Math.hypot(b.x - a.x, b.y + 1.5 - a.y, b.z - a.z) <= a.len + 0.05);
    assert.ok(b.z < 60 && b.y > 0.5, `swung forward and up: ${JSON.stringify(b)}`);
    const vy = b.vy;
    const e = stepHero(b, s, idle, 1 / 60, world);
    assert.ok(e?.kind === "release" || e?.kind === "perfect", String(e?.kind));
    assert.ok(b.vy > vy && s.anchor === null);
  });
  it("runs up the wall, vaults onto the roof and lands on it", () => {
    const b: HeroBody = { x: 0, y: 2, z: -17, vx: 0, vy: 0, vz: -9, yaw: 0 };
    const s = { ...newHero(), mode: "air" as const };
    const r = run(b, s, 6, { mz: 1 });
    assert.ok(r.events.includes("wall") && r.events.includes("vault"), r.events.join(","));
    assert.equal(s.mode, "ground");
    assert.equal(b.y, B.h, "standing on the roof");
  });
  it("kicks off a wall; glides down slowly; walks off a roof and lands on the street", () => {
    const b: HeroBody = { x: 0, y: 5, z: -19.6, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const s = { ...newHero(), mode: "wall" as const, wall: { nx: 0, nz: 1 } };
    assert.equal(stepHero(b, s, { ...idle, jumpPressed: true, jump: true }, 1 / 60, world)?.kind, "kick");
    assert.ok(b.vz > 5 && b.vy > 0);
    const g: HeroBody = { x: 0, y: 200, z: 100, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const gs = { ...newHero(), mode: "air" as const };
    run(g, gs, 1, {});
    stepHero(g, gs, { ...idle, jump: true, jumpPressed: true }, 1 / 60, world);
    run(g, gs, 3, {});
    assert.equal(gs.mode, "glide");
    assert.ok(g.vy > -HERO.glideSink - 0.5, `glide sink ${g.vy}`);
    const w: HeroBody = { x: 0, y: B.h, z: -30, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const ws = newHero();
    const out = run(w, ws, 8, { mz: -1 });
    assert.ok(out.events.includes("land"));
    assert.equal(w.y, 0);
    assert.equal(ws.mode, "ground");
  });
  it("a tap on the hook zips to the wall it caught and grabs it; looking up at the edge, it perches on the roof", () => {
    const b: HeroBody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const s = newHero();
    stepHero(b, s, { ...idle, grapple: true }, 1 / 60, world);
    assert.ok(s.anchor?.wall, "caught the block");
    assert.equal(stepHero(b, s, idle, 1 / 60, world)?.kind, "zip");
    const r = run(b, s, 3, {});
    assert.ok(r.events.includes("wall") || r.events.includes("perch"), r.events.join(","));
    assert.ok(b.z < -17, `pulled to the wall: ${b.z}`);
    // From the roof's height, the line catches the top of the wall: the zip ends standing on the roof.
    const p: HeroBody = { x: 0, y: 18, z: -6, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const ps = { ...newHero(), mode: "air" as const };
    stepHero(p, ps, { ...idle, grapple: true, camPitch: -0.5 }, 1 / 60, world);
    assert.ok(ps.anchor?.wall && ps.anchor.y > B.h - 2.5, JSON.stringify(ps.anchor));
    stepHero(p, ps, idle, 1 / 60, world);
    const pr = run(p, ps, 3, {});
    assert.ok(pr.events.includes("perch"), pr.events.join(","));
    assert.equal(p.y, B.h);
    assert.equal(ps.mode, "ground");
  });
  it("a long hold is a swing, not a zip; a sky line can't be zipped to", () => {
    const b: HeroBody = { x: 0, y: 0, z: 60, vx: 0, vy: 0, vz: -8, yaw: 0 };
    const s = newHero();
    run(b, s, ZIP_TAP_S + 0.2, { grapple: true });
    assert.notEqual(stepHero(b, s, idle, 1 / 60, world)?.kind, "zip");
    const k: HeroBody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const ks = newHero();
    stepHero(k, ks, { ...idle, grapple: true, camYaw: Math.PI }, 1 / 60, world);
    assert.equal(ks.anchor?.wall, false);
    assert.equal(stepHero(k, ks, idle, 1 / 60, world)?.kind, "release");
  });
  it("crouch in the air dives fast; a line out of the dive carries the speed on", () => {
    const b: HeroBody = { x: 0, y: 120, z: 200, vx: 0, vy: 0, vz: 0, yaw: 0 };
    const s = { ...newHero(), mode: "air" as const };
    assert.equal(stepHero(b, s, { ...idle, dive: true }, 1 / 60, world)?.kind, "dive");
    run(b, s, 1.5, {});
    assert.equal(s.mode, "dive");
    assert.ok(b.vy < -20, `diving at ${b.vy}`);
    const before = Math.hypot(b.vx, b.vz);
    stepHero(b, s, { ...idle, grapple: true, camYaw: Math.PI }, 1 / 60, world);
    assert.equal(s.mode, "swing");
    assert.ok(Math.hypot(b.vx, b.vz) > before + 8, "the fall turned forward");
  });
  it("letting go fast on the upswing is a perfect release: more fling than a plain one", () => {
    const mk = (): HeroBody => ({ x: 0, y: 10, z: 100, vx: 0, vy: 6, vz: -16, yaw: 0 });
    const a = mk(), sa = { ...newHero(), mode: "swing" as const, anchor: { x: 0, y: 30, z: 95, len: 25, wall: false }, lineT: 1 };
    assert.equal(stepHero(a, sa, idle, 1 / 60, world)?.kind, "perfect");
    const p = { ...mk(), vy: -6 }, sp = { ...newHero(), mode: "swing" as const, anchor: { x: 0, y: 30, z: 95, len: 25, wall: false }, lineT: 1 };
    assert.equal(stepHero(p, sp, idle, 1 / 60, world)?.kind, "release");
    assert.ok(Math.hypot(a.vx, a.vz) > Math.hypot(p.vx, p.vz) + 4);
  });
  it("lines fired before touching down build a chain that pumps harder; landing ends it", () => {
    assert.equal(chainPump(1), 1);
    assert.ok(chainPump(4) > chainPump(2) && chainPump(50) === HERO.chainMax);
    const b: HeroBody = { x: 0, y: 30, z: 300, vx: 0, vy: 0, vz: -10, yaw: 0 };
    const s = { ...newHero(), mode: "air" as const };
    for (let i = 0; i < 3; i++) {
      run(b, s, 0.6, { grapple: true, camYaw: Math.PI, mz: 1 });
      run(b, s, 0.1, {});
    }
    assert.equal(s.chain, 3);
    assert.equal(s.best, 3);
    run(b, s, 20, {});
    assert.equal(s.mode, "ground");
    assert.equal(s.chain, 0);
    assert.equal(s.best, 3, "the best stays for the HUD");
  });
});
