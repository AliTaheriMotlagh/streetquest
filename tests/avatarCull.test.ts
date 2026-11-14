import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

// arena/avatar.ts gives every soldier's skinned mesh a fixed sphere round the body instead of
// switching culling off: three must cull a skinned mesh by its own `boundingSphere`.
describe("soldiers off screen are culled", () => {
  it("a skinned mesh with its own sphere is drawn in front of the camera and skipped behind it", () => {
    const m = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.5, 1.8, 0.3), new THREE.MeshBasicMaterial());
    m.bind(new THREE.Skeleton([new THREE.Bone()]));
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    cam.position.set(0, 1, 10);
    cam.lookAt(0, 1, 0);
    cam.updateMatrixWorld();
    const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const seen = (z: number) => (m.position.set(0, 0, z), m.updateMatrixWorld(), f.intersectsObject(m));
    assert.equal(seen(0), true);
    assert.equal(seen(30), false);
    assert.equal(m.boundingSphere.radius, 2, "three kept our sphere instead of recomputing it");
  });
});
