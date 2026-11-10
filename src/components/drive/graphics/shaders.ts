// Small shader toolkit for the 3D city: composable material patches (several features can
// each hook a material's shader), three.js's ACES filmic curve and its exact inverse, on the
// GPU and the CPU. The inverse lets colours meant for the screen as-is (the fog, the night
// sky, the mountains on the horizon) survive the HDR pipeline's tone mapping unchanged.
import type * as THREE from "three";

type Shader = THREE.WebGLProgramParametersWithUniforms;

/**
 * Add a shader patch to a material. Patches stack in the order added; the program cache key
 * lists them, so materials with the same patches share one compiled program.
 */
export function patchShader<T extends THREE.Material>(mat: T, key: string, fn: (sh: Shader) => void): T {
  const patches: { key: string; fn: (sh: Shader) => void }[] = (mat.userData.patches ??= []);
  if (patches.some((p) => p.key === key)) return mat;
  patches.push({ key, fn });
  mat.onBeforeCompile = (sh) => {
    for (const p of patches) p.fn(sh);
  };
  mat.customProgramCacheKey = () => patches.map((p) => p.key).join("|");
  mat.needsUpdate = true;
  return mat;
}

/** Insert `code` after the first `#include <chunk>` (or `void main() {`). Throws if it's missing, so a three.js upgrade can't silently drop a feature. */
export function after(src: string, anchor: string, code: string) {
  const at = anchor.startsWith("#") || anchor.startsWith("void") ? anchor : `#include <${anchor}>`;
  if (!src.includes(at)) throw new Error(`shader anchor missing: ${at}`);
  return src.replace(at, `${at}\n${code}`);
}
/** Replace `#include <chunk>` with `code`. */
export function swap(src: string, chunk: string, code: string) {
  const at = `#include <${chunk}>`;
  if (!src.includes(at)) throw new Error(`shader anchor missing: ${at}`);
  return src.replace(at, code);
}

// ---------------------------------------------------------------- tone mapping
const IN = [0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777]; // column-major
const OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];
const mul = (m: number[], v: number[]) => [0, 1, 2].map((r) => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);
/** Inverse of a column-major 3×3 matrix (by the adjugate). */
function inv3(m: number[]) {
  const [a, b, c, d, e, f, g, h, i] = m; // columns (a b c) (d e f) (g h i)
  const M = [
    [a, d, g],
    [b, e, h],
    [c, f, i],
  ];
  const D = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const R = [
    [(M[1][1] * M[2][2] - M[1][2] * M[2][1]) / D, (M[0][2] * M[2][1] - M[0][1] * M[2][2]) / D, (M[0][1] * M[1][2] - M[0][2] * M[1][1]) / D],
    [(M[1][2] * M[2][0] - M[1][0] * M[2][2]) / D, (M[0][0] * M[2][2] - M[0][2] * M[2][0]) / D, (M[0][2] * M[1][0] - M[0][0] * M[1][2]) / D],
    [(M[1][0] * M[2][1] - M[1][1] * M[2][0]) / D, (M[0][1] * M[2][0] - M[0][0] * M[2][1]) / D, (M[0][0] * M[1][1] - M[0][1] * M[1][0]) / D],
  ];
  return [R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]];
}
const IN_INV = inv3(IN), OUT_INV = inv3(OUT);
const rrt = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const rrtInv = (y: number) => {
  y = Math.min(0.995, Math.max(0, y));
  const A = 0.983729 * y - 1, B = 0.432951 * y - 0.0245786, C = 0.238081 * y + 0.000090537;
  return (-B - Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A);
};

/** ACES filmic tone mapping of a linear colour (as three.js does it). */
export function aces(rgb: number[], exposure: number) {
  const v = mul(IN, rgb.map((c) => (c * exposure) / 0.6));
  return mul(OUT, v.map(rrt)).map((c) => Math.min(1, Math.max(0, c)));
}
/** The linear colour that tone-maps to `rgb` (linear, display-referred) at this exposure. */
export function acesInverse(rgb: number[], exposure: number) {
  const v = mul(OUT_INV, rgb).map(rrtInv);
  return mul(IN_INV, v).map((c) => (Math.max(0, c) * 0.6) / exposure);
}

const glMat = (m: number[]) => `mat3(${m.map((v) => v.toFixed(6)).join(", ")})`;
/** three.js's ACESFilmicToneMapping (the BakingLab fit), its exact inverse, and the sRGB curve. */
export const TONE_GLSL = /* glsl */ `
vec3 sqRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 sqRRTInv(vec3 y) {
  y = clamp(y, 0.0, 0.995);
  vec3 A = 0.983729 * y - 1.0, B = 0.432951 * y - 0.0245786, C = 0.238081 * y + 0.000090537;
  return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
}
vec3 sqACES(vec3 c, float exposure) { return clamp(${glMat(OUT)} * sqRRT(${glMat(IN)} * (c * exposure / 0.6)), 0.0, 1.0); }
vec3 sqACESInv(vec3 c, float exposure) { return max(${glMat(IN_INV)} * sqRRTInv(${glMat(OUT_INV)} * c), 0.0) * 0.6 / exposure; }
vec3 sqToSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;

/** Shared with every display-referred material; the engine sets them each frame. `mirror`: screen-space reflections are on. */
export const DISPLAY = { post: { value: 0 }, exposure: { value: 1 }, mirror: { value: 0 } };

/**
 * Mark how mirror-like an opaque surface is, for screen-space reflections (graphics/post.ts):
 * `expr` — a GLSL float 0…1 that may use the material's own variables (so the street's
 * puddles can say "here") — leaves in the HDR target's alpha as 1 − m. Surfaces that aren't
 * marked stay at alpha 1: no reflection traced for them.
 */
/** How mirror-like car paint is: the lacquer shows the street in it. */
export const PAINT_MIRROR = "0.32";
export function mirrored<T extends THREE.Material>(mat: T, expr: string): T {
  return patchShader(mat, `mirror:${expr}`, (sh) => {
    sh.uniforms.sqMirrorOn = DISPLAY.mirror;
    let f = after(sh.fragmentShader, "common", "uniform float sqMirrorOn;");
    f = after(f, "dithering_fragment", `if (sqMirrorOn > 0.5) gl_FragColor.a = 1.0 - clamp(${expr}, 0.0, 0.97);`);
    sh.fragmentShader = f;
  });
}

/**
 * For a material whose output is meant as the final screen colour, not light (the night
 * sky's gradient, the mountains drawn in the fog's colour): under the HDR pipeline it
 * outputs the light that tone-maps back to that colour. `encoded`: the shader writes
 * sRGB-encoded values (a raw ShaderMaterial), not linear ones.
 */
export function displayReferred<T extends THREE.Material>(mat: T, encoded = false): T {
  return patchShader(mat, `display${encoded ? "-srgb" : ""}`, (sh) => {
    sh.uniforms.sqPost = DISPLAY.post;
    sh.uniforms.sqExposure = DISPLAY.exposure;
    if (!sh.fragmentShader.includes("void main()")) throw new Error("shader anchor missing: void main()");
    const decode = encoded ? "c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));" : "";
    sh.fragmentShader =
      sh.fragmentShader.replace("void main()", `uniform float sqPost; uniform float sqExposure;\n${TONE_GLSL}\nvoid sqMain()`) +
      `\nvoid main() { sqMain(); if (sqPost > 0.5) { vec3 c = clamp(gl_FragColor.rgb, 0.0, 1.0); ${decode} gl_FragColor.rgb = sqACESInv(c, sqExposure); } }\n`;
  });
}
