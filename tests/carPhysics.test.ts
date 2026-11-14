// Car-against-car collisions: overlap tests, momentum passed on, chain crashes down a line
// of cars, heavy vs light, and spin from an off-centre hit.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contact, felt, massOf, resolve, tumbleOrigin, type Rigid } from "@/lib/street/carPhysics";

/** A Pride-sized car at (x, z) facing along −z (yaw 0) unless turned. */
const car = (x: number, z: number, o: Partial<Rigid> = {}): Rigid => ({ x, z, yaw: 0, vx: 0, vz: 0, spin: 0, mass: 1000, len: 4, wid: 1.6, ...o });
const momentum = (bs: Rigid[]) => bs.reduce((p, b) => ({ x: p.x + b.mass * b.vx, z: p.z + b.mass * b.vz }), { x: 0, z: 0 });

/** Step a set of cars forward, colliding every pair, like traffic.ts does each frame. */
function run(bs: Rigid[], seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) {
    for (const b of bs) (b.x += b.vx * dt), (b.z += b.vz * dt), (b.yaw += b.spin * dt);
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const c = contact(bs[i], bs[j]);
        if (c) resolve(bs[i], bs[j], c);
      }
  }
}

describe("car collisions", () => {
  it("finds the overlap and its normal, and none when apart", () => {
    assert.equal(contact(car(0, 0), car(3, 0)), null);
    // Side by side, 0.4 m overlap along x.
    const c = contact(car(0, 0), car(1.2, 0))!;
    assert.ok(c);
    assert.ok(Math.abs(c.nx - 1) < 1e-9 && Math.abs(c.nz) < 1e-9);
    assert.ok(Math.abs(c.depth - 0.4) < 1e-9);
    // Nose to tail along z: normal points from a to b.
    const d = contact(car(0, 0), car(0, -3.8))!;
    assert.ok(d.nz < -0.99 && Math.abs(d.depth - 0.2) < 1e-9);
    // A rotated box clear of a corner is apart (circles touch, boxes don't).
    assert.equal(contact(car(0, 0), car(3.2, 1.5, { yaw: Math.PI / 2 })), null);
  });

  it("a hit passes momentum on and conserves it", () => {
    const a = car(0, 0, { vz: -10 }), b = car(0, -3.9);
    const before = momentum([a, b]);
    const c = contact(a, b)!;
    const h = resolve(a, b, c);
    const after = momentum([a, b]);
    assert.ok(Math.abs(after.z - before.z) < 1e-6, "momentum kept");
    assert.ok(b.vz < -5 && a.vz > b.vz, "the struck car is shoved on, faster than the one that hit it");
    assert.ok(Math.abs(h.closing - 10) < 1e-9);
    // Equal cars: each feels the full closing speed.
    assert.ok(Math.abs(felt(h.dva) - 10) < 1e-9 && Math.abs(felt(h.dvb) - 10) < 1e-9);
  });

  it("a chain: the car you hit hits the next one, and that one the next", () => {
    const line = [car(0, 0, { vz: -15 }), car(0, -5), car(0, -10), car(0, -15)];
    run(line, 2);
    for (const b of line.slice(1)) assert.ok(Math.hypot(b.vx, b.vz) > 0.5 || b.z < -15, "every car in the line got moving");
    assert.ok(line[3].z < -16, "the last car was pushed down the street");
    // Nobody ends up inside anybody.
    for (let i = 0; i < line.length; i++) for (let j = i + 1; j < line.length; j++) assert.ok((contact(line[i], line[j])?.depth ?? 0) < 0.05);
  });

  it("a bus barely notices a Pride; the Pride bounces off", () => {
    const pride = car(0, 0, { vz: -12, mass: massOf({ len: 3.94, wid: 1.6, hgt: 1.43 }) });
    const bus = car(0, -7.9, { len: 12, wid: 2.55, mass: massOf({ len: 12, wid: 2.55, hgt: 3.35 }) });
    const h = resolve(pride, bus, contact(pride, bus)!);
    assert.ok(bus.mass > pride.mass * 8);
    assert.ok(Math.abs(bus.vz) < 2, "the bus hardly moves");
    assert.ok(felt(h.dva) > felt(h.dvb) * 8, "the Pride takes the hit");
    assert.ok(pride.vz >= -2, "the Pride stops dead or bounces");
  });

  it("a hit off the centre spins the struck car; a wall (Infinity) doesn't move", () => {
    const a = car(0, 0, { vz: -10 }), b = car(1.2, -3.9);
    resolve(a, b, contact(a, b)!);
    assert.ok(Math.abs(b.spin) > 0.1, "struck near its corner, it spins");
    const wall = car(0, -3.9, { mass: Infinity }), c = car(0, 0, { vz: -10 });
    resolve(c, wall, contact(c, wall)!);
    assert.equal(wall.vz, 0);
    assert.ok(c.vz > 0, "bounced back");
  });

  it("parting cars aren't pulled back together", () => {
    const a = car(0, 0, { vz: 3 }), b = car(0, -3.9, { vz: -3 });
    const h = resolve(a, b, contact(a, b)!);
    assert.equal(h.impulse, 0);
    assert.equal(a.vz, 3);
  });
});

describe("a car tipped over", () => {
  const pride = { len: 3.9, wid: 1.6, hgt: 1.45 };
  /** The height of the lowest and highest of the body's eight corners, drawn from that origin. */
  function span(y: number, roll: number, pitch: number) {
    const [, oy] = tumbleOrigin(pride, y, roll, pitch);
    const ys: number[] = [];
    for (const u of [-pride.wid / 2, pride.wid / 2])
      for (const v of [0, pride.hgt])
        for (const w of [-pride.len / 2, pride.len / 2]) {
          // yaw · pitch(X) · roll(Z), as fleet3d draws it: only the height matters here.
          const yr = u * Math.sin(roll) + v * Math.cos(roll);
          ys.push(oy + yr * Math.cos(pitch) - w * Math.sin(pitch));
        }
    return { low: Math.min(...ys), high: Math.max(...ys) };
  }

  it("stands where it is the right way up", () => {
    const same = (got: number[], want: number[]) => assert.ok(got.every((v, i) => Math.abs(v - want[i]) < 1e-9), `${got}`);
    same(tumbleOrigin(pride, 0, 0, 0), [0, 0, 0]);
    same(tumbleOrigin(pride, 2.5, 0, 0), [0, 2.5, 0]);
  });

  it("lies on the road on its roof, not under it", () => {
    const [x, y, z] = tumbleOrigin(pride, 0, Math.PI, 0);
    assert.ok(Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9, "over the same spot");
    assert.ok(Math.abs(y - pride.hgt) < 1e-9, "its wheels are a car's height up");
    const s = span(0, Math.PI, 0);
    assert.ok(Math.abs(s.low) < 1e-9 && Math.abs(s.high - pride.hgt) < 1e-9);
  });

  it("never dips under the road however it tumbles, and isn't lifted when it's clear of it", () => {
    for (let roll = -Math.PI; roll <= Math.PI; roll += 0.37)
      for (let pitch = -1.5; pitch <= 1.5; pitch += 0.5)
        for (const y of [0, 0.3, 4]) assert.ok(span(y, roll, pitch).low > -1e-9, `roll ${roll} pitch ${pitch} y ${y}`);
    // High in the air it turns about its middle, which is where the throw put it.
    const [, oy] = tumbleOrigin(pride, 6, Math.PI / 2, 0);
    assert.ok(Math.abs(oy - (6 + pride.hgt / 2)) < 1e-9);
  });
});

describe("no glitches from deep or violent hits", () => {
  it("a car sunk deep into another comes out a little each frame, never flung metres at once", async () => {
    const { contact, resolve, MAX_PUSH } = await import("@/lib/street/carPhysics");
    const a = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, spin: 0, mass: 1000, len: 4.2, wid: 1.8 };
    const b = { x: 0.3, z: 0.4, yaw: 0.2, vx: 0, vz: 0, spin: 0, mass: 1000, len: 4.2, wid: 1.8 };
    const c = contact(a, b)!;
    assert.ok(c.depth > 1, `deep overlap ${c.depth}`);
    const [ax, bx, az, bz] = [a.x, b.x, a.z, b.z];
    resolve(a, b, c);
    assert.ok(Math.hypot(a.x - ax, a.z - az) + Math.hypot(b.x - bx, b.z - bz) <= MAX_PUSH + 1e-9);
  });
  it("speed and spin after a hit stay within bounds; bad numbers come to rest", async () => {
    const { sane, MAX_V, MAX_SPIN } = await import("@/lib/street/carPhysics");
    const r = { x: 0, z: 0, yaw: 0, vx: 300, vz: 400, spin: -90, mass: 1000, len: 4, wid: 2 };
    sane(r);
    assert.ok(Math.abs(Math.hypot(r.vx, r.vz) - MAX_V) < 1e-9);
    assert.equal(r.spin, -MAX_SPIN);
    const bad = { x: 0, z: 0, yaw: 0, vx: NaN, vz: 1, spin: Infinity, mass: 1000, len: 4, wid: 2 };
    sane(bad);
    assert.deepEqual([bad.vx, bad.vz, bad.spin], [0, 0, 0]);
  });
});
