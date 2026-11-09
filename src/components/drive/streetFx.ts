"use client";
// What trouble on the street looks like (street.ts drives it): smoke pouring from a hurt
// car's bonnet — grey, then black — flames when it burns, the fireball, smoke and
// shockwave when it blows up (arena/vfx.ts), sparks where metal meets metal. All pooled
// sprites, nothing allocated per frame and no lights (a new light recompiles every shader
// and stalls phones).
import * as THREE from "three";
import type { CarLook } from "@/lib/street/damage";
import { Vfx } from "../arena/vfx";

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

export class StreetFx {
  /** Explosions, sparks, tracers and muzzle flashes (shared with the guns' look). */
  readonly vfx: Vfx;
  private puffs: Puff[] = [];
  private max: number;
  private tex = {
    grey: soft([[0, "rgba(170,170,170,.75)"], [0.55, "rgba(140,140,140,.35)"], [1, "rgba(120,120,120,0)"]]),
    black: soft([[0, "rgba(28,26,24,.85)"], [0.55, "rgba(22,20,18,.45)"], [1, "rgba(20,20,20,0)"]]),
    fire: soft([[0, "rgba(255,250,210,1)"], [0.25, "rgba(255,180,60,.95)"], [0.6, "rgba(230,80,20,.55)"], [1, "rgba(80,20,10,0)"]], 96),
  };
  private acc = 0;

  constructor(private scene: THREE.Scene, lite: boolean) {
    this.vfx = new Vfx(scene);
    this.max = lite ? 60 : 150;
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
    this.acc += dt;
    const every = 0.07 + cars.length * 0.025;
    if (this.acc < every) return;
    this.acc = 0;
    for (const c of cars) {
      if (c.look === "smoking") this.puff("grey", c.x, c.y, c.z, 0.7, 2.2, 0.8, 1.3, 0.7);
      else if (c.look === "black") this.puff("black", c.x, c.y, c.z, 0.9, 2.6, 0.9, 1.6, 0.85);
      else if (c.look === "burning") {
        // The flames grow as the blast nears.
        const k = 1 + Math.max(0, 6 - c.burnT) * 0.14;
        this.puff("fire", c.x + (Math.random() - 0.5) * 0.5, c.y + 0.1, c.z + (Math.random() - 0.5) * 0.5, 1.3 * k, 0.5, 1.5, 1.8);
        this.puff("fire", c.x + (Math.random() - 0.5) * 0.8, c.y - 0.1, c.z + (Math.random() - 0.5) * 0.8, 0.9 * k, 0.35, 1.2, 1.2);
        this.puff("black", c.x, c.y + 0.8, c.z, 1.1 * k, 3, 0.8, 2, 0.85);
      } else if (c.look === "wrecked") {
        // A burnt-out shell smoulders.
        if (Math.random() < 0.5) this.puff("black", c.x, c.y + 0.3, c.z, 1, 3.2, 0.7, 1.2, 0.6);
        if (Math.random() < 0.25) this.puff("fire", c.x + (Math.random() - 0.5) * 1.2, c.y, c.z + (Math.random() - 0.5) * 1.2, 0.5, 0.35, 1.2, 0.8);
      }
    }
  }

  /** A car blowing up at x, z. */
  explosion(x: number, y: number, z: number) {
    this.vfx.explosion(x, y, z, 1);
    // A brighter, bigger fireball than a grenade's, and the smoke rolling up after it.
    for (let i = 0; i < 4; i++) this.puff("fire", x + (Math.random() - 0.5) * 2.5, y + 0.8 + Math.random() * 1.5, z + (Math.random() - 0.5) * 2.5, 3 + Math.random() * 2, 0.55 + Math.random() * 0.3, 1.6, 2.5);
    for (let i = 0; i < 3; i++) this.puff("black", x + (Math.random() - 0.5) * 2, y + 2 + Math.random() * 2, z + (Math.random() - 0.5) * 2, 1.6 + Math.random(), 4.5, 0.9, 2.6, 0.55);
  }

  /** Metal on metal (or on a wall): a few sparks. */
  sparks(x: number, y: number, z: number, k: number) {
    for (let i = 0; i < 1 + Math.round(k * 3); i++) this.vfx.impact(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.6, "wall");
  }

  tick(dt: number) {
    this.vfx.tick(dt);
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
    for (const p of this.puffs) (p.s.removeFromParent(), p.m.dispose());
    for (const t of Object.values(this.tex)) t.dispose();
  }
}
