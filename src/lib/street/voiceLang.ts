// Which language a street line is spoken in, and by which voice (pure; tests/voiceLang.test.ts).
// Persian lines keep their old layout (public/sounds/voice/<id>-<v>.mp3); English ones sit
// in a language folder (public/sounds/voice/en/<id>-<v>.mp3). The dev page (/dev/voices) and
// the generator (scripts/voices.ts) share this table of voices; drive/voices.ts uses the
// file names and the device-voice choice.
import { BARKS, textOf, type Bark, type VoiceKind } from "./barks";

export type VoiceLang = "fa" | "en" | "tr";
export const VOICE_LANGS: VoiceLang[] = ["fa", "en", "tr"];

/**
 * The language the player hears: people in Turkey (`country` "TR", from region.ts) speak Turkish whatever the game's
 * language is (the bubble's subtitle follows the game's language); elsewhere Persian for a Persian game, Turkish for a
 * Turkish one, English for the rest.
 */
export const voiceLangOf = (locale: string, country?: string | null): VoiceLang =>
  country === "TR" ? "tr" : /^fa(-|_|$)/i.test(locale) ? "fa" : /^tr(-|_|$)/i.test(locale) ? "tr" : "en";

/** Folder of a language's files (Persian: the root, as it always was). */
const dirOf = (lang: VoiceLang) => (lang === "fa" ? "" : `${lang}/`);

/** A recording's path under /sounds/voice/ (and in the manifest). */
export const lineFile = (b: Bark, v: VoiceKind, lang: VoiceLang) => `${dirOf(lang)}${b.id}-${v}.mp3`;
/** The raw WAV's path under assets/voices/raw/ (what /dev/voices saves). */
export const rawFile = (b: Bark, v: VoiceKind, lang: VoiceLang) => lineFile(b, v, lang).replace(/\.mp3$/, ".wav");
/** What is said, in that language. */
export const lineText = (b: Bark, v: VoiceKind, lang: VoiceLang) => textOf(b, v)[lang];

/** One Piper (or Mimic 3) voice and where it comes from. `hf`: path in rhasspy/piper-voices. */
export type VoiceModel = { id: string; kind: VoiceKind; lang: VoiceLang; label: string; hf?: string; licence: string; source: string };

const OWN_TR = "Own recordings (no permissive Piper tr_TR voice exists)";
const HFS = "https://huggingface.co/rhasspy/piper-voices/tree/main";
/** Only permissive voices (every MODEL_CARD checked: public domain, CC0, CC BY) — never NC/SA. */
export const MODELS: VoiceModel[] = [
  { id: "fa_IR-amir-medium", kind: "m", lang: "fa", label: "amir", hf: "fa/fa_IR/amir/medium", licence: "CC0", source: `${HFS}/fa/fa_IR` },
  { id: "haaniye", kind: "f", lang: "fa", label: "haaniye (Mimic 3)", licence: "CC0", source: "https://github.com/MycroftAI/mimic3-voices" },
  { id: "fa_IR-gyro-medium", kind: "cop", lang: "fa", label: "gyro", hf: "fa/fa_IR/gyro/medium", licence: "CC0", source: `${HFS}/fa/fa_IR` },
  { id: "en_US-john-medium", kind: "m", lang: "en", label: "John (US man)", hf: "en/en_US/john/medium", licence: "Public domain (LibriVox)", source: `${HFS}/en/en_US/john/medium` },
  { id: "en_US-norman-medium", kind: "m", lang: "en", label: "Norman (US man)", hf: "en/en_US/norman/medium", licence: "Public domain (LibriVox)", source: `${HFS}/en/en_US/norman/medium` },
  { id: "en_US-ljspeech-medium", kind: "f", lang: "en", label: "LJ Speech (US woman)", hf: "en/en_US/ljspeech/medium", licence: "Public domain (LJ Speech)", source: `${HFS}/en/en_US/ljspeech/medium` },
  { id: "en_GB-alba-medium", kind: "f", lang: "en", label: "Alba (Scottish woman)", hf: "en/en_GB/alba/medium", licence: "CC BY 4.0 (CSTR, University of Edinburgh)", source: `${HFS}/en/en_GB/alba/medium` },
  { id: "en_US-bryce-medium", kind: "cop", lang: "en", label: "Bryce (US man, through a radio)", hf: "en/en_US/bryce/medium", licence: "Public domain", source: `${HFS}/en/en_US/bryce/medium` },
  // Turkish: Piper's own tr_TR voice (dfki) is CC BY-NC-SA and fettah/fahrettin were withdrawn from rhasspy/piper-voices, so no
  // permissive Piper model is used. Until clips exist the device's tr-TR speech reads the line (drive/voices.ts); clips made from your
  // own recordings or a permissively licensed voice go in with `npm run assets:voices -- --import=<dir> --lang=tr` (files in <dir>/tr/).
  { id: "tr-own-m", kind: "m", lang: "tr", label: "Turkish man (own recording / device voice)", licence: OWN_TR, source: `${HFS}/tr/tr_TR` },
  { id: "tr-own-f", kind: "f", lang: "tr", label: "Turkish woman (own recording / device voice)", licence: OWN_TR, source: `${HFS}/tr/tr_TR` },
  { id: "tr-own-cop", kind: "cop", lang: "tr", label: "Turkish police (own recording / device voice)", licence: OWN_TR, source: `${HFS}/tr/tr_TR` },
];

/** The voices that can say a line of this kind in this language (at least one each). */
export const modelsFor = (lang: VoiceLang, v: VoiceKind) => MODELS.filter((m) => m.lang === lang && m.kind === v);
export const modelById = (id: string) => MODELS.find((m) => m.id === id) ?? null;

const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  return h;
};

/** The voice that says this line: stable per line, so the men (and women) of a city sound different from each other. */
export function voiceFor(b: Bark, v: VoiceKind, lang: VoiceLang): VoiceModel {
  const pool = modelsFor(lang, v);
  return pool[hash(`${b.id}|${v}`) % pool.length];
}

export type Job = { b: Bark; v: VoiceKind; lang: VoiceLang; file: string; raw: string; text: string; model: VoiceModel };
/** Every line to record in a language, with its raw file name, words and voice. */
export const jobsFor = (lang: VoiceLang): Job[] =>
  BARKS.flatMap((b) => b.voices.map((v) => ({ b, v, lang, file: lineFile(b, v, lang), raw: rawFile(b, v, lang), text: lineText(b, v, lang), model: voiceFor(b, v, lang) })));

/** Manifest entries of the shipped files: `files` (Persian, as before), `en` and `tr` (folder-relative names). */
export function manifestPaths(m: { files?: unknown; en?: unknown; tr?: unknown }): string[] {
  const ok = (f: unknown): f is string => typeof f === "string" && /^[\w-]+\.mp3$/.test(f);
  return [...(Array.isArray(m.files) ? m.files.filter(ok) : []), ...(Array.isArray(m.en) ? m.en.filter(ok).map((f) => `en/${f}`) : []), ...(Array.isArray(m.tr) ? m.tr.filter(ok).map((f) => `tr/${f}`) : [])];
}

const FEMALE = /female|woman|yelda|seda|filiz|samantha|karen|victoria|zira|susan|moira|tessa|fiona|serena|kate|hazel|catherine|allison|ava|joanna|kendra|salli|amy|emma|libby|sonia/i;
const MALE = /\bmale\b|\bman\b|tolga|cem|daniel|alex|fred|david|mark|george|oliver|arthur|rishi|aaron|guy|ryan|matthew|james|thomas|brian|joey|justin/i;
/** A voice by name and language, as speechSynthesis lists them. */
export type DeviceVoice = { name: string; lang: string };

/**
 * The device's own voice for a language and kind of speaker: the language's voices only,
 * a matching gender if the names tell (women/men; police are men), en-US before en-GB
 * before other English, local voices before network ones. Null if there is none in the language.
 */
export function pickDeviceVoice<T extends DeviceVoice & { localService?: boolean }>(voices: readonly T[], lang: VoiceLang, v: VoiceKind): T | null {
  const inLang = voices.filter((x) => new RegExp(`^${lang}(-|_|$)`, "i").test(x.lang));
  if (!inLang.length) return null;
  const want = v === "f" ? FEMALE : MALE;
  const score = (x: T) => (want.test(x.name) ? 4 : (v === "f" ? MALE : FEMALE).test(x.name) ? -4 : 0) + (/^(en[-_]us|tr[-_]tr)/i.test(x.lang) ? 2 : /^en[-_]gb/i.test(x.lang) ? 1 : 0) + (x.localService ? 0.5 : 0);
  return inLang.reduce((a, x) => (score(x) > score(a) ? x : a));
}
