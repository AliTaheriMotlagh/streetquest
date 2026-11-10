"use client";
// What trouble on the street looks like (street.ts drives it): smoke pouring from a hurt
// car's bonnet — grey, then black — 3D flames when it burns, and when it blows up a 3D
// fireball and smoke column, the car's pieces thrown about and a scorch mark (blast3d.ts)
// with the flash, sparks and shockwave (arena/vfx.ts); sparks where metal meets metal,
// and in a hard crash glass and bits of bumper flying, bouncing and lying on the road a
// while. All pooled, nothing allocated per frame and no lights (a new light recompiles
// every shader and stalls phones).
import * as THREE from "three";
import type { CarLook } from "@/lib/street/damage";
import { Vfx } from "../arena/vfx";
import { Blasts } from "./blast3d";

type Puff = { s: THREE.Sprite; m: THREE.SpriteMaterial; age: number; life: number; grow: number; vx: number; vy: number; vz: number; alpha: number };

function soft(stops: [number, string][], size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A bit of glass or bumper flying off in a crash. */
type Shard = { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; size: number; age: number; life: number };

export class StreetFx {
  /** Explosions, sparks, tracers and muzzle flashes (shared with the guns' look). */
  readonly vfx: Vfx;
  /** Cars blowing up and burning, in 3D. */
  readonly blasts: Blasts;
  private puffs: Puff[] = [];
  private max: number;
  private tex = {
    grey: soft([[0, "rgba(170,170,170,.75)"], [0.55, "rgba(140,140,140,.35)"], [1, "rgba(120,120,120,0)"]]),
    dust: soft([[0, "rgba(176,152,118,.7)"], [0.55, "rgba(160,138,108,.32)"], [1, "rgba(150,130,100,0)"]]),
    black: soft([[0, "rgba(28,26,24,.85)"], [0.55, "rgba(22,20,18,.45)"], [1, "rgba(20,20,20,0)"]]),
    fire: soft([[0, "rgba(255,250,210,1)"], [0.25, "rgba(255,180,60,.95)"], [0.6, "rgba(230,80,20,.55)"], [1, "rgba(80,20,10,0)"]], 96),
  };
  private acc = 0;
  /** Crash debris: one instanced mesh of small shards (glass and plastic), pooled. */
  private shards: THREE.InstancedMesh;
  private bits: Shard[] = [];
  private nextBit = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(private scene: THREE.Scene, lite: boolean) {
    this.vfx = new Vfx(scene);
    this.blasts = new Blasts(scene, lite);
    // Pieces flying off a blown-up car trail smoke (and fire, at first).
    this.blasts.onTrail = (x, y, z, fire) => {
      this.puff("black", x, y, z, 0.45, 1.3, 1.1, 0.4, 0.55);
      if (fire) this.puff("fire", x, y, z, 0.5, 0.22, 1, 0.2);
    };
    this.max = lite ? 60 : 150;
    const n = lite ? 40 : 120;
    this.shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.2 }), n);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.frustumCulled = false;
    this.shards.count = 0;
    for (let i = 0; i < n; i++) {
      this.bits.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, size: 0, age: 1, life: 0 });
      this.shards.setColorAt(i, this.col.set("#000"));
    }
    scene.add(this.shards);
  }

  /**
   * A hard crash at x, z (`k` 0…1 how hard; `nx, nz` the way the hit pushed): glass and
   * bits of bumper fly out, bounce and lie on the road a while; dust kicks up.
   */
  debris(x: number, y: number, z: number, k: number, nx = 0, nz = 0) {
    if (k < 0.15) return;
    const count = Math.round(4 + k * 14);
    for (let i = 0; i < count; i++) {
      const b = this.bits[this.nextBit];
      this.nextBit = (this.nextBit + 1) % this.bits.length;
      const sp = 1.5 + Math.random() * 5 * k, a = Math.random() * Math.PI * 2;
      Object.assign(b, {
        x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.5, z: z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp + nx * 3 * k, vy: 1.5 + Math.random() * 3.5 * k, vz: Math.sin(a) * sp + nz * 3 * k,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 20, wy: (Math.random() - 0.5) * 20, wz: (Math.random() - 0.5) * 20,
        size: 0.05 + Math.random() * 0.12, age: 0, life: 6 + Math.random() * 6,
      });
      // Mostly glass (pale, a little blue), some black plastic and a tail-light red.
      const r = Math.random();
      this.shards.setColorAt(this.bits.indexOf(b), this.col.set(r < 0.6 ? "#cfe3ea" : r < 0.9 ? "#1c1c1e" : "#b3141c"));
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
    // Dust and grit kicked up off the road.
    this.dust(x, z, k);
  }

  /**
   * Smoke off a car's tyres as it slides or brakes hard: white-grey, low, spreading and
   * fading quickly. `k` 0…1 how much; `x, z` the wheel's place.
   */
  tyres(x: number, z: number, k: number) {
    if (k < 0.05) return;
    this.puff("grey", x + (Math.random() - 0.5) * 0.3, 0.22, z + (Math.random() - 0.5) * 0.3, 0.7 + k * 0.9, 0.9 + k * 1.1, 1.4 + k, 0.35 + k * 0.4, 0.45 + 0.5 * k);
  }

  /** A cloud of dust and grit where something hard hit: tan, big, slow to settle (`k` 0…1 how hard). */
  dust(x: number, z: number, k: number) {
    if (k < 0.1) return;
    for (let i = 0; i < 2 + Math.round(k * 5); i++) this.puff("dust", x + (Math.random() - 0.5) * 2.4, 0.3 + Math.random() * 0.5, z + (Math.random() - 0.5) * 2.4, 1.2 + k * 1.6, 1.8 + k * 2.2, 0.9 + k * 0.6, 0.25 + Math.random() * 0.5, 0.35 + 0.35 * k);
  }

  private tickDebris(dt: number) {
    let live = 0;
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (b.age >= b.life) {
        this.m4.makeScale(0, 0, 0);
        this.shards.setMatrixAt(i, this.m4);
        continue;
      }
      live++;
      b.age += dt;
      if (b.y > 0.01 || b.vy > 0) {
        b.vy -= 9.8 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rx += b.wx * dt;
        b.ry += b.wy * dt;
        b.rz += b.wz * dt;
        if (b.y <= 0.01) {
          // Bounce a little, then lie flat where it lands.
          b.y = 0.01;
          if (Math.abs(b.vy) > 1.2) (b.vy = -b.vy * 0.3), (b.vx *= 0.5), (b.vz *= 0.5);
          else (b.vy = 0), (b.vx = 0), (b.vz = 0), (b.rx = 0), (b.rz = 0);
        }
      }
      const fade = Math.min(1, (b.life - b.age) / 1.5);
      this.q.setFromEuler(this.e.set(b.rx, b.ry, b.rz));
      this.m4.compose(this.v.set(b.x, b.y, b.z), this.q, this.one.setScalar(b.size * fade));
      this.shards.setMatrixAt(i, this.m4);
    }
    this.shards.count = live ? this.bits.length : 0;
    this.shards.instanceMatrix.needsUpdate = true;
  }

  private puff(kind: keyof StreetFx["tex"], x: number, y: number, z: number, size: number, life: number, grow: number, vy: number, alpha = 1) {
    let p = this.puffs.find((q) => q.age >= q.life && q.m.map === this.tex[kind]);
    if (!p) {
      if (this.puffs.length >= this.max) {
        // Recycle the oldest puff of any kind.
        p = this.puffs.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a));
        p.m.map = this.tex[kind];
        p.m.blending = kind === "fire" ? THREE.AdditiveBlending : THREE.NormalBlending;
        p.m.needsUpdate = true;
      } else {
        const m = new THREE.SpriteMaterial({ map: this.tex[kind], transparent: true, depthWrite: false, blending: kind === "fire" ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: kind !== "fire" });
        const s = new THREE.Sprite(m);
        this.scene.add(s);
        p = { s, m, age: 0, life: 1, grow: 0, vx: 0, vy: 0, vz: 0, alpha: 1 };
        this.puffs.push(p);
      }
    }
    Object.assign(p, { age: 0, life, grow, vx: (Math.random() - 0.5) * 0.4 + 0.25, vy, vz: (Math.random() - 0.5) * 0.4, alpha });
    p.s.visible = true;
    p.s.position.set(x, y, z);
    p.s.scale.setScalar(size);
    p.m.rotation = Math.random() * Math.PI * 2;
    p.m.opacity = alpha;
  }

  /**
   * The damaged cars this frame, smoking and burning by how bad they are (`burnT`: seconds
   * of fire left before the blast — the flames grow toward it).
   */
  smoke(cars: { x: number; y: number; z: number; look: CarLook; burnT: number }[], dt: number) {
    this.blasts.burning(cars);
    this.acc += dt;
    const every = 0.07 + cars.length * 0.025;
    if (this.acc < every) return;
    this.acc = 0;
    for (const c of cars) {
      if (c.look === "smoking") this.puff("grey", c.x, c.y, c.z, 0.7, 2.2, 0.8, 1.3, 0.7);
      else if (c.look === "black") this.puff("black", c.x, c.y, c.z, 0.9, 2.6, 0.9, 1.6, 0.85);
      else if (c.look === "burning") {
        // The flames themselves are 3D (blast3d); embers and thick smoke over them, growing as the blast nears.
        const k = 1 + Math.max(0, 6 - c.burnT) * 0.14;
        if (Math.random() < 0.5) this.puff("fire", c.x + (Math.random() - 0.5) * 0.5, c.y + 0.6 * k, c.z + (Math.random() - 0.5) * 0.5, 0.5 * k, 0.4, 1.2, 2.2);
        this.puff("black", c.x, c.y + 1.2 * k, c.z, 1.1 * k, 3, 0.8, 2, 0.85);
      } else if (c.look === "wrecked") {
        // A burnt-out shell smoulders.
        if (Math.random() < 0.5) this.puff("black", c.x, c.y + 0.9, c.z, 1, 3.2, 0.7, 1.2, 0.6);
      }
    }
  }

  /** A car blowing up at x, z (`yaw`, `paint`: which way it faced and its colour — its pieces fly off painted). */
  explosion(x: number, y: number, z: number, yaw?: number, paint?: THREE.ColorRepresentation) {
    // The flash, sparks and shockwave; the fireball, smoke column and pieces in 3D.
    this.vfx.explosion(x, y, z, 1);
    this.blasts.explode(x, z, yaw, paint);
    for (let i = 0; i < 3; i++) this.puff("black", x + (Math.random() - 0.5) * 2, y + 2 + Math.random() * 2, z + (Math.random() - 0.5) * 2, 1.6 + Math.random(), 4.5, 0.9, 2.6, 0.55);
  }

  /** Metal on metal (or on a wall): a few sparks. */
  sparks(x: number, y: number, z: number, k: number) {
    for (let i = 0; i < 1 + Math.round(k * 3); i++) this.vfx.impact(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.6, "wall");
  }

  tick(dt: number) {
    this.vfx.tick(dt);
    this.blasts.tick(dt);
    this.tickDebris(dt);
    for (const p of this.puffs) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      p.s.scale.multiplyScalar(1 + p.grow * dt);
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vy *= 1 - dt * 0.3;
      p.m.opacity = p.alpha * (1 - k) * Math.min(1, p.age * 6);
      if (p.age >= p.life) p.s.visible = false;
    }
  }

  dispose() {
    this.vfx.dispose();
    this.blasts.dispose();
    this.shards.removeFromParent();
    this.shards.geometry.dispose();
    (this.shards.material as THREE.Material).dispose();
    for (const p of this.puffs) (p.s.removeFromParent(), p.m.dispose());
    for (const t of Object.values(this.tex)) t.dispose();
  }
}
