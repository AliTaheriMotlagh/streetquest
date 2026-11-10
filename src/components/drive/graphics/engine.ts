"use client";
// The 3D city's renderer, owned in one place: picks the quality tier for the device (or the
// player's choice), creates the WebGL renderer for it (canvas MSAA when drawing straight
// to the screen, none when the HDR pipeline does its own), keeps the frame rate up with
// dynamic resolution and — on "auto" — by stripping effects, keeps the sun's shadow map
// stable and aimed where the camera looks, and survives a lost GPU context.
import * as THREE from "three";
import { demote, demoted, qualityPick, readCaps, tierFor } from "./caps";
import { defaultGrade, PostPipeline, type Grade } from "./post";
import { Adaptive, effective, MAX_LEVEL, withCaps, type Profile, type QualityPick, type Tier } from "./quality";
import { acesInverse, DISPLAY } from "./shaders";
import { sharpenFor } from "@/lib/view";

export type GfxStats = { tier: Tier; pick: QualityPick; level: number; dpr: number; fps: number; frameMs: number; calls: number; triangles: number; textures: number; geometries: number; targetsMB: number; lost: boolean };

export class GraphicsEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly pick: QualityPick;
  readonly tier: Tier;
  profile: Profile;
  readonly grade: Grade = defaultGrade();
  private adaptive: Adaptive;
  private post: PostPipeline | null = null;
  private listeners = new Set<(p: Profile) => void>();
  private lastFrame = 0;
  private frames = 0;
  private fpsAt = 0;
  private fpsNow = 60;
  private frameMs = 16.7;
  private worstSince = 0;
  private demotedNow = false;
  private lost = false;
  private onLost = (e: Event) => {
    e.preventDefault(); // lets the browser restore the context
    this.lost = true;
    // Losing the GPU usually means memory pressure: "auto" starts a step lower next time.
    if (this.pick === "auto" && !this.demotedNow) (demote(), (this.demotedNow = true));
  };
  private onRestored = () => {
    this.lost = false;
    this.post?.dispose();
    this.post = this.profile.post ? new PostPipeline(this.renderer, this.postOpts()) : null;
  };

  /** The cartoon city keeps its flat colours: always drawn straight to the screen, never through the HDR pipeline. */
  private direct: boolean;

  constructor(el: HTMLElement, opts: { lite: boolean; direct?: boolean }) {
    this.pick = opts.lite ? "low" : qualityPick();
    this.tier = this.pick === "low" ? "low" : tierFor(this.pick);
    this.direct = !!opts.direct;
    this.profile = this.make(0);
    const p = this.profile;
    this.renderer = new THREE.WebGLRenderer({ antialias: !p.post && p.tier !== "low", powerPreference: "high-performance", stencil: false });
    this.adaptive = new Adaptive(
      { maxDpr: Math.min(window.devicePixelRatio || 1, p.maxDpr), minDpr: Math.min(p.minDpr, window.devicePixelRatio || 1) },
      { features: this.pick === "auto" },
    );
    const r = this.renderer;
    r.setPixelRatio(this.adaptive.dpr);
    r.setSize(el.clientWidth, el.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = p.shadows;
    r.shadowMap.type = p.tier === "medium" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    r.info.autoReset = false;
    if (p.post) this.post = new PostPipeline(r, this.postOpts());
    this.grade.sharpen = sharpenFor(this.adaptive.dpr, window.devicePixelRatio || 1);
    r.domElement.addEventListener("webglcontextlost", this.onLost);
    r.domElement.addEventListener("webglcontextrestored", this.onRestored);
    el.appendChild(r.domElement);
    this.lastFrame = this.fpsAt = performance.now();
  }

  private make(level: number) {
    const p = withCaps(effective(this.tier, level), readCaps());
    if (this.direct) (p.post = false), (p.bloom = false), (p.ao = false), (p.fxaa = false), (p.cinematic = false);
    return p;
  }

  private postOpts() {
    const p = this.profile;
    return { msaa: p.msaa, bloom: p.bloom, ao: p.ao, cinematic: p.cinematic, fxaa: p.fxaa, bloomDiv: p.bloomDiv };
  }

  /** Effects or distances changed (adaptive level): re-apply shadows, detail range… */
  onProfile(fn: (p: Profile) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get dpr() {
    return this.adaptive.dpr;
  }
  /** Frames a second over the last second. */
  get fps() {
    return this.fpsNow;
  }
  get hdr() {
    return !!this.post;
  }
  /** The camera jumped (a new view, a respawn): no motion blur across the cut. */
  cut() {
    this.post?.cut();
  }
  /**
   * A 3D colour lookup table over the finished picture (`size`³ RGB values 0…1, red fastest
   * — a .cube file's order; lib/lut.ts reads one), or null for none.
   */
  setLut(lut: { size: number; data: Float32Array } | null) {
    this.grade.lut?.dispose();
    this.grade.lut = null;
    if (!lut) return;
    const n = lut.size, px = new Uint8Array(n * n * n * 4);
    for (let i = 0; i < n * n * n; i++) {
      for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(Math.min(1, Math.max(0, lut.data[i * 3 + c])) * 255);
      px[i * 4 + 3] = 255;
    }
    const t = new THREE.Data3DTexture(px, n, n, n);
    t.format = THREE.RGBAFormat;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    this.grade.lut = t;
  }

  /**
   * A colour meant to show exactly as given on screen (fog, clear colour). Drawing straight to
   * the screen three.js fogs after tone mapping; the HDR pipeline tone-maps everything at the
   * end, so it gets the colour that tone-maps back to this one.
   */
  sceneColor(c: THREE.Color, out = new THREE.Color()) {
    if (!this.post) return out.copy(c);
    const [r, g, b] = acesInverse([c.r, c.g, c.b], this.renderer.toneMappingExposure);
    return out.setRGB(r, g, b);
  }

  /** Point the sun's shadow box at what the camera sees, snapped to whole shadow texels so it doesn't shimmer as you drive. */
  aimSun(sun: THREE.DirectionalLight, x: number, z: number, fx: number, fz: number, dir: THREE.Vector3) {
    const p = this.profile;
    const R = p.shadowRange;
    const cx = x + fx * R * 0.45, cz = z + fz * R * 0.45;
    const texel = (2 * R) / p.shadowMap;
    const right = this.v1.set(0, 1, 0).cross(dir);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = this.v2.copy(dir).cross(right).normalize();
    const c = this.v3.set(cx, 0, cz);
    const a = Math.round(c.dot(right) / texel) * texel, b = Math.round(c.dot(up) / texel) * texel, d = c.dot(dir);
    c.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(dir, d);
    const dist = 260;
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(dir, dist);
    const cam = sun.shadow.camera;
    if (cam.right !== R || cam.far !== dist + 260) {
      Object.assign(cam, { left: -R, right: R, top: R, bottom: -R, near: 1, far: dist + 260 });
      cam.updateProjectionMatrix();
    }
  }
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();

  /** Set up (or re-set after an adaptive step) the sun's shadow map. */
  shadeSun(sun: THREE.DirectionalLight) {
    const p = this.profile;
    sun.castShadow = p.shadows;
    if (sun.shadow.mapSize.x !== p.shadowMap) {
      sun.shadow.mapSize.set(p.shadowMap, p.shadowMap);
      sun.shadow.map?.dispose();
      (sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    // About seven shadow texels of normal offset (the old fixed 0.6 m at 2048 over ±80 m), so
    // big flat roofs at a low sun don't acne, without lifting shadows off their contacts.
    const texel = (2 * p.shadowRange) / p.shadowMap;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = Math.min(1, Math.max(0.4, texel * 7.5));
  }

  /** Call once per frame before rendering: feeds the frame-rate controller. */
  frame(now: number) {
    const ms = now - this.lastFrame;
    this.lastFrame = now;
    this.frames++;
    if (now - this.fpsAt > 1000) {
      this.fpsNow = (this.frames * 1000) / (now - this.fpsAt);
      this.frameMs = (now - this.fpsAt) / this.frames;
      this.frames = 0;
      this.fpsAt = now;
    }
    const ch = this.adaptive.sample(ms, now);
    if (ch?.kind === "dpr") (this.renderer.setPixelRatio(ch.dpr), (this.grade.sharpen = sharpenFor(ch.dpr, window.devicePixelRatio || 1)));
    else if (ch?.kind === "level") {
      this.profile = this.make(ch.level);
      this.post?.configure(this.postOpts());
      for (const l of this.listeners) l(this.profile);
    }
    // "Auto" still struggling with everything stripped: next visit starts a tier lower.
    if (this.pick === "auto" && this.adaptive.level >= MAX_LEVEL && this.adaptive.dpr <= this.adaptive.profile.minDpr + 1e-6 && this.fpsNow < 30) {
      if (!this.worstSince) this.worstSince = now;
      else if (now - this.worstSince > 20_000 && !this.demotedNow && demoted() < 3) (demote(), (this.demotedNow = true));
    } else this.worstSince = 0;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (this.lost) return;
    this.renderer.info.reset();
    DISPLAY.post.value = this.post ? 1 : 0;
    DISPLAY.exposure.value = this.renderer.toneMappingExposure;
    if (this.post) this.post.render(scene, camera, this.grade);
    else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
  }

  stats(): GfxStats {
    const i = this.renderer.info;
    return {
      tier: this.tier, pick: this.pick, level: this.adaptive.level, dpr: this.adaptive.dpr, fps: Math.round(this.fpsNow), frameMs: +this.frameMs.toFixed(1),
      calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries,
      targetsMB: +((this.post?.bytes() ?? 0) / 1048576).toFixed(1), lost: this.lost,
    };
  }

  dispose() {
    this.listeners.clear();
    this.grade.lut?.dispose();
    this.post?.dispose();
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onRestored);
    DISPLAY.post.value = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
