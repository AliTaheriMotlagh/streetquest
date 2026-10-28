"use client";
// Gunfire effects for the 3D city, all pooled (nothing allocated per shot, no lights —
// adding a light recompiles every shader, which stalls phones):
//  - tracers: one instanced mesh, a streak that flies down the bullet's path and fades;
//  - muzzle flashes and impacts (sparks on walls, dust on the ground, red puffs on
//    players): sprites that pop and fade;
//  - the bomb's explosion: a fireball and a shockwave ring.
import * as THREE from "three";

function radial(stops: [number, string][], size = 64) {
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

function star() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.translate(S / 2, S / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, "rgba(255,255,240,1)");
  gr.addColorStop(0.25, "rgba(255,210,120,.9)");
  gr.addColorStop(1, "rgba(255,120,20,0)");
  g.fillStyle = gr;
  for (let i = 0; i < 5; i++) {
    g.rotate((Math.PI * 2) / 5);
    g.beginPath();
    g.moveTo(0, -4);
    g.lineTo(S * 0.48, 0);
    g.lineTo(0, 4);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, S * 0.2, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Puff = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; age: number; grow: number; vy: number };
type Tracer = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; age: number; life: number };

const TRACERS = 40;
const up = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const dir = new THREE.Vector3();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const col = new THREE.Color();

export class Vfx {
  private tracerMesh: THREE.InstancedMesh;
  private tracers: Tracer[] = [];
  private puffs: Puff[] = [];
  private flashTex = star();
  private sparkTex = radial([[0, "rgba(255,250,220,1)"], [0.3, "rgba(255,190,90,.8)"], [1, "rgba(255,120,30,0)"]]);
  private dustTex = radial([[0, "rgba(200,190,170,.85)"], [0.6, "rgba(160,150,130,.35)"], [1, "rgba(140,130,110,0)"]]);
  private bloodTex = radial([[0, "rgba(200,20,30,1)"], [0.5, "rgba(150,10,20,.6)"], [1, "rgba(120,0,10,0)"]]);
  private fireTex = radial([[0, "rgba(255,255,220,1)"], [0.25, "rgba(255,190,60,1)"], [0.6, "rgba(220,70,20,.7)"], [1, "rgba(60,30,20,0)"]], 128);
  private ring: THREE.Mesh;
  private ringAge = Infinity;

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.tracerMesh = new THREE.InstancedMesh(geo, mat, TRACERS);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.setColorAt(0, col.set("#000"));
    scene.add(this.tracerMesh);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    if (this.tracers.length >= TRACERS) this.tracers.shift();
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    this.tracers.push({ ax, ay, az, bx, by, bz, age: 0, life: Math.min(0.16, 0.05 + len / 900) });
  }

  private puff(tex: THREE.Texture, x: number, y: number, z: number, size: number, life: number, grow: number, additive: boolean, vy = 0) {
    let p = this.puffs.find((q) => q.age >= q.life && q.mat.map === tex);
    if (!p) {
      if (this.puffs.length > 90) return;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive });
      const sprite = new THREE.Sprite(mat);
      this.scene.add(sprite);
      p = { sprite, mat, life, age: 0, grow, vy };
      this.puffs.push(p);
    }
    Object.assign(p, { life, age: 0, grow, vy });
    p.sprite.visible = true;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.setScalar(size);
    p.mat.rotation = Math.random() * Math.PI * 2;
    p.mat.opacity = 1;
  }

  flash(x: number, y: number, z: number, big = false) {
    this.puff(this.flashTex, x, y, z, big ? 0.9 : 0.55, 0.05, 1.2, true);
  }

  impact(x: number, y: number, z: number, kind: "wall" | "ground" | "body") {
    if (kind === "body") {
      this.puff(this.bloodTex, x, y, z, 0.35, 0.28, 2.2, false, 0.4);
      return;
    }
    this.puff(this.sparkTex, x, y, z, 0.25, 0.09, 1.5, true);
    this.puff(this.dustTex, x, y + 0.05, z, 0.3, 0.45, 2.4, false, 0.5);
  }

  explosion(x: number, y: number, z: number) {
    this.puff(this.fireTex, x, y + 2, z, 6, 0.7, 2.2, true, 1.5);
    this.puff(this.fireTex, x + 1.5, y + 1, z - 1, 4, 0.6, 2, true, 2);
    this.puff(this.dustTex, x, y + 3, z, 8, 1.8, 1.6, false, 2.5);
    this.ring.position.set(x, y + 0.2, z);
    this.ring.visible = true;
    this.ringAge = 0;
  }

  tick(dt: number) {
    // Tracers: a 6 m streak travelling from muzzle to impact.
    let n = 0;
    for (const t of this.tracers) {
      t.age += dt;
      if (t.age >= t.life) continue;
      const k = t.age / t.life;
      const len = Math.hypot(t.bx - t.ax, t.by - t.ay, t.bz - t.az);
      if (len < 0.5) continue;
      const streak = Math.min(len, 6);
      const head = Math.min(len, k * len * 1.4 + streak * 0.3);
      const tail = Math.max(0, head - streak);
      dir.set(t.bx - t.ax, t.by - t.ay, t.bz - t.az).normalize();
      pos.set(t.ax + dir.x * tail, t.ay + dir.y * tail, t.az + dir.z * tail);
      q.setFromUnitVectors(up, dir);
      scl.set(1, Math.max(0.01, head - tail), 1);
      m4.compose(pos, q, scl);
      this.tracerMesh.setMatrixAt(n, m4);
      this.tracerMesh.setColorAt(n, col.setRGB(1, 0.85, 0.55).multiplyScalar(1 - k * 0.8));
      n++;
    }
    this.tracers = this.tracers.filter((t) => t.age < t.life);
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;

    for (const p of this.puffs) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      p.sprite.scale.multiplyScalar(1 + p.grow * dt);
      p.sprite.position.y += p.vy * dt;
      p.mat.opacity = 1 - k;
      if (p.age >= p.life) p.sprite.visible = false;
    }
    if (this.ringAge < 1) {
      this.ringAge += dt;
      const k = Math.min(1, this.ringAge / 0.8);
      this.ring.scale.setScalar(1 + k * 22);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) this.ring.visible = false;
    }
  }

  dispose() {
    this.tracerMesh.removeFromParent();
    this.tracerMesh.geometry.dispose();
    (this.tracerMesh.material as THREE.Material).dispose();
    for (const p of this.puffs) (p.sprite.removeFromParent(), p.mat.dispose());
    this.ring.removeFromParent();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    for (const t of [this.flashTex, this.sparkTex, this.dustTex, this.bloodTex, this.fireTex]) t.dispose();
  }
}
