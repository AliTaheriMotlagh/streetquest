// Grenades and C4 (lib/arena/throwables): the shared flight, blast and flash maths, wall
// normals for bullet holes, and the realtime referee throwing, blasting and smoking.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FootprintIndex, rayFootprint, type Footprint, type Normal, type Ray } from "@/lib/arena/geom";
import { F_FOOT, type ServerMsg, type State } from "@/lib/arena/protocol";
import { blastDamage, flashSeconds, fly, fullGear, RESUPPLY_MS, resupply, smokeBlocks, smokeRadius, THROW_GAP_MS, THROW_KEYS, THROW_MAX_M, THROWABLES, throwVelocity, type Walls } from "@/lib/arena/throwables";
import { Hub } from "../realtime/hub";

const A = { lat: 35.7325, lng: 51.5352 };
const state = (x: number, z: number, extra: Partial<State> = {}): State => ({ flags: F_FOOT, vehicle: 0, weapon: 2, x, y: 0, z, yaw: 0, pitch: 0, vx: 0, vz: 0, ...extra });

/** A 10 m tall block whose west wall is at x = wallX (spanning z −20…20). */
const block = (wallX: number): Footprint => {
  const pts = [wallX, -20, wallX + 10, -20, wallX + 10, 20, wallX, 20];
  return { pts, minX: wallX, maxX: wallX + 10, minZ: -20, maxZ: 20, h: 10, mh: 0 };
};
const wallsOf = (...fs: Footprint[]): Walls => {
  const idx = new FootprintIndex();
  for (const f of fs) idx.add(f);
  return (r: Ray, maxT: number, n: Normal) => idx.ray(r, maxT, n);
};
const open: Walls = () => Infinity;

describe("a throw's flight", () => {
  it("arcs, bounces and rolls to a stop on open ground, then goes off on its fuse", () => {
    const def = THROWABLES.frag;
    const f = fly(def, [0, 1.5, 0], throwVelocity(def, { dx: 1, dy: 0, dz: 0 }, { vx: 0, vz: 0 }), open);
    assert.ok(f.landS > 0.3 && f.landS < 2, `lands after ${f.landS}`);
    assert.equal(f.goS, def.fuseS);
    assert.ok(f.rest[0] > 8 && f.rest[0] < THROW_MAX_M, `rests at ${f.rest[0]}`);
    assert.ok(Math.abs(f.rest[2]) < 1e-6);
    assert.ok(f.rest[1] >= 0 && f.rest[1] < 0.2);
    for (const p of f.path) assert.ok(p[1] >= 0, "never under the ground");
  });

  it("bounces off a wall instead of going through it", () => {
    const def = THROWABLES.frag;
    const f = fly(def, [0, 1.5, 0], throwVelocity(def, { dx: 1, dy: 0, dz: 0 }, { vx: 0, vz: 0 }), wallsOf(block(6)));
    for (const p of f.path) assert.ok(p[0] < 6, `stays this side of the wall (${p[0]})`);
    assert.ok(f.rest[0] < 6);
  });

  it("a molotov breaks where it first lands; C4 sticks to the wall it hits, facing back", () => {
    const m = THROWABLES.molotov;
    const fm = fly(m, [0, 1.5, 0], throwVelocity(m, { dx: 1, dy: -0.3, dz: 0 }, { vx: 0, vz: 0 }), open);
    assert.ok(fm.goS === fm.landS && fm.goS < m.fuseS, `breaks on landing (${fm.goS})`);
    assert.equal(fm.rest[1], 0);

    const c = THROWABLES.c4;
    const fc = fly(c, [0, 1.5, 0], [6, 1, 0], wallsOf(block(3)));
    assert.equal(fc.goS, Infinity, "waits for its owner");
    assert.ok(fc.stuck && fc.stuck.x < -0.99, "stuck facing the thrower");
    assert.ok(Math.abs(fc.rest[0] - 3) < 0.15, `on the wall (${fc.rest[0]})`);
  });

  it("adds half the thrower's run to the throw", () => {
    const def = THROWABLES.frag;
    const still = throwVelocity(def, { dx: 0, dy: 0, dz: -1 }, { vx: 0, vz: 0 });
    const running = throwVelocity(def, { dx: 0, dy: 0, dz: -1 }, { vx: 0, vz: -6 });
    assert.ok(Math.abs(running[2] - still[2] + 3) < 1e-9);
  });
});

describe("what goes off", () => {
  it("a blast is lethal up close, falls away, and is nothing at its edge", () => {
    const f = THROWABLES.frag;
    assert.ok(blastDamage(f, 0.8) >= 100, "a frag at your feet kills");
    let last = Infinity;
    for (let d = 0; d < f.radius; d += 0.5) {
      const x = blastDamage(f, d);
      assert.ok(x <= last && x >= 1);
      last = x;
    }
    assert.equal(blastDamage(f, f.radius), 0);
    assert.equal(blastDamage(THROWABLES.smoke, 1), 0, "smoke does no damage");
    assert.ok(blastDamage(THROWABLES.c4, 3) > blastDamage(f, 3), "C4 hits harder");
  });

  it("a flash blinds longest up close and looking at it; not at all through a wall", () => {
    const ahead = flashSeconds(4, 1, true), side = flashSeconds(4, 0.1, true), behind = flashSeconds(4, -1, true);
    assert.ok(ahead > side && side > behind && behind > 0, `${ahead} > ${side} > ${behind}`);
    assert.equal(flashSeconds(4, 1, false), 0);
    assert.equal(flashSeconds(THROWABLES.flash.radius + 1, 1, true), 0);
    assert.ok(flashSeconds(1, 1, true) > flashSeconds(15, 1, true));
  });

  it("smoke blocks a line through it, not one around it, and thins away", () => {
    const s = [{ x: 5, y: 1, z: 0, r: 2 }];
    assert.equal(smokeBlocks(s, 0, 1.5, 0, 10, 1.5, 0), true);
    assert.equal(smokeBlocks(s, 0, 1.5, 4, 10, 1.5, 4), false);
    assert.equal(smokeRadius(-1), 0);
    assert.ok(smokeRadius(3) > smokeRadius(0.1));
    assert.equal(smokeRadius(THROWABLES.smoke.lastsS + 1), 0);
  });

  it("every life starts with each kind's share", () => {
    const g = fullGear();
    for (const k of THROW_KEYS) assert.equal(g[k], THROWABLES[k].per);
  });
});

describe("bullet holes face the shooter", () => {
  it("a wall hit reports the wall's outward face; a roof hit points up", () => {
    const f = block(5);
    const n: Normal = { x: 0, y: 0, z: 0 };
    const t = rayFootprint({ ox: 0, oy: 2, oz: 0, dx: 1, dy: 0, dz: 0 }, f, 50, n);
    assert.equal(t, 5);
    assert.deepEqual([n.x, n.y, Math.abs(n.z)], [-1, 0, 0]);
    const t2 = rayFootprint({ ox: 8, oy: 20, oz: 0, dx: 0, dy: -1, dz: 0 }, f, 50, n);
    assert.equal(t2, 10);
    assert.deepEqual([n.x, n.y, n.z], [0, 1, 0]);
  });
});

describe("the referee", () => {
  const setup = () => {
    const hub = new Hub(() => {});
    const msgs: ServerMsg[] = [];
    const sock = { readyState: 1, bufferedAmount: 0, close() {}, send: (d: string | ArrayBuffer) => typeof d === "string" && msgs.push(JSON.parse(d)) };
    const a = hub.join(sock, { id: "a", name: "A", avatar: "🙂", level: 20, friends: [], virtual: true }, A);
    const b = hub.join(sock, { id: "b", name: "B", avatar: "🙂", level: 20, friends: [], virtual: true }, A);
    const t0 = Date.now();
    hub.state(a, state(0, 0), t0);
    hub.state(b, state(4, 0), t0);
    // Partners in the open city (they see each other), both out of passive mode.
    hub.message(a, { t: "party", ids: ["b"] });
    hub.message(b, { t: "party", ids: ["a"] });
    hub.message(a, { t: "passive", on: false }, t0);
    hub.message(b, { t: "passive", on: false }, t0);
    return { hub, msgs, a, b, t0 };
  };

  it("a frag at someone's feet hurts them (and its thrower, close by), once its fuse is up", () => {
    const { hub, msgs, a, b, t0 } = setup();
    hub.message(a, { t: "throw", k: "frag", o: [0, 1.5, 0], v: [6, 2, 0], rest: [4, 0, 0] }, t0 + 10);
    assert.equal(a.gear.frag, 0);
    assert.ok(msgs.some((m) => m.t === "nade" && m.k === "frag"), "everyone near sees the throw");
    hub.tick(t0 + 1000);
    assert.equal(b.hp, 100, "not before the fuse");
    hub.tick(t0 + 10 + THROWABLES.frag.fuseS * 1000 + 50);
    assert.ok(msgs.some((m) => m.t === "boom" && m.k === "frag"));
    assert.ok(b.dead || b.hp < 40, `b took the blast (${b.hp})`);
    assert.ok(a.hp < 100, "the thrower 4 m away is caught too");
    // None left: a second one is refused.
    msgs.length = 0;
    hub.message(a, { t: "throw", k: "frag", o: [0, 1.5, 0], v: [6, 2, 0] }, t0 + 10 + THROW_GAP_MS * 5);
    assert.ok(!msgs.some((m) => m.t === "nade"));
  });

  it("the open city hands a thrown grenade back after a rest", () => {
    const { hub, a, t0 } = setup();
    hub.message(a, { t: "throw", k: "smoke", o: [0, 1.5, 0], v: [12, 2, 0], rest: [5, 0, 0] }, t0 + 10);
    assert.equal(a.gear.smoke, 0);
    hub.tick(t0 + RESUPPLY_MS - 2000);
    assert.equal(a.gear.smoke, 0, "not yet");
    hub.tick(t0 + RESUPPLY_MS + 1500);
    assert.equal(a.gear.smoke, THROWABLES.smoke.per);
    assert.equal(resupply(fullGear(), {}, t0), null, "a full bag has nothing to get back");
  });

  it("C4 waits for its owner, then goes off on command", () => {
    const { hub, msgs, a, b, t0 } = setup();
    hub.message(a, { t: "throw", k: "c4", o: [0, 1.5, 0], v: [2, 1, 0], rest: [3, 0, 0] }, t0 + 10);
    hub.tick(t0 + 8000);
    assert.equal(b.hp, 100, "still waiting");
    hub.message(a, { t: "detonate" }, t0 + 8100);
    hub.tick(t0 + 8150);
    assert.ok(msgs.some((m) => m.t === "boom" && m.k === "c4"));
    assert.ok(b.dead, "C4 a metre away kills");
  });

  it("a passive player's grenade goes off but hurts nobody else; smoke hides one side from the other", () => {
    const { hub, msgs, a, b, t0 } = setup();
    hub.world.setPassive(b, true, t0 + 60_000);
    msgs.length = 0;
    hub.message(b, { t: "throw", k: "frag", o: [4, 1.5, 0], v: [-6, 2, 0], rest: [0.5, 0, 0] }, t0 + 60_010);
    assert.ok(msgs.some((m) => m.t === "nade"), "passive players throw too (the street takes the blast)");
    assert.equal(b.passive, true, "and stay passive");
    hub.tick(t0 + 60_010 + THROWABLES.frag.fuseS * 1000 + 50);
    assert.ok(msgs.some((m) => m.t === "boom" && m.k === "frag"));
    assert.equal(a.hp, 100, "a passive player's blast can't hurt another player");

    hub.state(b, state(10, 0), t0 + 60_020);
    const eye = (p: typeof a) => [p.ll, 1.5] as const;
    assert.equal(hub.world.sight(...eye(a), ...eye(b), t0 + 60_030), true);
    hub.message(a, { t: "throw", k: "smoke", o: [0, 1.5, 0], v: [12, 2, 0], rest: [5, 0, 0] }, t0 + 60_030);
    const pop = t0 + 60_030 + THROWABLES.smoke.fuseS * 1000 + 10;
    hub.tick(pop);
    assert.equal(hub.world.sight(...eye(a), ...eye(b), pop + 500), false, "the cloud is in the way");
    hub.tick(pop + THROWABLES.smoke.lastsS * 1000 + 100);
    assert.equal(hub.world.sight(...eye(a), ...eye(b), pop + THROWABLES.smoke.lastsS * 1000 + 200), true, "and it clears");
  });
});
