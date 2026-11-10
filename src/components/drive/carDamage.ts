"use client";
// Your own car's health and the dents you put in it (numbers: lib/street/damage.ts):
//  - a crash folds the bodywork in where it hit — every vertex near the point pushed in
//    toward the middle of the car, deepest at the point and easing out (a softly rounded
//    dent, a little crumpled), the lights and glass with it;
//  - the model's geometry is shared with traffic (fleet3d / carModels), so the first dent
//    gives this car its own copy (copy-on-write) and only it is bent;
//  - a bullet leaves a hole where it went in — found on the real body by a ray and laid on
//    it as a decal (DecalGeometry follows the panel's curve): a dark hole ringed with bare
//    metal, or a star of cracks in the glass; the last HOLES of them stay;
//  - blown up, it's a charred shell: black paint, no glass, lamps out.
// A new car (the garage, a street car) starts clean; the same car rebuilt (a new paint)
// keeps its health but not its dents.
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { carLook, enginePower, freshCar, type CarHealth } from "@/lib/street/damage";
import type { VehicleModel } from "./vehicles3d";

const v = new THREE.Vector3();
const hit = new THREE.Vector3();
const centre = new THREE.Vector3();
const inv = new THREE.Matrix4();
const CHAR = new THREE.MeshStandardMaterial({ color: "#16130f", roughness: 1, metalness: 0.1 });
/** Bullet holes kept on your car. */
const HOLES = 14;
const isGlass = (m: THREE.Material) => /glass|window/i.test(m.name) || (m as THREE.MeshStandardMaterial).transparent || ((m as THREE.MeshStandardMaterial).metalness > 0.85 && (m as THREE.MeshStandardMaterial).roughness < 0.12);

let holeMats: { metal: THREE.MeshStandardMaterial; glass: THREE.MeshBasicMaterial } | null = null;
/** The two decals: a hole in metal, a star of cracks in glass (drawn once on canvases). */
function holeMaterials() {
  if (holeMats) return holeMats;
  const draw = (size: number, paint: (g: CanvasRenderingContext2D, c: number) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    paint(g, size / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const metal = draw(64, (g, c) => {
    const soot = g.createRadialGradient(c, c, 0, c, c, c);
    soot.addColorStop(0, "rgba(20,18,16,.55)");
    soot.addColorStop(1, "rgba(20,18,16,0)");
    g.fillStyle = soot;
    g.fillRect(0, 0, c * 2, c * 2);
    g.fillStyle = "#a9adb2";
    g.beginPath();
    g.arc(c, c, c * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#050505";
    g.beginPath();
    g.arc(c, c, c * 0.24, 0, Math.PI * 2);
    g.fill();
  });
  const glass = draw(256, (g, c) => {
    g.strokeStyle = "rgba(235,240,245,.9)";
    g.lineCap = "round";
    for (let i = 0; i < 11; i++) {
      // A crack wandering out from the hole.
      let a = (i / 11) * Math.PI * 2 + Math.random() * 0.4, r = c * 0.06, x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x, y);
      const end = c * (0.55 + Math.random() * 0.4);
      while (r < end) {
        r += c * 0.08;
        a += (Math.random() - 0.5) * 0.35;
        (x = c + Math.cos(a) * r), (y = c + Math.sin(a) * r);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (const rr of [0.2, 0.38]) {
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(c, c, c * rr, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(240,244,248,.85)";
    g.beginPath();
    g.arc(c, c, c * 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#060606";
    g.beginPath();
    g.arc(c, c, c * 0.04, 0, Math.PI * 2);
    g.fill();
  });
  const decal = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
  return (holeMats = { metal: new THREE.MeshStandardMaterial({ map: metal, roughness: 0.6, metalness: 0.4, ...decal }), glass: new THREE.MeshBasicMaterial({ map: glass, ...decal }) });
}
const caster = new THREE.Raycaster();
const look = new THREE.Object3D();

export class CarDamage {
  health: CarHealth = freshCar();
  private model: VehicleModel | null = null;
  private own = new WeakSet<THREE.BufferGeometry>();
  /** This car's own (dented) copies, freed with the model they belonged to. */
  private clones: THREE.BufferGeometry[] = [];
  private charred = false;
  /** Bullet holes on it (decals on the body), the oldest first. */
  private holes: THREE.Mesh[] = [];

  /** The car's (new) model: dents start over on it; a burnt-out car stays burnt. */
  attach(model: VehicleModel) {
    this.clearHoles();
    this.model = model;
    for (const g of this.clones) g.dispose();
    this.clones = [];
    this.own = new WeakSet();
    this.charred = false;
    if (this.health.exploded) this.char();
  }

  /** A different car: as good as new. */
  reset(hp = 100) {
    this.clearHoles();
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

  /**
   * A bullet fired from (fx, fy, fz) at (tx, ty, tz) hit the car: a hole where it meets the
   * body (none if the ray misses it — the shot grazed past).
   */
  shot(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number) {
    const m = this.model;
    if (!m || this.charred) return;
    m.group.updateMatrixWorld(true);
    const from = new THREE.Vector3(fx, fy, fz), dir = new THREE.Vector3(tx - fx, ty - fy, tz - fz);
    const len = dir.length();
    if (len < 0.01) return;
    caster.set(from, dir.divideScalar(len));
    caster.far = len + 4;
    const skip = new Set<THREE.Object3D>();
    for (const w of m.wheels) w.traverse((o) => skip.add(o));
    for (const h of this.holes) skip.add(h);
    const hit = caster.intersectObject(m.body, true).find((h) => (h.object as THREE.Mesh).isMesh && !skip.has(h.object) && h.object.visible && !(h.object as THREE.InstancedMesh).isInstancedMesh);
    if (!hit?.face) return;
    const mesh = hit.object as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const glass = mats.some(isGlass);
    const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
    look.position.copy(hit.point);
    look.lookAt(hit.point.clone().add(n));
    look.rotation.z = Math.random() * Math.PI * 2;
    const size = glass ? 0.42 : 0.1;
    const geo = new DecalGeometry(mesh, hit.point, look.rotation, new THREE.Vector3(size, size, 0.25));
    // Built in world space: into the body's own frame, so it moves (and leans) with the car.
    geo.applyMatrix4(m.body.matrixWorld.clone().invert());
    const mat = holeMaterials();
    const d = new THREE.Mesh(geo, glass ? mat.glass : mat.metal);
    d.renderOrder = 3;
    m.body.add(d);
    this.holes.push(d);
    if (this.holes.length > HOLES) this.dropHole(this.holes.shift()!);
  }

  private dropHole(d: THREE.Mesh) {
    d.removeFromParent();
    d.geometry.dispose();
  }

  private clearHoles() {
    for (const d of this.holes) this.dropHole(d);
    this.holes = [];
  }

  /** Burnt out: black paint, no glass, the lamps dark. */
  char() {
    const m = this.model;
    if (!m || this.charred) return;
    this.charred = true;
    this.clearHoles();
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
