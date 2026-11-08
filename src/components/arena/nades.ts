"use client";
// Grenades and C4 in the 3D city (lib/arena/throwables): the thing in flight, then what it
// leaves — a smoke cloud, a pool of fire, a scorch mark — and the dotted arc you see while
// you line a throw up.
//
// Every client flies each throw itself through its own city (the same simulation the
// referee runs), so it can be drawn smoothly without a stream of positions; where it goes
// off comes from the referee ("boom"). My own throws are drawn the moment they leave my
// hand and pick up the referee's id when it echoes them back.
import * as THREE from "three";
import type { Normal, Ray } from "@/lib/arena/geom";
import { along, fly, smokeRadius, THROWABLES, type Flight, type ThrowKey, type Vec3 } from "@/lib/arena/throwables";
import type { Decals } from "./decals";
import type { Vfx } from "./vfx";

type Walls = { raycast(r: Ray, maxT: number, n?: Normal): number };

type Flying = {
  id: number;
  k: ThrowKey;
  by: number;
  mine: boolean;
  flight: Flight;
  /** Seconds since the throw, on my clock. */
  age: number;
  mesh: THREE.Object3D;
  /** Bounces already heard. */
  bounced: number;
};

type Cloud = { x: number; y: number; z: number; age: number; sprites: THREE.Sprite[]; offs: Vec3[]; mats: THREE.SpriteMaterial[] };
type Fire = { x: number; y: number; z: number; age: number; life: number; r: number; sprites: THREE.Sprite[]; offs: Vec3[]; mats: THREE.SpriteMaterial[]; soot: THREE.Sprite[]; sootMat: THREE.SpriteMaterial };

const PUFFS = 30;
const FLAMES = 26;
const SOOT = 7;

/** A cotton-wool puff: lumps of soft white overlapping, so a cloud of them looks billowy, not like stacked discs. */
function puffTex() {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  let seed = 9;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = r() * S * 0.22, rad = S * (0.14 + r() * 0.16);
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const shade = 225 + Math.floor(r() * 30);
    gr.addColorStop(0, `rgba(${shade},${shade},${shade},.55)`);
    gr.addColorStop(0.6, `rgba(${shade},${shade},${shade},.25)`);
    gr.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softTex(stops: [number, string][], size = 64, grain = 0) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  // Grain, so a cloud of them doesn't look like stacked discs.
  if (grain) {
    const img = g.getImageData(0, 0, size, size);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] *= 1 - grain + Math.random() * grain;
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Nades {
  private flying: Flying[] = [];
  private clouds: Cloud[] = [];
  private fires: Fire[] = [];
  private c4s = new Map<number, { mesh: THREE.Object3D; light: THREE.Sprite; blink: number }>();
  private geos: Record<ThrowKey, THREE.BufferGeometry>;
  private mats: Record<ThrowKey, THREE.Material>;
  private smokeTex = puffTex();
  private flameTex = softTex([[0, "rgba(255,250,210,1)"], [0.25, "rgba(255,190,70,.95)"], [0.6, "rgba(230,80,20,.6)"], [1, "rgba(90,20,5,0)"]], 64);
  private dotTex = softTex([[0, "rgba(255,40,40,1)"], [0.4, "rgba(255,30,30,.6)"], [1, "rgba(255,0,0,0)"]], 32);
  private arc: THREE.Points;
  private arcRing: THREE.Mesh;

  constructor(private scene: THREE.Scene, private walls: Walls, private vfx: Vfx, private decals: Decals) {
    this.geos = {
      frag: new THREE.IcosahedronGeometry(0.065, 1),
      flash: new THREE.CylinderGeometry(0.035, 0.035, 0.13, 10),
      smoke: new THREE.CylinderGeometry(0.04, 0.04, 0.15, 10),
      molotov: new THREE.CylinderGeometry(0.03, 0.045, 0.26, 10),
      c4: new THREE.BoxGeometry(0.2, 0.07, 0.13),
    };
    const std = (color: string, rough = 0.6, metal = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.mats = { frag: std("#3d4a2e"), flash: std("#8c9196", 0.4, 0.6), smoke: std("#58614d"), molotov: std("#5a3b17", 0.2, 0.1), c4: std("#c9b48a", 0.8, 0) };
    // The arc: dots every few steps along the flight, and a ring where it lands.
    this.arc = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: "#ffffff", size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arcRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.arcRing.rotation.x = -Math.PI / 2;
    this.arcRing.visible = false;
    scene.add(this.arc, this.arcRing);
  }

  private wallsFn = (r: Ray, maxT: number, n: Normal) => this.walls.raycast(r, maxT, n);

  /** Fly a throw through this city (for the arc, and for drawing it). */
  fly(k: ThrowKey, o: Vec3, v: Vec3) {
    return fly(THROWABLES[k], o, v, this.wallsFn);
  }

  private mesh(k: ThrowKey) {
    const m = new THREE.Mesh(this.geos[k], this.mats[k]);
    m.castShadow = false;
    return m;
  }

  /** My own throw, drawn straight away (id 0 until the referee echoes it). */
  mine(k: ThrowKey, flight: Flight, by: number) {
    this.add({ id: 0, k, by, mine: true, flight, age: 0, mesh: this.mesh(k), bounced: 0 });
  }

  /** Someone's throw (the referee's echo; mine just gets its id). `late`: seconds since it was thrown. */
  thrown(id: number, k: ThrowKey, by: number, o: Vec3, v: Vec3, late: number, myself: boolean) {
    if (myself) {
      const f = this.flying.find((x) => x.mine && x.id === 0 && x.k === k);
      if (f) {
        f.id = id;
        return;
      }
    }
    this.add({ id, k, by, mine: myself, flight: this.fly(k, o, v), age: Math.max(0, Math.min(1, late)), mesh: this.mesh(k), bounced: 0 });
  }

  private add(f: Flying) {
    this.scene.add(f.mesh);
    this.flying.push(f);
    this.place(f);
  }

  private place(f: Flying) {
    const [x, y, z] = along(f.flight, f.age);
    f.mesh.position.set(x, y, z);
    if (f.age < f.flight.restS) f.mesh.rotation.set(f.age * 9, f.age * 5, 0);
    else if (f.k === "c4" && f.flight.stuck) f.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.flight.stuck.x, f.flight.stuck.y, f.flight.stuck.z));
    else if (f.k !== "frag") f.mesh.rotation.set(Math.PI / 2, f.mesh.rotation.y, 0);
  }

  /** Is my C4 out there (so the throw button sets it off instead)? */
  myC4() {
    return this.flying.some((f) => f.mine && f.k === "c4");
  }

  /**
   * It went off at (x, y, z). Returns what it was (so the caller can shake the camera,
   * blind me, play the sound), or null if it's an id I never saw thrown (drawn anyway).
   */
  boom(id: number, k: ThrowKey, by: number, myself: boolean, x: number, y: number, z: number) {
    const i = this.flying.findIndex((f) => f.id === id || (myself && f.mine && f.id === 0 && f.k === k));
    if (i >= 0) {
      const f = this.flying[i];
      f.mesh.removeFromParent();
      this.flying.splice(i, 1);
      this.c4s.get(f.id)?.light.removeFromParent();
      this.c4s.delete(f.id);
    }
    void by;
    switch (k) {
      case "frag":
        this.vfx.explosion(x, y, z, 0.45);
        this.decals.scorch(x, y, z, 3.2);
        break;
      case "c4":
        this.vfx.explosion(x, y, z, 0.75);
        this.decals.scorch(x, y, z, 4.5);
        break;
      case "flash":
        this.vfx.flashBurst(x, y, z);
        break;
      case "smoke":
        this.cloud(x, y, z);
        break;
      case "molotov":
        this.vfx.explosion(x, y, z, 0.18);
        this.fire(x, y, z);
        this.decals.scorch(x, y, z, THROWABLES.molotov.radius * 2);
        break;
    }
  }

  private cloud(x: number, y: number, z: number) {
    const sprites: THREE.Sprite[] = [], offs: Vec3[] = [], mats: THREE.SpriteMaterial[] = [];
    for (let i = 0; i < PUFFS; i++) {
      // Each puff its own shade and spin (a few materials: one per puff is still cheap at 30).
      const shade = 0.78 + Math.random() * 0.14;
      const mat = new THREE.SpriteMaterial({ map: this.smokeTex, color: new THREE.Color(shade, shade, shade * 1.02), transparent: true, depthWrite: false, rotation: Math.random() * Math.PI * 2 });
      const s = new THREE.Sprite(mat);
      // Spread through a squat dome: more of them low down, where people stand.
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()), h = Math.random() ** 1.4;
      offs.push([Math.cos(a) * r, h, Math.sin(a) * r]);
      sprites.push(s);
      mats.push(mat);
      this.scene.add(s);
    }
    this.clouds.push({ x, y, z, age: 0, sprites, offs, mats });
  }

  private fire(x: number, y: number, z: number) {
    const def = THROWABLES.molotov;
    const sprites: THREE.Sprite[] = [], offs: Vec3[] = [], mats: THREE.SpriteMaterial[] = [];
    for (let i = 0; i < FLAMES; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const s = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * def.radius * 0.9;
      offs.push([Math.cos(a) * r, Math.random(), Math.sin(a) * r]);
      sprites.push(s);
      mats.push(mat);
      this.scene.add(s);
    }
    // A column of dark smoke over it.
    const sootMat = new THREE.SpriteMaterial({ map: this.smokeTex, color: "#2b2622", transparent: true, depthWrite: false, opacity: 0.6 });
    const soot: THREE.Sprite[] = [];
    for (let i = 0; i < SOOT; i++) {
      const s = new THREE.Sprite(sootMat);
      soot.push(s);
      this.scene.add(s);
    }
    this.fires.push({ x, y, z, age: 0, life: def.lastsS, r: def.radius, sprites, offs, mats, soot, sootMat });
  }

  /** Smoke clouds now, for aim assist (no locking on through smoke). */
  *smokes() {
    for (const c of this.clouds) {
      const r = smokeRadius(c.age);
      if (r > 0) yield { x: c.x, y: c.y + r * 0.45, z: c.z, r };
    }
  }

  /** Fires burning now (to warn me I'm standing in one). */
  inFire(x: number, z: number) {
    return this.fires.some((f) => f.age < f.life && Math.hypot(f.x - x, f.z - z) <= f.r);
  }

  /** The dotted arc of a throw I'm lining up (null hides it). */
  preview(f: Flight | null) {
    if (!f) {
      this.arc.visible = this.arcRing.visible = false;
      return;
    }
    const pts: number[] = [];
    for (let i = 0; i < f.path.length; i += 3) pts.push(...f.path[i]);
    const g = this.arc.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.computeBoundingSphere();
    this.arc.visible = true;
    const [x, y, z] = f.rest;
    this.arcRing.position.set(x, y + 0.05, z);
    this.arcRing.visible = true;
  }

  /** `onBounce(x, z)`: a throw touched something (for its clink). */
  tick(dt: number, onBounce: (x: number, z: number) => void) {
    for (const f of this.flying) {
      f.age += dt;
      this.place(f);
      if (f.bounced === 0 && f.age >= f.flight.landS) {
        f.bounced = 1;
        onBounce(f.mesh.position.x, f.mesh.position.z);
      }
      // C4 blinks once it's set.
      if (f.k === "c4" && f.age >= f.flight.restS) {
        let c = this.c4s.get(f.id);
        if (!c) {
          const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
          light.scale.setScalar(0.25);
          this.scene.add(light);
          c = { mesh: f.mesh, light, blink: 0 };
          this.c4s.set(f.id, c);
        }
        c.blink += dt;
        c.light.position.copy(f.mesh.position).y += 0.06;
        c.light.visible = c.blink % 0.8 < 0.12;
      }
    }
    // Throws whose boom never came (lost message, left the match): gone after a while.
    this.flying = this.flying.filter((f) => {
      const stale = f.k === "c4" ? f.age > 600 : f.age > f.flight.goS + 3;
      if (stale) f.mesh.removeFromParent();
      return !stale;
    });

    const smokeLife = THROWABLES.smoke.lastsS;
    for (const c of this.clouds) {
      c.age += dt;
      const r = smokeRadius(c.age);
      const fade = c.age > smokeLife - 2 ? Math.max(0, (smokeLife - c.age) / 2) : 1;
      for (let i = 0; i < c.sprites.length; i++) {
        const o = c.offs[i], s = c.sprites[i];
        // Billowing: each puff drifts, turns and breathes a little.
        const w = Math.sin(c.age * 0.6 + i) * 0.08;
        s.position.set(c.x + o[0] * r * (0.8 + w), c.y + 0.4 + o[1] * r * 1.1, c.z + o[2] * r * (0.8 - w));
        s.scale.setScalar(Math.max(0.01, r * (0.75 + 0.2 * Math.sin(i * 1.7 + c.age * 0.4))));
        c.mats[i].rotation += dt * (i % 2 ? 0.05 : -0.05);
        c.mats[i].opacity = fade;
      }
    }
    this.clouds = this.clouds.filter((c) => {
      const done = c.age > smokeLife;
      if (done) for (let i = 0; i < c.sprites.length; i++) (c.sprites[i].removeFromParent(), c.mats[i].dispose());
      return !done;
    });

    for (const f of this.fires) {
      f.age += dt;
      const k = f.age < 0.4 ? f.age / 0.4 : f.age > f.life - 1 ? Math.max(0, f.life - f.age) : 1;
      for (let i = 0; i < f.sprites.length; i++) {
        const o = f.offs[i], s = f.sprites[i];
        // Flicker: each flame rises, shrinks and starts again on its own beat.
        const ph = (f.age * (1.6 + (i % 4) * 0.3) + o[1]) % 1;
        const h = (1 + (i % 3) * 0.35) * (1 - ph * 0.45) * k;
        s.position.set(f.x + o[0], f.y + 0.35 + ph * 1.1 * h, f.z + o[2]);
        s.scale.set(h * 1.1, h * 1.7, 1);
        f.mats[i].opacity = (1 - ph * ph) * k;
      }
      // Soot rising and spreading, each puff on its own loop.
      for (let i = 0; i < f.soot.length; i++) {
        const ph = (f.age * 0.35 + i / f.soot.length) % 1;
        f.soot[i].position.set(f.x + Math.sin(i * 2.3) * 0.6 + ph * 0.8, f.y + 1.2 + ph * 6, f.z + Math.cos(i * 1.9) * 0.6);
        f.soot[i].scale.setScalar(1.2 + ph * 3.5);
      }
      f.sootMat.opacity = 0.55 * k;
    }
    this.fires = this.fires.filter((f) => {
      const done = f.age > f.life;
      if (done) {
        for (let i = 0; i < f.sprites.length; i++) (f.sprites[i].removeFromParent(), f.mats[i].dispose());
        for (const s of f.soot) s.removeFromParent();
        f.sootMat.dispose();
      }
      return !done;
    });
  }

  /** A new match or leaving one: nothing carries over. */
  clear() {
    for (const f of this.flying) f.mesh.removeFromParent();
    for (const c of this.c4s.values()) c.light.removeFromParent();
    for (const c of this.clouds) (c.sprites.forEach((s) => s.removeFromParent()), c.mats.forEach((m) => m.dispose()));
    for (const f of this.fires) (f.sprites.forEach((s) => s.removeFromParent()), f.mats.forEach((m) => m.dispose()), f.soot.forEach((s) => s.removeFromParent()), f.sootMat.dispose());
    this.flying = [];
    this.c4s.clear();
    this.clouds = [];
    this.fires = [];
  }

  dispose() {
    this.clear();
    this.preview(null);
    this.arc.removeFromParent();
    this.arcRing.removeFromParent();
    this.arc.geometry.dispose();
    (this.arc.material as THREE.Material).dispose();
    this.arcRing.geometry.dispose();
    (this.arcRing.material as THREE.Material).dispose();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    for (const t of [this.smokeTex, this.flameTex, this.dotTex]) t.dispose();
  }
}
