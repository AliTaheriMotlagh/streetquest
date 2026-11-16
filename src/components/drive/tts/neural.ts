"use client";
// The game's on-device Persian voices (the rules: lib/tts/neural.ts; the voices: lib/tts/sherpa.ts). Anything said in
// the 3D city that isn't a recorded line — the shopkeeper naming today's dishes, a passer-by giving directions — can
// be spoken by a sherpa-onnx model running in a worker (sherpa.worker.ts), on devices that should:
//   speakNeural(text, "m" | "f" | "cop") → AudioBuffer (or null: not here, not yet, failed)
// The first line a voice is asked for starts its download (Hugging Face, else hf-mirror.com — or our own copy first,
// NEXT_PUBLIC_TTS_BASE) and answers null meanwhile; the game speaks another way until the voice is on the device.
// Lines are cut into sentences, kept decoded (the newest SPOKEN_CACHE), and asked one at a time.
import type { VoiceKind } from "@/lib/street/barks";
import { chunks, NEURAL_PREF_KEY, NEURAL_WOMEN_KEY, neuralPlan, parseNeuralPref, parseNeuralWomen, SPOKEN_CACHE, type DeviceInfo, type NeuralPlan, type NeuralPref } from "@/lib/tts/neural";
import { bytesToGet, mirrors, VOICE_CACHE, VOICE_KEYS_PATH, voiceFor, type SherpaVoice } from "@/lib/tts/sherpa";
import { audioOut } from "../../game/sfx";

// ---------------------------------------------------------------- the choice and the device
let pref: NeuralPref = "auto";
/** Women speak in their own voice by default (they'd be silent on most phones otherwise); Settings can turn it off. */
let women = true;
let lite = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
if (typeof window !== "undefined")
  try {
    pref = parseNeuralPref(localStorage.getItem(NEURAL_PREF_KEY));
    women = parseNeuralWomen(localStorage.getItem(NEURAL_WOMEN_KEY));
  } catch {}

export const neuralPref = () => pref;
export function setNeuralPref(p: NeuralPref) {
  pref = p;
  try {
    localStorage.setItem(NEURAL_PREF_KEY, p);
  } catch {}
  changed();
}
/** Women speak with their own voice (a second download) — or, off, with the phone's voice / a recorded line. */
export const neuralWomen = () => women;
export function setNeuralWomen(on: boolean) {
  women = on;
  try {
    localStorage.setItem(NEURAL_WOMEN_KEY, on ? "1" : "0");
  } catch {}
  changed();
  if (on && neuralNow().use) warmNeural("f");
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
    // (The voice files live in Cache Storage, which needs a secure page.)
    worker: typeof Worker !== "undefined" && typeof caches !== "undefined",
    mobile,
    lite,
  };
}
export const neuralNow = (): NeuralPlan => neuralPlan(deviceInfo(), pref);
const voiceOf = (kind: VoiceKind) => voiceFor(kind, { mobile: deviceInfo().mobile, women });
/** MB this device downloads for the men's voice (and the women's, `withWomen`), for Settings. */
export const downloadMb = (withWomen = women) => Math.round(bytesToGet([voiceOf("m")!, ...(withWomen ? [voiceFor("f", { mobile: false, women: true })!] : [])]) / (1024 * 1024));

// ---------------------------------------------------------------- one worker per voice
type Speaker = { w: Worker; state: "checking" | "missing" | "downloading" | "ready" | "failed"; failures: number; waiting: Map<number, (r: { pcm: Float32Array; rate: number } | null) => void> };
const speakers = new Map<string, Speaker>();
let nextId = 1;
/** How far each voice's download is (0…1), for Settings; 1 once it's on the device. */
export const progress = new Map<string, number>();

const keys = () => `${location.origin}${VOICE_KEYS_PATH}`;
const doneKey = (sha: string) => `${keys()}${sha}?done`;

function speaker(v: SherpaVoice): Speaker {
  const had = speakers.get(v.id);
  if (had) return had;
  const w = new Worker(new URL("./sherpa.worker.ts", import.meta.url));
  const sp: Speaker = { w, state: "checking", failures: 0, waiting: new Map() };
  speakers.set(v.id, sp);
  w.postMessage({ t: "init", cache: VOICE_CACHE, keys: keys(), bases: mirrors(v.id, process.env.NEXT_PUBLIC_TTS_BASE), files: v.files, config: v.config });
  w.onmessage = (e: MessageEvent<{ t: string; id?: number; pcm?: Float32Array; rate?: number; loaded?: number; total?: number; msg?: string }>) => {
    const m = e.data;
    if (m.t === "progress") {
      progress.set(v.id, m.total ? Math.min(1, (m.loaded ?? 0) / m.total) : 1);
      return changed();
    }
    if (m.t === "downloaded") {
      sp.state = "ready";
      progress.set(v.id, 1);
      w.postMessage({ t: "load" });
      return changed();
    }
    const done = m.id != null ? sp.waiting.get(m.id) : undefined;
    if (m.t === "audio" && done) {
      sp.waiting.delete(m.id!);
      sp.failures = 0;
      return done({ pcm: m.pcm!, rate: m.rate ?? 22050 });
    }
    if (m.t === "fail") {
      if (done) sp.waiting.delete(m.id!), done(null);
      if (m.id == null) {
        // The download or the model failed: every waiting line gives up; three in a row → quiet for this session.
        for (const f of sp.waiting.values()) f(null);
        sp.waiting.clear();
        if (sp.state === "downloading") sp.state = "missing";
        if (++sp.failures >= 3) sp.state = "failed";
        changed();
      }
    }
  };
  w.onerror = () => {
    sp.state = "failed";
    for (const f of sp.waiting.values()) f(null);
    sp.waiting.clear();
  };
  // Already on the device? (caches.match, not caches.open: looking mustn't create the cache.)
  void Promise.all(v.files.map((f) => caches.match(doneKey(f.sha256), { cacheName: VOICE_CACHE }).catch(() => undefined))).then((hits) => {
    if (sp.state !== "checking") return;
    sp.state = hits.every(Boolean) ? "ready" : "missing";
    if (sp.state === "ready") progress.set(v.id, 1);
    changed();
  });
  return sp;
}

/** Start downloading a voice (once), if it isn't on the device. */
function fetchVoice(v: SherpaVoice, sp = speaker(v)) {
  if (sp.state !== "missing") return;
  sp.state = "downloading";
  progress.set(v.id, progress.get(v.id) ?? 0);
  sp.w.postMessage({ t: "download" });
  changed();
}

function ask(v: SherpaVoice, sp: Speaker, text: string) {
  return new Promise<{ pcm: Float32Array; rate: number } | null>((ok) => {
    const id = nextId++;
    sp.waiting.set(id, ok);
    sp.w.postMessage({ t: "say", id, text });
  });
}

/**
 * This speaker's voice is on the device (and its worker started): a line asked now is spoken, maybe after a moment
 * while the model loads, so it's worth waiting for. Starts nothing.
 */
export function neuralReady(kind: VoiceKind): boolean {
  if (!neuralNow().use) return false;
  const v = voiceOf(kind);
  return !!v && speakers.get(v.id)?.state === "ready";
}

/** A conversation is about to start with a man or a woman: get their voice loading (or downloading) now. */
export function warmFor(kind: VoiceKind) {
  warmNeural(kind === "cop" ? "m" : kind);
}

// ---------------------------------------------------------------- speaking
const spoken = new Map<string, Promise<AudioBuffer | null>>();

/** `text` (Persian) in a man's, a woman's or a police officer's voice, decoded; null when it can't be (yet). */
export function speakNeural(text: string, kind: VoiceKind): Promise<AudioBuffer | null> | null {
  if (!neuralNow().use || !text.trim()) return null;
  const v = voiceOf(kind);
  if (!v) return null;
  const sp = speaker(v);
  if (sp.state === "failed") return null;
  if (sp.state !== "ready") {
    // Not on the device yet: start bringing it (this line is said another way).
    if (sp.state === "missing") fetchVoice(v, sp);
    return null;
  }
  const key = `${v.id}|${text}`;
  const had = spoken.get(key);
  if (had) {
    // Newest last: the oldest falls out first.
    spoken.delete(key);
    spoken.set(key, had);
    return had;
  }
  const p = (async () => {
    const parts = await Promise.all(chunks(text).map((c) => ask(v, sp, c)));
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

/**
 * Bring a speaker's voice onto the device now and load it (Settings → "Get the voice", the 3D city opening), so
 * the first line isn't late.
 */
export function warmNeural(kind: VoiceKind = "m") {
  if (!neuralNow().use) return;
  const v = voiceOf(kind);
  if (!v) return;
  const sp = speaker(v);
  const go = () => (sp.state === "missing" ? fetchVoice(v, sp) : sp.state === "ready" ? sp.w.postMessage({ t: "load" }) : undefined);
  if (sp.state === "checking") {
    const off = onNeuralChange(() => sp.state !== "checking" && (off(), go()));
  } else go();
}

// Dev tools: try the voices from the console (window.__sqTts.warm("m"), .say("سلام", "m"), .progress).
if (process.env.NODE_ENV === "development" && typeof window !== "undefined")
  (window as unknown as { __sqTts?: unknown }).__sqTts = { warm: warmNeural, say: speakNeural, progress, plan: neuralNow, setPref: setNeuralPref, states: () => Object.fromEntries([...speakers].map(([k, s]) => [k, s.state])) };
