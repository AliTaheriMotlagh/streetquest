"use client";
// A patrol car's paint job, laid over a street model's own paint: white bodywork, a green
// band that starts thin behind the front wheel and sweeps up over the rear quarter to the
// boot, «پلیس» in white on the band, a gold roundel on the front door and POLICE in green
// across the bonnet. The models carry no texture coordinates (they're painted per copy,
// by instance colour), so the livery is drawn by where each bit of bodywork is in the
// car's own frame: the band is a curve worked out in the shader (sharp at any distance),
// the two words come from one small canvas. A burnt-out car (painted near black) loses it.
import * as THREE from "three";

/** Body white and the band's green (sRGB). */
export const POLICE_WHITE = "#f2f4f0";
export const POLICE_GREEN = "#1d7d4f";

let words: THREE.CanvasTexture | null = null;
/** POLICE (left half, green) and «پلیس» (right half, white), on clear. */
function wordsTexture() {
  if (words) return words;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = POLICE_GREEN;
  g.font = "italic 900 104px 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  g.fillText("POLICE", 256, 68, 480);
  g.fillStyle = "#ffffff";
  g.font = "900 108px Vazirmatn, 'Geeza Pro', Tahoma, Arial, sans-serif";
  g.fillText("پلیس", 768, 62, 440);
  words = new THREE.CanvasTexture(c);
  words.colorSpace = THREE.SRGBColorSpace;
  words.anisotropy = 4;
  return words;
}

/**
 * The band, as the shader draws it: its middle and half-height at `u` along the car's side
 * (0 the nose … 1 the tail), in fractions of the car's height. Exported for the tests —
 * the GLSL below is the same arithmetic.
 */
export function policeBand(u: number) {
  const ss = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return { mid: 0.4 + 0.3 * ss(0.5, 0.96, u), half: 0.028 + 0.085 * ss(0.14, 0.86, u), from: 0.1 };
}

/**
 * A copy of a fleet paint material that wears the police livery. `dims`: the model's
 * outside size (the livery is laid out in fractions of it).
 */
export function policePaint(base: THREE.Material, dims: { len: number; wid: number; hgt: number }): THREE.Material {
  const mat = base.clone();
  const uniforms = { livWords: { value: wordsTexture() }, livDims: { value: new THREE.Vector3(dims.wid, dims.hgt, dims.len) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLivP;\nvarying vec3 vLivN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLivP = position;\nvLivN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLivP;\nvarying vec3 vLivN;\nuniform sampler2D livWords;\nuniform vec3 livDims;")
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        // Not on a burnt-out shell.
        if (dot(diffuseColor.rgb, vec3(0.333)) > 0.2) {
          vec3 livN = abs(normalize(vLivN));
          vec3 livGreen = vec3(0.012, 0.205, 0.078);
          float u = vLivP.z / livDims.z + 0.5; // nose 0 … tail 1
          float v = vLivP.y / livDims.y;
          if (livN.x > 0.5 && livN.x > livN.y) {
            // The sides: the band, thin behind the front wheel, sweeping up to the boot.
            float mid = 0.4 + 0.3 * smoothstep(0.5, 0.96, u);
            float half_ = 0.028 + 0.085 * smoothstep(0.14, 0.86, u);
            float aa = fwidth(v) * 1.5 + 0.0015;
            float band = (1.0 - smoothstep(half_ - aa, half_ + aa, abs(v - mid))) * smoothstep(0.1, 0.1 + fwidth(u) * 2.0 + 0.004, u);
            // A fine green line under it, the length of the doors.
            float line = (1.0 - smoothstep(0.008, 0.008 + aa, abs(v - (mid - half_ - 0.035)))) * step(0.2, u) * step(u, 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb, livGreen, max(band, line * 0.9));
            // «پلیس» on the band over the rear door, reading the right way on both sides.
            float tu = (u - 0.56) / 0.2;
            if (vLivP.x > 0.0) tu = 1.0 - tu;
            float tv = (v - (mid - half_ * 0.82)) / (half_ * 1.64);
            if (tu > 0.0 && tu < 1.0 && tv > 0.0 && tv < 1.0) {
              vec4 w = texture2D(livWords, vec2(0.5 + tu * 0.5, tv));
              diffuseColor.rgb = mix(diffuseColor.rgb, w.rgb, w.a * band);
            }
            // The roundel on the front door: gold, ringed in green.
            float r = length(vec2((u - 0.4) * livDims.z, (v - 0.52) * livDims.y));
            float ra = fwidth(r) + 0.002;
            diffuseColor.rgb = mix(diffuseColor.rgb, livGreen, 1.0 - smoothstep(0.105, 0.105 + ra, r));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.5, 0.08), 1.0 - smoothstep(0.082, 0.082 + ra, r));
          } else if (livN.y > 0.55 && u > 0.05 && u < 0.26) {
            // POLICE across the bonnet, to be read from in front of the car.
            float tu = 0.5 - vLivP.x / (livDims.x * 0.74);
            float tv = (u - 0.07) / 0.17;
            if (tu > 0.0 && tu < 1.0 && tv > 0.0 && tv < 1.0) {
              vec4 w = texture2D(livWords, vec2(tu * 0.5, tv));
              diffuseColor.rgb = mix(diffuseColor.rgb, w.rgb, w.a);
            }
          }
        }`,
      );
  };
  // Its own program (the patched shader isn't the plain paint's).
  mat.customProgramCacheKey = () => "police-livery";
  return mat;
}
