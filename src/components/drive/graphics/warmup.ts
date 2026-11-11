"use client";
// Shaders built off the frame. WebGL compiles a material's shader program the first time
// something drawn with it is rendered — and that frame waits for the GPU driver (a tenth of a
// second, more on a phone; a whole new kind of car, a new street's materials or the first
// pedestrian each cost one or more). The gate looks over the scene just before it's drawn:
//  - a mesh whose material has never been built has its program started in the background
//    (KHR_parallel_shader_compile, on every Android and desktop Chrome) and sits out (its layer
//    mask cleared — nothing else in the game uses layers) until the program is ready, a frame
//    or a few later, instead of freezing the game until it is;
//  - a program already built for another mesh (the usual case) is shared at once, so nothing
//    is hidden for a frame;
//  - `whenReady` builds something before it's added at all (your own car, so the old one stays
//    on screen until the new one can be drawn);
//  - checked from inside the render, with the scene's render target bound, so what it builds is
//    exactly the variant the frame then draws (HDR target: no tone mapping in the shader).
// Without the extension programs are only checked when first used, as before (nothing waits).
import * as THREE from "three";

/** Never hide something longer than this, whatever the driver says. */
const MAX_WAIT_MS = 4000;

type Wait = { objs: THREE.Object3D[]; mats: THREE.Material[]; masks: number[] | null; since: number; done?: () => void };
type Prog = { isReady?: () => boolean };

const drawable = (o: THREE.Object3D) => {
  const m = o as THREE.Mesh & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  return !!(m.isMesh || m.isPoints || m.isLine || m.isSprite);
};
const materialsOf = (o: THREE.Object3D): THREE.Material[] => {
  const m = (o as THREE.Mesh).material;
  return !m ? [] : Array.isArray(m) ? m : [m];
};

export class ShaderGate {
  private seen = new WeakSet<THREE.Object3D>();
  private waits: Wait[] = [];
  private asked: { obj: THREE.Object3D; done: () => void }[] = [];
  /** Meshes held back so far (for the tests and the stats overlay). */
  held = 0;

  constructor(private renderer: THREE.WebGLRenderer) {}

  /** Resolves once everything in `obj` (not yet in the scene) can be drawn without a stall. */
  whenReady(obj: THREE.Object3D): Promise<void> {
    return new Promise((done) => this.asked.push({ obj, done }));
  }

  private program(m: THREE.Material) {
    return (this.renderer.properties.get(m) as { currentProgram?: Prog }).currentProgram;
  }
  private ready = (m: THREE.Material) => this.program(m)?.isReady?.() !== false;

  /** Call with the scene's render target bound, right before rendering it. */
  check(scene: THREE.Scene, camera: THREE.Camera) {
    const now = performance.now();
    if (this.waits.length)
      this.waits = this.waits.filter((w) => {
        if (now - w.since < MAX_WAIT_MS && !w.mats.every(this.ready)) return true;
        if (w.masks) w.objs.forEach((o, i) => (o.layers.mask = w.masks![i]));
        w.done?.();
        return false;
      });
    const fresh: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (this.seen.has(o)) return;
      this.seen.add(o);
      if (drawable(o) && materialsOf(o).some((m) => !this.program(m))) fresh.push(o);
    });
    if (fresh.length) this.start(fresh, scene, camera, true);
    if (this.asked.length) for (const a of this.asked.splice(0)) this.start([a.obj], scene, camera, false, a.done);
  }

  private start(objs: THREE.Object3D[], scene: THREE.Scene, camera: THREE.Camera, hide: boolean, done?: () => void) {
    // compile() walks `scene` for materials and `targetScene` for the lights: a stand-in that
    // walks just these objects gets them all built in one go, lit by the real scene.
    const group = {
      traverse: (fn: (o: THREE.Object3D) => void) => objs.forEach((o) => o.traverse(fn)),
      traverseVisible: (fn: (o: THREE.Object3D) => void) => objs.forEach((o) => o.traverseVisible(fn)),
    } as unknown as THREE.Object3D;
    let mats: THREE.Material[];
    try {
      mats = [...this.renderer.compile(group, camera, scene)];
    } catch {
      return void done?.();
    }
    // Shared with something already built (or no parallel compiling here): draw it now.
    if (mats.every(this.ready)) return void done?.();
    const masks = hide ? objs.map((o) => o.layers.mask) : null;
    if (hide) for (const o of objs) o.layers.mask = 0;
    this.held += hide ? objs.length : 0;
    this.waits.push({ objs, mats, masks, since: performance.now(), done });
  }

  /** Let everything held back be drawn (the renderer is going away). */
  release() {
    for (const w of this.waits) {
      if (w.masks) w.objs.forEach((o, i) => (o.layers.mask = w.masks![i]));
      w.done?.();
    }
    this.waits = [];
  }
}
