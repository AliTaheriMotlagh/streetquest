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
