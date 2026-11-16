// On-device neural voices (pure; tests/tts.test.ts): whether this device should run the sherpa-onnx
// Persian voices (lib/tts/sherpa.ts: which model speaks for whom, ~49–93 MB, in a Web Worker — drive/tts/)
// and how a line is cut for them. Best practice for a game on phones:
//  - never download tens of MB unasked on a phone or a metered/slow connection: "auto" runs it only on a
//    desktop-class device (≥ 4 GB, ≥ 4 cores) that isn't saving data; phones need "on" in Settings;
//  - never on the render thread (the worker), never blocking a line (it falls back to the phone's own
//    voice, then to the speech bubble alone), one model per kind of speaker, loaded on first use.
export type NeuralPref = "auto" | "on" | "off";
export const NEURAL_PREFS: NeuralPref[] = ["auto", "on", "off"];
export const NEURAL_PREF_KEY = "sq_neural_voice";
/** The women's voice is a second download (Haaniye, ~81 MB): on with the men's unless the player turns it off. */
export const NEURAL_WOMEN_KEY = "sq_neural_women";
/** Women's own voice: on unless turned off ("0") — off, every woman in the street would be silent on most phones. */
export const parseNeuralWomen = (v: string | null | undefined) => v !== "0";
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

export type NeuralWhy = "off" | "unsupported" | "weak" | "data-saver" | "slow-net" | "phone-ask" | "on" | "auto";
export type NeuralPlan = { use: boolean; why: NeuralWhy };

/** Whether to run the neural voices here, and why (the Settings line explains it). */
export function neuralPlan(d: DeviceInfo, pref: NeuralPref): NeuralPlan {
  if (pref === "off") return { use: false, why: "off" };
  if (!d.wasm || !d.worker) return { use: false, why: "unsupported" };
  // Even when asked for: a model needs ~200 MB of memory while it runs.
  if (d.memoryGb != null && d.memoryGb < 2) return { use: false, why: "weak" };
  if (pref === "on") return { use: true, why: "on" };
  if (d.saveData) return { use: false, why: "data-saver" };
  if (d.net === "2g" || d.net === "slow-2g" || d.net === "3g") return { use: false, why: "slow-net" };
  if (d.mobile) return { use: false, why: "phone-ask" };
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
