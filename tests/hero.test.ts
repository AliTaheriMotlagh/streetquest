// Hero moves (lib/hero.ts) in a toy city: one block 20 × 20 m and 30 m tall, its south face at z = -20.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aimLine, HERO, newHero, stepHero, type HeroBody, type HeroInput, type HeroWorld } from "@/lib/hero";

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
    assert.equal(e?.kind, "release");
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
});
