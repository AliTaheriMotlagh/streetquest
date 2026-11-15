// The game's on-device Persian voices (pure; tests/tts.test.ts): sherpa-onnx WebAssembly packages of Piper and
// Mimic 3 models, the same pinned builds the khabar news site reads aloud with (github.com/AliTaheriMotlagh/khabar,
// src/lib/voices.ts). A package is [loader, glue, runtime, data]: the runtime (.wasm, 12 MB) and the glue are the same
// bytes in every package, so they're stored once (by SHA-256) and a second voice downloads only its own loader and
// data. Every file is pinned to one revision and checked against its SHA-256, so a mirror can't serve anything else —
// and nothing has to be hosted by us: Hugging Face first, hf-mirror.com where it is blocked (Iran), or our own copy
// first when NEXT_PUBLIC_TTS_BASE is set (folders wasm-<id>/ as on Hugging Face).
//  - men and the police: Ganji (the clearest and fastest Persian Piper voice; the police through the megaphone
//    filter, so no second download); phones get its int8 build (37 MB instead of 81, ~1.7× slower to speak);
//  - women: Haaniye (Mimic 3, a woman's own voice — never a man's pitched up), only when the player asks for it too.
import type { VoiceKind } from "../street/barks";

export const REPO = "datasets/jiangzhuo9357/sherpa-onnx-tts-models";
export const REVISION = "c17064a360099d72cf3973cfdaaddc46acf98bfb";

/** Where a package's files are, in the order tried: our own copy (if any), Hugging Face, its mirror. */
export function mirrors(pkg: string, own?: string | null): string[] {
  const out = [`https://huggingface.co/${REPO}/resolve/${REVISION}/wasm-${pkg}/`, `https://hf-mirror.com/${REPO}/resolve/${REVISION}/wasm-${pkg}/`];
  if (own) out.unshift(`${own.endsWith("/") ? own : `${own}/`}wasm-${pkg}/`);
  return out;
}

export type SherpaFile = { name: string; size: number; sha256: string };
export type SherpaVoice = {
  id: string;
  /** One speaker: its full and int8 builds share it. */
  family: "ganji" | "haaniye";
  gender: "m" | "f";
  /** The int8 build: about half the download, slower to speak. */
  light?: true;
  /** Seconds of work per second of speech on one desktop core (a phone is 2–4× slower). */
  rtf: number;
  /** [loader, glue, runtime, data] — the order the worker reads them in. */
  files: SherpaFile[];
  /** sherpa-onnx's OfflineTts config; paths are inside the package's .data file. */
  config: unknown;
};

const GLUE: SherpaFile = { name: "sherpa-onnx-tts.js", size: 25933, sha256: "51c0523f16a864ec942409aa0fe6e80a581bfb54a492ed94ecbdce491f9e9a79" };
const WASM: SherpaFile = { name: "sherpa-onnx-wasm-main-tts.wasm", size: 11903250, sha256: "cfd3c816c2f02477c234b66f00af11cc500f45904956f7e44d86f81bf4fe41d5" };
const pack = (loader: [number, string], data: [number, string]): SherpaFile[] => [
  { name: "sherpa-onnx-wasm-main-tts.js", size: loader[0], sha256: loader[1] },
  GLUE,
  WASM,
  { name: "sherpa-onnx-wasm-main-tts.data", size: data[0], sha256: data[1] },
];
const vits = (onnx: string) => ({
  offlineTtsModelConfig: { offlineTtsVitsModelConfig: { model: `./${onnx}`, lexicon: "", tokens: "./tokens.txt", dataDir: "./espeak-ng-data", noiseScale: 0.667, noiseScaleW: 0.8, lengthScale: 1 }, numThreads: 1, debug: 0, provider: "cpu" },
  ruleFsts: "",
  ruleFars: "",
  maxNumSentences: 1,
});

export const SHERPA_VOICES: SherpaVoice[] = [
  {
    id: "piper-fa-ganji-medium",
    family: "ganji",
    gender: "m",
    rtf: 0.17,
    files: pack([119743, "ebec9541e999ae99fb267ef40d527ac0f1e436bf5a0b55ec73b10eaae278a14a"], [81142978, "e354f66cbd0c167b6e6f502c63628bcf4368f51767f22b5c621fdbdc55559c51"]),
    config: vits("fa_IR-ganji-medium.onnx"),
  },
  {
    id: "piper-fa-ganji-medium-int8",
    family: "ganji",
    gender: "m",
    light: true,
    rtf: 0.3,
    files: pack([119743, "922127a5338db3e1bc2c08796a08f9f7b0900ecbf9afc7e89f18c01acaa399d7"], [36573501, "d324602a63fcb44d6007323971ffcb4baff17943d68a7a04488770852fc88910"]),
    config: vits("fa_IR-ganji-medium.onnx"),
  },
  {
    id: "mimic3-fa-haaniye-low",
    family: "haaniye",
    gender: "f",
    rtf: 0.17,
    files: pack([119860, "d6a0eaaf61b82e6d0b2ce85654edbc79cab5384f8228dace217f812b505d8602"], [80782423, "ae629322e12a2b8657194e5a120f3bcdf81ec0d849bde7d69d6f9d3215603c71"]),
    config: vits("fa-haaniye_low.onnx"),
  },
];

export const sherpaVoice = (id: string) => SHERPA_VOICES.find((v) => v.id === id);
export const voiceBytes = (v: SherpaVoice) => v.files.reduce((s, f) => s + f.size, 0);
/** Bytes still to download for these voices: each distinct file (by hash) once, minus what's on the device. */
export function bytesToGet(voices: readonly SherpaVoice[], have: ReadonlySet<string> = new Set()): number {
  const seen = new Set<string>();
  let n = 0;
  for (const f of voices.flatMap((v) => v.files)) {
    if (seen.has(f.sha256) || have.has(f.sha256)) continue;
    seen.add(f.sha256);
    n += f.size;
  }
  return n;
}

/**
 * The voice a kind of speaker gets on this device: Ganji for men and the police (its int8 build on a phone), Haaniye
 * for women when `women` is on — else none (the game falls back to the phone's voice or a recorded line).
 */
export function voiceFor(kind: VoiceKind, o: { mobile: boolean; women: boolean }): SherpaVoice | null {
  if (kind === "f") return o.women ? sherpaVoice("mimic3-fa-haaniye-low")! : null;
  return sherpaVoice(o.mobile ? "piper-fa-ganji-medium-int8" : "piper-fa-ganji-medium")!;
}

/** Cache Storage name for the voice files (kept by the service worker; never cleared with the app's own caches). */
export const VOICE_CACHE = "sq-voices-sherpa-1";
/** Every file is stored under <origin> + this path + its SHA-256 (+ "?part=k" / "?done"): shared files once. */
export const VOICE_KEYS_PATH = "/voice-files/";
