// Helpers for /dev/voices (pure; tests/voiceTools.test.ts): every way a line gets its voice —
// Piper, the game's speech server, any other TTS reachable over HTTP, a microphone take, an
// uploaded file — ends as the same 16-bit mono WAV that `npm run assets:voices` reads.
import type { VoiceKind } from "./street/barks";
import type { VoiceLang } from "./street/voiceLang";

/** How one voice (language × kind) is made on the page. */
export type VoiceEngine =
  | { type: "piper" }
  /** The game's own speech service (/api/tts; Persian). */
  | { type: "server" }
  /** Any TTS with an HTTP GET answering audio: `url` with {text}, {lang}, {voice} in it. */
  | { type: "http"; url: string }
  /** A text-to-speech model on Hugging Face (through /api/dev/voices/hf, with HF_TOKEN from .env). */
  | { type: "hf"; model: string }
  /** No engine: recorded with the microphone or uploaded, line by line. */
  | { type: "record" };
export const ENGINE_TYPES = ["piper", "server", "hf", "http", "record"] as const;

/**
 * Text-to-speech models on Hugging Face worth trying, with their licence: only `ok` ones may
 * ship in the game (the rest are for hearing what's possible — the game never ships
 * non-commercial voices). Any other model id can be typed in.
 */
export const HF_MODELS: { id: string; langs: VoiceLang[]; licence: string; ok: boolean; note: string }[] = [
  { id: "facebook/mms-tts-fas", langs: ["fa"], licence: "CC BY-NC 4.0", ok: false, note: "Meta MMS, Persian (non-commercial: try only)" },
  { id: "facebook/mms-tts-tur", langs: ["tr"], licence: "CC BY-NC 4.0", ok: false, note: "Meta MMS, Turkish (non-commercial: try only)" },
  { id: "facebook/mms-tts-eng", langs: ["en"], licence: "CC BY-NC 4.0", ok: false, note: "Meta MMS, English (non-commercial: try only)" },
  { id: "hexgrad/Kokoro-82M", langs: ["en"], licence: "Apache-2.0", ok: true, note: "Kokoro, natural English" },
  { id: "parler-tts/parler-tts-mini-v1", langs: ["en"], licence: "Apache-2.0", ok: true, note: "Parler, English, described voices" },
  { id: "microsoft/speecht5_tts", langs: ["en"], licence: "MIT", ok: true, note: "SpeechT5, English" },
  { id: "suno/bark", langs: ["en", "tr"], licence: "MIT", ok: true, note: "Bark, expressive (English, Turkish)" },
  { id: "espnet/kan-bayashi_ljspeech_vits", langs: ["en"], licence: "CC BY 4.0", ok: true, note: "VITS, LJ Speech (credit it)" },
];
/** A Hugging Face model id ("owner/name"). */
export const validHfModel = (m: string) => /^[\w.-]+\/[\w.-]+$/.test(m.trim());
/** What a model's licence allows (unknown models: check its card before shipping). */
export const hfLicence = (m: string) => HF_MODELS.find((x) => x.id === m.trim()) ?? null;

/** The request for a line from an HTTP TTS template (each placeholder URL-encoded). */
export function ttsUrl(template: string, text: string, lang: VoiceLang, voice: VoiceKind): string {
  return template.replace(/\{text\}/g, encodeURIComponent(text)).replace(/\{lang\}/g, lang).replace(/\{voice\}/g, voice);
}

/** A plausible template: http(s), with {text} in it. */
export const validTemplate = (t: string) => /^https?:\/\/\S+$/.test(t.trim()) && t.includes("{text}");

/** Many channels → one (their average). */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < out.length; i++) out[i] += c[i] / channels.length;
  return out;
}

/** Samples (−1…1) → a 16-bit mono PCM WAV file. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff), true);
  return buf;
}

/** Silence trimmed off both ends of a take (a microphone take starts and ends with the button press). */
export function trimSilence(samples: Float32Array, rate: number, threshold = 0.02, padS = 0.08): Float32Array {
  let a = 0, b = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  if (a >= b) return samples;
  const pad = Math.round(padS * rate);
  return samples.slice(Math.max(0, a - pad), Math.min(samples.length, b + pad + 1));
}

/** A file dropped in for many lines at once: "greet-3-f.mp3" → the line's raw name for that language ("greet-3-f.wav", "en/greet-3-f.wav"). */
export function rawNameOf(fileName: string, lang: VoiceLang): string | null {
  const m = /^([a-zA-Z]+-\d+-(?:m|f|cop))\.(wav|mp3|ogg|m4a|webm|flac|aac)$/i.exec(fileName.split(/[\\/]/).pop() ?? "");
  return m ? `${lang === "fa" ? "" : `${lang}/`}${m[1]}.wav` : null;
}
