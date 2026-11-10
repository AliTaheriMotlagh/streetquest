"use client";
// A car blowing up, in 3D (the plan: lib/street/blast.ts):
//  - the fireball and the smoke column are real 3D balls, not flat sprites: an icosphere
//    whose surface boils (noise moving through it), coloured by heat — white-yellow core,
//    orange, red, then black smoke — soft at the edges and torn apart as it ages (the
//    cooler parts go first); one instanced mesh for every ball of every blast, the smoke
//    drawn before the fire so the fire glows through it, fogged;
//  - the car's pieces thrown off (bonnet, boot lid, doors, bumper, a wheel), tumbling,
//    trailing smoke, bouncing and lying on the road;
//  - flames that are 3D too: crossed panes of moving fire on every burning car and wreck
//    and on the burning fuel round a fresh one (additive, bright enough to bloom);
//  - a scorch mark on the road, and a flash of orange light on the ground at the blast.
// No lights are added (a new light recompiles every shader and stalls phones).
import * as THREE from "three";
import { ballAt, BLAST_CLEAR_S, planBlast, stepPart, type BallPlan, type PartPlan } from "@/lib/street/blast";

const NOISE = /* glsl */ `
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1, 0, 0)), f.x), mix(bHash(i + vec3(0, 1, 0)), bHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0, 0, 1)), bHash(i + vec3(1, 0, 1)), f.x), mix(bHash(i + vec3(0, 1, 1)), bHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float bFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * bNoise(p); p *= 2.03; a *= 0.5; } return s; }`;

/** The fireball / smoke ball: `aBall` = (age 0…1, seed, smoke 0…1, heat). */
function ballMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aBall;
      uniform float uTime;
      varying float vN;
      varying vec3 vNw;
      varying vec3 vView;
      varying vec4 vBall;
      varying vec3 vQ;
      ${NOISE}
      void main() {
        vBall = aBall;
        vec3 dir = normalize(position);
        float t = aBall.x;
        vec3 q = dir * 2.1 + vec3(aBall.y * 13.1, aBall.y * 7.7 - t * 2.2 - uTime * 0.15, aBall.y * 3.3);
        float n = bFbm(q);
        vN = n;
        vQ = q;
        vec3 p = dir * (0.66 + n * 0.75);
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vNw = normalize(mat3(modelMatrix * instanceMatrix) * dir);
        vView = normalize(cameraPosition - wp.xyz);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying float vN;
      varying vec3 vNw;
      varying vec3 vView;
      varying vec4 vBall;
      varying vec3 vQ;
      ${NOISE}
      void main() {
        float t = vBall.x;
        float detail = bNoise(vQ * 4.3 + vec3(0.0, uTime * 0.9, 0.0));
        float n = vN + 0.3 * detail - 0.15;
        // Torn apart as it ages (the thin parts first), soft at the rim.
        float tear = smoothstep(0.35, 1.0, t) * 0.9;
        float facing = clamp(dot(vNw, vView), 0.0, 1.0);
        float a = smoothstep(tear, tear + 0.16, n) * smoothstep(0.02, 0.5, facing);
        if (a < 0.01) discard;
        // Hottest in the middle of what faces you and in the thick of it; the rim runs red.
        float heat = clamp((1.0 - t * 1.9) * vBall.w * (0.15 + 1.25 * n) * (0.55 + 0.45 * facing), 0.0, 1.0) * (1.0 - vBall.z * 0.85);
        vec3 fire = mix(vec3(0.42, 0.05, 0.01), vec3(1.0, 0.33, 0.04), smoothstep(0.1, 0.42, heat));
        fire = mix(fire, vec3(1.0, 0.72, 0.3), smoothstep(0.42, 0.78, heat));
        fire = mix(fire, vec3(1.0, 0.95, 0.8), smoothstep(0.82, 1.0, heat));
        fire *= (1.0 + heat * 2.4) * (0.75 + 0.5 * detail);
        // Smoke: near black, rolling (lit a little from above), the fire glowing through it from below.
        float lit = 0.5 + 0.5 * vNw.y;
        vec3 smoke = mix(vec3(0.035, 0.032, 0.03), vec3(0.2, 0.19, 0.18), lit * (0.3 + n * 0.7)) * (0.6 + 0.8 * detail);
        smoke += vec3(0.6, 0.15, 0.03) * max(0.0, -vNw.y) * max(0.0, 1.0 - t * 1.5) * (1.0 - vBall.z) * 1.6;
        float glow = smoothstep(0.04, 0.3, heat);
        gl_FragColor = vec4(mix(smoke, fire, glow), a * mix(0.88, 1.0, glow));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Moving fire on crossed panes: `aFlame` = (seed, strength). Additive. */
function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec2 aFlame;
      varying vec2 vUv;
      varying vec2 vF;
      void main() {
        vUv = uv;
        vF = aFlame;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec2 vF;
      ${NOISE}
      void main() {
        vec2 uv = vUv;
        float n = bFbm(vec3(uv.x * 3.2 + vF.x * 17.0, uv.y * 2.4 - uTime * 2.4, vF.x * 5.0 + uTime * 0.4));
        float w = (1.0 - uv.y) * 0.42 + 0.06;
        float d = abs(uv.x - 0.5 + (n - 0.5) * 0.4 * uv.y);
        float body = smoothstep(w, w * 0.3, d) * smoothstep(1.0, 0.2, uv.y + (n - 0.5) * 0.6) * smoothstep(0.0, 0.1, uv.y);
        float heat = body * (1.25 - uv.y);
        vec3 col = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.15, 0.55, heat));
        col = mix(col, vec3(1.0, 0.93, 0.68), smoothstep(0.6, 1.0, heat));
        gl_FragColor = vec4(col * body * (1.0 + heat * 2.5) * vF.y, 1.0);
      }`,
  });
}

/** Three panes crossed round the vertical, 1 wide and 1.6 tall, standing on the origin. */
function flameGeometry() {
  const panes = [0, 1, 2].map((i) => new THREE.PlaneGeometry(1, 1.6).translate(0, 0.8, 0).rotateY((i * Math.PI) / 3));
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const p of panes) {
    const base = pos.length / 3;
    pos.push(...(p.getAttribute("position").array as Float32Array));
    uv.push(...(p.getAttribute("uv").array as Float32Array));
    idx.push(...Array.from(p.index!.array, (k) => k + base));
    p.dispose();
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function radial(stops: [number, string][], size = 128) {
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

type Blast = { x: number; z: number; t: number; balls: BallPlan[] };
type Part = PartPlan & { yaw: number; rx: number; ry: number; rz: number; rest: boolean; half: number; flat: THREE.Quaternion; age: number; color: THREE.Color; smokeAcc: number };
type GroundFire = { x: number; z: number; size: number; age: number; life: number; seed: number };
type Scorch = { x: number; z: number; yaw: number; age: number };

const SCORCH_S = 90, PART_S = 40, MAX_SCORCH = 10;
const CHAR = new THREE.Color("#141210");
const Y = new THREE.Vector3(0, 1, 0);

export class Blasts {
  private blasts: Blast[] = [];
  private parts: Part[] = [];
  private fires: GroundFire[] = [];
  private scorches: Scorch[] = [];
  private balls: THREE.InstancedMesh;
  private ballAttr: THREE.InstancedBufferAttribute;
  private panels: THREE.InstancedMesh;
  private wheels: THREE.InstancedMesh;
  private flames: THREE.InstancedMesh;
  private flameAttr: THREE.InstancedBufferAttribute;
  private flameN = 0;
  private scorchMesh: THREE.InstancedMesh;
  private glow: THREE.Mesh;
  private glowAge = 9;
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  /** A thrown piece's smoke trail (StreetFx puffs it). */
  onTrail: ((x: number, y: number, z: number, fire: boolean) => void) | null = null;

  constructor(private scene: THREE.Scene, private lite: boolean) {
    const ballCap = lite ? 16 : 36;
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, lite ? 2 : 3), ballMaterial(), ballCap);
    this.ballAttr = new THREE.InstancedBufferAttribute(new Float32Array(ballCap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.balls.geometry.setAttribute("aBall", this.ballAttr);
    this.setup(this.balls);

    const partCap = lite ? 24 : 60;
    const metal = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.45 });
    this.panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), metal, partCap);
    this.setup(this.panels);
    this.panels.setColorAt(0, CHAR);
    this.panels.castShadow = !lite;
    // A wheel: the tyre and a dull rim, on its axle along x.
    const tyre = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateZ(Math.PI / 2);
    this.wheels = new THREE.InstancedMesh(tyre, new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.9 }), Math.ceil(partCap / 5));
    this.setup(this.wheels);
    this.wheels.castShadow = !lite;

    const flameCap = lite ? 24 : 64;
    this.flames = new THREE.InstancedMesh(flameGeometry(), flameMaterial(), flameCap);
    this.flameAttr = new THREE.InstancedBufferAttribute(new Float32Array(flameCap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.flames.geometry.setAttribute("aFlame", this.flameAttr);
    this.setup(this.flames);
    this.flames.renderOrder = 2;

    const scorchTex = radial([[0, "rgba(8,6,5,.92)"], [0.45, "rgba(14,11,9,.75)"], [0.8, "rgba(20,16,12,.3)"], [1, "rgba(20,16,12,0)"]]);
    this.scorchMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      MAX_SCORCH,
    );
    this.setup(this.scorchMesh);

    const glowTex = radial([[0, "rgba(255,190,110,1)"], [0.35, "rgba(255,120,40,.6)"], [1, "rgba(255,80,20,0)"]]);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glow.visible = false;
    this.glow.renderOrder = 1;
    scene.add(this.glow);
  }

  private setup(m: THREE.InstancedMesh) {
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(m);
  }

  /** A car blowing up at (x, z), turned `yaw`, painted `paint` (its pieces keep the paint, scorched). */
  explode(x: number, z: number, yaw = Math.random() * Math.PI * 2, paint?: THREE.ColorRepresentation) {
    const plan = planBlast(Math.random, this.lite);
    this.blasts.push({ x, z, t: 0, balls: plan.balls });
    // The oldest go first when there's no room.
    while (this.blasts.length > (this.lite ? 2 : 4)) this.blasts.shift();
    const c = Math.cos(yaw), s = Math.sin(yaw), col = new THREE.Color(paint ?? "#777").lerp(CHAR, 0.62);
    for (const p of plan.parts) {
      const thin = Math.min(p.sx, p.sy, p.sz);
      // Turned so its thinnest side is up when it lies down.
      const flat = new THREE.Quaternion();
      if (thin === p.sx) flat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      else if (thin === p.sz) flat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      this.parts.push({
        ...p,
        x: x + p.x * c + p.z * s, z: z - p.x * s + p.z * c,
        vx: p.vx * c + p.vz * s, vz: -p.vx * s + p.vz * c,
        yaw, rx: 0, ry: yaw, rz: 0, rest: false, half: thin / 2, flat, age: 0, smokeAcc: 0,
        color: p.painted ? col.clone() : CHAR.clone(),
      });
    }
    while (this.parts.length > this.panels.instanceMatrix.count) this.parts.shift();
    // The fuel burning on the road round it for a while.
    for (let i = 0; i < (this.lite ? 2 : 4); i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.2;
      this.fires.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, size: 0.8 + Math.random() * 0.9, age: 0, life: 6 + Math.random() * 6, seed: Math.random() });
    }
    this.scorches.push({ x, z, yaw: Math.random() * Math.PI * 2, age: 0 });
    if (this.scorches.length > MAX_SCORCH) this.scorches.shift();
    this.glow.position.set(x, 0.08, z);
    this.glowAge = 0;
  }

  /**
   * Flames on the cars burning this frame (and the wrecks smouldering): where (on the
   * bonnet), and how it's burning — `burnT` the seconds left before it blows, the flames
   * growing toward it.
   */
  burning(cars: { x: number; y: number; z: number; look: string; burnT: number }[]) {
    let n = 0;
    const cap = this.flames.instanceMatrix.count;
    const put = (x: number, y: number, z: number, size: number, seed: number, strength: number) => {
      if (n >= cap) return;
      this.q.setFromAxisAngle(Y, seed * 6.28);
      this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size, size * (0.9 + 0.2 * Math.sin(this.time * 7 + seed * 40)), size));
      this.flames.setMatrixAt(n, this.m);
      this.flameAttr.setXY(n++, seed, strength);
    };
    cars.forEach((c, i) => {
      const seed = (i * 0.618) % 1;
      if (c.look === "burning") {
        const k = 1 + Math.max(0, 6 - c.burnT) * 0.16;
        put(c.x, c.y - 0.35, c.z, 1.1 * k, seed, 1);
        put(c.x + Math.sin(seed * 9) * 0.4, c.y - 0.45, c.z + Math.cos(seed * 9) * 0.4, 0.8 * k, (seed + 0.37) % 1, 0.9);
      } else if (c.look === "wrecked") {
        put(c.x, c.y - 0.2, c.z, 0.9, seed, 0.75);
        if (!this.lite) put(c.x + Math.cos(seed * 7) * 0.9, c.y - 0.3, c.z + Math.sin(seed * 7) * 0.9, 0.6, (seed + 0.5) % 1, 0.6);
      }
    });
    for (const f of this.fires) {
      const k = Math.min(1, f.age * 4) * Math.min(1, (f.life - f.age) / 2);
      if (k > 0.02) put(f.x, 0.02, f.z, f.size * k, f.seed, k);
    }
    this.flameN = n;
  }

  tick(dt: number) {
    this.time += dt;
    (this.balls.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    (this.flames.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;

    // Fire and smoke balls: the smoke first (drawn behind), then the fire.
    let n = 0;
    const cap = this.balls.instanceMatrix.count;
    for (const b of this.blasts) b.t += dt;
    for (const smoky of [1, 0])
      for (const b of this.blasts)
        for (const plan of b.balls) {
          if (plan.smoke !== smoky) continue;
          const at = ballAt(plan, b.t);
          if (!at || n >= cap) continue;
          this.m.compose(this.p.set(b.x + at.x, at.y, b.z + at.z), this.q.identity(), this.s.setScalar(at.r));
          this.balls.setMatrixAt(n, this.m);
          this.ballAttr.setXYZW(n++, at.k, plan.seed, plan.smoke, plan.heat);
        }
    this.blasts = this.blasts.filter((b) => b.t < BLAST_CLEAR_S);
    this.balls.count = n;
    this.balls.instanceMatrix.needsUpdate = true;
    this.ballAttr.needsUpdate = true;

    // Thrown pieces.
    let pn = 0, wn = 0;
    for (const p of this.parts) {
      p.age += dt;
      const flying = !p.rest;
      stepPart(p, dt);
      if (flying && this.onTrail && (p.smokeAcc += dt) > 0.06) {
        p.smokeAcc = 0;
        this.onTrail(p.x, p.y, p.z, p.age < 1.2);
      }
      // Sinks into the road at the very end (gone without a pop).
      const sink = Math.max(0, p.age - (PART_S - 2)) * 0.25;
      if (p.rest) this.q.setFromAxisAngle(Y, p.ry).multiply(p.flat);
      else this.q.setFromEuler(this.e.set(p.rx, p.ry, p.rz));
      this.m.compose(this.p.set(p.x, p.y - sink, p.z), this.q, this.s.set(p.sx, p.sy, p.sz));
      if (p.kind === "wheel") {
        if (wn < this.wheels.instanceMatrix.count) {
          // The wheel's own frame is (width, diameter, diameter): x is its axle.
          this.m.compose(this.p, this.q, this.s.set(p.sx, p.sy, p.sz));
          this.wheels.setMatrixAt(wn++, this.m);
        }
        continue;
      }
      this.panels.setMatrixAt(pn, this.m);
      this.panels.setColorAt(pn++, p.color);
    }
    this.parts = this.parts.filter((p) => p.age < PART_S);
    this.panels.count = pn;
    this.panels.instanceMatrix.needsUpdate = true;
    if (this.panels.instanceColor) this.panels.instanceColor.needsUpdate = true;
    this.wheels.count = wn;
    this.wheels.instanceMatrix.needsUpdate = true;

    // Burning fuel, scorch marks, the flash on the ground.
    for (const f of this.fires) f.age += dt;
    this.fires = this.fires.filter((f) => f.age < f.life);
    let sn = 0;
    for (const s of this.scorches) {
      s.age += dt;
      const k = Math.min(1, (SCORCH_S - s.age) / 10);
      if (k <= 0) continue;
      this.q.setFromAxisAngle(Y, s.yaw);
      this.m.compose(this.p.set(s.x, 0.04, s.z), this.q, this.s.set(7 * k, 1, 7 * k));
      this.scorchMesh.setMatrixAt(sn++, this.m);
    }
    this.scorches = this.scorches.filter((s) => s.age < SCORCH_S);
    this.scorchMesh.count = sn;
    this.scorchMesh.instanceMatrix.needsUpdate = true;
    this.flames.count = this.flameN;
    this.flames.instanceMatrix.needsUpdate = true;
    this.flameAttr.needsUpdate = true;
    if (this.glowAge < 0.7) {
      this.glowAge += dt;
      const k = Math.min(1, this.glowAge / 0.7);
      this.glow.visible = true;
      this.glow.scale.setScalar(10 + 12 * k);
      (this.glow.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * 1.6;
    } else this.glow.visible = false;
  }

  dispose() {
    for (const m of [this.balls, this.panels, this.wheels, this.flames, this.scorchMesh]) {
      this.scene.remove(m);
      m.geometry.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture | null };
      mat.map?.dispose();
      mat.dispose();
      m.dispose();
    }
    this.scene.remove(this.glow);
    this.glow.geometry.dispose();
    const gm = this.glow.material as THREE.MeshBasicMaterial;
    gm.map?.dispose();
    gm.dispose();
  }
}
