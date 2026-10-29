"use client";
// People on the pavements of the 3D city: men in shirts and jackets, women in a manteau
// and headscarf or a black chador, each walking along the street near you at their own
// pace, arms and legs swinging. They keep to the pavement beside the road (turning back
// at a wall or the end of the street, or carrying on round the corner), and they're
// solid: a car stops for them. All of them are drawn instanced — one mesh per body part,
// coloured per person — so a busy street costs a few draw calls.
import * as THREE from "three";
import { insidePacked } from "@/lib/city";
import { box, KERB_H, type Footprint } from "./tileMesh";
import { toon, type Style, type TileMeshes } from "./world3d";

type Road = { line: Float32Array; w: number };
/** 0 a man · 1 a woman in a manteau and scarf · 2 a woman in a chador. */
type Look = 0 | 1 | 2;
type Walker = {
  look: Look;
  top: THREE.Color;
  legs: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  road: Road;
  seg: number;
  along: number;
  dir: 1 | -1;
  /** Which pavement (+1 right of the line's direction, −1 left) and how far out from the middle of the road. */
  side: 1 | -1;
  off: number;
  speed: number;
  phase: number;
  x: number;
  z: number;
  yaw: number;
  /** Seconds until it looks ahead for a wall again. */
  scan: number;
};

const pick = <T,>(r: () => number, l: T[]) => l[Math.floor(r() * l.length)];
const C = (l: string[]) => l.map((c) => new THREE.Color(c));
const SKIN = C(["#e2b896", "#d7a77f", "#c99569", "#b07a52", "#f0c9a8"]);
const SHIRTS = C(["#2f3a4f", "#5b6470", "#e8e6df", "#3b5f8a", "#7a5a43", "#1f2124", "#6b2f2f", "#4f6b4a", "#a7b0ba"]);
const TROUSERS = C(["#1f2433", "#2b2f36", "#3c3a35", "#28304a", "#4a4a4a", "#5a4a3a"]);
const HAIR = C(["#1a1410", "#2a2018", "#3a2c20", "#55504a"]);
const MANTEAU = C(["#1d1d22", "#2a3448", "#6e5a48", "#3f4a3a", "#7a2e3a", "#a59b8a", "#24262b", "#4b3a56"]);
const SCARF = C(["#1b1b1f", "#7a2e3a", "#c9b79c", "#2f5d73", "#8a7f74", "#a33b3b", "#3e5a3a", "#d8cfc4", "#5a3f6b"]);
const CHADOR = new THREE.Color("#121214");

const SPAWN_MIN = 30, SPAWN_MAX = 150, DROP = 190;
/** Footprints are looked up in squares this big. */
const GRID = 24;

/** Each body part once, standing at the origin facing −z; legs and arms hang from their pivot (y = 0). */
function parts() {
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  const shirt = new THREE.BoxGeometry(0.4, 0.56, 0.24);
  at(shirt, 0, 1.13, 0);
  const manteau = new THREE.CylinderGeometry(0.19, 0.27, 0.8, 6);
  at(manteau, 0, 1.02, 0);
  const chador = new THREE.CylinderGeometry(0.13, 0.36, 1.52, 8);
  at(chador, 0, 0.86, 0);
  const head = new THREE.SphereGeometry(0.11, 8, 6);
  at(head, 0, 1.54, 0);
  const hair = new THREE.SphereGeometry(0.117, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  at(hair, 0, 1.56, 0.01);
  // A headscarf (or a chador's hood): round the head, open over the face (−z).
  const scarf = new THREE.SphereGeometry(0.128, 8, 6, Math.PI * 1.65, Math.PI * 1.7);
  at(scarf, 0, 1.54, 0.015);
  const leg = new THREE.BoxGeometry(0.13, 0.86, 0.14);
  at(leg, 0, -0.43, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.6, 0.11);
  at(arm, 0, -0.3, 0);
  return { shirt, manteau, chador, head, hair, scarf, leg, arm };
}
type PartKey = keyof ReturnType<typeof parts>;

export class Crowd {
  private walkers: Walker[] = [];
  private roads: Road[] = [];
  private ends = new Map<string, Road[]>();
  /** Buildings by GRID square, for "is that a wall ahead?". */
  private walls = new Map<string, Footprint[]>();
  private known = new WeakSet<TileMeshes>();
  private meshCount = -1;
  private rand = Math.random;
  private geo = parts();
  private mat: THREE.Material;
  private meshes = {} as Record<PartKey, THREE.InstancedMesh>;
  private count = {} as Record<PartKey, number>;
  private m = new THREE.Matrix4();
  private j = new THREE.Matrix4();
  private s = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private Y = new THREE.Vector3(0, 1, 0);
  /** Up on the raised pavement (drawn in the real city's full detail). */
  private base: number;
  enabled = true;

  constructor(private scene: THREE.Scene, style: Style, private lite: boolean) {
    this.base = style === "real" && !lite ? KERB_H : 0;
    this.mat = style === "toon" ? toon({ color: "#ffffff" }) : new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88 });
    const cap = lite ? 14 : 34;
    for (const k of Object.keys(this.geo) as PartKey[]) {
      const m = new THREE.InstancedMesh(this.geo[k], this.mat, k === "leg" || k === "arm" ? cap * 2 : cap);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, CHADOR);
      scene.add(m);
      this.meshes[k] = m;
    }
  }

  /** Streets to walk beside, and the buildings beside them: re-read when tiles come and go. */
  sync(meshes: TileMeshes[]) {
    if (meshes.length === this.meshCount && meshes.every((m) => this.known.has(m))) return;
    this.meshCount = meshes.length;
    this.known = new WeakSet(meshes);
    this.roads = [];
    this.ends.clear();
    this.walls.clear();
    for (const m of meshes) {
      m.roads.forEach((line, i) => {
        const k = m.roadKinds[i];
        if ((k !== "major" && k !== "minor") || !m.roadDrawn[i] || line.length < 4) return;
        const r = { line, w: m.roadWidths[i] };
        this.roads.push(r);
        for (const end of [0, 1]) {
          const key = this.cell(line[end ? line.length - 2 : 0], line[end ? line.length - 1 : 1], 8);
          const l = this.ends.get(key);
          if (l) l.push(r);
          else this.ends.set(key, [r]);
        }
      });
      for (const f of m.footprints)
        for (let gx = Math.floor(f.minX / GRID); gx <= Math.floor(f.maxX / GRID); gx++)
          for (let gz = Math.floor(f.minZ / GRID); gz <= Math.floor(f.maxZ / GRID); gz++) {
            const key = `${gx}_${gz}`;
            const l = this.walls.get(key);
            if (l) l.push(f);
            else this.walls.set(key, [f]);
          }
    }
    const alive = new Set(this.roads.map((r) => r.line));
    this.walkers = this.walkers.filter((w) => alive.has(w.road.line));
  }

  private cell(x: number, z: number, size: number) {
    return `${Math.floor(x / size)}_${Math.floor(z / size)}`;
  }

  /** Inside a building (or right against its wall)? */
  private walled(x: number, z: number) {
    for (const f of this.walls.get(this.cell(x, z, GRID)) ?? []) if (x >= f.minX - 0.3 && x <= f.maxX + 0.3 && z >= f.minZ - 0.3 && z <= f.maxZ + 0.3 && insidePacked(f.pts, x, z)) return true;
    return false;
  }

  /** Where a walker stands: along its road, out on its pavement. */
  private place(w: Walker) {
    const L = w.road.line, i = w.seg * 2;
    const ax = L[i], az = L[i + 1], bx = L[i + 2], bz = L[i + 3];
    const len = Math.hypot(bx - ax, bz - az) || 0.01, ux = (bx - ax) / len, uz = (bz - az) / len;
    const k = Math.max(0, Math.min(1, w.along / len));
    return { x: ax + (bx - ax) * k - uz * w.side * w.off, z: az + (bz - az) * k + ux * w.side * w.off, len, ux: ux * w.dir, uz: uz * w.dir };
  }

  private spawn(px: number, pz: number) {
    for (let tries = 0; tries < 10; tries++) {
      const road = this.roads[Math.floor(this.rand() * this.roads.length)];
      if (!road) return;
      const seg = Math.floor(this.rand() * (road.line.length / 2 - 1));
      const r = this.rand, roll = r();
      const look: Look = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
      const w: Walker = {
        look,
        top: look === 0 ? pick(r, SHIRTS) : look === 1 ? pick(r, MANTEAU) : CHADOR,
        legs: look === 0 ? pick(r, TROUSERS) : pick(r, TROUSERS.slice(0, 3)),
        skin: pick(r, SKIN),
        hair: look === 0 ? pick(r, HAIR) : look === 1 ? pick(r, SCARF) : CHADOR,
        road,
        seg,
        along: 0,
        dir: r() < 0.5 ? 1 : -1,
        side: r() < 0.5 ? 1 : -1,
        off: road.w / 2 + 1.1 + r() * 0.8,
        speed: 1.05 + r() * 0.45,
        phase: r() * Math.PI * 2,
        x: 0,
        z: 0,
        yaw: 0,
        scan: 0,
      };
      const at = this.place(w);
      w.along = this.rand() * at.len;
      const p = this.place(w);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX || this.walled(p.x, p.z)) continue;
      w.x = p.x;
      w.z = p.z;
      w.yaw = Math.atan2(-p.ux, -p.uz);
      this.walkers.push(w);
      return;
    }
  }

  /** Off the end of its street: round the corner onto the next one, or back the way it came. */
  private corner(w: Walker) {
    const L = w.road.line, end = w.dir > 0 ? 1 : 0;
    const x = L[end ? L.length - 2 : 0], z = L[end ? L.length - 1 : 1];
    const opts: Road[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const r of this.ends.get(`${Math.floor(x / 8) + i}_${Math.floor(z / 8) + j}`) ?? []) if (r !== w.road) opts.push(r);
    const next = opts.length && this.rand() < 0.75 ? opts[Math.floor(this.rand() * opts.length)] : null;
    if (!next) return this.turn(w);
    const n = next.line, startsHere = Math.hypot(n[0] - x, n[1] - z) < Math.hypot(n[n.length - 2] - x, n[n.length - 1] - z);
    // Same side of the street as it walks (the pavement on its right stays on its right).
    const rel = w.side * w.dir;
    w.road = next;
    w.dir = startsHere ? 1 : -1;
    w.side = (rel * w.dir) as 1 | -1;
    w.seg = startsHere ? 0 : n.length / 2 - 2;
    w.off = next.w / 2 + 1.1 + this.rand() * 0.8;
    const at = this.place({ ...w, along: 0 });
    w.along = startsHere ? 0 : at.len;
  }

  private turn(w: Walker) {
    w.dir = w.dir > 0 ? -1 : 1;
  }

  /** Walk everyone and draw them; returns their footprints (a car stops for them). */
  tick(dt: number, px: number, pz: number): Footprint[] {
    for (const k of Object.keys(this.meshes) as PartKey[]) this.count[k] = 0;
    const out: Footprint[] = [];
    if (!this.enabled) this.walkers = [];
    else {
      this.walkers = this.walkers.filter((w) => Math.hypot(w.x - px, w.z - pz) <= DROP);
      if (this.walkers.length < (this.lite ? 10 : 26) && this.roads.length) this.spawn(px, pz);
    }
    for (const w of this.walkers) {
      // Look ahead now and then: a wall (or a building sitting right on the kerb) turns it back.
      w.scan -= dt;
      if (w.scan <= 0) {
        w.scan = 0.4 + this.rand() * 0.3;
        const f = this.place(w);
        if (this.walled(f.x + f.ux * 0.9, f.z + f.uz * 0.9)) this.turn(w);
      }
      w.along += w.speed * dt * w.dir;
      let at = this.place(w);
      if (w.along > at.len) {
        if (w.seg + 1 < w.road.line.length / 2 - 1) (w.along -= at.len), w.seg++;
        else this.corner(w);
        at = this.place(w);
      } else if (w.along < 0) {
        if (w.seg > 0) {
          w.seg--;
          at = this.place({ ...w, along: 0 });
          w.along += at.len;
        } else this.corner(w);
        at = this.place(w);
      }
      w.x = at.x;
      w.z = at.z;
      const yaw = Math.atan2(-at.ux, -at.uz);
      w.yaw += Math.atan2(Math.sin(yaw - w.yaw), Math.cos(yaw - w.yaw)) * Math.min(1, dt * 6);
      w.phase += w.speed * dt * 4.6;
      this.draw(w);
      out.push(box(w.x, w.z, 0.28, 0.22, w.yaw, 1.7));
    }
    for (const k of Object.keys(this.meshes) as PartKey[]) {
      const m = this.meshes[k];
      m.count = this.count[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    return out;
  }

  private put(k: PartKey, m: THREE.Matrix4, c: THREE.Color) {
    const mesh = this.meshes[k], i = this.count[k];
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c);
    this.count[k] = i + 1;
  }

  private draw(w: Walker) {
    const swing = Math.sin(w.phase) * (w.look === 2 ? 0.25 : 0.42);
    const bob = Math.abs(Math.cos(w.phase)) * 0.025;
    this.m.compose(this.p.set(w.x, this.base + bob, w.z), this.q.setFromAxisAngle(this.Y, w.yaw), this.one);
    const limb = (k: "leg" | "arm", x: number, y: number, a: number, c: THREE.Color) => {
      this.j.makeRotationX(a).setPosition(x, y, 0);
      this.put(k, this.s.multiplyMatrices(this.m, this.j), c);
    };
    this.put(w.look === 0 ? "shirt" : w.look === 1 ? "manteau" : "chador", this.m, w.top);
    this.put("head", this.m, w.skin);
    this.put(w.look === 0 ? "hair" : "scarf", this.m, w.hair);
    for (const s of [-1, 1]) {
      limb("leg", s * 0.1, 0.88, s * swing, w.legs);
      // Arms swing against the legs (a chador keeps them inside).
      if (w.look !== 2) limb("arm", s * 0.25, 1.39, -s * swing * 0.75, w.top);
    }
  }

  dispose() {
    this.walkers = [];
    for (const m of Object.values(this.meshes)) {
      this.scene.remove(m);
      m.dispose();
    }
    for (const g of Object.values(this.geo)) g.dispose();
    this.mat.dispose();
  }
}
