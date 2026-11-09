"use client";
// Real street furniture for the 3D city (scripts/props.ts builds public/models/props and the
// manifest src/lib/propModels.ts): trees, lamps, bus shelters, benches, bins, hydrants and
// dumpsters from CC BY models, one small file (~100 KB, cached forever: its name carries a
// hash of its bytes). Each kind is one plain vertex-coloured geometry standing at its foot
// on y = 0, ready to be the template a whole street is instanced from (world3d adoptModels).
import type * as THREE from "three";
import { PROP_MODELS } from "@/lib/propModels";
import { loadModel, plainGeometry } from "./gltf";

let file: Promise<Record<string, THREE.BufferGeometry> | null> | null = null;

/** The models (fetched once a session); each call gets its own copies, which the caller owns. */
export async function loadPropModels(): Promise<Record<string, THREE.BufferGeometry> | null> {
  file ??= loadModel(PROP_MODELS.url)
    .then((root) => {
      root.updateMatrixWorld(true);
      const out: Record<string, THREE.BufferGeometry> = {};
      for (const k of Object.keys(PROP_MODELS.kinds)) {
        let mesh: THREE.Mesh | null = null;
        root.getObjectByName(k)?.traverse((o) => void (!mesh && (o as THREE.Mesh).isMesh && (mesh = o as THREE.Mesh)));
        if (mesh) out[k] = plainGeometry(mesh);
      }
      return out;
    })
    .catch((e) => {
      console.warn("street furniture models", e);
      return null;
    });
  const models = await file;
  return models && Object.fromEntries(Object.entries(models).map(([k, g]) => [k, g.clone()]));
}
