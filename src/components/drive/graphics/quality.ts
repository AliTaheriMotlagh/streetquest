// Graphics quality for the 3D city: four tiers, how a device is placed in one from what
// its GPU reports, and the adaptive controller that trades resolution, then effects,
// then shadows for a steady frame rate. Pure (no three.js, no DOM) — tests drive it.

export type Tier = "low" | "medium" | "high" | "ultra";
export const TIERS: Tier[] = ["low", "medium", "high", "ultra"];
/** "auto": detect the tier, then adapt it to the measured frame rate. */
export type QualityPick = "auto" | Tier;
export const QUALITY_PICKS: QualityPick[] = ["auto", "ultra", "high", "medium", "low"];

export type Profile = {
  tier: Tier;
  /** Cap on the device pixel ratio. */
  maxDpr: number;
  /** Dynamic resolution never drops below this pixel ratio. */
  minDpr: number;
  /** HDR pipeline: MSAA target, bloom, AO, colour grading. Off: straight to the screen. */
  post: boolean;
  /** MSAA samples in the HDR target (post) — otherwise the canvas's own antialiasing. */
  msaa: number;
  bloom: boolean;
  /** Bloom starts at this fraction of the picture: 2 = half size, 4 = a quarter (the light pipeline). */
  bloomDiv: number;
  /** FXAA on the finished frame — the light pipeline's anti-aliasing (it has no MSAA target). */
  fxaa: boolean;
  /** The film look: motion blur, sun shafts and lens flare, chromatic aberration, grain, split-tone grade. */
  cinematic: boolean;
  /** Height fog with the sun glowing in it, and heat shimmer over far tarmac (a depth-based pass). */
  haze: boolean;
  /** Real lights at night — street lamps, headlights, brake lamps — spent from one pool (lib/lightBudget.ts). 0 = none (glow textures only). */
  nightLights: number;
  /** My own headlights cast shadows (ultra: the street's furniture throws them across the road). */
  headlightShadow: boolean;
  /** Screen-space reflections on wet streets and car paint: 0 none (the sky's environment map only), 1 traced at half size, 2 at full size. */
  ssr: 0 | 1 | 2;
  /** Screen-space ambient occlusion (contact shadows at kerbs, walls, under cars). */
  ao: boolean;
  shadows: boolean;
  shadowMap: number;
  /** Half-size of the sun's shadow box (m). */
  shadowRange: number;
  /** Street furniture and trees within this distance (m). */
  detailM: number;
  /** The fog never ends further than this (m): also the draw distance for the city. */
  fogFar: number;
  /** Normal/roughness maps on asphalt, pavements and façades; reflective windows. */
  surfaces: boolean;
  /** The cloud layer in the realistic sky. */
  clouds: boolean;
  /** Clear-coated car paint (MeshPhysicalMaterial). */
  clearcoat: boolean;
  /** Night light pools under street lamps. */
  lampPools: boolean;
  /** Trees sway in the wind. */
  wind: boolean;
  anisotropy: number;
  /** Rain streaks drawn around the camera. */
  rainDrops: number;
};

export const PROFILES: Record<Tier, Profile> = {
  low: { tier: "low", maxDpr: 1, minDpr: 0.6, post: false, msaa: 0, bloom: false, ao: false, shadows: false, shadowMap: 1024, shadowRange: 60, detailM: 190, fogFar: 650, surfaces: false, clouds: false, clearcoat: false, lampPools: false, wind: false, anisotropy: 1, rainDrops: 700, bloomDiv: 4, fxaa: false, cinematic: false, ssr: 0, nightLights: 0, headlightShadow: false, haze: false },
  medium: { tier: "medium", maxDpr: 1.5, minDpr: 0.7, post: true, msaa: 0, bloom: true, ao: false, shadows: true, shadowMap: 1024, shadowRange: 70, detailM: 260, fogFar: 900, surfaces: true, clouds: false, clearcoat: false, lampPools: true, wind: true, anisotropy: 4, rainDrops: 1600, bloomDiv: 4, fxaa: true, cinematic: false, ssr: 0, nightLights: 0, headlightShadow: false, haze: false },
  high: { tier: "high", maxDpr: 1.75, minDpr: 0.8, post: true, msaa: 4, bloom: true, ao: false, shadows: true, shadowMap: 2048, shadowRange: 90, detailM: 320, fogFar: 1100, surfaces: true, clouds: true, clearcoat: true, lampPools: true, wind: true, anisotropy: 8, rainDrops: 3200, bloomDiv: 2, fxaa: false, cinematic: true, ssr: 1, nightLights: 4, headlightShadow: false, haze: true },
  ultra: { tier: "ultra", maxDpr: 2, minDpr: 0.9, post: true, msaa: 4, bloom: true, ao: true, shadows: true, shadowMap: 4096, shadowRange: 120, detailM: 400, fogFar: 1300, surfaces: true, clouds: true, clearcoat: true, lampPools: true, wind: true, anisotropy: 16, rainDrops: 5200, bloomDiv: 2, fxaa: false, cinematic: true, ssr: 2, nightLights: 8, headlightShadow: true, haze: true },
};

/** What the GPU and browser report (graphics/caps.ts reads it). */
export type Caps = {
  /** Unmasked GPU name, lower-cased ("" if hidden). */
  gpu: string;
  mobile: boolean;
  maxTexture: number;
  /** Half-float colour buffers can be rendered to (needed for the HDR pipeline). */
  floatTargets: boolean;
  /** RAM in GB (Chrome only) and logical cores, when the browser says. */
  memoryGB: number | null;
  cores: number | null;
  /** Physical pixels on the screen (width × height × dpr²). */
  screenPx: number;
  saveData: boolean;
  /** The player (or the 2D map's frame-rate probe) asked for the lite mode. */
  lite: boolean;
};

const step = (t: Tier, by: number): Tier => TIERS[Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(t) + by))];
const cap = (t: Tier, max: Tier): Tier => (TIERS.indexOf(t) > TIERS.indexOf(max) ? max : t);

/** Software rasterisers: everything is slow, keep it minimal. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software/;
/** Phones and tablets whose GPU handles the HDR pipeline at a capped resolution. */
const STRONG_MOBILE = /apple gpu|apple a1[5-9]|apple m\d|adreno.*\b(7[3-9]\d|8\d\d)\b|immortalis|mali-g7[1-9]\d|mali-g6[2-9]\d|xclipse|maleoon/;
/** Old or entry-level mobile GPUs. */
const WEAK_MOBILE = /adreno.*\b([2-5]\d\d|6[0-1]\d)\b|mali-[t4]|mali-g(31|51|52|57|68)\b|powervr|sgx|videocore|vivante/;
/** Desktop GPUs with headroom for AO and big shadow maps. */
const STRONG_DESKTOP = /rtx|gtx (9[6-9]0|1[0-9]{3})|radeon (rx|pro)|arc a\d|apple m\d (pro|max|ultra)|apple m[3-9]/;
/** Integrated laptop GPUs: fine for the HDR pipeline without AO, or less. */
const WEAK_DESKTOP = /intel.*(hd|uhd) graphics|intel.*gma|mesa intel|radeon(\(tm\))? (r[2-7]|hd)|vega [3-8]\b/;

/** The tier a device starts in. `demoted` is how many steps "auto" learned to drop on this device. */
export function detectTier(c: Caps, demoted = 0): Tier {
  let t: Tier;
  if (c.lite || SOFTWARE.test(c.gpu)) t = "low";
  else if (c.mobile) {
    if ((c.memoryGB != null && c.memoryGB <= 3) || (c.cores != null && c.cores <= 4) || WEAK_MOBILE.test(c.gpu)) t = "low";
    else t = STRONG_MOBILE.test(c.gpu) ? "high" : "medium";
  } else if (STRONG_DESKTOP.test(c.gpu)) t = "ultra";
  else if (WEAK_DESKTOP.test(c.gpu)) t = "medium";
  else if (/apple m\d|iris|radeon|nvidia|geforce/.test(c.gpu)) t = "high";
  else t = "high"; // unknown desktop GPU: let the adaptive controller find its level
  if (c.saveData) t = step(t, -1);
  if (c.maxTexture < 4096) t = "low";
  else if (c.maxTexture < 8192) t = cap(t, "medium");
  if (!c.floatTargets) t = cap(t, "medium");
  // A 4K screen on an integrated GPU: one step down, the pixels cost more than the effects.
  if (!c.mobile && c.screenPx > 8_000_000 && !STRONG_DESKTOP.test(c.gpu)) t = step(t, -1);
  return step(t, -Math.max(0, demoted));
}

/** The profile in force: the tier's, with effects stripped by the adaptive `level` (0 = none stripped). */
export function effective(tier: Tier, level: number, base: Profile = PROFILES[tier]): Profile {
  const p = { ...base };
  // Each level gives back one thing, cheapest-to-lose first: the film look and every
  // screen-space extra go before a single shadow does.
  if (level >= 1) (p.ao = false), (p.ssr = Math.min(p.ssr, 1) as 0 | 1), (p.headlightShadow = false);
  if (level >= 2) (p.cinematic = false), (p.ssr = 0), (p.haze = false);
  if (level >= 3) (p.bloom = false), (p.clouds = false);
  if (level >= 3) p.nightLights = p.nightLights >> 1;
  if (level >= 4) (p.nightLights = 0), (p.shadowMap = Math.min(p.shadowMap, 1024)), (p.shadowRange = Math.min(p.shadowRange, 70)), (p.detailM = Math.min(p.detailM, 260));
  if (level >= 5) (p.shadows = false), (p.clearcoat = false), (p.detailM = Math.min(p.detailM, 200)), (p.wind = false), (p.fxaa = false);
  return p;
}
export const MAX_LEVEL = 5;

/**
 * What this device can't do, taken out of a profile: without half-float render targets
 * there is no HDR pipeline at all (the picture goes straight to the screen, as on low).
 */
export function withCaps(p: Profile, c: Pick<Caps, "floatTargets"> & Partial<Pick<Caps, "mobile">>): Profile {
  if (!c.floatTargets) return { ...p, post: false, msaa: 0, bloom: false, ao: false, fxaa: false, cinematic: false, ssr: 0, haze: false };
  // Phones and tablets (tile-based GPUs, 3× screens): past 1.5× the extra pixels and MSAA samples
  // cost frames you feel and detail you don't see on a small screen — the sharpening pass makes up
  // the difference. "Ultra", picked by hand, keeps 2× and 4 samples.
  if (c.mobile && p.tier !== "ultra") return { ...p, maxDpr: Math.min(p.maxDpr, 1.5), minDpr: Math.min(p.minDpr, 1.5), msaa: Math.min(p.msaa, 2) };
  return p;
}

export type Change = { kind: "dpr"; dpr: number } | { kind: "level"; level: number };

/**
 * Keeps the frame rate up. Every window of frames it looks at the median frame time:
 * too slow → lower the resolution a notch, and once at the floor strip effects (only
 * when `features`, i.e. "auto"); plenty of headroom for a while → give them back, effects
 * first. A step that didn't speed things up twice running means the browser caps the
 * frame rate (iOS Low Power Mode, a 30 Hz screen): it stops lowering until things change.
 */
export class Adaptive {
  dpr: number;
  level = 0;
  private times: number[] = [];
  private lastChange = 0;
  private goodWindows = 0;
  private futile = 0;
  private before = 0;
  private held = false;
  /** Lowering the resolution was tried and didn't help, but this isn't a cap: the frame is CPU-bound. */
  private dprUseless = false;

  constructor(
    readonly profile: Pick<Profile, "maxDpr" | "minDpr">,
    readonly opts: { features: boolean; target?: number; window?: number },
  ) {
    this.dpr = profile.maxDpr;
  }

  /** Frame budget in ms (60 fps by default; 30 fps screens never get here thanks to `futile`). */
  private get target() {
    return this.opts.target ?? 1000 / 60;
  }

  /** Feed one frame's duration (ms). Returns what to change, if anything. */
  sample(ms: number, now: number): Change | null {
    if (!(ms > 0) || ms > 250) return null; // a hitch (tab switch, GC) says nothing about the steady state
    this.times.push(ms);
    if (this.times.length < (this.opts.window ?? 60)) return null;
    const sorted = [...this.times].sort((a, b) => a - b);
    this.times.length = 0;
    const median = sorted[sorted.length >> 1];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    // A frame-rate cap (iOS Low Power Mode, a 30 Hz screen) looks like frames sitting tightly on
    // a multiple of the refresh; a busy CPU or GPU wanders around between them.
    const vsyncs = median / (1000 / 60);
    const capped = Math.round(vsyncs) >= 2 && Math.abs(vsyncs - Math.round(vsyncs)) < 0.08 && p90 - p10 < median * 0.12;
    const slow = median > this.target * 1.32; // under ~45 fps
    const fast = p90 < this.target * 1.08; // nearly every frame on time

    if (this.before && now - this.lastChange < 6000) {
      // Judge the last step down: did it help?
      if (median > this.before * 0.95) this.futile++;
      else this.futile = 0;
      this.before = 0;
      if (this.futile >= 2 && !this.held && !this.dprUseless) {
        // Fewer pixels bought nothing: give back the sharpness those steps took. Capped → hold
        // there; otherwise the time goes on work per object (draw calls, the shadow pass, the
        // CPU), so the effects come off next instead of the resolution.
        if (capped || !this.opts.features) this.held = true;
        else (this.dprUseless = true), (this.futile = 0);
        this.lastChange = now;
        const dpr = Math.min(this.profile.maxDpr, +(this.dpr + 0.3).toFixed(2));
        if (dpr !== this.dpr) return { kind: "dpr", dpr: (this.dpr = dpr) };
      }
    }
    if (slow) {
      this.goodWindows = 0;
      if (this.held || now - this.lastChange < 1000) return null;
      let change: Change | null = null;
      if (this.dpr > this.profile.minDpr + 1e-6 && !this.dprUseless) change = { kind: "dpr", dpr: (this.dpr = Math.max(this.profile.minDpr, +(this.dpr - 0.15).toFixed(2))) };
      else if (this.opts.features && this.level < MAX_LEVEL) change = { kind: "level", level: ++this.level };
      // Nothing left to give (a chosen tier at its lowest resolution): no step to judge either.
      if (change) (this.lastChange = now), (this.before = median);
      return change;
    }
    if (!fast) {
      this.goodWindows = 0;
      return null;
    }
    // Headroom: wait a few windows (longer the more often we've had to back off), then climb.
    this.held = false;
    this.futile = 0;
    if (++this.goodWindows < 4 || now - this.lastChange < 4000) return null;
    this.goodWindows = 0;
    this.lastChange = now;
    if (this.level > 0) return { kind: "level", level: --this.level };
    this.dprUseless = false;
    if (this.dpr < this.profile.maxDpr - 1e-6) {
      this.dpr = Math.min(this.profile.maxDpr, +(this.dpr + 0.15).toFixed(2));
      return { kind: "dpr", dpr: this.dpr };
    }
    return null;
  }
}
