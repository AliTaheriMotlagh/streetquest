"use client";
// Dents on the cars in traffic (and patrol cars, and the parked ones): they're drawn by
// the thousand as instanced copies of one model, so a crash can't bend a copy's geometry
// the way your own car's is bent (carDamage.ts). Each copy carries its dent instead — one
// vec4 per instance: where (x, z in the car's own frame), how deep, and how battered the
// whole car is — and the vertex shader folds the bodywork in there with the same shape
// carDamage uses (in toward the middle, a touch down, crumpled), the panels around it
// scuffed to bare grey. Trim, lamps and glass fold with the paint (the lamps go dark, the
// glass frosts where it cracked).
import * as THREE from "three";

/** The per-copy dent attribute. Missing, WebGL reads (0, 0, 0, 1): no dent, not battered — so w is 1 − crumple. */
export const DENT_ATTR = "aDent";

const VERT_COMMON = /* glsl */ `
attribute vec4 aDent;
varying float vDentK;
float dentK(vec3 p) {
  float R = 0.75 + aDent.z * 2.2;
  float k = max(0.0, 1.0 - distance(p, vec3(aDent.x, 0.55, aDent.y)) / R);
  return k * k * step(0.005, aDent.z);
}
vec3 dentWobble(vec3 p) {
  return vec3(sin(p.y * 23.0 + p.z * 17.0), sin(p.x * 19.0 + p.z * 13.0), sin(p.x * 29.0 + p.y * 11.0));
}`;

/** Patch a material so copies drawn with it fold in at their dent. Wraps whatever patch it already has. */
export function withDents<M extends THREE.Material>(mat: M): M {
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_COMMON}`)
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `#include <beginnormal_vertex>
        {
          float dk = dentK(position);
          float bat = 1.0 - aDent.w;
          objectNormal = normalize(objectNormal + dentWobble(position * 1.3) * (dk * aDent.z * 2.5 + bat * (0.08 + 0.3 * dk)));
        }`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        {
          float dk = dentK(position);
          float bat = 1.0 - aDent.w;
          vec2 toC = -position.xz;
          float lc = length(toC);
          float cr = 1.0 + sin(dot(position, vec3(12.9898, 78.233, 37.719)) * 43.0) * 0.25;
          if (lc > 0.001) transformed.xz += toC / lc * aDent.z * dk * cr;
          transformed.y -= aDent.z * dk * 0.25;
          transformed += dentWobble(position * 1.3) * bat * 0.016 * (0.35 + dk);
          vDentK = dk;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vDentK;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.31), smoothstep(0.12, 0.55, vDentK) * 0.6);");
  };
  mat.customProgramCacheKey = () => `${key}+dent`;
  mat.needsUpdate = true;
  return mat;
}

/**
 * The geometry a pool draws: the model's own buffers (shared — nothing copied) plus that
 * pool's dent attribute (the same one on every part of the pool).
 */
export function dentable(geo: THREE.BufferGeometry, dents: THREE.InstancedBufferAttribute) {
  const g = new THREE.BufferGeometry();
  g.setIndex(geo.index);
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingSphere = geo.boundingSphere;
  g.boundingBox = geo.boundingBox;
  g.setAttribute(DENT_ATTR, dents);
  return g;
}

/** Free a pool's geometry without freeing the model's buffers it shares. */
export function releaseDentable(g: THREE.BufferGeometry) {
  g.setIndex(null);
  for (const k of Object.keys(g.attributes)) if (k !== DENT_ATTR) g.deleteAttribute(k);
  g.dispose();
}

/** A pool's dent attribute (`cap` copies), every copy undented. */
export function dentAttr(cap: number) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  for (let i = 0; i < cap; i++) a.array[i * 4 + 3] = 1;
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}
