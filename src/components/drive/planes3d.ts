// Planes in the 3D city's sky (lib/flights.ts): the real ones round you — live ADS-B positions, or
// today's timetable placed by the clock where no receiver hears them (Iran) — each drawn where you'd
// look up and see it: same direction, same angle above the horizon, pulled in to the sky dome inside
// the camera's reach (a plane 40 km off still shows, small, at the right spot). Each one flies on
// between updates at its own speed and heading, banks into turns, and blinks its navigation lights
// (red left, green right, white strobe) — brighter at night. Low-poly shared geometry, unlit-ish
// materials, one group per plane; no lights added to the scene.
import * as THREE from "three";
import { advance, skyPlace, type Plane } from "@/lib/flights";

/** Planes are drawn on a dome this far round the camera (m) — inside the camera's far plane. */
const DOME_M = 2000;
const MAX_PLANES = 40;
type Frame = { toXZ: (lat: number, lng: number) => { x: number; z: number } };

export class Planes3D {
  private group = new THREE.Group();
  private items = new Map<string, { p: Plane; g: THREE.Group; red: THREE.Mesh; green: THREE.Mesh; strobe: THREE.Mesh; yaw: number }>();
  private body = new THREE.MeshLambertMaterial({ color: "#e9edf2", fog: false });
  private tail = new THREE.MeshLambertMaterial({ color: "#2a5db0", fog: false });
  private redM = new THREE.MeshBasicMaterial({ color: "#ff3030", fog: false });
  private greenM = new THREE.MeshBasicMaterial({ color: "#30ff6a", fog: false });
  private whiteM = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false });
  private geo = {
    fuselage: new THREE.CylinderGeometry(1.9, 1.6, 38, 10).rotateX(Math.PI / 2),
    nose: new THREE.SphereGeometry(1.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 19),
    wing: new THREE.BoxGeometry(34, 0.5, 5.5).translate(0, -0.6, 1),
    stab: new THREE.BoxGeometry(12, 0.4, 3).translate(0, 0.6, -17),
    fin: new THREE.BoxGeometry(0.5, 7, 4.5).translate(0, 4, -16.5),
    engine: new THREE.CylinderGeometry(1, 1, 4.5, 8).rotateX(Math.PI / 2),
    light: new THREE.SphereGeometry(0.9, 6, 4),
  };

  constructor(private scene: THREE.Scene, private frame: Frame) {
    this.group.name = "planes";
    scene.add(this.group);
  }

  private build(): { g: THREE.Group; red: THREE.Mesh; green: THREE.Mesh; strobe: THREE.Mesh } {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(this.geo.fuselage, this.body);
    add(this.geo.nose, this.body);
    add(this.geo.wing, this.body);
    add(this.geo.stab, this.body);
    add(this.geo.fin, this.tail);
    add(this.geo.engine, this.tail, -7, -2, 3);
    add(this.geo.engine, this.tail, 7, -2, 3);
    const red = add(this.geo.light, this.redM, -17, -0.6, 1);
    const green = add(this.geo.light, this.greenM, 17, -0.6, 1);
    const strobe = add(this.geo.light, this.whiteM, 0, 6.8, -18);
    return { g, red, green, strobe };
  }

  /** New positions from the server (planes no longer listed fly off). */
  set(planes: Plane[]) {
    const seen = new Set<string>();
    for (const p of planes.filter((x) => !x.ground).slice(0, MAX_PLANES)) {
      seen.add(p.id);
      const had = this.items.get(p.id);
      if (had) had.p = p;
      else {
        const parts = this.build();
        this.group.add(parts.g);
        this.items.set(p.id, { p, ...parts, yaw: 0 });
      }
    }
    for (const [id, x] of this.items) if (!seen.has(id)) (this.group.remove(x.g), this.items.delete(id));
  }

  /** Every frame: fly each plane on to `nowMs` and place it in the sky round the camera. */
  update(nowMs: number, cam: THREE.Vector3, night: number) {
    if (!this.items.size) return;
    const blink = Math.floor(nowMs / 1200) % 2 === 0, strobe = nowMs % 1500 < 90;
    const glow = 0.6 + night * 1.8;
    for (const x of this.items.values()) {
      const now = advance(x.p, (nowMs - x.p.at) / 1000);
      const ahead = advance(now, 4);
      const a = this.frame.toXZ(now.lat, now.lng), b = this.frame.toXZ(ahead.lat, ahead.lng);
      const s = skyPlace(a.x - cam.x, a.z - cam.z, Math.max(150, now.alt) - cam.y, DOME_M);
      x.g.position.set(cam.x + s.x, cam.y + s.y, cam.z + s.z);
      x.g.scale.setScalar(s.scale);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      // Bank into a turn (how fast the heading changes), pitch with the climb.
      let turn = yaw - x.yaw;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      x.yaw = yaw;
      x.g.rotation.set(-Math.atan2(now.vs, Math.max(60, now.speed)), yaw, THREE.MathUtils.clamp(-turn * 40, -0.45, 0.45), "YXZ");
      x.red.visible = x.green.visible = blink || night > 0.3;
      x.strobe.visible = strobe;
      x.red.scale.setScalar(glow);
      x.green.scale.setScalar(glow);
      x.strobe.scale.setScalar(glow * 1.3);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of [this.body, this.tail, this.redM, this.greenM, this.whiteM]) m.dispose();
    this.items.clear();
  }
}
