// Car parts exported inside out (drive/gltf.ts fixWinding): the Xantia's wheel had every
// triangle wound backwards, so with back faces culled it drew as a see-through shell.
import assert from "node:assert/strict";
import { it } from "node:test";
import * as THREE from "three";
import { fixWinding, windingAgreement } from "@/components/drive/gltf";

const inverted = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const a = g.index!.array as Uint16Array;
  for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
  return g;
};

it("a well-made part agrees with its normals; one inside out doesn't", () => {
  const ok = new THREE.BoxGeometry(1, 1, 1), bad = inverted();
  assert.equal(windingAgreement(ok.attributes.position.array, ok.attributes.normal.array, ok.index!.array), 1);
  assert.equal(windingAgreement(bad.attributes.position.array, bad.attributes.normal.array, bad.index!.array), 0);
});

it("an inside-out part is turned the right way round; a good one is left alone", () => {
  const bad = inverted();
  assert.equal(fixWinding(bad), true);
  assert.equal(windingAgreement(bad.attributes.position.array, bad.attributes.normal.array, bad.index!.array), 1);
  const ok = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  assert.equal(fixWinding(ok), false);
  assert.equal(windingAgreement(ok.attributes.position.array, ok.attributes.normal.array, ok.index!.array), 1);
});
