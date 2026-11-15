"use client";
// The game's on-device Persian voices (the rules: lib/tts/neural.ts). Anything said in the 3D city
// that isn't a recorded line — the shopkeeper naming today's dishes, a passer-by giving directions —
// can be spoken by a neural model running in a worker (piper.worker.ts), on devices that should:
//   speakNeural(text, "m" | "f" | "cop") → AudioBuffer (or null: not here, not now, failed)
// Lines are cut into sentences, kept decoded (the newest SPOKEN_CACHE), and asked one at a time.
// The models come from the voice host: NEXT_PUBLIC_TTS_BASE (ort/, piper/, model/ as in
// assets/voices/lib), or the dev server's /api/dev/voices/lib/ while developing.
import type { VoiceKind } from "@/lib/street/barks";
import { chunks, FA_MODELS, NEURAL_PREF_KEY, neuralPlan, parseNeuralPref, SPOKEN_CACHE, type DeviceInfo, type NeuralPlan, type NeuralPref } from "@/lib/tts/neural";
import { audioOut } from "../../game/sfx";

const ORT_URL = process.env.NEXT_PUBLIC_TTS_ORT_URL || "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/wasm/+esm";
const PHONEMIZER_URL = process.env.NEXT_PUBLIC_TTS_PHONEMIZER_URL || "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js/+esm";

/** Where the voice files are ("" = nowhere: no neural voices). */
export function voiceBase(): string {
  const own = process.env.NEXT_PUBLIC_TTS_BASE;
  if (own) return own.endsWith("/") ? own : `${own}/`;
  return process.env.NODE_ENV === "development" ? "/api/dev/voices/lib/" : "";
}

// ---------------------------------------------------------------- the choice and the device
let pref: NeuralPref = "auto";
let lite = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
if (typeof window !== "undefined")
  try {
    pref = parseNeuralPref(localStorage.getItem(NEURAL_PREF_KEY));
  } catch {}

export const neuralPref = () => pref;
export function setNeuralPref(p: NeuralPref) {
  pref = p;
  try {
    localStorage.setItem(NEURAL_PREF_KEY, p);
  } catch {}
  changed();
}
/** The 3D city says when it's running in its lite mode (a weak device by its own measure). */
export const setNeuralLite = (v: boolean) => void (lite = v);
export const onNeuralChange = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));

export function deviceInfo(): DeviceInfo {
  const n = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }) : null;
  const mobile = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(n?.userAgent ?? ""));
  return {
    memoryGb: n?.deviceMemory ?? null,
    cores: n?.hardwareConcurrency ?? null,
    saveData: !!n?.connection?.saveData,
    net: n?.connection?.effectiveType ?? null,
    wasm: typeof WebAssembly === "object",
    worker: typeof Worker !== "undefined",
    mobile,
    hosted: !!voiceBase(),
    lite,
  };
}
export const neuralNow = (): NeuralPlan => neuralPlan(deviceInfo(), pref);

// ---------------------------------------------------------------- the worker
let worker: Worker | null = null;
let nextId = 1;
let failures = 0;
const waiting = new Map<number, { ok: (r: { pcm: Float32Array; rate: number } | null) => void }>();
/** How far each model's download is (0…1), for Settings; 1 once it's on the device. */
export const progress = new Map<string, number>();

function workerNow() {
  if (worker) return worker;
  worker = new Worker(new URL("./piper.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ type: string; id?: number; pcm?: Float32Array; rate?: number; model?: string; loaded?: number; total?: number; message?: string }>) => {
    const m = e.data;
    if (m.type === "progress" && m.model) {
      progress.set(m.model, m.total ? Math.min(1, (m.loaded ?? 0) / m.total) : 0);
      return changed();
    }
    const w = m.id != null ? waiting.get(m.id) : undefined;
    if (!w) return;
    waiting.delete(m.id!);
    if (m.type === "audio" && m.pcm) (failures = 0), w.ok({ pcm: m.pcm, rate: m.rate ?? 22050 });
    else {
      // Three failures in a row (no network to the host, a broken file): quiet for this session.
      if (++failures >= 3) disabled = true;
      w.ok(null);
    }
  };
  worker.onerror = () => {
    disabled = true;
    for (const w of waiting.values()) w.ok(null);
    waiting.clear();
  };
  return worker;
}
let disabled = false;

function ask(text: string, kind: VoiceKind) {
  return new Promise<{ pcm: Float32Array; rate: number } | null>((ok) => {
    const id = nextId++;
    waiting.set(id, { ok });
    workerNow().postMessage({ type: "say", id, text, model: FA_MODELS[kind], base: new URL(voiceBase(), location.href).href, ortUrl: ORT_URL, phonemizerUrl: PHONEMIZER_URL });
  });
}

// ---------------------------------------------------------------- speaking
const spoken = new Map<string, Promise<AudioBuffer | null>>();

/** `text` (Persian) in a man's, a woman's or a police officer's voice, decoded; null when it can't be. */
export function speakNeural(text: string, kind: VoiceKind): Promise<AudioBuffer | null> | null {
  if (disabled || !neuralNow().use || !text.trim()) return null;
  const key = `${kind}|${text}`;
  const had = spoken.get(key);
  if (had) {
    // Newest last: the oldest falls out first.
    spoken.delete(key);
    spoken.set(key, had);
    return had;
  }
  const p = (async () => {
    const parts = await Promise.all(chunks(text).map((c) => ask(c, kind)));
    const ok = parts.filter((x): x is { pcm: Float32Array; rate: number } => !!x);
    const o = audioOut("voices");
    if (!ok.length || !o) return null;
    // The pieces back to back, a short breath between them.
    const rate = ok[0].rate, gap = Math.round(rate * 0.12);
    const len = ok.reduce((n, x) => n + x.pcm.length, 0) + gap * (ok.length - 1);
    const buf = o.ctx.createBuffer(1, len, rate), ch = buf.getChannelData(0);
    let at = 0;
    for (const x of ok) ch.set(x.pcm, at), (at += x.pcm.length + gap);
    return buf;
  })();
  p.then((b) => b ?? spoken.delete(key));
  spoken.set(key, p);
  while (spoken.size > SPOKEN_CACHE) spoken.delete(spoken.keys().next().value!);
  return p;
}

/** Downloads a speaker's model now (Settings → "Get the voices"), so the first line isn't late. */
export function warmNeural(kind: VoiceKind = "m") {
  if (!disabled && neuralNow().use) void ask("سلام", kind);
}
