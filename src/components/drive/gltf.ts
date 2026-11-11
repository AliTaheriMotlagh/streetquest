"use client";
// Loading stores' 3D models (.glb from Blender) — shared by drive mode and the admin
// panel's preview, so what the admin checks is exactly what players get.
//  - Draco and meshopt compressed meshes, WebP textures; the Draco decoder is served by
//    the game itself (public/draco), never a third-party CDN.
//  - Reference objects left in the scene (named "ref_…", like the footprint the admin
//    panel exports) are dropped, so forgetting to delete them before export is harmless.
//  - `measure` reports what the model costs (triangles, materials, textures) and its
//    street-level outline (convex hull of everything below 2.5 m — an awning or a
//    sign over the pavement doesn't block the pavement), which is what cars hit.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { convexHull, simplifyHull, type ModelStats } from "@/lib/landmarks";

let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  draco.setWorkerLimit(1);
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export const isReference = (o: THREE.Object3D) => /^(ref_|footprint)/i.test(o.name);

/**
 * A mesh of a loaded model as plain float geometry in the model's frame: quantized,
 * compressed attributes (meshopt + KHR_mesh_quantization keep the scale in the node's
 * transform) unpacked and the node's transform applied, once, at load. Call after
 * `root.updateMatrixWorld(true)`; the source geometry is disposed.
 */
export function plainGeometry(m: THREE.Mesh) {
  const src = m.geometry;
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(src.index.array.slice(), 1));
  g.applyMatrix4(m.matrixWorld);
  g.computeBoundingSphere();
  src.dispose();
  return g;
}

/**
 * How many of a mesh's triangles face the way its normals say (0…1). A part exported inside
 * out (the Xantia's wheel: every triangle wound backwards) shows only its far side — a see-through
 * ghost — once back faces are culled. Pure: tests/carWinding.test.ts.
 */
export function windingAgreement(pos: ArrayLike<number>, nor: ArrayLike<number>, idx: ArrayLike<number> | null): number {
  const n = (idx ? idx.length : pos.length / 3) / 3;
  if (!n) return 1;
  let agree = 0;
  const at = (k: number) => (idx ? idx[k] : k) * 3;
  for (let t = 0; t < n; t++) {
    const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2);
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = nor[a] + nor[b] + nor[c], ny = nor[a + 1] + nor[b + 1] + nor[c + 1], nz = nor[a + 2] + nor[b + 2] + nor[c + 2];
    if (fx * nx + fy * ny + fz * nz > 0) agree++;
  }
  return agree / n;
}

/** Turn a part that's inside out (most triangles against their normals) the right way round. Returns whether it did. */
export function fixWinding(g: THREE.BufferGeometry): boolean {
  const p = g.getAttribute("position"), nrm = g.getAttribute("normal");
  if (!p || !nrm) return false;
  if (!g.index) g.setIndex([...Array(p.count).keys()]);
  const idx = g.index!;
  if (windingAgreement(p.array, nrm.array, idx.array) >= 0.25) return false;
  const a = idx.array as Uint32Array | Uint16Array;
  for (let i = 0; i + 2 < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
  idx.needsUpdate = true;
  return true;
}

/** Parse a .glb (an address or its bytes) into a scene, reference objects removed. */
export async function loadModel(src: string | ArrayBuffer): Promise<THREE.Group> {
  const l = gltfLoader();
  const gltf = typeof src === "string" ? await l.loadAsync(src) : await l.parseAsync(src, "");
  const root = gltf.scene;
  const drop: THREE.Object3D[] = [];
  root.traverse((o) => isReference(o) && drop.push(o));
  for (const o of drop) o.removeFromParent();
  return root;
}

/** Parse a .glb with its animations (rigged people). */
export async function loadAnimated(src: string): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> {
  const gltf = await gltfLoader().loadAsync(src);
  return { scene: gltf.scene, clips: gltf.animations };
}

/** What a model costs, and its outline at street level (model metres, x/z pairs). */
export function measure(root: THREE.Object3D, bytes: number): { stats: ModelStats; hull: number[]; height: number } {
  root.updateMatrixWorld(true);
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  let triangles = 0, meshes = 0, texturePx = 0, top = 0;
  const low: number[] = [], all: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const count = g.index ? g.index.count : g.attributes.position.count;
    triangles += Math.floor(count / 3) * ((m as THREE.InstancedMesh).count ?? 1);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      mats.add(mat);
      for (const val of Object.values(mat)) if ((val as THREE.Texture)?.isTexture) texs.add(val as THREE.Texture);
    }
    const pos = g.attributes.position;
    // Every vertex of small meshes; a sample of big ones (the hull hardly changes).
    const step = Math.max(1, Math.floor(pos.count / 20_000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      top = Math.max(top, v.y);
      all.push(v.x, v.z);
      if (v.y < 2.5) low.push(v.x, v.z);
    }
  });
  for (const t of texs) {
    const img = t.image as { width?: number; height?: number } | undefined;
    texturePx = Math.max(texturePx, img?.width ?? 0, img?.height ?? 0);
  }
  const hull = simplifyHull(convexHull(low.length >= 6 ? low : all)).map((n) => Math.round(n * 100) / 100);
  return { stats: { triangles, materials: mats.size, textures: texs.size, texturePx, meshes, bytes }, hull, height: Math.round(top * 10) / 10 };
}

/**
 * Get a loaded model ready for the city: shadows on, matrices frozen (it never moves),
 * emissive parts remembered so night can brighten them.
 */
export function prepare(root: THREE.Object3D, shadows: boolean) {
  const glow: { mat: THREE.MeshStandardMaterial; base: number }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const s = mat as THREE.MeshStandardMaterial;
      if (s.map) s.map.anisotropy = 4;
      if (s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b > 0 || s.emissiveMap)) glow.push({ mat: s, base: s.emissiveIntensity });
    }
  });
  root.updateMatrixWorld(true);
  root.traverse((o) => (o.matrixAutoUpdate = false));
  return {
    /** 0 by day … 1 at night: lit signs glow brighter after dark. */
    night(n: number) {
      for (const g of glow) g.mat.emissiveIntensity = g.base * (1 + n * 0.8);
    },
  };
}

/** Free a model's GPU memory. */
export function disposeModel(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const val of Object.values(mat)) if ((val as THREE.Texture)?.isTexture) (val as THREE.Texture).dispose();
      mat.dispose();
    }
  });
}
