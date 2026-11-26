// Knockable street furniture in the 3D city (rules: lib/street/props.ts). A car that runs into a bin,
// a bag, a bench or a dumpster wakes it: from then on that one instance is moved straight in its tile's
// InstancedMesh (every mesh drawing that kind — the drawn template and a real model's parts alike), so it
// stays one draw call. Its static collider is switched off; while it moves the car pushes it (and is
// slowed by it) through carPhysics. Only bodies within AWAKE_M move, at most MAX_AWAKE at once.
import * as THREE from "three";
import { contact, massOf, near, type Rigid } from "@/lib/street/carPhysics";
import { AWAKE_M, carRigid, knock, LOOSE, makeBody, MAX_AWAKE, stepBody, type Body, type LooseRef } from "@/lib/street/props";
import type { Footprint } from "./tileMesh";

type Awake = { b: Body; ref: LooseRef; meshes: THREE.InstancedMesh[]; y: number; scale: number; at: number };
/** The car as the props see it: position, heading, velocity and size. */
export type CarBox = { x: number; z: number; yaw: number; vx: number; vz: number; len: number; wid: number; hgt: number };

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), ax = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

export class LooseProps {
  private awake = new Map<string, Awake>();

  /** `detailOf(key)`: the tile's furniture group (its InstancedMeshes carry `userData.prop`), or null when it's gone. */
  constructor(private detailOf: (key: string) => THREE.Object3D | null, private onKnock?: (dv: number, x: number, z: number) => void) {}

  /**
   * The car ran into a loose obstacle (its collider's normal (nx, nz) points from the thing to the car).
   * Wakes it, hands it the hit and slows the car (mutates `car`). False when it can't be found (then
   * it's a plain wall this once).
   */
  hit(f: Footprint, ref: LooseRef, car: CarBox, nx: number, nz: number, px: number, pz: number): boolean {
    const a = this.wake(f, ref);
    if (!a) return false;
    const c = this.rigid(car);
    const k = knock(a.b, c, { nx: -nx, nz: -nz, depth: 0.02, px, pz });
    (car.vx = c.vx), (car.vz = c.vz);
    if (k.dv > 1.5) this.onKnock?.(k.dv, px, pz);
    return true;
  }

  /** Moves what's awake on by dt; the car (if driving) pushes the ones it touches and is slowed by them. */
  update(dt: number, car: CarBox | null, fx: number, fz: number) {
    if (!this.awake.size) return;
    const c = car ? this.rigid(car) : null;
    let moving = 0;
    for (const [id, a] of this.awake) {
      if (!a.meshes[0]?.parent) {
        this.awake.delete(id);
        continue;
      }
      if (Math.hypot(a.b.x - fx, a.b.z - fz) > AWAKE_M) continue;
      if (c && near(c, a.b)) {
        const hit = contact(c, a.b);
        if (hit) knock(a.b, c, hit);
      }
      const still = a.b.still;
      if (stepBody(a.b, dt) || still < 0.5) (moving++, this.draw(a));
      // Too many moving: the oldest stops where it is.
      if (moving > MAX_AWAKE) {
        a.b.vx = a.b.vz = a.b.spin = 0;
        if (a.b.tipping) a.b.tip = 1;
        this.draw(a);
      }
    }
    if (c && car) (car.vx = c.vx), (car.vz = c.vz), (car.x = c.x), (car.z = c.z);
  }

  /** A tile went away (or was rebuilt): its furniture starts over. */
  forget(key: string) {
    for (const [id, a] of this.awake) if (a.ref.key === key) this.awake.delete(id);
  }

  /** How many pieces are awake (dev hook). */
  count = () => this.awake.size;

  private rigid(car: CarBox): Rigid {
    return carRigid(car.x, car.z, car.yaw, car.vx, car.vz, massOf(car), car.len, car.wid);
  }

  private wake(f: Footprint, ref: LooseRef): Awake | null {
    const id = `${ref.key}|${ref.loose}|${ref.i}`;
    const had = this.awake.get(id);
    if (had) return had;
    const detail = this.detailOf(ref.key);
    if (!detail) return null;
    const meshes: THREE.InstancedMesh[] = [];
    detail.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh && im.userData.prop === ref.loose && ref.i < im.count) meshes.push(im);
    });
    if (!meshes.length) return null;
    meshes[0].getMatrixAt(ref.i, m4);
    m4.decompose(p3, q, s3);
    // Yaw back out of the quaternion (instances only turn about Y).
    const yaw = 2 * Math.atan2(q.y, q.w);
    const a: Awake = { b: makeBody(ref.loose, p3.x, p3.z, yaw), ref, meshes, y: p3.y, scale: s3.x, at: performance.now() };
    // Its static collider is off: from now on it's a body.
    f.h = -Infinity;
    this.awake.set(id, a);
    return a;
  }

  private draw(a: Awake) {
    const b = a.b, s = LOOSE[b.kind];
    q.setFromAxisAngle(Y, b.yaw);
    let lift = 0;
    if (b.tip > 0) {
      // Falling away from the hit: about the horizontal axis across its path, pivoting on the near foot.
      const ang = b.tip * b.tip * (Math.PI / 2);
      ax.set(b.tz, 0, -b.tx).normalize();
      qt.setFromAxisAngle(ax, ang);
      q.premultiply(qt);
      lift = Math.sin(ang) * Math.min(s.wid, s.hgt) * 0.5;
    }
    // Broken: squashed (a burst bag lies flat, a crushed bin is half its height).
    const sy = b.broken ? 0.45 : 1;
    m4.compose(p3.set(b.x, a.y + lift, b.z), q, s3.set(a.scale, a.scale * sy, a.scale));
    for (const im of a.meshes) {
      im.setMatrixAt(a.ref.i, m4);
      im.instanceMatrix.addUpdateRange(a.ref.i * 16, 16);
      im.instanceMatrix.needsUpdate = true;
    }
    // Knocked out of its tile's bounds: the mesh must still be drawn when only this one is in view.
    if (b.still > 0.4) for (const im of a.meshes) im.computeBoundingSphere();
  }
}
