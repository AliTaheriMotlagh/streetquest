// Admin-editable graphics (Admin → Graphics), pure. The 3D city's quality tiers live in
// components/drive/graphics/quality.ts (PROFILES); the admin may override any of their
// parameters — for every tier (`all`) or one tier — and scale the film look and haze. The
// result is merged: built-in defaults ← admin overrides ← the player's own choice (their
// quality pick chooses the tier; `user` can pin single parameters on top). Stored in the
// `gfx` setting (settings.ts), so it travels to clients with /api/me like every other one.
import { msg } from "./i18n";
import { PROFILES, TIERS, type Profile, type Tier } from "../components/drive/graphics/quality";

/** The tier parameters the admin can change (every Profile field but the tier's name). */
export type ProfileParams = Omit<Profile, "tier">;
/** The film look and haze: multipliers on what lib/filmLook.ts and lib/atmosphere.ts produce each frame (1 = as built), and the exposure. */
export type Look = {
  exposure: number;
  bloomMult: number;
  aoMult: number;
  saturationMult: number;
  contrastMult: number;
  vignetteMult: number;
  sharpenMult: number;
  motionBlurMult: number;
  raysMult: number;
  flareMult: number;
  aberrationMult: number;
  grainMult: number;
  splitMult: number;
  hazeMult: number;
  hazeScatterMult: number;
  heatMult: number;
  lutMix: number;
};
export type GfxParams = ProfileParams & Look;
export type GfxKey = keyof GfxParams;
export type GfxOverrides = Partial<GfxParams>;
export type GfxConfig = { all?: GfxOverrides; tiers?: Partial<Record<Tier, GfxOverrides>> };

export const LOOK_DEFAULTS: Look = {
  exposure: 1, bloomMult: 1, aoMult: 1, saturationMult: 1, contrastMult: 1, vignetteMult: 1, sharpenMult: 1, motionBlurMult: 1, raysMult: 1, flareMult: 1,
  aberrationMult: 1, grainMult: 1, splitMult: 1, hazeMult: 1, hazeScatterMult: 1, heatMult: 1, lutMix: 1,
};

export type ParamDef =
  | { key: GfxKey; group: string; label: string; type: "number"; min: number; max: number; step: number }
  | { key: GfxKey; group: string; label: string; type: "bool" }
  | { key: GfxKey; group: string; label: string; type: "choice"; options: number[] };

const RES = msg("Resolution"), PIPE = msg("Post-processing"), SHD = msg("Shadows & lights"), WORLD = msg("World & surfaces"), FILM = msg("Film look"), AIR = msg("Haze & grade");
const num = (key: GfxKey, group: string, label: string, min: number, max: number, step: number): ParamDef => ({ key, group, label, type: "number", min, max, step });
const bool = (key: GfxKey, group: string, label: string): ParamDef => ({ key, group, label, type: "bool" });
const choice = (key: GfxKey, group: string, label: string, options: number[]): ParamDef => ({ key, group, label, type: "choice", options });

/** Every parameter, grouped for the panel. Order = the order shown. Tests check it covers every Profile field and Look field. */
export const GFX_PARAMS: ParamDef[] = [
  num("maxDpr", RES, msg("Highest pixel ratio"), 0.5, 3, 0.05),
  num("minDpr", RES, msg("Lowest pixel ratio (adaptive floor)"), 0.3, 2, 0.05),
  num("anisotropy", RES, msg("Texture sharpness at an angle (anisotropy)"), 1, 16, 1),
  bool("post", PIPE, msg("HDR pipeline")),
  choice("msaa", PIPE, msg("MSAA samples"), [0, 2, 4, 8]),
  bool("fxaa", PIPE, msg("FXAA")),
  bool("bloom", PIPE, msg("Bloom")),
  num("bloomDiv", PIPE, msg("Bloom size divisor (2 = half size)"), 1, 8, 1),
  bool("ao", PIPE, msg("Ambient occlusion")),
  choice("ssr", PIPE, msg("Screen-space reflections (0 off, 1 half size, 2 full)"), [0, 1, 2]),
  bool("cinematic", PIPE, msg("Film look (motion blur, sun shafts, flare, grain)")),
  bool("haze", PIPE, msg("Depth haze and heat shimmer")),
  bool("shadows", SHD, msg("Sun shadows")),
  choice("shadowMap", SHD, msg("Shadow map size"), [512, 1024, 2048, 4096]),
  num("shadowRange", SHD, msg("Shadow reach (m)"), 20, 300, 5),
  num("nightLights", SHD, msg("Real night lights (pool size)"), 0, 16, 1),
  bool("headlightShadow", SHD, msg("Headlights cast shadows")),
  bool("lampPools", SHD, msg("Light pools under street lamps")),
  num("detailM", WORLD, msg("Street furniture and trees within (m)"), 50, 1000, 10),
  num("fogFar", WORLD, msg("Draw distance (m)"), 200, 3000, 50),
  bool("surfaces", WORLD, msg("Surface textures and reflective windows")),
  bool("clouds", WORLD, msg("Clouds")),
  bool("clearcoat", WORLD, msg("Clear-coated car paint")),
  bool("wind", WORLD, msg("Trees sway in the wind")),
  num("rainDrops", WORLD, msg("Rain streaks"), 0, 10000, 100),
  num("exposure", AIR, msg("Exposure"), 0.4, 2.5, 0.05),
  num("saturationMult", AIR, msg("Saturation (× built-in)"), 0, 2, 0.05),
  num("contrastMult", AIR, msg("Contrast (× built-in)"), 0.5, 1.5, 0.05),
  num("vignetteMult", AIR, msg("Vignette (× built-in)"), 0, 3, 0.1),
  num("sharpenMult", AIR, msg("Sharpening (× built-in)"), 0, 3, 0.1),
  num("bloomMult", AIR, msg("Bloom strength (× built-in)"), 0, 4, 0.1),
  num("aoMult", AIR, msg("Occlusion strength (× built-in)"), 0, 2, 0.1),
  num("hazeMult", AIR, msg("Haze thickness (× built-in)"), 0, 4, 0.1),
  num("hazeScatterMult", AIR, msg("Sun glow in the haze (× built-in)"), 0, 3, 0.1),
  num("heatMult", AIR, msg("Heat shimmer (× built-in)"), 0, 3, 0.1),
  num("lutMix", AIR, msg("Colour LUT strength"), 0, 1, 0.05),
  num("motionBlurMult", FILM, msg("Motion blur (× built-in)"), 0, 3, 0.1),
  num("raysMult", FILM, msg("Sun shafts (× built-in)"), 0, 3, 0.1),
  num("flareMult", FILM, msg("Lens flare (× built-in)"), 0, 3, 0.1),
  num("aberrationMult", FILM, msg("Colour fringing (× built-in)"), 0, 3, 0.1),
  num("grainMult", FILM, msg("Film grain (× built-in)"), 0, 4, 0.1),
  num("splitMult", FILM, msg("Split toning (× built-in)"), 0, 2, 0.1),
];
export const GFX_GROUPS = [...new Set(GFX_PARAMS.map((p) => p.group))];
const DEF_BY_KEY = new Map<string, ParamDef>(GFX_PARAMS.map((p) => [p.key, p]));

/** What a tier is built with, before any override. */
export function tierDefaults(tier: Tier): GfxParams {
  const { tier: _t, ...p } = PROFILES[tier];
  return { ...p, ...LOOK_DEFAULTS };
}

const isTier = (k: string): k is Tier => (TIERS as string[]).includes(k);

function sanitizeSet(raw: unknown): GfxOverrides {
  const out: Record<string, number | boolean> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const d = DEF_BY_KEY.get(k);
    if (!d) continue;
    if (d.type === "bool") {
      if (typeof v === "boolean") out[k] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      if (d.type === "choice") {
        if (d.options.includes(v)) out[k] = v;
      } else out[k] = Math.min(d.max, Math.max(d.min, v));
    }
  }
  return out as GfxOverrides;
}

/** Keep only known parameters with the right type and range; drop empty sets. */
export function sanitizeGfx(raw: unknown): GfxConfig {
  const out: GfxConfig = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { all?: unknown; tiers?: unknown };
  const all = sanitizeSet(r.all);
  if (Object.keys(all).length) out.all = all;
  if (r.tiers && typeof r.tiers === "object") {
    const tiers: Partial<Record<Tier, GfxOverrides>> = {};
    for (const [k, v] of Object.entries(r.tiers)) {
      if (!isTier(k)) continue;
      const s = sanitizeSet(v);
      if (Object.keys(s).length) tiers[k] = s;
    }
    if (Object.keys(tiers).length) out.tiers = tiers;
  }
  return out;
}

/**
 * defaults ← admin (`all`, then the tier's own) ← the player's own pins. The player's
 * quality pick already chose `tier`; `user` is for anything they set individually.
 */
export function resolveGfx(tier: Tier, admin?: GfxConfig | null, user?: GfxOverrides | null): GfxParams {
  return { ...tierDefaults(tier), ...sanitizeSet(admin?.all), ...sanitizeSet(admin?.tiers?.[tier]), ...sanitizeSet(user) };
}

/** The tier profile in force (the engine's starting point; the adaptive controller strips from it). */
export function resolveProfile(tier: Tier, admin?: GfxConfig | null, user?: GfxOverrides | null): Profile {
  const g = resolveGfx(tier, admin, user) as unknown as Record<string, unknown>;
  const p: Record<string, unknown> = { tier };
  for (const k of Object.keys(PROFILES[tier])) if (k !== "tier") p[k] = g[k];
  // minDpr above maxDpr would starve the adaptive controller.
  if ((p.minDpr as number) > (p.maxDpr as number)) p.minDpr = p.maxDpr;
  return p as Profile;
}

export function resolveLook(tier: Tier, admin?: GfxConfig | null, user?: GfxOverrides | null): Look {
  const g = resolveGfx(tier, admin, user) as unknown as Record<string, number>;
  const out: Record<string, number> = {};
  for (const k of Object.keys(LOOK_DEFAULTS)) out[k] = g[k];
  return out as unknown as Look;
}

/** The parameters that differ from the built-in tier, for the panel's "changed" marks. */
export function overriddenKeys(tier: Tier, admin?: GfxConfig | null): GfxKey[] {
  const base = tierDefaults(tier), now = resolveGfx(tier, admin);
  return (Object.keys(base) as GfxKey[]).filter((k) => base[k] !== now[k]);
}
