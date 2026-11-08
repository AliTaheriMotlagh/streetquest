"use client";
// The HDR pipeline for the high and ultra tiers. The city renders once into a half-float
// MSAA target (with a depth texture when AO is on); then, all at reduced resolution:
// screen-space ambient occlusion from that depth (normals rebuilt from it, so no second
// scene pass) with a depth-aware blur, and a dual-filter bloom chain; and one last pass to
// the screen that adds them up, tone-maps (three.js's ACES, so it matches the direct path),
// grades, vignettes and dithers. About ten cheap full-screen passes, most at ¼ size or less.
import * as THREE from "three";
import { TONE_GLSL } from "./shaders";

/** Look of the final image; the environment updates it with the time of day and weather. */
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
};
export const defaultGrade = (): Grade => ({ bloom: 0.08, threshold: 1.2, ao: 0.7, saturation: 1.06, contrast: 1.05, tint: new THREE.Color(1, 1, 1), lift: 0.0, vignette: 0.24 });

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

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO;
uniform float uExposure, uBloom, uAO, uSat, uContrast, uLift, uVignette, uSeed;
uniform vec3 uTint;
varying vec2 vUv;
${TONE_GLSL}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
#ifdef USE_AO
  c *= mix(1.0, texture2D(tAO, vUv).r, uAO);
#endif
#ifdef USE_BLOOM
  c += texture2D(tBloom, vUv).rgb * uBloom;
#endif
  c *= uTint;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSat), 0.0);
  vec3 s = sqToSRGB(sqACES(c, uExposure));
  s = clamp((s - 0.5) * uContrast + 0.5, 0.0, 1.0);
  s = s + uLift * (1.0 - s);
  vec2 d = vUv - 0.5;
  s *= 1.0 - uVignette * smoothstep(0.1, 0.55, dot(d, d) * 2.0);
  // Dither: no banding in the sky's long gradients.
  s += (fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(s, 1.0);
}`;

const pass = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) =>
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });

const BLOOM_MIPS = 5;

export type PostOptions = { msaa: number; bloom: boolean; ao: boolean };

export class PostPipeline {
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private hdr: THREE.WebGLRenderTarget;
  private aoA: THREE.WebGLRenderTarget | null = null;
  private aoB: THREE.WebGLRenderTarget | null = null;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private final: THREE.ShaderMaterial;
  private aoMat: THREE.ShaderMaterial;
  private blurMat = pass(BLUR_FRAG, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
  private preMat = pass(PREFILTER_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
  private downMat = pass(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private upMat = pass(UP_FRAG, { tSrc: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private size = new THREE.Vector2();
  private opts: PostOptions;

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
      tScene: { value: null }, tBloom: { value: null }, tAO: { value: null },
      uExposure: { value: 1 }, uBloom: { value: 0 }, uAO: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: 0 }, uVignette: { value: 0 }, uSeed: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) },
    });
    this.configure(opts);
  }

  private makeHdr(w: number, h: number) {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.opts.msaa, depthBuffer: true, stencilBuffer: false });
    if (this.opts.ao) t.depthTexture = new THREE.DepthTexture(w, h);
    return t;
  }
  private target(w: number, h: number) {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }

  /** Turn effects on or off (the adaptive controller strips AO, then bloom). */
  configure(opts: PostOptions) {
    const rebuild = opts.ao !== this.opts.ao || opts.msaa !== this.opts.msaa;
    this.opts = { ...opts };
    this.final.defines = { ...(opts.bloom ? { USE_BLOOM: "" } : {}), ...(opts.ao ? { USE_AO: "" } : {}) };
    this.final.needsUpdate = true;
    if (rebuild) {
      this.hdr.depthTexture?.dispose();
      this.hdr.dispose();
      this.hdr = this.makeHdr(this.size.x || 1, this.size.y || 1);
    }
    this.resizeAux();
  }

  setSize(w: number, h: number) {
    if (w === this.size.x && h === this.size.y) return;
    this.size.set(w, h);
    this.hdr.setSize(w, h);
    this.resizeAux();
  }

  private resizeAux() {
    const { x: w, y: h } = this.size;
    if (!w || !h) return;
    const free = (t: THREE.WebGLRenderTarget | null) => t?.dispose();
    free(this.aoA);
    free(this.aoB);
    this.aoA = this.aoB = null;
    if (this.opts.ao) {
      this.aoA = this.target(w >> 1, h >> 1);
      this.aoB = this.target(w >> 1, h >> 1);
    }
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    if (this.opts.bloom)
      for (let i = 0; i < BLOOM_MIPS; i++) {
        this.down.push(this.target(w >> (i + 1), h >> (i + 1)));
        if (i < BLOOM_MIPS - 1) this.up.push(this.target(w >> (i + 1), h >> (i + 1)));
      }
  }

  private draw(mat: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, g: Grade) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.tmp);
    this.setSize(this.tmp.x, this.tmp.y);
    r.setRenderTarget(this.hdr);
    r.render(scene, camera);

    if (this.opts.ao && this.aoA && this.aoB && this.hdr.depthTexture) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = this.hdr.depthTexture;
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

    if (this.opts.bloom && this.down.length) {
      const d = this.down, up = this.up;
      this.preMat.uniforms.tSrc.value = this.hdr.texture;
      this.preMat.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
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

    const u = this.final.uniforms;
    u.tScene.value = this.hdr.texture;
    u.tBloom.value = this.up[0]?.texture ?? null;
    u.tAO.value = this.aoA?.texture ?? null;
    u.uExposure.value = r.toneMappingExposure;
    u.uBloom.value = g.bloom;
    u.uAO.value = g.ao;
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uLift.value = g.lift;
    u.uVignette.value = g.vignette;
    u.uTint.value.copy(g.tint);
    u.uSeed.value = (u.uSeed.value + 17.13) % 1000;
    this.draw(this.final, null);
  }
  private tmp = new THREE.Vector2();

  /** GPU memory the pipeline's targets hold (bytes, roughly). */
  bytes() {
    const px = (t: THREE.WebGLRenderTarget | null) => (t ? t.width * t.height : 0);
    let n = px(this.hdr) * 8 * Math.max(1, this.opts.msaa) + px(this.hdr) * 8 + (this.opts.ao ? px(this.hdr) * 4 : 0);
    for (const t of [this.aoA, this.aoB, ...this.down, ...this.up]) n += px(t) * 8;
    return n;
  }

  dispose() {
    this.hdr.depthTexture?.dispose();
    this.hdr.dispose();
    for (const t of [this.aoA, this.aoB, ...this.down, ...this.up]) t?.dispose();
    for (const m of [this.final, this.aoMat, this.blurMat, this.preMat, this.downMat, this.upMat]) m.dispose();
    this.quad.geometry.dispose();
  }
}
