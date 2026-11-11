"use client";
// How the cars' surfaces look, close up (real style): shader patches on the paint, glass,
// trim and wheels that every car shares — traffic's instanced copies (fleet3d.ts) and your
// own (vehicles3d.ts).
//  - paint: most cars metallic (flakes under the lacquer that glint as the light moves over
//    them; they blur into a soft sheen further off, never into noise), the rest solid; road
//    dust caked up the sills and wheel arches and a film on top, each car its own amount
//    (yours builds up as you drive and the rain washes it); beads of water in the rain;
//    scratches down to bare metal where the body was dented;
//  - glass: dark tinted, see-through looking straight in, a mirror at a glancing angle;
//  - trim: chrome (bumpers, grilles, strips) a polished mirror, black plastic satin;
//  - wheels: alloy rims, tyres with a tread (grooves and sipes) and a sidewall (rim lip,
//    raised lettering).
// The patches go on before fleetDamage's `withDents` (which wraps the material's
// onBeforeCompile itself), never after it — patchShader would replace that wrapper.
import * as THREE from "three";
import { after, patchShader } from "./graphics/shaders";
import { WORLD } from "./world3d";

/** A car's own dirt: 0 showroom clean … 1 filthy (yours: updated as you drive). */
export type CarGrime = { dirt: { value: number }; base: { value: number } };
export const carGrime = (dirt = 0.15): CarGrime => ({ dirt: { value: dirt }, base: { value: 0 } });
/** Traffic's cars: each its own amount around this (picked from its paint). */
const FLEET_GRIME = carGrime(0.6);

const HASH = /* glsl */ `
float sqHash1(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
vec3 sqHash3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }`;

/**
 * Scratches, 0…1, over a dented patch (`k` how much): fine streaks mostly along the car,
 * where it scraped along something, broken up along their length. `p` in the car's frame (m).
 */
export const SCRATCH_GLSL = /* glsl */ `
#ifndef SQ_SCRATCH
#define SQ_SCRATCH
float sqScratch(vec3 p, float k) {
  if (k < 0.01) return 0.0;
  float row = p.y * 90.0 + sin(p.z * 2.3 + p.x * 1.7) * 2.0;
  float line = 1.0 - smoothstep(0.0, 0.18 + 0.1 * k, abs(fract(row) - 0.5) * 2.0 - 0.72);
  float keep = step(0.45, fract(sin(floor(row) * 91.7) * 43758.5453));
  float broken = smoothstep(0.35, 0.6, fract(sin(floor(p.z * 6.0 + floor(row) * 3.1) * 12.9898) * 43758.5453));
  return clamp(line * keep * broken * smoothstep(0.0, 0.6, k) * 1.4, 0.0, 1.0);
}
#endif`;

/**
 * Car paint. `grime`: this car's dirt (and where its wheels stand, for a car that isn't an
 * instanced copy — dirt is measured up from there). Copies drawn by the thousand (fleet)
 * each get their own share of the dirt and their own finish from their colour.
 */
export function carPaint<T extends THREE.MeshStandardMaterial>(mat: T, grime: CarGrime = FLEET_GRIME): T {
  if (mat instanceof THREE.MeshPhysicalMaterial) (mat.clearcoat = 1), (mat.clearcoatRoughness = 0.035);
  return patchShader(mat, "car-paint-1", (sh) => {
    sh.uniforms.sqWet = WORLD.wet;
    sh.uniforms.sqDirt = grime.dirt;
    sh.uniforms.sqBase = grime.base;
    let v = after(sh.vertexShader, "common", "attribute float aScuff;\nvarying vec3 vCarP;\nvarying vec3 vCarN;\nvarying float vCarH;\nvarying float vScuff;\nuniform float sqBase;");
    v = after(
      v,
      "begin_vertex",
      `vCarP = position;
vCarN = normal;
vScuff = aScuff;
#ifdef USE_INSTANCING
vCarH = position.y;
#else
vCarH = (modelMatrix * vec4(position, 1.0)).y - sqBase;
#endif`,
    );
    sh.vertexShader = v;
    let f = after(sh.fragmentShader, "common", `uniform float sqWet;\nuniform float sqDirt;\nvarying vec3 vCarP;\nvarying vec3 vCarN;\nvarying float vCarH;\nvarying float vScuff;\n${HASH}\n${SCRATCH_GLSL}`);
    f = after(
      f,
      "color_fragment",
      `// This car: metallic or solid, and how dirty, from its paint (traffic) — yours from the garage's colour.
#if defined( USE_INSTANCING_COLOR )
float sqId = sqHash1(floor(vColor.rgb * 255.0 + 0.5));
#else
float sqId = sqHash1(floor(diffuse * 255.0 + 0.5));
#endif
float sqMetal = step(0.38, sqId);
#ifdef USE_INSTANCING
float sqDirtK = sqDirt * fract(sqId * 7.31);
#else
float sqDirtK = sqDirt;
#endif
sqDirtK *= 1.0 - 0.5 * sqWet;
// Dust up the sills and wheel arches, a film on the bonnet and roof, patchy.
float sqPatch = 0.55 + 0.45 * sqHash1(floor(vCarP * 9.0));
float sqLow = 1.0 - smoothstep(0.18, 0.75, vCarH);
float sqDust = clamp((sqLow * 0.95 + max(vCarN.y, 0.0) * 0.35) * sqDirtK * sqPatch, 0.0, 0.92);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.25, 0.19), sqDust);
// Scratched to bare metal where it was hit (your own car: per vertex).
float sqScr = sqScratch(vCarP, vScuff);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.61, 0.63), sqScr);
// Beads of rain on the lacquer.
vec3 sqDropCell = floor(vCarP * vec3(38.0, 38.0, 38.0));
vec3 sqDropR = sqHash3(sqDropCell);
vec3 sqDropD = fract(vCarP * 38.0) - (0.25 + 0.5 * sqDropR);
float sqDrop = sqWet * step(0.55, sqDropR.z) * (1.0 - smoothstep(0.12, 0.22, length(sqDropD)));
diffuseColor.rgb *= 1.0 - 0.18 * sqDrop;`,
    );
    f = after(f, "roughnessmap_fragment", "roughnessFactor = mix(mix(roughnessFactor, 0.34, sqMetal), 0.92, sqDust);\nroughnessFactor = mix(roughnessFactor, 0.45, sqScr);");
    f = after(f, "metalnessmap_fragment", "metalnessFactor = mix(mix(metalnessFactor, 0.55, sqMetal) * (1.0 - sqDust), 0.9, sqScr);");
    f = after(
      f,
      "normal_fragment_maps",
      `{
  // Metallic flakes: each ~4 mm cell of the paint tips its own way. Smaller than a pixel
  // they'd only sparkle as noise, so they fade out by the screen size of a cell.
  float sqCells = length(fwidth(vCarP)) * 240.0;
  float sqFlake = sqMetal * (1.0 - smoothstep(0.6, 1.6, sqCells)) * (1.0 - sqDust);
  vec3 sqTip = sqHash3(floor(vCarP * 240.0)) - 0.5;
  normal = normalize(normal + sqTip * 0.5 * sqFlake);
  // A raindrop is a little lens: its edge tips the light.
  normal = normalize(normal + vec3(sqDropD.xy * 1.6, 0.0) * sqDrop);
}`,
    );
    f = after(
      f,
      "lights_physical_fragment",
      `#ifdef USE_CLEARCOAT
material.clearcoat *= (1.0 - sqDust) * (1.0 - sqScr);
material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.25, sqDust);
#endif`,
    );
    sh.fragmentShader = f;
  });
}

/**
 * Car glass: dark tinted. Opaque glass (your car's) gets a real lacquer-like reflection;
 * see-through glass (traffic's) is clear looking straight in and turns to a mirror at a
 * glancing angle (the alpha follows Fresnel), so the cabin shows through the side windows
 * you look into and the windscreen raked away from you mirrors the sky.
 */
export function carGlass<T extends THREE.MeshStandardMaterial>(mat: T): T {
  mat.name ||= "glass";
  mat.metalness = 0;
  mat.roughness = 0.03;
  mat.color.set("#0a1015");
  mat.envMapIntensity = 1.6;
  if (mat instanceof THREE.MeshPhysicalMaterial) (mat.clearcoat = 1), (mat.clearcoatRoughness = 0.02);
  if (!mat.transparent) return mat;
  return patchShader(mat, "car-glass-fresnel", (sh) => {
    sh.fragmentShader = after(sh.fragmentShader, "dithering_fragment", "{ float sqF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 4.0); gl_FragColor.a = clamp(mix(gl_FragColor.a, 0.96, sqF), 0.0, 1.0); }");
  });
}

/**
 * Trim with vertex colours (bumpers, grilles, strips, plates): the bright neutral greys are
 * chrome — polished, fully metal — black is satin plastic, the rest painted metal.
 */
export function carTrim<T extends THREE.MeshStandardMaterial>(mat: T): T {
  return patchShader(mat, "car-trim-1", (sh) => {
    let f = after(sh.fragmentShader, "color_fragment", `float sqL = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), sqS = sqL - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
float sqChrome = smoothstep(0.32, 0.42, sqL) * (1.0 - smoothstep(0.78, 0.85, sqL)) * (1.0 - smoothstep(0.05, 0.1, sqS));
float sqBlack = 1.0 - smoothstep(0.015, 0.05, sqL);`);
    f = after(f, "roughnessmap_fragment", "roughnessFactor = mix(mix(roughnessFactor, 0.48, sqBlack), 0.09, sqChrome);");
    f = after(f, "metalnessmap_fragment", "metalnessFactor = mix(mix(metalnessFactor, 0.0, sqBlack), 1.0, sqChrome);");
    sh.fragmentShader = f;
  });
}

/**
 * Where each wheel vertex is on its tyre: (distance from the axle ÷ the tyre's radius,
 * across the tread ÷ half its width, 1 if its rim is a plain disc to cut spokes into — the
 * drawn wheels; a real model's rims are modelled). Wheels turn about x, centred on the
 * origin. `R`: the tyre's radius when this geometry is only the rim.
 */
export function tyreAttr(g: THREE.BufferGeometry, o: { spokes?: boolean; R?: number } = {}) {
  const p = g.getAttribute("position");
  if (!p || g.getAttribute("aTyre")) return g;
  let R = o.R ?? 0, W = 0;
  for (let i = 0; i < p.count; i++) {
    if (!o.R) R = Math.max(R, Math.hypot(p.getY(i), p.getZ(i)));
    W = Math.max(W, Math.abs(p.getX(i)));
  }
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) (a[i * 3] = Math.hypot(p.getY(i), p.getZ(i)) / (R || 1)), (a[i * 3 + 1] = p.getX(i) / (W || 1)), (a[i * 3 + 2] = o.spokes ? 1 : 0);
  g.setAttribute("aTyre", new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * Wheels: the dark parts are tyre — grooves and sipes round the tread, and on the sidewall
 * a moulded rim lip and a band of raised lettering — the light parts alloy (or chrome).
 * Needs `tyreAttr` on the geometry; without it the tyre stays plain.
 */
export function carWheel<T extends THREE.MeshStandardMaterial>(mat: T): T {
  return patchShader(mat, "car-wheel-1", (sh) => {
    let v = after(sh.vertexShader, "common", "attribute vec3 aTyre;\nvarying vec3 vTyre;\nvarying vec3 vTyreP;\nvarying vec3 vTyreN;");
    v = after(v, "begin_vertex", "vTyre = aTyre; vTyreP = position; vTyreN = normal;");
    sh.vertexShader = v;
    let f = after(sh.fragmentShader, "common", "varying vec3 vTyre;\nvarying vec3 vTyreP;\nvarying vec3 vTyreN;");
    f = after(
      f,
      "color_fragment",
      `float sqRubber = 1.0 - smoothstep(0.03, 0.08, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
float sqTyreRough = 0.9, sqGroove = 0.0;
if (sqRubber > 0.5 && vTyre.x > 0.05) {
  float a = atan(vTyreP.z, vTyreP.y);
  if (abs(vTyreN.x) > 0.6) {
    // Sidewall: the lip by the rim and the shoulder, and the lettering band between.
    float r = vTyre.x;
    float rings = (1.0 - smoothstep(0.0, 0.012, abs(r - 0.7))) + (1.0 - smoothstep(0.0, 0.01, abs(r - 0.95)));
    float band = step(0.79, r) * step(r, 0.88);
    // Letters ~1 cm wide, in three words round the tyre.
    float ga = a * 26.0;
    float glyph = step(0.42, fract(sin(floor(ga) * 78.233) * 43758.5453)) * step(0.22, fract(ga)) * step(fract(r * 36.0), 0.7);
    diffuseColor.rgb += vec3(0.016) * (rings + band * glyph * step(0.5, sin(a * 3.0) + 1.0));
    sqTyreRough = 0.78;
  } else {
    // Tread: three grooves round it, sipes across in a shallow chevron.
    float x = abs(vTyre.y);
    float grooves = 1.0 - smoothstep(0.035, 0.06, min(abs(x - 0.0), abs(x - 0.48)));
    float sipe = 1.0 - smoothstep(0.08, 0.16, abs(fract(a * 30.0 / 3.1415927 + x * 0.6) - 0.5));
    sqGroove = max(grooves, sipe * step(0.12, x) * step(x, 0.86));
    diffuseColor.rgb *= 1.0 - 0.55 * sqGroove;
    // A little road dust on the shoulders.
    diffuseColor.rgb += vec3(0.012, 0.01, 0.008) * smoothstep(0.7, 0.95, x);
  }
}
float sqHole = 0.0;
if (sqRubber < 0.5 && vTyre.z > 0.5 && abs(vTyreN.x) > 0.6) {
  // A five-spoke alloy cut into the drawn rim's face: dark gaps between the spokes onto
  // the brake disc behind, a polished lip, a darker centre cap.
  float r = vTyre.x, a = atan(vTyreP.z, vTyreP.y);
  float spoke = smoothstep(0.58, 0.68, cos(a * 5.0) * 0.5 + 0.5 + (0.45 - r) * 0.9);
  sqHole = (1.0 - spoke) * smoothstep(0.17, 0.2, r) * (1.0 - smoothstep(0.5, 0.53, r));
  float disc = smoothstep(0.26, 0.28, r) * (1.0 - smoothstep(0.42, 0.44, r));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.012), vec3(0.09, 0.085, 0.08), disc), sqHole);
  diffuseColor.rgb *= 1.0 - 0.35 * (1.0 - smoothstep(0.1, 0.13, r));
}`,
    );
    f = after(f, "roughnessmap_fragment", "roughnessFactor = mix(mix(0.24, 0.7, sqHole), sqTyreRough, sqRubber);");
    f = after(f, "metalnessmap_fragment", "metalnessFactor = mix(mix(0.92, 0.3, sqHole), 0.0, sqRubber);");
    sh.fragmentShader = f;
  });
}
