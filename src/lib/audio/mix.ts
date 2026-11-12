// The player's sound mixer (Settings → Sound): one volume for everything, and one for each kind
// of sound — effects and menus, cars, guns and blasts, people's voices, the city around you.
// Music keeps its own slider (music.ts). Pure: the audio graph (game/sfx.ts) applies it.
import { msg } from "@/lib/i18n";
import type { SoundKind } from "./spatial";

export type MixBus = "effects" | "vehicles" | "weapons" | "voices" | "ambience";
export const MIX_BUSES: Record<MixBus, { label: string; emoji: string }> = {
  effects: { label: msg("Effects & menus"), emoji: "✨" },
  vehicles: { label: msg("Cars & sirens"), emoji: "🚗" },
  weapons: { label: msg("Guns & explosions"), emoji: "💥" },
  voices: { label: msg("Voices"), emoji: "🗣️" },
  ambience: { label: msg("City ambience"), emoji: "🏙️" },
};
export const MIX_BUS_KEYS = Object.keys(MIX_BUSES) as MixBus[];

/** Each 0…1 as the slider shows it (1: as the game was mixed). */
export type Mix = { master: number } & Record<MixBus, number>;
export const DEFAULT_MIX: Mix = { master: 1, effects: 1, vehicles: 1, weapons: 1, voices: 1, ambience: 1 };

const clamp01 = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
/** A saved mix (JSON from localStorage, maybe old or broken) → a whole, valid one. */
export function parseMix(raw: string | null | undefined): Mix {
  let o: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === "object") o = p as Record<string, unknown>;
  } catch {}
  const m = { ...DEFAULT_MIX };
  for (const k of Object.keys(DEFAULT_MIX) as (keyof Mix)[]) m[k] = clamp01(o[k], DEFAULT_MIX[k]);
  return m;
}

/** A slider's 0…1 → a gain: squared, so the slider feels even (half way ≈ −12 dB, not −6). */
export const sliderGain = (v: number) => clamp01(v, 1) ** 2;

/** Which slider a positioned sound (spatial.ts) answers to. */
export function busOfKind(kind: SoundKind): MixBus {
  switch (kind) {
    case "gun":
    case "blast":
    case "fire":
      return "weapons";
    case "horn":
    case "siren":
    case "alarm":
    case "crash":
      return "vehicles";
    case "voice":
      return "voices";
    case "ambient":
      return "ambience";
    default:
      return "effects";
  }
}

/** Which slider a recorded sound (soundSlots.ts) answers to. */
export function busOfSlot(key: string): MixBus {
  if (key === "explosion" || key === "fire") return "weapons";
  if (key === "city") return "ambience";
  if (/^(siren|horn|skid|carAlarm|carLock|engine|crash)/.test(key)) return "vehicles";
  return "effects";
}
