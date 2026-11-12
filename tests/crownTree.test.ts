// The realistic city's drawn trees: a trunk and a lumpy crown, near-white (the street tints it),
// normals bent out from the crown, and cheap enough to plant along every street.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { makeTemplates } from "@/components/drive/world3d";

describe("street trees", () => {
  const tpl = makeTemplates("real");
  it("three kinds, each under 700 triangles, standing on the ground", () => {
    for (const g of [tpl.tree, ...tpl.variants]) {
      const tris = g.getAttribute("position").count / 3;
      assert.ok(tris > 100 && tris < 700, `${tris} triangles`);
      g.computeBoundingBox();
      assert.ok(Math.abs(g.boundingBox!.min.y) < 0.6, "on the ground");
    }
    assert.equal(tpl.variants.length, 2);
  });
  it("the crown's normals point outward (lit like a volume), its colours are light enough to tint", () => {
    const g = tpl.tree, pos = g.getAttribute("position"), n = g.getAttribute("normal"), c = g.getAttribute("color");
    g.computeBoundingBox();
    const mid = new THREE.Vector3();
    g.boundingBox!.getCenter(mid);
    let out = 0, crown = 0, light = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 4) continue;
      crown++;
      const d = new THREE.Vector3(pos.getX(i) - mid.x, 0, pos.getZ(i) - mid.z);
      if (d.length() > 1 && d.normalize().dot(new THREE.Vector3(n.getX(i), 0, n.getZ(i))) > 0) out++;
      if (c.getY(i) > 0.5) light++;
    }
    assert.ok(out / crown > 0.6, `${out}/${crown} face out`);
    assert.ok(light / crown > 0.9);
  });
});
