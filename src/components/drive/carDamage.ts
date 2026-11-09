"use client";
// Your own car's health and the dents you put in it (numbers: lib/street/damage.ts):
//  - a crash folds the bodywork in where it hit — every vertex near the point pushed in
//    toward the middle of the car, deepest at the point and easing out (a softly rounded
//    dent, a little crumpled), the lights and glass with it;
//  - the model's geometry is shared with traffic (fleet3d / carModels), so the first dent
//    gives this car its own copy (copy-on-write) and only it is bent;
//  - blown up, it's a charred shell: black paint, no glass, lamps out.
// A new car (the garage, a street car) starts clean; the same car rebuilt (a new paint)
// keeps its health but not its dents.
import * as THREE from "three";
import { carLook, enginePower, freshCar, type CarHealth } from "@/lib/street/damage";
import type { VehicleModel } from "./vehicles3d";

const v = new THREE.Vector3();
const hit = new THREE.Vector3();
const centre = new THREE.Vector3();
const inv = new THREE.Matrix4();
const CHAR = new THREE.MeshStandardMaterial({ color: "#16130f", roughness: 1, metalness: 0.1 });

export class CarDamage {
  health: CarHealth = freshCar();
  private model: VehicleModel | null = null;
  private own = new WeakSet<THREE.BufferGeometry>();
  /** This car's own (dented) copies, freed with the model they belonged to. */
  private clones: THREE.BufferGeometry[] = [];
  private charred = false;

  /** The car's (new) model: dents start over on it; a burnt-out car stays burnt. */
  attach(model: VehicleModel) {
    this.model = model;
    for (const g of this.clones) g.dispose();
    this.clones = [];
    this.own = new WeakSet();
    this.charred = false;
    if (this.health.exploded) this.char();
  }

  /** A different car: as good as new. */
  reset(hp = 100) {
    this.health = freshCar();
    this.health.hp = Math.max(1, Math.min(100, hp));
  }

  get look() {
    return carLook(this.health.hp, this.health.exploded);
  }

  /** How much pull the engine has left (1 = all of it, 0 = a wreck). */
  get power() {
    return this.health.exploded ? 0 : enginePower(this.health.hp);
  }

  /** Dent the body `depth` m in where it hit at world (x, z), `y` m up. */
  dent(x: number, y: number, z: number, depth: number) {
    const m = this.model;
    if (!m || depth <= 0.005 || this.charred) return;
    m.group.updateMatrixWorld(true);
    hit.set(x, y, z);
    m.group.getWorldPosition(centre);
    centre.y = y;
    const R = 0.75 + depth * 2.2;
    const skip = new Set<THREE.Object3D>();
    for (const w of m.wheels) w.traverse((o) => skip.add(o));
    m.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || skip.has(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
      const g0 = mesh.geometry;
      const pos0 = g0.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos0 || pos0.count > 60_000) return;
      // Quick reject: is any of this mesh near the hit?
      if (!g0.boundingSphere) g0.computeBoundingSphere();
      const bs = g0.boundingSphere!;
      v.copy(bs.center).applyMatrix4(mesh.matrixWorld);
      const scale = mesh.matrixWorld.getMaxScaleOnAxis();
      if (v.distanceTo(hit) > bs.radius * scale + R) return;
      if (!this.own.has(g0)) {
        mesh.geometry = g0.clone();
        this.own.add(mesh.geometry);
        this.clones.push(mesh.geometry);
      }
      const g = mesh.geometry;
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      inv.copy(mesh.matrixWorld).invert();
      let moved = false;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const d = v.distanceTo(hit);
        if (d >= R) continue;
        const k = (1 - d / R) ** 2;
        // In toward the middle of the car, a touch downward, with a little crumple.
        let ix = centre.x - v.x, iz = centre.z - v.z;
        const l = Math.hypot(ix, iz) || 1;
        ix /= l;
        iz /= l;
        const crumple = 1 + Math.sin(i * 12.9898) * 0.25;
        v.x += ix * depth * k * crumple;
        v.z += iz * depth * k * crumple;
        v.y -= depth * k * 0.25;
        v.applyMatrix4(inv);
        pos.setXYZ(i, v.x, v.y, v.z);
        moved = true;
      }
      if (!moved) return;
      pos.needsUpdate = true;
      if (g.getAttribute("normal")) g.computeVertexNormals();
      g.computeBoundingSphere();
    });
  }

  /** Burnt out: black paint, no glass, the lamps dark. */
  char() {
    const m = this.model;
    if (!m || this.charred) return;
    this.charred = true;
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // Glass (mirror-smooth and metallic in these models) shatters away.
      if (mats.some((x) => /glass/i.test(x.name) || ((x as THREE.MeshStandardMaterial).metalness > 0.85 && (x as THREE.MeshStandardMaterial).roughness < 0.12))) mesh.visible = false;
      else mesh.material = CHAR;
    });
    m.brake.color.set("#000000");
    m.head.color.set("#000000");
    if (m.light) m.light.visible = false;
    if (m.beams) m.beams.visible = false;
  }
}
