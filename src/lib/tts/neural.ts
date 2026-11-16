// On-device neural voices (pure; tests/tts.test.ts): whether this device should run the sherpa-onnx voices
// (lib/tts/sherpa.ts: which model speaks for whom, 36–146 MB each, in a Web Worker — drive/tts/), who speaks
// with which (saved picks), and how a line is cut for them. Best practice for a game on phones:
//  - only the player's own language is downloaded, while the 3D city loads (as the game files are): never on a
//    connection saving data or a slow one, never on a weak device (< 4 GB, < 4 cores, the lite mode);
//  - never on the render thread (the worker), never blocking a line (it falls back to the phone's own
//    voice, then to the speech bubble alone), one model per kind of speaker, loaded on first use.
import { isFamily, type VoiceFamily } from "./sherpa";

export type NeuralPref = "auto" | "on" | "off";
export const NEURAL_PREFS: NeuralPref[] = ["auto", "on", "off"];
export const NEURAL_PREF_KEY = "sq_neural_voice";
/** The women's voice is a second download (Haaniye, ~81 MB): on with the men's unless the player turns it off. */
export const NEURAL_WOMEN_KEY = "sq_neural_women";
/** Women's own voice: on unless turned off ("0") — off, every woman in the street would be silent on most phones. */
export const parseNeuralWomen = (v: string | null | undefined) => v !== "0";
/** Who speaks per language and role (lib/tts/sherpa.ts), and the extra voices kept for variety: JSON. */
export const NEURAL_PICK_KEY = "sq_voice_picks", NEURAL_EXTRA_KEY = "sq_voice_extras";

const LANGS = ["fa", "en", "tr"] as const;
type Lang = (typeof LANGS)[number];
type Pick = Partial<Record<Lang, Partial<Record<"m" | "f" | "cop", VoiceFamily | null>>>>;
/**
 * The saved picks (only known speakers of the right language and role survive; null = no voice). An older save that
 * turned women's voices off (NEURAL_WOMEN_KEY "0") means no Persian woman's voice.
 */
export function parsePicks(json: string | null | undefined, oldWomen?: string | null): Pick {
  const out: Pick = {};
  try {
    const raw = JSON.parse(json ?? "{}") as Record<string, Record<string, unknown>>;
    for (const lang of LANGS)
      for (const role of ["m", "f", "cop"] as const) {
        const v = raw?.[lang]?.[role];
        if (v === null || isFamily(v, lang, role)) out[lang] = { ...out[lang], [role]: v as VoiceFamily | null };
      }
  } catch {}
  if (oldWomen === "0" && !(out.fa && "f" in out.fa)) out.fa = { ...out.fa, f: null };
  return out;
}
/** The saved extra voices per language (known speakers of that language only). */
export function parseExtras(json: string | null | undefined): Partial<Record<Lang, VoiceFamily[]>> {
  const out: Partial<Record<Lang, VoiceFamily[]>> = {};
  try {
    const raw = JSON.parse(json ?? "{}") as Record<string, unknown>;
    for (const lang of LANGS) {
      const l = raw?.[lang];
      if (Array.isArray(l)) out[lang] = [...new Set(l.filter((f): f is VoiceFamily => isFamily(f, lang, "m") || isFamily(f, lang, "f")))];
    }
  } catch {}
  return out;
}
export const parseNeuralPref = (v: string | null | undefined): NeuralPref => (v === "on" || v === "off" ? v : "auto");

/** What the browser says about this device (navigator.deviceMemory, hardwareConcurrency, connection). */
export type DeviceInfo = {
  memoryGb: number | null;
  cores: number | null;
  saveData: boolean;
  /** connection.effectiveType ("4g", "3g", "2g", "slow-2g"), null when unknown. */
  net: string | null;
  wasm: boolean;
  worker: boolean;
  mobile: boolean;
  /** The game runs in its lite graphics mode (a weak device by its own measure). */
  lite: boolean;
};

export type NeuralWhy = "off" | "unsupported" | "weak" | "data-saver" | "slow-net" | "on" | "auto";
export type NeuralPlan = { use: boolean; why: NeuralWhy };

/** Whether to run the neural voices here, and why (the Settings line explains it). */
export function neuralPlan(d: DeviceInfo, pref: NeuralPref): NeuralPlan {
  if (pref === "off") return { use: false, why: "off" };
  if (!d.wasm || !d.worker) return { use: false, why: "unsupported" };
  // Even when asked for: a model needs ~200 MB of memory while it runs.
  if (d.memoryGb != null && d.memoryGb < 2) return { use: false, why: "weak" };
  if (pref === "on") return { use: true, why: "on" };
  if (d.saveData) return { use: false, why: "data-saver" };
  // (Only 2G counts as slow: Chrome calls Iran's high-latency links "3g" while they download at a megabyte a second,
  // and the voice comes in resumable 8 MB parts.)
  if (d.net === "2g" || d.net === "slow-2g") return { use: false, why: "slow-net" };
  if (d.lite || (d.memoryGb != null && d.memoryGb < 4) || (d.cores != null && d.cores < 4)) return { use: false, why: "weak" };
  return { use: true, why: "auto" };
}

/**
 * A line in pieces the model says well and quickly: whole sentences, none longer than `max`
 * characters (a long one is cut at a comma, then at a space). Empty pieces are dropped.
 */
export function chunks(text: string, max = 140): string[] {
  const out: string[] = [];
  // (No lookbehind: Safari before 16.4 can't even parse it, and the whole app would fail to load.)
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?؟…]+[.!?؟…]*/g) ?? [];
  for (const s of sentences) {
    let rest = s.trim();
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf("،", max), rest.lastIndexOf(",", max));
      const at = cut > max / 3 ? cut + 1 : rest.lastIndexOf(" ", max) > 0 ? rest.lastIndexOf(" ", max) : max;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/** Spoken lines kept decoded (the shopkeeper's greeting, a passer-by's answer): the newest this many. */
export const SPOKEN_CACHE = 48;
