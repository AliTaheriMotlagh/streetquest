"use client";
// Dents on the cars in traffic (and patrol cars, and the parked ones): they're drawn by
// the thousand as instanced copies of one model, so a crash can't bend a copy's geometry
// the way your own car's is bent (carDamage.ts). Each copy carries its dent instead — one
// vec4 per instance: where (x, z in the car's own frame), how deep, and how battered the
// whole car is — and the vertex shader folds the bodywork in there with the same shape
// carDamage uses (in toward the middle, a touch down, crumpled), the panels around it
// scuffed to bare grey. Trim, lamps and glass fold with the paint (the lamps go dark, the
// glass frosts where it cracked).
// Bullet holes the same way: each copy carries its last four (HOLES_MAX) as three more
// vec4s, and the fragment shader draws each one along the bullet's line (in toward the
// middle of the car) on whatever surface faces it — a dark hole ringed with bare metal on
// paint and trim, a star of cracks on glass — so it sits on the real, curved body.
import * as THREE from "three";
import type { Hole } from "@/lib/street/damage";

/** The per-copy dent attribute. Missing, WebGL reads (0, 0, 0, 1): no dent, not battered — so w is 1 − crumple. */
export const DENT_ATTR = "aDent";
/** The per-copy bullet holes: (x, y + 10, z) × 4 packed in three vec4s — missing, y reads −10: none. */
export const HOLE_ATTRS = ["aHoleA", "aHoleB", "aHoleC"] as const;
const MARKS: readonly string[] = [DENT_ATTR, ...HOLE_ATTRS];

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
}
attribute vec4 aHoleA;
attribute vec4 aHoleB;
attribute vec4 aHoleC;
varying vec3 vHoleP;
varying vec3 vHoleN;
varying vec4 vH0;
varying vec4 vH1;
varying vec4 vH2;`;

const FRAG_HOLES = /* glsl */ `
varying vec3 vHoleP;
varying vec3 vHoleN;
varying vec4 vH0;
varying vec4 vH1;
varying vec4 vH2;
/** How much of a bullet hole at c covers this point (x), and the point in the hole's own plane (yz: radius, angle). */
vec3 holeAt(vec3 c) {
  if (c.y < -5.0) return vec3(0.0);
  vec3 d = vec3(-c.x, 0.0, -c.z);
  float dl = length(d);
  d = dl > 0.01 ? d / dl : vec3(0.0, 0.0, 1.0);
  vec3 v = vHoleP - c;
  float along = dot(v, d);
  // Only the surfaces facing the shot, near where it went in.
  if (along < -0.35 || along > 2.5 || dot(vHoleN, d) > -0.1) return vec3(0.0);
  vec3 perp = v - along * d;
  vec3 t = normalize(cross(d, vec3(0.0, 1.0, 0.0)));
  vec3 b = cross(t, d);
  return vec3(1.0, length(perp), atan(dot(perp, b), dot(perp, t)) + c.x * 31.0 + c.y * 17.0);
}`;

/**
 * Patch a material so copies drawn with it fold in at their dent and show their bullet
 * holes (`glass`: as cracks). Wraps whatever patch it already has.
 */
export function withDents<M extends THREE.Material>(mat: M, glass = false): M {
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
          vHoleP = transformed;
          vHoleN = normal;
          vH0 = aHoleA;
          vH1 = aHoleB;
          vH2 = aHoleC;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying float vDentK;\n${FRAG_HOLES}`).replace(
      "#include <color_fragment>",
      /* glsl */ `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.3, 0.31), smoothstep(0.12, 0.55, vDentK) * 0.6);
      {
        vec3 hs[4];
        hs[0] = holeAt(vec3(vH0.x, vH0.y - 10.0, vH0.z));
        hs[1] = holeAt(vec3(vH0.w, vH1.x - 10.0, vH1.y));
        hs[2] = holeAt(vec3(vH1.z, vH1.w - 10.0, vH2.x));
        hs[3] = holeAt(vec3(vH2.y, vH2.z - 10.0, vH2.w));
        for (int i = 0; i < 4; i++) {
          if (hs[i].x < 0.5) continue;
          float r = hs[i].y, a = hs[i].z;
          ${
            glass
              ? `// A star of cracks round a small hole, two rings, the glass whitened and clouded.
          float fall = 1.0 - smoothstep(0.02, 0.24, r);
          float spokes = pow(abs(sin(a * 5.0)), 60.0) + pow(abs(sin(a * 3.0 + 1.3)), 90.0) * 0.8;
          float rings = (1.0 - smoothstep(0.0, 0.005, abs(r - 0.05))) + (1.0 - smoothstep(0.0, 0.004, abs(r - 0.12))) * 0.6;
          float crack = clamp((spokes + rings) * fall + (1.0 - smoothstep(0.012, 0.045, r)) * 0.85, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.92), crack);
          diffuseColor.a = max(diffuseColor.a, crack * 0.95);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), 1.0 - smoothstep(0.006, 0.012, r));`
              : `// A dark hole, ringed with bare metal, a little soot round it.
          diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.03, 0.065, r)) * 0.35;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.63, 0.65), 1.0 - smoothstep(0.016, 0.03, r));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), 1.0 - smoothstep(0.009, 0.014, r));`
          }
        }
      }`,
    );
  };
  mat.customProgramCacheKey = () => `${key}+dent${glass ? "+glass" : ""}`;
  mat.needsUpdate = true;
  return mat;
}

/** A pool's per-copy marks: its dents and its bullet holes (one set, on every part of the pool). */
export type Marks = { dents: THREE.InstancedBufferAttribute; holes: THREE.InstancedBufferAttribute[] };

/**
 * The geometry a pool draws: the model's own buffers (shared — nothing copied) plus that
 * pool's marks.
 */
export function dentable(geo: THREE.BufferGeometry, marks: Marks) {
  const g = new THREE.BufferGeometry();
  g.setIndex(geo.index);
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingSphere = geo.boundingSphere;
  g.boundingBox = geo.boundingBox;
  g.setAttribute(DENT_ATTR, marks.dents);
  HOLE_ATTRS.forEach((k, i) => g.setAttribute(k, marks.holes[i]));
  return g;
}

/** Free a pool's geometry without freeing the model's buffers it shares. */
export function releaseDentable(g: THREE.BufferGeometry) {
  g.setIndex(null);
  for (const k of Object.keys(g.attributes)) if (!MARKS.includes(k)) g.deleteAttribute(k);
  g.dispose();
}

/** A pool's marks (`cap` copies), every copy undented, no holes. */
export function marksFor(cap: number): Marks {
  const v4 = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const dents = v4();
  for (let i = 0; i < cap; i++) dents.array[i * 4 + 3] = 1;
  return { dents, holes: [v4(), v4(), v4()] };
}

/** Copy `n` copies' marks from one pool to another (it grew). */
export function copyMarks(from: Marks, to: Marks, n: number) {
  to.dents.array.set(from.dents.array.subarray(0, n * 4));
  from.holes.forEach((h, i) => to.holes[i].array.set(h.array.subarray(0, n * 4)));
}

/** Copy `i`'s marks this frame: its dent and how battered it is, its holes. */
export function setMarks(m: Marks, i: number, dent: { x: number; z: number; depth: number } | undefined, crumple: number, holes: Hole[] | undefined) {
  m.dents.setXYZW(i, dent?.x ?? 0, dent?.z ?? 0, dent?.depth ?? 0, 1 - crumple);
  const f = HOLE_PACK;
  f.fill(0);
  for (let k = 0; k < 4; k++) {
    const h = holes?.[k];
    if (h) (f[k * 3] = h.x), (f[k * 3 + 1] = h.y + 10), (f[k * 3 + 2] = h.z);
  }
  for (let j = 0; j < 3; j++) m.holes[j].setXYZW(i, f[j * 4], f[j * 4 + 1], f[j * 4 + 2], f[j * 4 + 3]);
}
const HOLE_PACK = new Float32Array(12);

/** The marks are new this frame (upload them). */
export function marksChanged(m: Marks) {
  m.dents.needsUpdate = true;
  for (const h of m.holes) h.needsUpdate = true;
}
