"use client";
// Turntable previews for the admin panel's Objects catalog and model-replace flow. Dozens of
// cards must not mean dozens of WebGL contexts: ONE shared renderer draws each visible
// preview in turn and copies the picture to the card's own 2D canvas. A model is fetched when
// its card scrolls into view (the caller mounts it then) and freed when the last card using it
// goes; with no cards left the renderer itself is disposed. Models load through drive/gltf.ts
// (`loadModel`), so a preview shows exactly what players get — Draco, meshopt, overrides and all.
import * as THREE from "three";
import { disposeModel, loadModel } from "./gltf";

export type PreviewSpec = {
  /** A .glb address (a built-in file goes through the published-replacement manifest) or its bytes (never swapped). */
  src: string | ArrayBuffer;
  /** Show only this node of the file (a gun, a prop kind). */
  node?: string;
  /** Hide nodes whose names match (a car's far level of detail). */
  hide?: RegExp;
};

type Loaded = { root: THREE.Object3D; refs: number };
type Entry = { ctx: CanvasRenderingContext2D; w: number; h: number; pivot: THREE.Group; radius: number; angle: number; ready: boolean; dead: boolean };

let gl: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let raf = 0;
const entries = new Set<Entry>();
const loaded = new Map<string, Promise<Loaded>>();
let bufferId = 0;

function ensure() {
  if (gl) return;
  gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4a42, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(32, 1, 0.01, 2000);
}

function release() {
  if (entries.size) return;
  cancelAnimationFrame(raf);
  raf = 0;
  for (const p of loaded.values()) void p.then((l) => disposeModel(l.root)).catch(() => {});
  loaded.clear();
  gl?.dispose();
  gl?.forceContextLoss();
  gl = scene = camera = null;
}

function tick(now: number) {
  raf = 0;
  if (!gl || !scene || !camera || !entries.size) return;
  if (!document.hidden) {
    for (const e of entries) {
      if (!e.ready || e.dead) continue;
      e.angle = now / 1800;
      e.pivot.rotation.y = e.angle;
      gl.setSize(e.w, e.h, false);
      camera.aspect = e.w / e.h;
      camera.position.set(0, e.radius * 0.55, e.radius * 2.6);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      scene.add(e.pivot);
      gl.render(scene, camera);
      scene.remove(e.pivot);
      e.ctx.clearRect(0, 0, e.w, e.h);
      e.ctx.drawImage(gl.domElement, 0, 0, e.w, e.h);
    }
  }
  raf = requestAnimationFrame(tick);
}

/** Start a turntable on `canvas`. Returns what to call when the card goes away (or scrolls out of view). */
export function mountPreview(canvas: HTMLCanvasElement, spec: PreviewSpec, onState?: (s: "loading" | "ready" | "error") => void): () => void {
  ensure();
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const entry: Entry = { ctx, w: canvas.width, h: canvas.height, pivot: new THREE.Group(), radius: 1, angle: 0, ready: false, dead: false };
  entries.add(entry);
  onState?.("loading");
  const key = typeof spec.src === "string" ? spec.src : `buffer:${++bufferId}`;
  let p = loaded.get(key);
  if (!p) {
    p = loadModel(spec.src).then((root) => ({ root, refs: 0 }));
    loaded.set(key, p);
  }
  let held: Loaded | null = null;
  void p
    .then((l) => {
      if (entry.dead) return;
      l.refs++;
      held = l;
      const root = spec.node ? l.root.getObjectByName(spec.node) : l.root;
      if (!root) throw new Error("no such node");
      const obj = root.clone(true);
      if (spec.hide) obj.traverse((o) => spec.hide!.test(o.name) && (o.visible = false));
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj, true);
      if (box.isEmpty()) throw new Error("empty");
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
      // Centre on the middle of its bounds; the pivot spins it.
      obj.position.sub(c);
      entry.pivot.add(obj);
      entry.radius = r;
      entry.ready = true;
      onState?.("ready");
    })
    .catch(() => {
      loaded.delete(key);
      onState?.("error");
    });
  if (!raf) raf = requestAnimationFrame(tick);
  return () => {
    entry.dead = true;
    entries.delete(entry);
    entry.pivot.clear();
    // The last card using a model frees it.
    if (held && --held.refs <= 0) {
      loaded.delete(key);
      disposeModel(held.root);
    }
    release();
  };
}
