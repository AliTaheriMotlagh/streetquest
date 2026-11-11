"use client";
// Real light at night: a fixed pool of lights handed, a few times a second, to the most
// useful candidates around the player (lib/lightBudget.ts) — street lamps that pour a cone
// of light down onto the pavement and the road under them, headlights that throw a beam
// down the road ahead of a car, brake lamps that stain the tarmac red behind it. A light
// never jumps: one that is taken away fades out, a new one fades in, so driving past a lamp
// is a gradient, never a pop. By day the pool is empty and not in the scene at all (every
// light costs every pixel it can reach). The pool is built whole at dusk — so many spot
// lights for lamps and headlights, so many points for brake glow (poolKinds) — and its
// lights stay in the scene (idle ones at intensity 0): three.js compiles its shaders for
// the number of lights of each type, so adding or hiding one mid-drive would stall the
// frame while every material is rebuilt.
import * as THREE from "three";
import { lightBudget, pickLights, poolKinds, type Candidate, type LightKind } from "@/lib/lightBudget";

/** Spot lights: `angle` the cone's half-angle, `penumbra` how soft its edge. */
const LOOK: Record<LightKind, { color: string; intensity: number; distance: number; angle?: number; penumbra?: number }> = {
  // A lamp lights a wide pool under it (and the walls up to its own height), not the sky.
  lamp: { color: "#ffc27a", intensity: 60, distance: 26, angle: 0.95, penumbra: 0.75 },
  // Dipped headlights: a beam down the lane, bright in the middle, soft at its edges.
  head: { color: "#fff3d6", intensity: 220, distance: 42, angle: 0.5, penumbra: 0.55 },
  brake: { color: "#ff2a1a", intensity: 16, distance: 7.5 },
};
/** Where the light sits relative to its candidate (m): up in the lamp head, at a car's nose, behind its tail; and where a spot points (`aim`: metres ahead, `drop`: down to). */
const AT: Record<LightKind, { y: number; along: number; aim?: number; drop?: number }> = {
  lamp: { y: 6.3, along: 0, aim: 0.01, drop: 0 },
  head: { y: 0.75, along: 2.2, aim: 18, drop: 0 },
  brake: { y: 0.8, along: -2.6 },
};
const REPICK_S = 0.25;
const FADE_PER_S = 4;

type Slot = { light: THREE.PointLight | THREE.SpotLight; cone: THREE.Mesh | null; id: string | null; kind: LightKind; k: number; want: number };

// The lamp's light made visible: a soft cone of lit air from the head down to the road,
// brightest in the middle and fading at its edge and towards the ground.
const CONE_H = 6.3;
const CONE_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV; varying float vH;
void main() {
  vH = (position.y + ${(CONE_H / 2).toFixed(2)}) / ${CONE_H.toFixed(2)};
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const CONE_FRAG = /* glsl */ `uniform float uOpacity; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vH;
void main() {
  float rim = pow(abs(dot(normalize(vN), normalize(-vV))), 1.7);
  float a = uOpacity * rim * (0.12 + 0.88 * vH * vH);
  gl_FragColor = vec4(uColor * a, a);
}`;
let coneGeo: THREE.BufferGeometry | null = null;

export class NightLights {
  private slots: Slot[] = [];
  private max = 0;
  private lit = new Set<string>();
  private cands: Candidate[] = [];
  private since = 1;

  constructor(private scene: THREE.Scene, max: number) {
    this.max = max;
  }

  /** The tier (or the adaptive controller) changed how many lights may be spent. */
  setMax(n: number) {
    if (n === this.max) return;
    this.max = n;
    this.clear();
  }

  /** How many are shining right now (tests, the debug overlay). */
  get active() {
    return this.slots.filter((s) => s.k > 0.02).length;
  }

  /**
   * Every frame. `collect` adds the candidates around `eye` (lamps from the tiles, cars from
   * the traffic); it is only asked on a repick.
   */
  update(dt: number, night: number, eye: { x: number; z: number }, fwd: { x: number; z: number }, collect: (out: Candidate[]) => void, airK = 1) {
    const budget = lightBudget(this.max, night);
    if (budget.total <= 0 && !this.slots.some((s) => s.k > 0.02)) {
      if (this.slots.length) this.clear();
      return;
    }
    this.since += dt;
    if (this.since >= REPICK_S) {
      this.since = 0;
      this.cands.length = 0;
      if (budget.total > 0) collect(this.cands);
      this.assign(pickLights(this.cands, eye, fwd, budget, this.lit));
    }
    // Fade, and keep each light on its candidate (a car moves between repicks).
    const byId = new Map(this.cands.map((c) => [c.id, c]));
    for (const s of this.slots) {
      s.k = Math.max(0, Math.min(1, s.k + Math.sign(s.want - s.k) * Math.min(Math.abs(s.want - s.k), FADE_PER_S * dt)));
      const c = s.id ? byId.get(s.id) : null;
      if (c) this.place(s, c);
      // Never toggled `visible`: a light count that changes recompiles every material in the city.
      s.light.intensity = LOOK[s.kind].intensity * s.k * s.k;
      // Lit air under a lamp: more of it in rain and haze (`airK`); only lamps have one.
      if (s.cone) {
        const on = s.k > 0.02;
        s.cone.visible = on;
        if (on) {
          (s.cone.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.2 * s.k * airK;
          s.cone.position.set(s.light.position.x, CONE_H / 2, s.light.position.z);
        }
      }
      if (s.k <= 0.01 && s.want === 0) s.id = null;
    }
  }

  private place(s: Slot, c: Candidate) {
    const a = AT[s.kind], yaw = c.yaw ?? 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    s.light.position.set(c.x + fx * a.along, a.y, c.z + fz * a.along);
    if (s.light instanceof THREE.SpotLight && a.aim != null) {
      s.light.target.position.set(s.light.position.x + fx * a.aim, a.drop ?? 0, s.light.position.z + fz * a.aim);
      s.light.target.updateMatrixWorld();
    }
  }

  private assign(chosen: Candidate[]) {
    // The whole pool at once, the first time it's needed: lights added one by one would each recompile the city's materials.
    if (!this.slots.length && chosen.length) {
      const k = poolKinds(this.max);
      for (const kind of ["lamp", "head", "brake"] as const) for (let i = 0; i < k[kind]; i++) this.add(kind);
    }
    const want = new Map(chosen.map((c) => [c.id, c]));
    // Keep the lights already on a chosen candidate; the rest fade out.
    for (const s of this.slots) if (s.id && !want.has(s.id)) s.want = 0;
    const held = new Set(this.slots.filter((s) => s.id && want.has(s.id) && s.want === 1).map((s) => s.id!));
    for (const c of chosen) {
      if (held.has(c.id)) continue;
      // A light of its kind that has finished fading.
      const s = this.slots.find((x) => x.kind === c.kind && x.id === null && x.want === 0 && x.k <= 0.01);
      if (!s) continue;
      Object.assign(s, { id: c.id, want: 1, k: 0 });
      this.place(s, c);
    }
    this.lit = new Set(this.slots.filter((s) => s.id && s.want === 1).map((s) => s.id!));
  }

  private add(kind: LightKind): Slot {
    const look = LOOK[kind];
    let light: THREE.PointLight | THREE.SpotLight;
    if (look.angle != null) {
      const spot = new THREE.SpotLight(look.color, 0, look.distance, look.angle, look.penumbra ?? 0.5, 2);
      this.scene.add(spot.target);
      light = spot;
    } else light = new THREE.PointLight(look.color, 0, look.distance, 2);
    light.castShadow = false;
    light.position.set(0, -50, 0);
    this.scene.add(light);
    let cone: THREE.Mesh | null = null;
    if (kind === "lamp") {
      coneGeo ??= new THREE.ConeGeometry(3.6, CONE_H, 24, 1, true);
      const mat = new THREE.ShaderMaterial({ vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color("#ffbf70") } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
      cone = new THREE.Mesh(coneGeo, mat);
      cone.visible = false;
      cone.frustumCulled = false;
      cone.renderOrder = 4;
      this.scene.add(cone);
    }
    const s: Slot = { light, cone, id: null, kind, k: 0, want: 0 };
    this.slots.push(s);
    return s;
  }

  /** Take every light out of the scene (day, or fewer allowed). */
  clear() {
    for (const s of this.slots) {
      this.scene.remove(s.light);
      if (s.light instanceof THREE.SpotLight) this.scene.remove(s.light.target);
      s.light.dispose();
      if (s.cone) this.scene.remove(s.cone), (s.cone.material as THREE.Material).dispose();
    }
    this.slots = [];
    this.lit.clear();
    this.cands.length = 0;
    this.since = 1;
  }

  dispose() {
    this.clear();
  }
}
