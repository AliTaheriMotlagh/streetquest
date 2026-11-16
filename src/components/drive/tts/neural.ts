"use client";
// The game's on-device voices (the rules: lib/tts/neural.ts; the voices: lib/tts/sherpa.ts). Anything said in the 3D
// city that isn't a recorded line — the shopkeeper naming today's dishes, a passer-by giving directions — can be
// spoken by a sherpa-onnx model running in a worker (sherpa.worker.ts), in the player's language (Persian, English or
// Turkish: lib/street/voiceLang.ts), on devices that should:
//   speakNeural(text, "m" | "f" | "cop", who?) → AudioBuffer (or null: not here, not yet, failed)
// Only the player's own language is ever downloaded: on the 3D city's loading screen (warmLanguage, shown by
// VoiceLine), or by the first line asked for. Files come from Hugging Face, else hf-mirror.com (or our own copy first,
// NEXT_PUBLIC_TTS_BASE); meanwhile the game speaks another way. Settings picks the voice of men, women and the police
// per language (pickOf / setPick), and extra voices the street's people share out (extrasOf / setExtra).
// Lines are cut into sentences, kept decoded (the newest SPOKEN_CACHE), and asked one at a time.
import type { VoiceKind } from "@/lib/street/barks";
import { getLocale } from "@/lib/i18n";
import { voiceLangOf } from "@/lib/street/voiceLang";
import { chunks, NEURAL_EXTRA_KEY, NEURAL_PICK_KEY, NEURAL_PREF_KEY, NEURAL_WOMEN_KEY, neuralPlan, parseNeuralPref, parsePicks, parseExtras, SPOKEN_CACHE, type DeviceInfo, type NeuralPlan, type NeuralPref } from "@/lib/tts/neural";
import { buildOf, bytesToGet, DEFAULT_PICK, FAMILIES, familiesOf, familyFor, isFamily, mirrors, ownBytes, ROLES, VOICE_CACHE, VOICE_KEYS_PATH, type Role, type SherpaVoice, type TtsLang, type VoiceFamily } from "@/lib/tts/sherpa";
import { audioOut } from "../../game/sfx";

// ---------------------------------------------------------------- the choice and the device
let pref: NeuralPref = "auto";
let lite = false;
/** The player's picks per language (a role missing: its default; null: no voice — the phone's own). */
let picks: Partial<Record<TtsLang, Partial<Record<Role, VoiceFamily | null>>>> = {};
/** Extra voices per language, kept for variety. */
let extras: Partial<Record<TtsLang, VoiceFamily[]>> = {};
/** The country the player is in (people in Turkey speak Turkish). */
let country: string | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
if (typeof window !== "undefined")
  try {
    pref = parseNeuralPref(localStorage.getItem(NEURAL_PREF_KEY));
    picks = parsePicks(localStorage.getItem(NEURAL_PICK_KEY), localStorage.getItem(NEURAL_WOMEN_KEY));
    extras = parseExtras(localStorage.getItem(NEURAL_EXTRA_KEY));
  } catch {}
const save = () => {
  try {
    localStorage.setItem(NEURAL_PICK_KEY, JSON.stringify(picks));
    localStorage.setItem(NEURAL_EXTRA_KEY, JSON.stringify(extras));
  } catch {}
};

export const neuralPref = () => pref;
export function setNeuralPref(p: NeuralPref) {
  pref = p;
  try {
    localStorage.setItem(NEURAL_PREF_KEY, p);
  } catch {}
  changed();
}
/** The language the player hears now (the game's language; Turkish in Turkey). */
export const ttsLang = (): TtsLang => voiceLangOf(getLocale(), country);
export const setTtsCountry = (c: string | null) => void (country = c);

/** Who speaks a role in a language: the player's pick, else the default (null: no voice). */
export function pickOf(role: Role, lang: TtsLang = ttsLang()): VoiceFamily | null {
  const p = picks[lang];
  const f = p && role in p ? p[role]! : DEFAULT_PICK[lang][role];
  return f && isFamily(f, lang, role) ? f : null;
}
/** Pick a role's voice (null: none — the phone's own voice); it downloads now when voices are on. */
export function setPick(role: Role, f: VoiceFamily | null, lang: TtsLang = ttsLang()) {
  picks = { ...picks, [lang]: { ...picks[lang], [role]: f } };
  if (f) extras = { ...extras, [lang]: (extras[lang] ?? []).filter((x) => x !== f) };
  save();
  changed();
  if (f && neuralNow().use) warmVoice(buildOf(f, deviceInfo().mobile), false);
}
/** Extra voices kept for variety: on, it downloads now; the street's people share them out. */
export const extrasOf = (lang: TtsLang = ttsLang()) => extras[lang] ?? [];
export function setExtra(f: VoiceFamily, on: boolean, lang: TtsLang = ttsLang()) {
  const l = extrasOf(lang);
  extras = { ...extras, [lang]: on ? [...new Set([...l, f])] : l.filter((x) => x !== f) };
  save();
  changed();
  if (on && neuralNow().use) warmVoice(buildOf(f, deviceInfo().mobile), false);
}
/** Every speaker of a language and its build here, for Settings: name, gender, its own MB, speed, how far it's downloaded. */
export function speakers(lang: TtsLang = ttsLang()): { family: VoiceFamily; gender: "m" | "f"; name: string; mb: number; rtf: number; got: number | null }[] {
  const mobile = deviceInfo().mobile;
  return familiesOf(lang).map((family) => {
    const v = buildOf(family, mobile);
    return { family, gender: v.gender, name: v.name, mb: Math.round(ownBytes(v) / 2 ** 20), rtf: v.rtf, got: progress.get(v.id) ?? null };
  });
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
/**
 * The voice person `who` speaks with: their role's pick — or, with extra voices of that gender on the device, one of
 * those by who they are (the same person, the same voice). Only voices already here are shared out.
 */
function voiceOf(kind: VoiceKind, who?: number, lang: TtsLang = ttsLang()): SherpaVoice | null {
  const role: Role = kind === "f" ? "f" : kind === "cop" ? "cop" : "m";
  const chosen = pickOf(role, lang);
  if (!chosen) return null;
  const mobile = deviceInfo().mobile;
  if (who == null || role === "cop") return buildOf(chosen, mobile);
  const here = [chosen, ...extrasOf(lang).filter((f) => isFamily(f, lang, role) && speakers_.get(buildOf(f, mobile).id)?.state === "ready")];
  return buildOf(familyFor(here, who) ?? chosen, mobile);
}
/** The voices a language's picks need on this device (each once: the police often share the men's). */
function picked(lang: TtsLang): SherpaVoice[] {
  const mobile = deviceInfo().mobile, out: SherpaVoice[] = [];
  for (const r of ROLES) {
    const f = pickOf(r, lang);
    if (f && !out.some((v) => v.family === f)) out.push(buildOf(f, mobile));
  }
  return out;
}
/** MB this device downloads for a language's voices (runtime included), for Settings and the talk panel. */
export const downloadMb = (lang: TtsLang = ttsLang()) => Math.round(bytesToGet(picked(lang)) / (1024 * 1024));

// ---------------------------------------------------------------- one worker per voice
type Speaker = { w: Worker; state: "checking" | "missing" | "downloading" | "ready" | "failed"; failures: number; waiting: Map<number, (r: { pcm: Float32Array; rate: number } | null) => void> };
const speakers_ = new Map<string, Speaker>();
let nextId = 1;
/** How far each voice's download is (0…1), for Settings; 1 once it's on the device. */
export const progress = new Map<string, number>();

const keys = () => `${location.origin}${VOICE_KEYS_PATH}`;
const doneKey = (sha: string) => `${keys()}${sha}?done`;

function speaker(v: SherpaVoice): Speaker {
  const had = speakers_.get(v.id);
  if (had) return had;
  const w = new Worker(new URL("./sherpa.worker.ts", import.meta.url));
  const sp: Speaker = { w, state: "checking", failures: 0, waiting: new Map() };
  speakers_.set(v.id, sp);
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
function fetchVoice(v: SherpaVoice, sp: Speaker = speaker(v)) {
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
export function neuralReady(kind: VoiceKind, who?: number, lang: TtsLang = ttsLang()): boolean {
  if (!neuralNow().use) return false;
  const v = voiceOf(kind, who, lang);
  return !!v && speakers_.get(v.id)?.state === "ready";
}

/** A conversation is about to start with a man or a woman: get their voice loading (or downloading) now. */
export function warmFor(kind: VoiceKind) {
  warmNeural(kind === "cop" ? "m" : kind);
}

/**
 * Bring a voice onto the device (once its cache has been checked), and — `load` — into its worker's memory, so the
 * first line isn't late. Loading is ~200 MB of memory a voice: only the ones about to speak.
 */
function warmVoice(v: SherpaVoice, load = true) {
  const sp = speaker(v);
  const go = () => (sp.state === "missing" ? fetchVoice(v, sp) : sp.state === "ready" && load ? sp.w.postMessage({ t: "load" }) : undefined);
  if (sp.state === "checking") {
    const off = onNeuralChange(() => sp.state !== "checking" && (off(), go()));
  } else go();
}

/** Bring a speaker's voice onto the device now and load it (the talk panel, Settings, the 3D city opening). */
export function warmNeural(kind: VoiceKind = "m") {
  if (!neuralNow().use) return;
  const v = voiceOf(kind);
  if (v) warmVoice(v);
}

/**
 * The 3D city is loading: bring the player's language's voices (men's first, then women's, then the police's when
 * it's another) one after another — only that language, nothing for the others. The men's is loaded too.
 */
export function warmLanguage(lang: TtsLang = ttsLang()) {
  if (!neuralNow().use) return;
  const list = picked(lang);
  const next = (i: number) => {
    if (i >= list.length) return;
    const v = list[i], sp = speaker(v);
    warmVoice(v, i === 0);
    const done = () => sp.state === "ready" || sp.state === "failed";
    if (done()) return next(i + 1);
    const off = onNeuralChange(() => done() && (off(), next(i + 1)));
  };
  next(0);
}

/** How far the language's voices are on this device (0…1), and whether one is downloading now — the loading screen's line. */
export function languageProgress(lang: TtsLang = ttsLang()): { pct: number; busy: boolean; mb: number } {
  const list = picked(lang);
  if (!list.length || !neuralNow().use) return { pct: 1, busy: false, mb: 0 };
  let sum = 0, busy = false;
  for (const v of list) {
    const st = speakers_.get(v.id)?.state;
    if (st === "downloading") busy = true;
    sum += st === "ready" ? 1 : progress.get(v.id) ?? 0;
  }
  return { pct: sum / list.length, busy, mb: Math.round(list.reduce((n, v) => n + ownBytes(v), 0) / 2 ** 20) };
}

// ---------------------------------------------------------------- speaking
const spoken = new Map<string, Promise<AudioBuffer | null>>();

/** One voice saying `text`, decoded (cached by voice and words). The voice must be ready. */
function sayWith(v: SherpaVoice, sp: Speaker, text: string): Promise<AudioBuffer | null> {
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
 * `text` in a man's, a woman's or a police officer's voice of the player's language, decoded; null when it can't be
 * (yet). `who`: the person speaking — with extra voices on the device, theirs (voiceOf).
 */
export function speakNeural(text: string, kind: VoiceKind, who?: number, lang: TtsLang = ttsLang()): Promise<AudioBuffer | null> | null {
  if (!neuralNow().use || !text.trim()) return null;
  const v = voiceOf(kind, who, lang);
  if (!v) return null;
  const sp = speaker(v);
  if (sp.state === "failed") return null;
  if (sp.state !== "ready") {
    // Not on the device yet: start bringing it (this line is said another way).
    if (sp.state === "missing") fetchVoice(v, sp);
    return null;
  }
  return sayWith(v, sp, text);
}

/** What each role says to show its voice in Settings. */
const SAMPLE: Record<TtsLang, Record<Role, string>> = {
  fa: { m: "سلام! به خیابون خوش اومدی، بفرما داخل.", f: "سلام عزیزم! نونوایی سر کوچه تازه باز کرده.", cop: "ایست! ماشین رو کنار بزن." },
  en: { m: "Hi there! Welcome to the street, come on in.", f: "Hello! The bakery round the corner just opened.", cop: "Stop! Pull the car over now." },
  tr: { m: "Merhaba! Sokağa hoş geldin, buyur içeri.", f: "Merhaba! Köşedeki fırın yeni açıldı.", cop: "Dur! Arabayı kenara çek." },
};
/**
 * Settings → ▶: a family says its sample for a role, straight to the speakers. "downloading" when it isn't here yet
 * (it starts coming), "none" when voices can't run here.
 */
export async function previewVoice(f: VoiceFamily, role: Role, lang: TtsLang = ttsLang()): Promise<"played" | "downloading" | "none"> {
  if (!neuralNow().use) return "none";
  const v = buildOf(f, deviceInfo().mobile), sp = speaker(v);
  if (sp.state !== "ready") return warmVoice(v), "downloading";
  const buf = await sayWith(v, sp, SAMPLE[lang][role]);
  const o = audioOut("voices");
  if (!buf || !o) return "none";
  const src = o.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(o.out);
  src.start();
  return "played";
}

/** Is this family's voice on the device, coming, or not yet asked for? (Settings' tick and bar.) */
export const voiceState = (f: VoiceFamily) => speakers_.get(buildOf(f, deviceInfo().mobile).id)?.state ?? null;

// Dev tools: try the voices from the console (window.__sqTts.warm("m"), .say("سلام", "m"), .progress).
if (process.env.NODE_ENV === "development" && typeof window !== "undefined")
  (window as unknown as { __sqTts?: unknown }).__sqTts = { warm: warmNeural, warmLanguage, lang: ttsLang, pick: setPick, say: speakNeural, progress, plan: neuralNow, setPref: setNeuralPref, states: () => Object.fromEntries([...speakers_].map(([k, s]) => [k, s.state])) };
