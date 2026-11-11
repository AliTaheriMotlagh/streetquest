// The storefront renderer without a GPU (drive/storefronts.ts): a stub canvas stands in for the
// browser's, so the sign atlas, dressed fronts, caps, picking and the panel can be exercised in Node.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

// A canvas whose 2d context swallows every call.
const ctx = new Proxy({}, {
  get: (_t, k) => (k === "measureText" ? () => ({ width: 40 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });
Object.assign(globalThis, {
  document: { createElement: () => fakeCanvas(), fonts: { load: () => Promise.resolve([]) } },
  Image: class { onload: (() => void) | null = null; set src(_: string) {} },
});

const { Storefronts } = await import("@/components/drive/storefronts");

const shop = (i: number, cls: string, d = 20, pole = false) => ({ id: `t:${i}`, text: `فروشگاه ${i}`, cls, x: i * 6, y: 3, z: 10, angle: Math.PI, w: 4.6, pole, d });
const KINDS = ["bakery", "pharmacy", "cafe", "restaurant", "greengrocer", "clothes", "electronics", "supermarket"];
const counts = (sf: unknown) => {
  const o = sf as Record<string, THREE.InstancedMesh>;
  return { signs: o.signs.count, awnings: o.awnings.count, glass: o.glass.count, shutters: o.shutters.count, crosses: o.crosses.count };
};

describe("storefronts", () => {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera();
  it("builds a sign per store and dresses the near fronts, within the tier's caps", () => {
    const sf = new Storefronts(scene, "low");
    sf.now = () => new Date("2026-11-11T13:00:00+03:30");
    sf.sync(Array.from({ length: 80 }, (_, i) => shop(i, KINDS[i % KINDS.length], 10 + i)));
    const c = counts(sf);
    assert.ok(c.signs > 0 && c.signs <= 36, `signs ${c.signs}`);
    assert.ok(c.awnings > 0 && c.awnings <= 12, `awnings ${c.awnings}`);
    sf.update(1, 0.016, cam);
    sf.dispose();
  });
  it("lite builds the fewest", () => {
    const sf = new Storefronts(scene, "lite");
    sf.sync(Array.from({ length: 80 }, (_, i) => shop(i, KINDS[i % KINDS.length], 10)));
    const c = counts(sf);
    assert.ok(c.signs <= 24 && c.awnings <= 8);
    sf.dispose();
  });
  it("far stores get no sign; pole signs get two faces and no awning", () => {
    const sf = new Storefronts(scene, "high");
    sf.sync([shop(0, "cafe", 500), shop(1, "cafe", 30, true)]);
    const c = counts(sf);
    assert.equal(c.signs, 2);
    assert.equal(c.awnings, 0);
    sf.dispose();
  });
  it("a shut store shows its shutter, an open one its window", () => {
    const sf = new Storefronts(scene, "high");
    sf.now = () => new Date("2026-11-11T04:00:00+03:30");
    sf.sync([shop(0, "supermarket")]);
    const m = sf as unknown as { glass: THREE.InstancedMesh; shutters: THREE.InstancedMesh };
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.glass.getMatrixAt(0, m4);
    m4.decompose(p, q, s);
    assert.ok(s.y < 0.01, "window is folded away while shut");
    m.shutters.getMatrixAt(0, m4);
    m4.decompose(p, q, s);
    assert.ok(s.y > 0.5);
    sf.dispose();
  });
  it("the pharmacy's cross turns and the panel pops in and out", () => {
    const sf = new Storefronts(scene, "high");
    sf.sync([shop(0, "pharmacy")]);
    const cross = (sf as unknown as { crosses: THREE.InstancedMesh }).crosses;
    assert.equal(cross.count, 1);
    const yaw = () => {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      cross.getMatrixAt(0, m4);
      m4.decompose(new THREE.Vector3(), q, new THREE.Vector3());
      return new THREE.Euler().setFromQuaternion(q, "YXZ").y;
    };
    sf.update(0, 0.016, cam);
    const a = yaw();
    sf.update(1, 0.016, cam);
    assert.notEqual(a, yaw());
    sf.setInfo("t:0", { rating: 4.5, items: [{ title: "x", price: 1000 }], deal: 10 });
    sf.showPanel("t:0");
    for (let i = 0; i < 60; i++) sf.update(2 + i * 0.016, 0.016, cam);
    const panel = (sf as unknown as { panel: { mesh: THREE.Mesh } }).panel;
    assert.ok(panel.mesh.visible && panel.mesh.scale.x > 0.9);
    sf.showPanel(null);
    for (let i = 0; i < 120; i++) sf.update(3 + i * 0.016, 0.016, cam);
    assert.equal(panel.mesh.visible, false);
    sf.dispose();
  });
  it("picking maps an instance back to its store", () => {
    const sf = new Storefronts(scene, "high");
    sf.sync([shop(0, "cafe"), shop(1, "cafe")]);
    const ray = new THREE.Raycaster(new THREE.Vector3(6, 3, 0), new THREE.Vector3(0, 0, 1));
    // The sign faces −z (angle π); shoot from the street side.
    (sf as unknown as { group: THREE.Group }).group.updateMatrixWorld(true);
    const hit = sf.pick(ray);
    assert.equal(hit?.id, "t:1");
    sf.dispose();
  });
});
