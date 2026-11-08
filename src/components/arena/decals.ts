"use client";
// Marks that stay where the fighting happened: bullet holes (walls and the ground), blood
// (splats on walls and the pavement, a pool under whoever fell) and scorch marks
// (explosions, burnt-out fire).
//
// Each kind is one instanced mesh of small quads laid on the surface they hit — a ring
// buffer, so when it's full the oldest mark makes room. They're drawn with multiply
// blending (white = no change, so the texture only darkens what's under it): no sorting,
// no lights, no shader compile per mark, three draw calls in all. A mark shrinks away at
// the end of its life; a pool grows for its first seconds.
import * as THREE from "three";
import type { Normal } from "@/lib/arena/geom";

export type DecalKind = "hole" | "blood" | "scorch";

type Spec = { cap: number; life: number; tex: () => THREE.Texture };
type Slot = { x: number; y: number; z: number; q: THREE.Quaternion; size: number; born: number; grow: number; life: number };

const FADE_S = 3;
const LIFT = 0.025;

/** A white canvas (multiply: white leaves the wall as it is) to paint a mark on. */
function canvas(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Seeded so every client paints the same marks (and tests stay stable). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A bullet hole: a dark crater, a lighter chipped ring, a few hairline cracks. */
const holeTex = () =>
  canvas(64, (g, s) => {
    const r = rng(7), c = s / 2;
    g.strokeStyle = "rgba(70,64,58,.7)";
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      let x = c, y = c;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        const aa = a + (r() - 0.5) * 0.8;
        x += Math.cos(aa) * (3 + r() * 5);
        y += Math.sin(aa) * (3 + r() * 5);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const ring = g.createRadialGradient(c, c, 0, c, c, s * 0.42);
    ring.addColorStop(0, "rgba(18,16,14,1)");
    ring.addColorStop(0.22, "rgba(30,27,24,1)");
    ring.addColorStop(0.32, "rgba(120,112,100,.9)");
    ring.addColorStop(0.6, "rgba(190,184,175,.5)");
    ring.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = ring;
    g.beginPath();
    g.arc(c, c, s * 0.42, 0, Math.PI * 2);
    g.fill();
  });

/** A blood splat: a dark core, lobes thrown out to one side, and droplets. */
const bloodTex = () =>
  canvas(128, (g, s) => {
    const r = rng(23), c = s / 2;
    g.fillStyle = "rgb(110,8,12)";
    const blob = (x: number, y: number, rad: number) => {
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    };
    blob(c, c, s * 0.16);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = s * (0.06 + r() * 0.16);
      blob(c + Math.cos(a) * d, c + Math.sin(a) * d, s * (0.04 + r() * 0.07));
    }
    // A spray thrown along +x (the way the bullet went): long streaks and drops.
    g.fillStyle = "rgb(125,10,14)";
    for (let i = 0; i < 26; i++) {
      const a = (r() - 0.5) * 1.1, d = s * (0.2 + r() * 0.26);
      blob(c + Math.cos(a) * d, c + Math.sin(a) * d, s * (0.008 + r() * 0.022));
    }
    const glow = g.createRadialGradient(c, c, s * 0.1, c, c, s * 0.3);
    glow.addColorStop(0, "rgba(70,0,6,.55)");
    glow.addColorStop(1, "rgba(70,0,6,0)");
    g.fillStyle = glow;
    blob(c, c, s * 0.3);
  });

/** Soot from a blast or a fire: a dark, ragged-edged stain. */
const scorchTex = () =>
  canvas(128, (g, s) => {
    const r = rng(41), c = s / 2;
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = r() * s * 0.3, rad = s * (0.06 + r() * 0.12);
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(14,12,10,.35)");
      gr.addColorStop(1, "rgba(14,12,10,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const core = g.createRadialGradient(c, c, 0, c, c, s * 0.3);
    core.addColorStop(0, "rgba(8,6,5,.9)");
    core.addColorStop(1, "rgba(8,6,5,0)");
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
  });

const SPECS: Record<DecalKind, Spec> = {
  hole: { cap: 320, life: 90, tex: holeTex },
  blood: { cap: 140, life: 120, tex: bloodTex },
  scorch: { cap: 32, life: 180, tex: scorchTex },
};

const Z = new THREE.Vector3(0, 0, 1);
const nrm = new THREE.Vector3();
const spin = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

class Layer {
  readonly mesh: THREE.InstancedMesh;
  private slots: (Slot | null)[];
  private next = 0;
  /** Marks still changing size (growing in, or fading out): only these are rewritten each frame. */
  private live = new Set<number>();

  constructor(scene: THREE.Scene, private spec: Spec, order: number) {
    const tex = spec.tex();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, spec.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.name = "decals";
    this.slots = new Array(spec.cap).fill(null);
    scene.add(this.mesh);
  }

  add(x: number, y: number, z: number, n: Normal, size: number, now: number, grow = 0, life = this.spec.life) {
    const i = this.next;
    this.next = (this.next + 1) % this.spec.cap;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    // Face along the normal, spun at random about it so no two marks look alike.
    const q = new THREE.Quaternion().setFromUnitVectors(Z, nrm.set(n.x, n.y, n.z).normalize());
    q.multiply(spin.setFromAxisAngle(Z, Math.random() * Math.PI * 2));
    this.slots[i] = { x: x + n.x * LIFT, y: y + n.y * LIFT, z: z + n.z * LIFT, q, size, born: now, grow, life };
    this.write(i, now);
    if (grow > 0) this.live.add(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number, now: number) {
    const s = this.slots[i];
    if (!s) return;
    const age = now - s.born;
    let k = s.grow > 0 ? Math.min(1, 0.25 + (0.75 * age) / s.grow) : 1;
    if (age > s.life - FADE_S) k *= Math.max(0, (s.life - age) / FADE_S);
    m4.compose(pos.set(s.x, s.y, s.z), s.q, scl.set(s.size * k, s.size * k, 1));
    this.mesh.setMatrixAt(i, m4);
  }

  /** `scan`: also look for marks that have started to fade (a few times a second is plenty). */
  tick(now: number, scan: boolean) {
    let dirty = false;
    if (scan)
      for (let i = 0; i < this.mesh.count; i++) {
        const s = this.slots[i];
        if (s && now - s.born > s.life - FADE_S) this.live.add(i);
      }
    for (const i of this.live) {
      const s = this.slots[i];
      if (!s) {
        this.live.delete(i);
        continue;
      }
      const age = now - s.born;
      this.write(i, now);
      dirty = true;
      if (age >= s.life) {
        this.slots[i] = null;
        this.live.delete(i);
      } else if (age >= s.grow && age < s.life - FADE_S) this.live.delete(i);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.slots.fill(null);
    this.live.clear();
    this.mesh.count = 0;
    this.next = 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}

/** Something to cast a ray into: the city's walls and the ground (physics.ts CollisionWorld). */
export type Surfaces = { raycast(r: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }, maxT: number, n?: Normal): number };

const UP: Normal = { x: 0, y: 1, z: 0 };

export class Decals {
  private layers: Record<DecalKind, Layer>;
  private clock = 0;
  private scanAt = 0;
  private n: Normal = { x: 0, y: 1, z: 0 };

  constructor(scene: THREE.Scene, private surfaces: Surfaces) {
    // Scorch under blood under holes, so a hole in a stain still shows.
    this.layers = { scorch: new Layer(scene, SPECS.scorch, 1), blood: new Layer(scene, SPECS.blood, 2), hole: new Layer(scene, SPECS.hole, 3) };
  }

  /** A bullet hole where a shot met a wall or the ground. */
  hole(x: number, y: number, z: number, n: Normal, big = false) {
    this.layers.hole.add(x, y, z, n, (big ? 0.16 : 0.1) * (0.85 + Math.random() * 0.3), this.clock);
  }

  /**
   * Blood thrown on through a hit: onto the wall behind (within 3 m) along the bullet's
   * path, or the pavement under where it falls. `dir` is the bullet's unit direction.
   */
  spray(x: number, y: number, z: number, dx: number, dy: number, dz: number, amount = 1) {
    const reach = 3;
    const t = this.surfaces.raycast({ ox: x + dx * 0.4, oy: y, oz: z + dz * 0.4, dx, dy, dz }, reach, this.n);
    if (Number.isFinite(t)) {
      const s = (0.45 + Math.random() * 0.35) * amount * (1 - (t / reach) * 0.4);
      this.layers.blood.add(x + dx * (t + 0.4), y + dy * (t + 0.4), z + dz * (t + 0.4), this.n, s, this.clock);
    }
    // Drops on the ground a little way on.
    const d = 0.6 + Math.random() * 0.9;
    this.layers.blood.add(x + dx * d, 0, z + dz * d, UP, (0.35 + Math.random() * 0.3) * amount, this.clock);
  }

  /** A pool spreading under someone who fell. */
  pool(x: number, z: number) {
    this.layers.blood.add(x, 0, z, UP, 1.5 + Math.random() * 0.5, this.clock, 4);
  }

  /** Soot where something blew up (on the ground, and on a wall it's next to). */
  scorch(x: number, y: number, z: number, size: number) {
    this.layers.scorch.add(x, 0, z, UP, size, this.clock, 0.25);
    if (y > 0.5) return;
    // The nearest wall within reach of the blast gets a stain too.
    let best = Infinity, bn: Normal | null = null, ba = 0;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const t = this.surfaces.raycast({ ox: x, oy: 1, oz: z, dx: Math.cos(a), dy: 0, dz: Math.sin(a) }, size * 0.6, this.n);
      if (t < best && this.n.y === 0) (best = t), (bn = { ...this.n }), (ba = a);
    }
    if (bn && Number.isFinite(best)) this.layers.scorch.add(x + Math.cos(ba) * best, 1.2, z + Math.sin(ba) * best, bn, size * 0.8, this.clock, 0.25);
  }

  tick(dt: number) {
    this.clock += dt;
    // Fading is only checked a few times a second; growing marks every frame.
    const scan = this.clock >= this.scanAt;
    if (scan) this.scanAt = this.clock + 0.25;
    for (const l of Object.values(this.layers)) l.tick(this.clock, scan);
  }

  clear() {
    for (const l of Object.values(this.layers)) l.clear();
  }

  dispose() {
    for (const l of Object.values(this.layers)) l.dispose();
  }
}
