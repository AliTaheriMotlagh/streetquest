"use client";
// What this device's GPU and browser can do, read once from a throwaway WebGL2 context
// (released straight away), plus the player's graphics choices kept on the device.
import { TIME_PICKS, WEATHERS, type TimePick, type Weather } from "@/lib/daylight";
import { isLite, isTouch } from "../../perf";
import { detectTier, QUALITY_PICKS, TIERS, type Caps, type QualityPick, type Tier } from "./quality";

let cached: Caps | null = null;

export function readCaps(): Caps {
  if (cached) return { ...cached, lite: isLite() };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const dpr = window.devicePixelRatio || 1;
  const caps: Caps = {
    gpu: "",
    // iPadOS Safari says it's a Mac: a "Mac" with a touch screen is an iPad (big iPad Pros are ≥ 900 px too).
    mobile: isTouch() && (Math.min(screen.width, screen.height) < 900 || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)),
    maxTexture: 4096,
    floatTargets: false,
    memoryGB: nav.deviceMemory ?? null,
    cores: nav.hardwareConcurrency ?? null,
    screenPx: screen.width * screen.height * dpr * dpr,
    saveData: !!nav.connection?.saveData,
    lite: isLite(),
  };
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (gl) {
      caps.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      caps.floatTargets = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      // Firefox and Safari mask the name; RENDERER then says just "WebKit WebGL" or similar.
      caps.gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "").toLowerCase();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } else caps.maxTexture = 0;
  } catch {
    caps.maxTexture = 0;
  }
  cached = caps;
  return caps;
}

// ---------------------------------------------------------------- choices
const QUALITY_KEY = "sq_gfx_quality";
const DEMOTE_KEY = "sq_gfx_demote";
const TIME_KEY = "sq_drive_time";
const WEATHER_KEY = "sq_drive_weather";

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

export const qualityPick = (): QualityPick => {
  const v = get(QUALITY_KEY) as QualityPick | null;
  return v && QUALITY_PICKS.includes(v) ? v : "auto";
};
export const setQualityPick = (q: QualityPick) => set(QUALITY_KEY, q === "auto" ? null : q);

export const timePick = (): TimePick => {
  const v = get(TIME_KEY) as TimePick | null;
  return v && TIME_PICKS.includes(v) ? v : "day";
};
export const setTimePick = (t: TimePick) => set(TIME_KEY, t === "day" ? null : t);

export const weatherPick = (): Weather => {
  const v = get(WEATHER_KEY) as Weather | null;
  return v && WEATHERS.includes(v) ? v : "clear";
};
export const setWeatherPick = (w: Weather) => set(WEATHER_KEY, w === "clear" ? null : w);

/** Steps "auto" has learned to drop on this device (sustained slowness, a lost GPU context). */
export const demoted = () => Math.min(3, Math.max(0, Number(get(DEMOTE_KEY)) || 0));
export const demote = () => set(DEMOTE_KEY, String(demoted() + 1));
/** "Auto" is reset when the player picks it again, so a one-off bad session isn't forever. */
export const forgetDemotion = () => set(DEMOTE_KEY, null);

/** The tier "auto" chooses on this device right now. */
export const autoTier = (): Tier => detectTier(readCaps(), demoted());
/** The tier in force for a pick. */
export const tierFor = (q: QualityPick): Tier => (q === "auto" ? autoTier() : TIERS.includes(q) ? q : "medium");
