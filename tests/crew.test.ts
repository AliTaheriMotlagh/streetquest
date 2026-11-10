// Who's in the cars in traffic (components/drive/crew.ts, fleet3d.ts): every model with
// windows gets a cabin you see through the glass — inside the glass, facing in — and a
// driver's seat on the left; a car that's driving is drawn with someone at the wheel, and
// a dented car carries its dent to the shader.
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import * as THREE from "three";
import { FLEET, type FleetKey } from "@/lib/fleet";
import { freshCar, dentCar } from "@/lib/street/damage";
import { cabinGeometry, cabinShape, driverLook, hull, WOMEN_SHARE } from "@/components/drive/crew";
import { fleetParts, FleetInstances } from "@/components/drive/fleet3d";

before(() => {
  const ctx = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    fillStyle: "",
  };
  (globalThis as { document?: unknown }).document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
  mock.method(console, "warn", () => {});
});

const CARS: FleetKey[] = ["pride", "peykan", "p206", "pars", "samand", "taxi", "suv", "vanet", "bus", "minibus", "khavar"];

describe("the cabin", () => {
  it("hull: the outline round a set of points", () => {
    const h = hull([
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
      [1, 0.5],
      [1, 0.2],
    ]);
    assert.equal(h.length, 4);
  });

  it("every car's driver sits on the left, inside the car, head under the roof", () => {
    for (const key of CARS) {
      const p = fleetParts(key), def = FLEET[key];
      const c = cabinShape(p.glass!.getAttribute("position").array, p.hgt);
      assert.ok(c, `${key}: a cabin`);
      const s = c.seat;
      assert.ok(s.x < -0.15 && s.x > -def.wid / 2, `${key}: on the left (${s.x.toFixed(2)})`);
      assert.ok(s.y < c.roof - 0.15 && s.y > c.waist - 0.1, `${key}: head under the roof`);
      assert.ok(s.z > c.front && s.z < c.back, `${key}: between the windscreen and the back`);
      assert.ok(Math.abs(s.z) < def.len / 2);
    }
  });

  it("a bike has no cabin (its rider is part of the model)", () => {
    const p = fleetParts("bike");
    assert.ok(!p.glass || !cabinShape(p.glass.getAttribute("position").array, p.hgt));
  });

  it("its walls face in: only the far side draws, so it can't cover anything outside", () => {
    const p = fleetParts("samand");
    const c = cabinShape(p.glass!.getAttribute("position").array, p.hgt)!;
    const g = cabinGeometry(c);
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal");
    // The walls are the first triangles (seats, dash and wheel follow): check every wall
    // triangle's winding agrees with its normal, and both point into the cabin.
    const mid = new THREE.Vector3((c.x0 + c.x1) / 2, (c.roof + c.waist) / 2 - 0.2, (c.front + c.back) / 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), w = new THREE.Vector3();
    let walls = 0;
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      d.fromBufferAttribute(pos, i + 2);
      // Only the walls: every corner on the outer surface (outside the seat/dash region is hard to tell, so use the side walls).
      if (!(Math.abs(a.x - c.x0) < 1e-4 && Math.abs(b.x - c.x0) < 1e-4 && Math.abs(d.x - c.x0) < 1e-4)) continue;
      walls++;
      w.subVectors(b, a).cross(n.subVectors(d, a)).normalize();
      n.fromBufferAttribute(nor, i);
      assert.ok(w.dot(n) > 0.9, "winding and normal agree");
      assert.ok(w.x > 0.9, "the left wall faces right, into the cabin");
    }
    assert.ok(walls >= 2, `${walls} wall triangles`);
    assert.ok(mid.x > c.x0);
  });
});

describe("traffic drawn with drivers and dents", () => {
  type Pool = {
    n: number;
    marks: { dents: THREE.InstancedBufferAttribute };
    seat: unknown;
    body: THREE.InstancedMesh[];
  };
  const pools = (f: FleetInstances) => [...(f as unknown as { pools: Map<unknown, Pool> }).pools.values()];
  const crewN = (f: FleetInstances) => (f as unknown as { crew: { n: number } }).crew.n;

  it("a driving car has a driver, a parked one doesn't; the dent reaches every part of the body", () => {
    const f = new FleetInstances(new THREE.Scene(), "real");
    const h = freshCar();
    h.hp = 40;
    dentCar(h, { x: 0.3, z: -2.2 }, 0.2);
    f.begin(0, 0);
    f.put("samand", 0, 0, 0, new THREE.Color("#fff"), false, 0, 0, {
      health: h,
      driver: 3,
    });
    f.put("samand", 5, 0, 0, new THREE.Color("#fff"), false, 0);
    f.end();
    assert.equal(crewN(f), 1, "one driver");
    const p = pools(f).find((q) => q.n === 2)!;
    assert.ok(p.seat, "the samand has a seat");
    assert.deepEqual(
      Array.from(p.marks.dents.array.slice(0, 8) as Float32Array).map((v) => +v.toFixed(3)),
      [0.3, -2.2, 0.2, 0.4, 0, 0, 0, 1],
    );
    for (const m of p.body) assert.equal(m.geometry.getAttribute("aDent"), p.marks.dents, "paint, trim, lamps and glass all fold");
    f.dispose();
  });

  it("the traffic copy of a model carries its cabin; the model itself (your car's) doesn't", () => {
    const f = new FleetInstances(new THREE.Scene(), "real");
    f.begin(0, 0);
    f.put("pride", 0, 0, 0, new THREE.Color("#fff"), false, 0);
    f.end();
    const parts = fleetParts("pride");
    const kit = pools(f)[0].body[1].geometry;
    assert.ok(kit.getAttribute("position").count > parts.kit.getAttribute("position").count);
    assert.notEqual(kit.getAttribute("position"), parts.kit.getAttribute("position"));
    f.dispose();
  });
});

describe("who's driving", () => {
  it("about a third of drivers are women in a headscarf; the same car, the same driver; a uniform is always an officer", () => {
    let women = 0;
    for (let id = 1; id <= 1000; id++) if (driverLook(id).woman) women++;
    assert.ok(Math.abs(women / 1000 - WOMEN_SHARE) < 0.08, `${women} women in 1000`);
    assert.deepEqual(driverLook(42), driverLook(42));
    for (let id = 1; id < 200; id++) assert.equal(driverLook(id, true).woman, false);
  });

  it("a woman driver is drawn with a scarf, a man with hair", () => {
    const f = new FleetInstances(new THREE.Scene(), "real");
    const woman = Array.from({ length: 50 }, (_, i) => i + 1).find((i) => driverLook(i).woman)!;
    const man = Array.from({ length: 50 }, (_, i) => i + 1).find((i) => !driverLook(i).woman)!;
    f.begin(0, 0);
    f.put("pride", 0, 0, 0, new THREE.Color("#fff"), false, 0, 0, { driver: woman });
    f.put("pride", 6, 0, 0, new THREE.Color("#fff"), false, 0, 0, { driver: man });
    f.end();
    const count = (f as unknown as { crew: { count: Record<string, number> } }).crew.count;
    assert.deepEqual(count, { top: 2, skin: 2, hair: 1, scarf: 1 });
    f.dispose();
  });

  it("bullet holes ride along with the copy: packed into its marks, none for a clean car", () => {
    const f = new FleetInstances(new THREE.Scene(), "real");
    const h = freshCar();
    h.holes = [{ x: 0.8, y: 0.7, z: -0.5 }, { x: -0.8, y: 1.1, z: 0.2 }];
    f.begin(0, 0);
    f.put("samand", 0, 0, 0, new THREE.Color("#fff"), false, 0, 0, { health: h });
    f.put("samand", 5, 0, 0, new THREE.Color("#fff"), false, 0);
    f.end();
    const all = [...(f as unknown as { pools: Map<unknown, { n: number; marks: { holes: THREE.InstancedBufferAttribute[] } }> }).pools.values()];
    const p = all.find((q) => q.n === 2)!;
    const a = p.marks.holes.map((x) => Array.from(x.array.slice(0, 4)).map((v) => +v.toFixed(2)));
    assert.deepEqual(a, [[0.8, 10.7, -0.5, -0.8], [11.1, 0.2, 0, 0], [0, 0, 0, 0]]);
    // The clean one: every hole's height reads −10 (none).
    assert.deepEqual(p.marks.holes.map((x) => Array.from(x.array.slice(4, 8))), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    f.dispose();
  });
});
