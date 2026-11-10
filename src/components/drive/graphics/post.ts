"use client";
// The HDR pipeline. The city renders once into a half-float target (4× MSAA on high and
// ultra, with a depth texture when something needs it); then, mostly at reduced resolution:
//  - screen-space ambient occlusion from that depth (normals rebuilt from it, so no second
//    scene pass) with a depth-aware blur;
//  - the film look (high and ultra, `cinematic`): camera motion blur — every pixel is put
//    back where it was a frame ago from its depth and the two cameras, and smeared along
//    the way, except what's nearer than the player's car — and the sun's shafts: the sky
//    around the sun, smeared outwards from it at ¼ size, so they pour through the gaps in
//    the skyline;
//  - screen-space reflections (`ssr`: half size on high, full on ultra): surfaces say how
//    mirror-like they are in the target's alpha (shaders.ts `mirrored` — wet asphalt, puddles,
//    car paint); for those a ray is marched along the reflection through the depth buffer and
//    what it hits is laid over the surface. A ray that leaves the screen or passes behind
//    something leaves the surface as drawn: reflecting the sky's environment map;
//  - a dual-filter bloom chain;
//  - one last pass that adds them up, sharpens, fringes the corners (chromatic aberration),
//    adds a lens flare while the sun is in view, tone-maps (three.js's ACES, so it matches
//    the direct path), grades (white balance, split toning, an optional 3D LUT), vignettes
//    and grains;
//  - on the light pipeline (medium: no MSAA, bloom from ¼ size) FXAA on the finished frame.
// About ten cheap full-screen passes, most at ¼ size or less.
import * as THREE from "three";
import { TONE_GLSL } from "./shaders";

/** Look of the final image; the environment updates it with the time of day and weather, the drive with speed and camera. */
export type Grade = {
  bloom: number;
  /** Bloom starts at this scene brightness (linear, before exposure). */
  threshold: number;
  ao: number;
  saturation: number;
  contrast: number;
  /** White balance: per-channel gain before tone mapping. */
  tint: THREE.Color;
  /** Raised blacks (display space). */
  lift: number;
  vignette: number;
  /** Sharpening of the finished frame, 0 = none (lib/view.ts `sharpenFor`: more when drawn below the screen's resolution). */
  sharpen: number;
  // -- the film look (profile.cinematic)
  /** Camera motion blur: the shutter, 0 = none … 1 = open for 1/30 s. */
  motionBlur: number;
  /** Nothing nearer than this (m from the camera) is blurred: the player's car stays sharp. */
  sharpNear: number;
  /** Sun shafts, 0 = none. */
  rays: number;
  /** Lens flare while the sun is on screen and not hidden, 0 = none. */
  flare: number;
  /** Towards the sun (world, unit) and its light's colour. */
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  /** Colour fringes towards the corners (0 = none; rises with speed). */
  aberration: number;
  /** Film grain (display space; ~0.03 is fine film, 0 leaves only the anti-banding dither). */
  grain: number;
  /** Split toning, 0 = none … 1: shadows lean to `shadowTint`, highlights to `highTint`. */
  split: number;
  shadowTint: THREE.Color;
  highTint: THREE.Color;
  /** A 3D colour lookup table over the finished picture (engine.setLut), and how much of it. */
  lut: THREE.Data3DTexture | null;
  lutMix: number;
};
export const defaultGrade = (): Grade => ({
  bloom: 0.08, threshold: 1.2, ao: 0.7, saturation: 1.06, contrast: 1.05, tint: new THREE.Color(1, 1, 1), lift: 0.0, vignette: 0.24, sharpen: 0.15,
  motionBlur: 0, sharpNear: 12, rays: 0, flare: 0, sunDir: new THREE.Vector3(0.3, 0.8, 0.5).normalize(), sunColor: new THREE.Color(1, 0.95, 0.85),
  aberration: 0, grain: 0, split: 0, shadowTint: new THREE.Color(0.86, 1.0, 1.06), highTint: new THREE.Color(1.07, 1.0, 0.9), lut: null, lutMix: 1,
});

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAG = /* glsl */ `
uniform highp sampler2D tDepth; uniform mat4 uProj; uniform mat4 uInvProj; uniform vec2 uTexel; uniform float uRadius; uniform float uFadeFar;
varying vec2 vUv;
vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).r; vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
void main() {
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  vec3 p = viewPos(vUv);
  // Normal from the nearer neighbour on each axis, so silhouettes don't smear.
  vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0)), pr = viewPos(vUv + vec2(uTexel.x, 0.0));
  vec3 pd = viewPos(vUv - vec2(0.0, uTexel.y)), pu = viewPos(vUv + vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float a0 = ign * 6.2831853;
  vec3 rv = vec3(cos(a0), sin(a0), 0.0);
  vec3 t = normalize(rv - n * dot(rv, n));
  mat3 tbn = mat3(t, cross(n, t), n);
  float radius = uRadius * (1.0 + -p.z * 0.015);
  float occ = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float fi = (float(i) + 0.5) / float(SAMPLES);
    float r = sqrt(fi), th = float(i) * 2.39996323;
    vec3 k = vec3(cos(th) * r, sin(th) * r, sqrt(max(0.05, 1.0 - fi)));
    vec3 s = p + tbn * k * radius * mix(0.2, 1.0, fi * fi);
    vec4 c = uProj * vec4(s, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, radius / max(abs(p.z - sz), 1e-3));
    occ += step(s.z + 0.03 * radius, sz) * range;
  }
  float ao = 1.0 - occ / float(SAMPLES);
  ao = mix(1.0, ao, 1.0 - smoothstep(uFadeFar * 0.4, uFadeFar, -p.z));
  gl_FragColor = vec4(ao, -p.z, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tAO; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tAO, vUv);
  float z = c.g, sum = c.r, w = 1.0;
  for (int i = -4; i <= 4; i++) {
    if (i == 0) continue;
    vec4 s = texture2D(tAO, vUv + uDir * float(i));
    float wi = exp(-abs(s.g - z) / max(0.04 * z, 0.08)) * (1.0 - abs(float(i)) / 5.0);
    sum += s.r * wi;
    w += wi;
  }
  gl_FragColor = vec4(sum / w, z, 0.0, 1.0);
}`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c = min(c * 0.25, vec3(60.0));
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(soft, br - uThreshold) / max(br, 1e-4), 1.0);
}`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv - uTexel).rgb + texture2D(tSrc, vUv + uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tCur; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + vec2(-uTexel.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(uTexel.x * 2.0, 0.0)).rgb
         + texture2D(tSrc, vUv + vec2(0.0, -uTexel.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, uTexel.y * 2.0)).rgb;
  c += (texture2D(tSrc, vUv + uTexel).rgb + texture2D(tSrc, vUv - uTexel).rgb
      + texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb) * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tCur, vUv).rgb, 1.0);
}`;

/** View-space distance (m, positive) of a depth-buffer value. */
const VIEW_Z = /* glsl */ `float viewZ(float d) { vec4 p = uInvProj * vec4(0.0, 0.0, d * 2.0 - 1.0, 1.0); return -p.z / p.w; }`;

// Camera motion blur. uReproject takes this frame's clip space to last frame's: where the
// pixel was is where it's smeared from. Samples that land on something near (the player's
// car) don't count, so it neither smears nor bleeds into the street behind it.
const MOTION_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform highp sampler2D tDepth; uniform mat4 uReproject; uniform mat4 uInvProj;
uniform float uAmount, uNear, uSeed;
varying vec2 vUv;
${VIEW_Z}
void main() {
  float d = texture2D(tDepth, vUv).r;
  vec3 c = texture2D(tScene, vUv).rgb;
  float k = smoothstep(uNear, uNear * 1.5, viewZ(d));
  vec4 prev = uReproject * vec4(vec3(vUv, d) * 2.0 - 1.0, 1.0);
  vec2 vel = prev.w > 0.0 ? (vUv - (prev.xy / prev.w * 0.5 + 0.5)) * uAmount * k : vec2(0.0);
  float len = length(vel);
  if (len < 0.0007) { gl_FragColor = vec4(c, 1.0); return; }
  vel *= min(1.0, 0.045 / len);
  float jitter = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float w = 1.0;
  for (int i = 0; i < SAMPLES; i++) {
    vec2 uv = vUv + vel * ((float(i) + 0.5 + jitter) / float(SAMPLES) - 0.5);
    float sw = smoothstep(uNear, uNear * 1.5, viewZ(texture2D(tDepth, uv).r));
    c += texture2D(tScene, uv).rgb * sw;
    w += sw;
  }
  gl_FragColor = vec4(c / w, 1.0);
}`;

// Sun shafts, step one: the open sky near the sun (everything else is black).
const RAY_MASK_FRAG = /* glsl */ `
uniform highp sampler2D tDepth; uniform mat4 uInvProj; uniform vec2 uSun; uniform float uAspect, uSkyZ;
varying vec2 vUv;
${VIEW_Z}
void main() {
  float sky = step(uSkyZ, viewZ(texture2D(tDepth, vUv).r));
  float f = max(0.0, 1.0 - length((vUv - uSun) * vec2(uAspect, 1.0)) * 1.25);
  gl_FragColor = vec4(vec3(sky * f * f * f), 1.0);
}`;
// …step two (twice): smeared away from the sun.
const RAY_BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uSun; uniform float uReach;
varying vec2 vUv;
void main() {
  vec2 stp = (uSun - vUv) * uReach / float(SAMPLES);
  vec2 uv = vUv;
  float acc = 0.0, w = 1.0, tot = 0.0;
  for (int i = 0; i < SAMPLES; i++) { acc += texture2D(tSrc, uv).r * w; tot += w; w *= 0.93; uv += stp; }
  gl_FragColor = vec4(vec3(acc / tot), 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO; uniform sampler2D tRays;
uniform float uExposure, uBloom, uAO, uSat, uContrast, uLift, uVignette, uSeed, uSharpen;
uniform float uRays, uFlare, uAspect, uAberration, uGrain, uSplit, uLutMix, uLutSize;
uniform vec3 uTint, uSunColor, uShadowTint, uHighTint; uniform vec2 uTexel, uSun;
#ifdef USE_LUT
uniform highp sampler3D tLut;
#endif
varying vec2 vUv;
${TONE_GLSL}
// HDR → 0…1 and back, so a bright lamp next to a dark wall doesn't decide everything.
vec3 squash(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 unsquash(vec3 c) { return c / max(1.0 - max(c.r, max(c.g, c.b)), 1e-3); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec2 d = vUv - 0.5;
  float edge = dot(d, d) * 2.0;
  if (uSharpen > 0.0) {
    // Sharpen: push each pixel away from its four neighbours' average, but never past the
    // brightest or darkest of them — edges get crisper with no halo around them.
    vec3 m = squash(c);
    vec3 n = squash(texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb), s = squash(texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb);
    vec3 e = squash(texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb), w = squash(texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb);
    vec3 lo = min(m, min(min(n, s), min(e, w))), hi = max(m, max(max(n, s), max(e, w)));
    c = unsquash(clamp(m + (m * 4.0 - n - s - e - w) * uSharpen, lo, hi));
  }
#ifdef USE_CINEMATIC
  if (uAberration > 0.0) {
    // A lens bends red and blue differently, more towards the corners; the middle stays clean.
    vec2 off = d * edge * uAberration * 0.005;
    float k = smoothstep(0.08, 0.5, edge);
    c.r = mix(c.r, texture2D(tScene, vUv - off).r, k);
    c.b = mix(c.b, texture2D(tScene, vUv + off).b, k);
  }
#endif
#ifdef USE_AO
  c *= mix(1.0, texture2D(tAO, vUv).r, uAO);
#endif
#ifdef USE_BLOOM
  c += texture2D(tBloom, vUv).rgb * uBloom;
#endif
#ifdef USE_CINEMATIC
  if (uRays > 0.0) c += uSunColor * texture2D(tRays, vUv).r * uRays * 0.7;
  if (uFlare > 0.0) {
    // How much open sky is round the sun (the shafts' texture, read where the sun is): hidden
    // behind a tower there's no flare. Then a glow at the sun and three ghosts on the line
    // through the middle of the picture.
    float seen = texture2D(tRays, clamp(uSun, 0.02, 0.98)).r;
    vec2 a = vec2(uAspect, 1.0), axis = vec2(0.5) - uSun;
    float glow = exp(-dot((vUv - uSun) * a, (vUv - uSun) * a) * 45.0);
    vec3 f = uSunColor * glow * 0.4;
    f += vec3(0.5, 0.8, 1.0) * smoothstep(0.075, 0.03, length((vUv - (uSun + axis * 0.62)) * a)) * 0.12;
    f += vec3(1.0, 0.7, 0.4) * smoothstep(0.13, 0.09, length((vUv - (uSun + axis * 1.35)) * a)) * 0.07;
    f += vec3(0.6, 1.0, 0.7) * smoothstep(0.045, 0.01, length((vUv - (uSun + axis * 1.75)) * a)) * 0.14;
    c += f * uFlare * seen * seen;
  }
#endif
  c *= uTint;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSat), 0.0);
  vec3 s = sqToSRGB(sqACES(c, uExposure));
  s = clamp((s - 0.5) * uContrast + 0.5, 0.0, 1.0);
  s = s + uLift * (1.0 - s);
#ifdef USE_CINEMATIC
  if (uSplit > 0.0) {
    // Split toning: the dark end leans one way, the bright end the other, the middle is left alone.
    float y = dot(s, vec3(0.2126, 0.7152, 0.0722));
    float lo = (1.0 - y) * (1.0 - y), hi = y * y;
    s = clamp(s * mix(vec3(1.0), uShadowTint, lo * uSplit) * mix(vec3(1.0), uHighTint, hi * uSplit), 0.0, 1.0);
  }
#endif
#ifdef USE_LUT
  s = mix(s, texture(tLut, s * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize).rgb, uLutMix);
#endif
  s *= 1.0 - uVignette * smoothstep(0.1, 0.55, edge);
  // Grain (and with none, a dither): no banding in the sky's long gradients; less on the bright end, as on film.
  float noise = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  s += noise * (1.0 / 255.0 + uGrain * (1.0 - 0.6 * dot(s, vec3(0.3333))));
  gl_FragColor = vec4(s, 1.0);
}`;

// Screen-space reflections, step one: for every mirror-like pixel (alpha < 1) march the
// reflected ray through the depth buffer in growing steps, refine where it first goes behind
// something, and write what's there — premultiplied by how sure the hit is (fading at the
// screen's edges and for rays coming back at the camera) and how strongly this surface
// mirrors at this angle (Fresnel: a wet road is a mirror at a glancing angle, hardly looking down).
const SSR_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform highp sampler2D tDepth; uniform mat4 uProj; uniform mat4 uInvProj; uniform vec2 uTexel; uniform float uSeed;
varying vec2 vUv;
vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).r; vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = 1.0 - texture2D(tScene, vUv).a;
  if (m < 0.03) { gl_FragColor = vec4(0.0); return; }
  vec3 P = viewPos(vUv);
  vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0)), pr = viewPos(vUv + vec2(uTexel.x, 0.0));
  vec3 pd = viewPos(vUv - vec2(0.0, uTexel.y)), pu = viewPos(vUv + vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  vec3 V = normalize(P);
  float n1 = hash(gl_FragCoord.xy + uSeed), n2 = hash(gl_FragCoord.yx * 1.37 + uSeed);
  // A rougher surface scatters its reflection: the ray is nudged, the blur afterwards does the rest.
  vec3 R = normalize(reflect(V, N) + (vec3(n1, n2, n1 * n2 * 2.0) - 0.5) * (1.0 - m) * 0.025);
  float away = smoothstep(0.3, 0.0, R.z);
  if (away <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float stepLen = max(0.12, -P.z * 0.025), t = stepLen * (0.8 + 0.4 * n1), tPrev = 0.0, hit = 0.0;
  vec2 hitUv = vUv;
  for (int i = 0; i < STEPS; i++) {
    vec3 q = P + R * t;
    vec4 c = uProj * vec4(q, 1.0);
    if (c.w <= 0.0) break;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float behind = viewPos(uv).z - q.z;
    if (behind > 0.0) {
      // Behind something — if only just, that's what the ray hit; if far behind, it went
      // past the back of something we can't see the far side of: no answer.
      if (behind < stepLen * 1.5 + 0.6) {
        hit = 1.0;
        hitUv = uv;
        float lo = tPrev, hi = t;
        for (int j = 0; j < 4; j++) {
          float mid = (lo + hi) * 0.5;
          vec3 qm = P + R * mid;
          vec4 cm = uProj * vec4(qm, 1.0);
          vec2 um = cm.xy / cm.w * 0.5 + 0.5;
          if (viewPos(um).z - qm.z > 0.0) { hi = mid; hitUv = um; } else lo = mid;
        }
      }
      break;
    }
    tPrev = t;
    stepLen *= 1.2;
    t += stepLen;
  }
  vec2 e = abs(hitUv - 0.5) * 2.0;
  float fres = mix(0.22, 1.0, pow(1.0 - max(dot(-V, N), 0.0), 3.0));
  float a = hit * (1.0 - smoothstep(0.82, 1.0, max(e.x, e.y))) * away * fres * min(1.0, m * 1.35);
  gl_FragColor = vec4(min(texture2D(tScene, hitUv).rgb, vec3(24.0)) * a, a);
}`;
// …step two: laid over the scene, a little blurred (more for a duller mirror).
const SSR_MIX_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tRefl; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec4 s = texture2D(tScene, vUv);
  if (s.a > 0.975) { gl_FragColor = vec4(s.rgb, 1.0); return; }
  // A 3×3 tent, wider for a duller mirror.
  vec2 o = uTexel * (0.7 + 1.6 * s.a);
  vec4 r = texture2D(tRefl, vUv) * 0.25
    + (texture2D(tRefl, vUv + vec2(o.x, 0.0)) + texture2D(tRefl, vUv - vec2(o.x, 0.0)) + texture2D(tRefl, vUv + vec2(0.0, o.y)) + texture2D(tRefl, vUv - vec2(0.0, o.y))) * 0.125
    + (texture2D(tRefl, vUv + o) + texture2D(tRefl, vUv - o) + texture2D(tRefl, vUv + vec2(o.x, -o.y)) + texture2D(tRefl, vUv - vec2(o.x, -o.y))) * 0.0625;
  gl_FragColor = vec4(s.rgb * (1.0 - r.a) + r.rgb, 1.0);
}`;

// FXAA (Lottes' fast approximate anti-aliasing, the short form): find the edge from the
// corners' brightness and blend along it. Works on the finished, display-space frame.
const FXAA_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 m = texture2D(tSrc, vUv).rgb;
  float lM = luma(m);
  float lNW = luma(texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb), lNE = luma(texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb);
  float lSW = luma(texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb), lSE = luma(texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(m, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
  float lB = luma(b);
  gl_FragColor = vec4(lB < lMin || lB > lMax ? a : b, 1.0);
}`;

const pass = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) =>
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });

const BLOOM_MIPS = 5;

export type PostOptions = { msaa: number; bloom: boolean; ao: boolean; cinematic: boolean; fxaa: boolean; bloomDiv: number; ssr: 0 | 1 | 2 };

/** Further than this (m) is sky to the sun shafts (the city ends in fog well before). */
const SKY_Z = 1500;

export class PostPipeline {
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private hdr: THREE.WebGLRenderTarget;
  private aoA: THREE.WebGLRenderTarget | null = null;
  private aoB: THREE.WebGLRenderTarget | null = null;
  private motion: THREE.WebGLRenderTarget | null = null;
  private rayA: THREE.WebGLRenderTarget | null = null;
  private rayB: THREE.WebGLRenderTarget | null = null;
  private ldr: THREE.WebGLRenderTarget | null = null;
  private refl: THREE.WebGLRenderTarget | null = null;
  private lit: THREE.WebGLRenderTarget | null = null;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private final: THREE.ShaderMaterial;
  private aoMat: THREE.ShaderMaterial;
  private blurMat = pass(BLUR_FRAG, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
  private preMat = pass(PREFILTER_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
  private downMat = pass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private upMat = pass(UP_FRAG, { tSrc: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private motionMat = pass(MOTION_FRAG, { tScene: { value: null }, tDepth: { value: null }, uReproject: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uAmount: { value: 0 }, uNear: { value: 10 }, uSeed: { value: 0 } }, { SAMPLES: 8 });
  private rayMaskMat = pass(RAY_MASK_FRAG, { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uSkyZ: { value: SKY_Z } });
  private rayBlurMat = pass(RAY_BLUR_FRAG, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uReach: { value: 0.5 } }, { SAMPLES: 14 });
  private ssrMat = pass(SSR_FRAG, { tScene: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uSeed: { value: 0 } }, { STEPS: 22 });
  private ssrMixMat = pass(SSR_MIX_FRAG, { tScene: { value: null }, tRefl: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private fxaaMat = pass(FXAA_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private size = new THREE.Vector2();
  private opts: PostOptions;
  // Last frame's camera, for motion blur (and to tell a cut from a move).
  private viewProj = new THREE.Matrix4();
  private prevViewProj = new THREE.Matrix4();
  private prevPos = new THREE.Vector3();
  private prevFwd = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private sunClip = new THREE.Vector4();
  private lastAt = 0;
  private fresh = true;
  private lut = false;

  constructor(private renderer: THREE.WebGLRenderer, opts: PostOptions) {
    this.opts = { ...opts };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.hdr = this.makeHdr(1, 1);
    this.aoMat = pass(AO_FRAG, { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.4 }, uFadeFar: { value: 220 } }, { SAMPLES: 12 });
    this.final = pass(FINAL_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, tRays: { value: null }, tLut: { value: null },
      uExposure: { value: 1 }, uBloom: { value: 0 }, uAO: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: 0 }, uVignette: { value: 0 }, uSeed: { value: 0 }, uSharpen: { value: 0 },
      uRays: { value: 0 }, uFlare: { value: 0 }, uAspect: { value: 1 }, uAberration: { value: 0 }, uGrain: { value: 0 }, uSplit: { value: 0 }, uLutMix: { value: 1 }, uLutSize: { value: 16 },
      uTexel: { value: new THREE.Vector2() }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uTint: { value: new THREE.Color(1, 1, 1) }, uSunColor: { value: new THREE.Color(1, 1, 1) }, uShadowTint: { value: new THREE.Color(1, 1, 1) }, uHighTint: { value: new THREE.Color(1, 1, 1) },
    });
    this.configure(opts);
  }

  /** Needs the scene's depth as a texture? */
  private get depth() {
    return this.opts.ao || this.opts.cinematic || this.opts.ssr > 0;
  }
  private makeHdr(w: number, h: number) {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.opts.msaa, depthBuffer: true, stencilBuffer: false });
    if (this.depth) t.depthTexture = new THREE.DepthTexture(w, h);
    return t;
  }
  private target(w: number, h: number, type: THREE.TextureDataType = THREE.HalfFloatType) {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }
  private defines() {
    const o = this.opts;
    this.final.defines = { ...(o.bloom ? { USE_BLOOM: "" } : {}), ...(o.ao ? { USE_AO: "" } : {}), ...(o.cinematic ? { USE_CINEMATIC: "" } : {}), ...(this.lut ? { USE_LUT: "" } : {}) };
    this.final.needsUpdate = true;
  }

  /** Turn effects on or off (the adaptive controller strips AO, then the film look, then bloom). */
  configure(opts: PostOptions) {
    const was = this.depth, msaa = this.opts.msaa;
    this.opts = { ...opts };
    this.defines();
    if (was !== this.depth || msaa !== opts.msaa) {
      this.hdr.depthTexture?.dispose();
      this.hdr.dispose();
      this.hdr = this.makeHdr(this.size.x || 1, this.size.y || 1);
    }
    this.fresh = true;
    this.resizeAux();
  }

  setSize(w: number, h: number) {
    if (w === this.size.x && h === this.size.y) return;
    this.size.set(w, h);
    this.hdr.setSize(w, h);
    this.resizeAux();
  }

  private get aux() {
    return [this.aoA, this.aoB, this.motion, this.rayA, this.rayB, this.ldr, this.refl, this.lit, ...this.down, ...this.up];
  }
  private resizeAux() {
    const { x: w, y: h } = this.size;
    if (!w || !h) return;
    for (const t of this.aux) t?.dispose();
    this.aoA = this.aoB = this.motion = this.rayA = this.rayB = this.ldr = this.refl = this.lit = null;
    this.down = [];
    this.up = [];
    const o = this.opts;
    if (o.ao) {
      this.aoA = this.target(w >> 1, h >> 1);
      this.aoB = this.target(w >> 1, h >> 1);
    }
    if (o.cinematic) {
      this.motion = this.target(w, h);
      this.rayA = this.target(w >> 2, h >> 2, THREE.UnsignedByteType);
      this.rayB = this.target(w >> 2, h >> 2, THREE.UnsignedByteType);
    }
    if (o.fxaa) this.ldr = this.target(w, h, THREE.UnsignedByteType);
    if (o.ssr) {
      const half = o.ssr === 1 ? 1 : 0;
      this.refl = this.target(w >> half, h >> half);
      this.lit = this.target(w, h);
    }
    if (o.bloom) {
      // From half size (five steps down) or, on the light pipeline, from a quarter (four).
      const first = o.bloomDiv >= 4 ? 2 : 1, mips = BLOOM_MIPS - (first - 1);
      for (let i = 0; i < mips; i++) {
        this.down.push(this.target(w >> (i + first), h >> (i + first)));
        if (i < mips - 1) this.up.push(this.target(w >> (i + first), h >> (i + first)));
      }
    }
  }

  private draw(mat: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  /** The camera jumped (a new view, a respawn): the next frame has no "where it was" to blur from. */
  cut() {
    this.fresh = true;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, g: Grade) {
    const r = this.renderer, o = this.opts;
    r.getDrawingBufferSize(this.tmp);
    this.setSize(this.tmp.x, this.tmp.y);
    r.setRenderTarget(this.hdr);
    r.render(scene, camera);
    const depth = this.hdr.depthTexture;
    let sceneTex = this.hdr.texture;
    const now = performance.now(), dt = Math.min(0.1, Math.max(0.004, (now - this.lastAt) / 1000));
    this.lastAt = now;

    if (o.ao && this.aoA && this.aoB && depth) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = depth;
      u.uProj.value.copy(camera.projectionMatrix);
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uTexel.value.set(1 / this.aoA.width, 1 / this.aoA.height);
      this.draw(this.aoMat, this.aoA);
      this.blurMat.uniforms.tAO.value = this.aoA.texture;
      this.blurMat.uniforms.uDir.value.set(1 / this.aoA.width, 0);
      this.draw(this.blurMat, this.aoB);
      this.blurMat.uniforms.tAO.value = this.aoB.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / this.aoA.height);
      this.draw(this.blurMat, this.aoA);
    }

    // -- reflections, before anything smears the picture
    if (o.ssr && depth && this.refl && this.lit) {
      const u = this.ssrMat.uniforms;
      u.tScene.value = sceneTex;
      u.tDepth.value = depth;
      u.uProj.value.copy(camera.projectionMatrix);
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uTexel.value.set(1 / this.refl.width, 1 / this.refl.height);
      u.uSeed.value = (u.uSeed.value + 3.77) % 1000;
      this.draw(this.ssrMat, this.refl);
      const m = this.ssrMixMat.uniforms;
      m.tScene.value = sceneTex;
      m.tRefl.value = this.refl.texture;
      m.uTexel.value.set(1 / this.refl.width, 1 / this.refl.height);
      this.draw(this.ssrMixMat, this.lit);
      sceneTex = this.lit.texture;
    }

    // -- the film look: motion blur, then the sun's shafts
    let rays = 0, flare = 0;
    if (o.cinematic && depth) {
      this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      camera.getWorldDirection(this.fwd);
      // A cut, not a move: the camera jumped further or swung wider than driving ever does in a frame.
      const moved = camera.position.distanceTo(this.prevPos);
      if (moved > Math.max(4, 150 * dt) || this.fwd.dot(this.prevFwd) < 0.9) this.fresh = true;
      if (!this.fresh && g.motionBlur > 0.01 && this.motion) {
        const u = this.motionMat.uniforms;
        u.tScene.value = sceneTex;
        u.tDepth.value = depth;
        (u.uReproject.value as THREE.Matrix4).copy(this.viewProj).invert().premultiply(this.prevViewProj);
        u.uInvProj.value.copy(camera.projectionMatrixInverse);
        // The same streak whatever the frame rate: it's the shutter that's fixed (1 = 1/30 s), not the frame.
        u.uAmount.value = g.motionBlur * Math.min(3, 1 / 30 / dt);
        u.uNear.value = g.sharpNear;
        u.uSeed.value = (u.uSeed.value + 7.31) % 1000;
        this.draw(this.motionMat, this.motion);
        sceneTex = this.motion.texture;
      }
      this.prevViewProj.copy(this.viewProj);
      this.prevPos.copy(camera.position);
      this.prevFwd.copy(this.fwd);
      this.fresh = false;

      if ((g.rays > 0.005 || g.flare > 0.005) && this.rayA && this.rayB) {
        // Where the sun is on screen; behind the camera there's nothing to draw, and it fades out past the edges.
        const s = this.sunClip.set(camera.position.x + g.sunDir.x * 1e4, camera.position.y + g.sunDir.y * 1e4, camera.position.z + g.sunDir.z * 1e4, 1).applyMatrix4(this.viewProj);
        if (s.w > 0) {
          const sx = s.x / s.w, sy = s.y / s.w, out = Math.max(Math.abs(sx), Math.abs(sy));
          const fade = 1 - THREE.MathUtils.smoothstep(out, 1, 1.7);
          if (fade > 0) {
            const sun = this.rayMaskMat.uniforms.uSun.value as THREE.Vector2;
            sun.set(sx * 0.5 + 0.5, sy * 0.5 + 0.5);
            const aspect = this.size.x / this.size.y;
            this.rayMaskMat.uniforms.tDepth.value = depth;
            this.rayMaskMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
            this.rayMaskMat.uniforms.uAspect.value = aspect;
            this.draw(this.rayMaskMat, this.rayA);
            const b = this.rayBlurMat.uniforms;
            (b.uSun.value as THREE.Vector2).copy(sun);
            b.tSrc.value = this.rayA.texture;
            b.uReach.value = 0.35;
            this.draw(this.rayBlurMat, this.rayB);
            b.tSrc.value = this.rayB.texture;
            b.uReach.value = 0.6;
            this.draw(this.rayBlurMat, this.rayA);
            rays = g.rays * fade;
            flare = g.flare * fade * (1 - THREE.MathUtils.smoothstep(out, 0.85, 1.15));
            const f = this.final.uniforms;
            (f.uSun.value as THREE.Vector2).copy(sun);
            f.uAspect.value = aspect;
            f.tRays.value = this.rayA.texture;
          }
        }
      }
    }

    if (o.bloom && this.down.length) {
      const d = this.down, up = this.up;
      this.preMat.uniforms.tSrc.value = sceneTex;
      // Four taps a texel apart cover a half-size step; two apart, a quarter-size one.
      const spread = o.bloomDiv >= 4 ? 2 : 1;
      this.preMat.uniforms.uTexel.value.set(spread / this.size.x, spread / this.size.y);
      this.preMat.uniforms.uThreshold.value = g.threshold;
      this.draw(this.preMat, d[0]);
      for (let i = 1; i < d.length; i++) {
        this.downMat.uniforms.tSrc.value = d[i - 1].texture;
        this.downMat.uniforms.uTexel.value.set(0.5 / d[i - 1].width, 0.5 / d[i - 1].height);
        this.draw(this.downMat, d[i]);
      }
      for (let i = up.length - 1; i >= 0; i--) {
        const src = i === up.length - 1 ? d[i + 1] : up[i + 1];
        this.upMat.uniforms.tSrc.value = src.texture;
        this.upMat.uniforms.tCur.value = d[i].texture;
        this.upMat.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        this.draw(this.upMat, up[i]);
      }
    }

    if (!!g.lut !== this.lut) (this.lut = !!g.lut), this.defines();
    const u = this.final.uniforms;
    u.tScene.value = sceneTex;
    u.tBloom.value = this.up[0]?.texture ?? null;
    u.tAO.value = this.aoA?.texture ?? null;
    u.uExposure.value = r.toneMappingExposure;
    u.uBloom.value = g.bloom;
    u.uAO.value = g.ao;
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uLift.value = g.lift;
    u.uVignette.value = g.vignette;
    // FXAA softens what it smooths: it gets a touch more to work against.
    u.uSharpen.value = g.sharpen * (o.fxaa ? 1.3 : 1);
    u.uTexel.value.set(1 / this.hdr.width, 1 / this.hdr.height);
    u.uTint.value.copy(g.tint);
    u.uRays.value = rays;
    u.uFlare.value = flare;
    u.uSunColor.value.copy(g.sunColor);
    u.uAberration.value = g.aberration;
    u.uGrain.value = o.cinematic ? g.grain : 0;
    u.uSplit.value = g.split;
    u.uShadowTint.value.copy(g.shadowTint);
    u.uHighTint.value.copy(g.highTint);
    u.tLut.value = g.lut;
    u.uLutMix.value = g.lutMix;
    u.uLutSize.value = g.lut?.image.width ?? 16;
    u.uSeed.value = (u.uSeed.value + 17.13) % 1000;
    if (o.fxaa && this.ldr) {
      this.draw(this.final, this.ldr);
      this.fxaaMat.uniforms.tSrc.value = this.ldr.texture;
      this.fxaaMat.uniforms.uTexel.value.set(1 / this.ldr.width, 1 / this.ldr.height);
      this.draw(this.fxaaMat, null);
    } else this.draw(this.final, null);
  }
  private tmp = new THREE.Vector2();

  /** GPU memory the pipeline's targets hold (bytes, roughly). */
  bytes() {
    const px = (t: THREE.WebGLRenderTarget | null) => (t ? t.width * t.height : 0);
    let n = px(this.hdr) * 8 * Math.max(1, this.opts.msaa) + px(this.hdr) * 8 + (this.depth ? px(this.hdr) * 4 : 0);
    for (const t of this.aux) n += px(t) * (t?.texture.type === THREE.UnsignedByteType ? 4 : 8);
    return n;
  }

  dispose() {
    this.hdr.depthTexture?.dispose();
    this.hdr.dispose();
    for (const t of this.aux) t?.dispose();
    for (const m of [this.final, this.aoMat, this.blurMat, this.preMat, this.downMat, this.upMat, this.motionMat, this.rayMaskMat, this.rayBlurMat, this.fxaaMat, this.ssrMat, this.ssrMixMat]) m.dispose();
    this.quad.geometry.dispose();
  }
}
