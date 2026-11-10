"use client";
// Real light at night: a fixed pool of point lights handed, a few times a second, to the most
// useful candidates around the player (lib/lightBudget.ts) — street lamps that light the
// walls and pavement under them, headlights that throw light down the road, brake lamps that
// stain the tarmac red. A light never jumps: one that is taken away fades out, a new one
// fades in, so driving past a lamp is a gradient, never a pop. By day the pool is empty and
// not in the scene at all (every light costs every pixel it can reach). The pool is built
// whole at dusk and its lights stay in the scene (idle ones at intensity 0): three.js
// compiles its shaders for the number of lights, so adding or hiding one mid-drive would
// stall the frame while every material is rebuilt.
import * as THREE from "three";
import { lightBudget, pickLights, type Candidate, type LightKind } from "@/lib/lightBudget";

const LOOK: Record<LightKind, { color: string; intensity: number; distance: number }> = {
  lamp: { color: "#ffc27a", intensity: 80, distance: 28 },
  head: { color: "#fff3d6", intensity: 70, distance: 18 },
  brake: { color: "#ff2a1a", intensity: 16, distance: 7.5 },
};
/** Where the light sits relative to its candidate (m): up in the lamp head, ahead of a car's nose, behind its tail. */
const AT: Record<LightKind, { y: number; along: number }> = { lamp: { y: 6.3, along: 0 }, head: { y: 0.8, along: 4.5 }, brake: { y: 0.8, along: -2.6 } };
const REPICK_S = 0.25;
const FADE_PER_S = 4;

type Slot = { light: THREE.PointLight; id: string | null; kind: LightKind; k: number; want: number };

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
  update(dt: number, night: number, eye: { x: number; z: number }, fwd: { x: number; z: number }, collect: (out: Candidate[]) => void) {
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
      if (s.k <= 0.01 && s.want === 0) s.id = null;
    }
  }

  private place(s: Slot, c: Candidate) {
    const a = AT[s.kind], yaw = c.yaw ?? 0;
    s.light.position.set(c.x - Math.sin(yaw) * a.along, a.y, c.z - Math.cos(yaw) * a.along);
  }

  private assign(chosen: Candidate[]) {
    // The whole pool at once, the first time it's needed: lights added one by one would each recompile the city's materials.
    if (!this.slots.length && chosen.length) while (this.slots.length < this.max) this.add();
    const want = new Map(chosen.map((c) => [c.id, c]));
    // Keep the lights already on a chosen candidate; the rest fade out.
    for (const s of this.slots) if (s.id && !want.has(s.id)) s.want = 0;
    const held = new Set(this.slots.filter((s) => s.id && want.has(s.id) && s.want === 1).map((s) => s.id!));
    for (const c of chosen) {
      if (held.has(c.id)) continue;
      // A light that has finished fading, else a new one while there's room.
      let s = this.slots.find((x) => x.id === null && x.want === 0 && x.k <= 0.01);
      if (!s) continue;
      Object.assign(s, { id: c.id, kind: c.kind, want: 1, k: 0 });
      const look = LOOK[c.kind];
      s.light.color.set(look.color);
      s.light.distance = look.distance;
      this.place(s, c);
    }
    this.lit = new Set(this.slots.filter((s) => s.id && s.want === 1).map((s) => s.id!));
  }

  private add(): Slot {
    const light = new THREE.PointLight("#ffffff", 0, 20, 2);
    light.castShadow = false;
    light.position.set(0, -50, 0);
    this.scene.add(light);
    const s: Slot = { light, id: null, kind: "lamp", k: 0, want: 0 };
    this.slots.push(s);
    return s;
  }

  /** Take every light out of the scene (day, or fewer allowed). */
  clear() {
    for (const s of this.slots) (this.scene.remove(s.light), s.light.dispose());
    this.slots = [];
    this.lit.clear();
    this.cands.length = 0;
    this.since = 1;
  }

  dispose() {
    this.clear();
  }
}
