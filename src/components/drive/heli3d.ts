// The police helicopter's look (rules: lib/street/heli.ts): a white-and-blue body, a tail boom, skids, the main and
// tail rotors spinning, a blinking red light — and at night a searchlight cone down to where you are. Drawn in code
// (one merged body, two rotor discs, one cone), added when it's called in and disposed when it's gone.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Heli } from "@/lib/street/heli";

const tint = (g: THREE.BufferGeometry, c: string) => {
  const out = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(c), n = out.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  out.setAttribute("color", new THREE.BufferAttribute(a, 3));
  out.deleteAttribute("uv");
  return out;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

export class PoliceHeli {
  readonly group = new THREE.Group();
  private rotor: THREE.Mesh;
  private tail: THREE.Mesh;
  private beacon: THREE.Mesh;
  private cone: THREE.Mesh;
  private owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {
    // Nose forward along −z (forward is (−sin yaw, −cos yaw), as everywhere in the drive).
    const body = mergeGeometries([
      tint(new THREE.SphereGeometry(1.25, 12, 8).scale(1, 0.9, 1.6).translate(0, 0, -0.4), "#f2f4f7"),
      box(0.6, 0.18, 2.2, 0, -0.55, -0.4, "#1f4fa0"),
      tint(new THREE.SphereGeometry(0.95, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1.1).translate(0, 0.15, -1.3), "#2a3644"),
      tint(new THREE.CylinderGeometry(0.22, 0.32, 5.2, 8).rotateX(Math.PI / 2).translate(0, 0.25, 2.9), "#f2f4f7"),
      box(0.12, 1.1, 0.7, 0, 0.8, 5.3, "#1f4fa0"),
      box(0.12, 0.12, 2.8, -0.7, -1.35, -0.3, "#40464f"),
      box(0.12, 0.12, 2.8, 0.7, -1.35, -0.3, "#40464f"),
      box(0.1, 0.6, 0.1, -0.7, -1.05, -1.1, "#40464f"),
      box(0.1, 0.6, 0.1, 0.7, -1.05, -1.1, "#40464f"),
      box(0.1, 0.6, 0.1, -0.7, -1.05, 0.6, "#40464f"),
      box(0.1, 0.6, 0.1, 0.7, -1.05, 0.6, "#40464f"),
      tint(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6).translate(0, 1.3, -0.3), "#40464f"),
    ])!;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
    const blade = new THREE.MeshBasicMaterial({ color: "#1b1d21", transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const rotorGeo = new THREE.CircleGeometry(5.2, 24).rotateX(-Math.PI / 2);
    const tailGeo = new THREE.CircleGeometry(0.75, 12).rotateY(Math.PI / 2);
    const beaconGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const beaconMat = new THREE.MeshBasicMaterial({ color: "#ff2a2a" });
    // The searchlight: a soft additive cone, its tip at the light under the nose, opening down to the ground. Outside
    // faces only: the chase camera is often inside it, and its inner wall would wash the whole screen.
    const coneGeo = new THREE.ConeGeometry(4.5, 1, 20, 1, true).translate(0, -0.5, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color: "#fff6d8", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
    this.owned.push(body, mat, blade, rotorGeo, tailGeo, beaconGeo, beaconMat, coneGeo, coneMat);
    const hull = new THREE.Mesh(body, mat);
    hull.castShadow = true;
    this.rotor = new THREE.Mesh(rotorGeo, blade);
    this.rotor.position.set(0, 1.6, -0.3);
    this.tail = new THREE.Mesh(tailGeo, blade);
    this.tail.position.set(0.2, 0.8, 5.4);
    this.beacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.beacon.position.set(0, -0.75, 0.6);
    this.cone = new THREE.Mesh(coneGeo, coneMat);
    this.cone.frustumCulled = false;
    this.group.add(hull, this.rotor, this.tail, this.beacon);
    scene.add(this.group, this.cone);
  }

  /** Puts it where the rules say; the searchlight (night 0…1) points at `me` on the ground. */
  draw(h: Heli, me: { x: number; z: number }, dt: number, night: number) {
    this.t += dt;
    this.group.position.set(h.x, h.alt, h.z);
    this.group.rotation.set(0.12, h.yaw, 0, "YXZ");
    this.rotor.rotation.y += dt * 38;
    this.tail.rotation.x += dt * 55;
    this.beacon.visible = Math.sin(this.t * 6) > 0.6;
    const on = night > 0.35 && !h.leaving;
    this.cone.visible = on;
    if (on) {
      // From under the nose to the ground beside you, the cone's axis along that line.
      const from = new THREE.Vector3(h.x, h.alt - 1, h.z), to = new THREE.Vector3(me.x, 0, me.z);
      const len = from.distanceTo(to);
      this.cone.position.copy(from);
      this.cone.scale.set(1, len, 1);
      this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.sub(from).normalize());
      (this.cone.material as THREE.MeshBasicMaterial).opacity = 0.12 * Math.min(1, (night - 0.35) / 0.3);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.cone.removeFromParent();
    for (const o of this.owned) o.dispose();
  }
}
