// The game's on-device Persian voices (pure; tests/tts.test.ts): sherpa-onnx WebAssembly packages of Piper and
// Mimic 3 models, the same pinned builds the khabar news site reads aloud with (github.com/AliTaheriMotlagh/khabar,
// src/lib/voices.ts). A package is [loader, glue, runtime, data]: the runtime (.wasm, 12 MB) and the glue are the same
// bytes in every package, so they're stored once (by SHA-256) and a second voice downloads only its own loader and
// data. Every file is pinned to one revision and checked against its SHA-256, so a mirror can't serve anything else —
// and nothing has to be hosted by us: Hugging Face first, hf-mirror.com where it is blocked (Iran), or our own copy
// first when NEXT_PUBLIC_TTS_BASE is set (folders wasm-<id>/ as on Hugging Face).
//  - English and Turkish (the player's language decides, lib/street/voiceLang.ts): small int8 Piper builds;
//  - every voice khabar offers: Ganji, Ganji Adabi, Amir, Gyro, Reza (and bilingual Reza), Musa (Matcha) for men,
//    Khadije (Matcha — the clearest Persian of all in khabar's Whisper test) and Haaniye (Mimic 3) for women;
//  - men and the police speak as the chosen man (Ganji by default; phones get a Piper voice's int8 build, about half
//    the download), women as the chosen woman (Khadije by default); extra voices downloaded in Settings are shared
//    out among the street's people for variety, each person keeping theirs (familyFor).
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
/** A speaker: its full build and (Piper) its int8 build share the family. */
export type VoiceFamily =
  | "ganji" | "ganji_adabi" | "amir" | "gyro" | "reza" | "reza_en" | "musa" | "khadijah" | "haaniye"
  | "ryan" | "danny" | "alan" | "amy" | "kathleen" | "lessac"
  | "fahrettin" | "fettah" | "dfki";
/** The languages there are voices for (the player hears one: lib/street/voiceLang.ts voiceLangOf). */
export type TtsLang = "fa" | "en" | "tr";
/** Who speaks: men, women, the police (through the megaphone filter). */
export type Role = "m" | "f" | "cop";
export const ROLES: Role[] = ["m", "f", "cop"];
export type SherpaVoice = {
  id: string;
  family: VoiceFamily;
  lang: TtsLang;
  /** Its name in Persian, as khabar's picker shows it. */
  name: string;
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
const tts = (model: object) => ({ offlineTtsModelConfig: { ...model, numThreads: 1, debug: 0, provider: "cpu" }, ruleFsts: "", ruleFars: "", maxNumSentences: 1 });
const vits = (onnx: string) => tts({ offlineTtsVitsModelConfig: { model: `./${onnx}`, lexicon: "", tokens: "./tokens.txt", dataDir: "./espeak-ng-data", noiseScale: 0.667, noiseScaleW: 0.8, lengthScale: 1 } });
const matcha = () => tts({ offlineTtsMatchaModelConfig: { acousticModel: "./model.onnx", vocoder: "./vocos-22khz-univ.onnx", lexicon: "", tokens: "./tokens.txt", dataDir: "./espeak-ng-data", noiseScale: 0.667, lengthScale: 1 } });
/** (The language from the package's name: "-fa-" Persian — bilingual ones too — "-tr-" Turkish, else "-en-" English.) */
const langOf = (id: string): TtsLang => (/-fa-/.test(id) ? "fa" : /-tr-/.test(id) ? "tr" : "en");
const V = (id: string, family: VoiceFamily, name: string, gender: "m" | "f", rtf: number, loader: [number, string], data: [number, string], config: unknown, light = false): SherpaVoice => ({ id, family, lang: langOf(id), name, gender, rtf, files: pack(loader, data), config, ...(light ? { light: true as const } : {}) });

/** khabar's whole catalog (src/lib/voices.ts there), the same pinned packages. */
export const SHERPA_VOICES: SherpaVoice[] = [
  V("piper-fa-ganji-medium", "ganji", "گنجی", "m", 0.17, [119743, "ebec9541e999ae99fb267ef40d527ac0f1e436bf5a0b55ec73b10eaae278a14a"], [81142978, "e354f66cbd0c167b6e6f502c63628bcf4368f51767f22b5c621fdbdc55559c51"], vits("fa_IR-ganji-medium.onnx")),
  V("piper-fa-ganji-medium-int8", "ganji", "گنجی", "m", 0.3, [119743, "922127a5338db3e1bc2c08796a08f9f7b0900ecbf9afc7e89f18c01acaa399d7"], [36573501, "d324602a63fcb44d6007323971ffcb4baff17943d68a7a04488770852fc88910"], vits("fa_IR-ganji-medium.onnx"), true),
  V("matcha-fa-en-khadijah", "khadijah", "خدیجه", "f", 0.27, [119722, "fa99b531b803c541715502b2e0c7230b01e78c4f6684a75bcbaa8a9ab2e66e3f"], [146151530, "e52e4334d5d4decbb5968ec43321db9d9019614abb4d4e8a0b12ecb712be2728"], matcha()),
  V("matcha-fa-en-musa", "musa", "موسی", "m", 0.27, [119722, "fa99b531b803c541715502b2e0c7230b01e78c4f6684a75bcbaa8a9ab2e66e3f"], [146151530, "b012269e6f585bda9e006bb446753051ab9b26372b67ebcd8ba36a85087ad2a3"], matcha()),
  V("piper-fa-ganji_adabi-medium", "ganji_adabi", "گنجی ادبی", "m", 0.17, [119755, "978ef76c8015e91011e4f02da2a06cc712b656a95a96c60e1e9b82cafc1a0125"], [81142990, "13638be1c1cc6a2eb5930aa7bead633218ac59bd69950af6f991932fd863fa95"], vits("fa_IR-ganji_adabi-medium.onnx")),
  V("piper-fa-ganji_adabi-medium-int8", "ganji_adabi", "گنجی ادبی", "m", 0.31, [119755, "87e732fb6fbbe989db7fadca1ea1aef0a9ec6bd6a15a8dba367bd8e907b65599"], [36573512, "21983b03f9ca1c5620452f7cbf519a25dc2cce88fc27b340cc69a5692a56b11b"], vits("fa_IR-ganji_adabi-medium.onnx"), true),
  V("piper-fa-amir-medium", "amir", "امیر", "m", 0.18, [119741, "2d90ec19e780400e9ec9e49b0bae1de10560f5582600f74c9215e7673a687cbf"], [81150783, "6eaef3f381f91e682bc9534e2c06d4ca2a219a0cdb7a3117461fde8dfd7be86c"], vits("fa_IR-amir-medium.onnx")),
  V("piper-fa-amir-medium-int8", "amir", "امیر", "m", 0.33, [119741, "d413620512b76ab54d31e67d0f9c0901174401b50fd40a1adc775515f87f3c14"], [36581299, "f0808a0eb80912305f185f858676b99865de1238e2182c35886c61f55fa46c8c"], vits("fa_IR-amir-medium.onnx"), true),
  V("piper-fa-gyro-medium", "gyro", "ژیرو", "m", 0.17, [119741, "a4aa3e543f507f015ebd0896e8bba2b1c79375cb781f87beea3e3b7cce1b7717"], [80949377, "1317fe0ea4c4fe246306fb48d7a0846a7a46f44cf9586afd2041cbf7a52bfa8e"], vits("fa_IR-gyro-medium.onnx")),
  V("piper-fa-gyro-medium-int8", "gyro", "ژیرو", "m", 0.35, [119741, "e2827f3fc49b209d54a0f22ffa2515d9c7468018668b7e2524768c9d7a3664ad"], [36304677, "88efa9b4b7e2bab72f415479df977c48e70a748d7502f9a4e67fff55cbbef528"], vits("fa_IR-gyro-medium.onnx"), true),
  V("piper-fa-reza-medium", "reza", "رضا", "m", 0.18, [119757, "82cd54fdca277cc81c144b62c586bdb6699c4442b657565696c9ed31d31784f7"], [81151968, "a53408fd65b023d9269a8794fe42cbad5db94e199386bae26efd0fc330cd65a1"], vits("fa_IR-reza_ibrahim-medium.onnx")),
  V("piper-fa-reza-medium-int8", "reza", "رضا", "m", 0.3, [119757, "f31a722edcf72c5c66b6556a199fad818b6eec12600bc84082864e156a8eb991"], [36582496, "c4a0be2a1e32ca9f734f2707730a0225a53570de619ea37fbad986c8eded6aa8"], vits("fa_IR-reza_ibrahim-medium.onnx"), true),
  V("piper-fa-en-rezahedayatfar-ibrahimwalk-medium", "reza_en", "رضا (دوزبانه)", "m", 0.19, [119909, "f41625ee822a8c6fbdaba7e148a53be46a11ccc5cd1480ea5130b1528da28141"], [81515497, "cd129a47274a4dd6d56759496933b3f2b6092a38a45248fb84845cb8e2b43931"], vits("fa_en-rezahedayatfar-ibrahimwalk-medium.onnx")),
  V("mimic3-fa-haaniye-low", "haaniye", "هانیه", "f", 0.17, [119860, "d6a0eaaf61b82e6d0b2ce85654edbc79cab5384f8228dace217f812b505d8602"], [80782423, "ae629322e12a2b8657194e5a120f3bcdf81ec0d849bde7d69d6f9d3215603c71"], vits("fa-haaniye_low.onnx")),
  // English and Turkish: the smallest builds there are (int8; 36 MB each plus the shared runtime) — the street's
  // words are short, and these players' phones mostly have a voice of their own as a fallback.
  V("piper-en-ryan-low-int8", "ryan", "Ryan", "m", 0.12, [120213, "6552497822657ba19ca604e6e33e58eed61c37a364ac2df433dfa39da0ac85a6"], [36654407, "73ad8e55067975d990aa3c8367ba0c1cca2046f0011ac67ca6fa6d8647f24d04"], vits("en_US-ryan-low.onnx"), true),
  V("piper-en-danny-low-int8", "danny", "Danny", "m", 0.12, [120215, "0c27523d5ad0d53459254d276dfc8e2e50f75bf9cdcf4e05e786cea759fe551e"], [36552385, "d9e4dd1b7ccbb5c207a1fbd641d0e6d6feb6c9d8a616e4e774b111991fa80ad1"], vits("en_US-danny-low.onnx"), true),
  V("piper-en-gb-alan-low-int8", "alan", "Alan (UK)", "m", 0.12, [120213, "dc664ff22d1012b6e8ec1f82eae56cf7ca54c9416e7b9ad61cc886a0dee44ef6"], [36654458, "8441263d75ac231daebcb5dfaa806bc3b5b1a1a884bd983ccc62035e675a0b41"], vits("en_GB-alan-low.onnx"), true),
  V("piper-en-amy-low-int8", "amy", "Amy", "f", 0.12, [120211, "c647b76dd4aef1178ab2e4152e542810e2863fd59f41c25e96bc9a86408c80c3"], [36654416, "557c31b1df45e97f6531ce4e09643f6cdbdf84e63140a284753c93ac220df956"], vits("en_US-amy-low.onnx"), true),
  V("piper-en-kathleen-low-int8", "kathleen", "Kathleen", "f", 0.12, [120221, "e7da4ea879d1a14984c0438b5a9f18f0d76f1ddd946968051e330d16dadba2f7"], [36552404, "893478dfe0cd1665711635de9bf4b9d9e67c4aa95962d52494b837db9cd1e233"], vits("en_US-kathleen-low.onnx"), true),
  V("piper-en-lessac-low-int8", "lessac", "Lessac", "f", 0.12, [120217, "808da734df6c61412d99313ee1d166f3437b91e312cf6ba06065f4d0425c0d66"], [36577511, "880a9d609670ae92f641306aedf4c9cc66ac12bcf0d124e07f6d0d45981a1a66"], vits("en_US-lessac-low.onnx"), true),
  V("piper-tr-fahrettin-medium-int8", "fahrettin", "Fahrettin", "m", 0.3, [119751, "d6cd6a2abe94b32fbcf21971fe756aca5009a390b7f3ebdc9dca3cae0d89ea7c"], [36577624, "f66d94f7c4f9df1cf0c6be5a5f116bf4346d104b964ecbd2f8b2d497222b6079"], vits("tr_TR-fahrettin-medium.onnx"), true),
  V("piper-tr-fettah-medium-int8", "fettah", "Fettah", "m", 0.3, [119745, "b1ccaca06d4ba059036f28ffed5bcb22467bf21a3509daab25bc67e9456ed6ac"], [36679473, "942ed0af465edde0d0269f03039b071d95e1c5c88d923aac7dd9f9206c513597"], vits("tr_TR-fettah-medium.onnx"), true),
  V("piper-tr-dfki-medium-int8", "dfki", "DFKI", "m", 0.3, [119741, "43029c82e0e9fc721698b00700875db6fcbc3c92d0d06520038b38f5e9d8e0a5"], [36577569, "2f3208a02fed0ab6648282d3119ed0fec3ad5f05e9138ffac66449f6fa1561a6"], vits("tr_TR-dfki-medium.onnx"), true),
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

/** The speakers there are, per language and gender, in the picker's order (the default first). Turkish has no woman's voice. */
export const FAMILIES: Record<TtsLang, Record<"m" | "f", VoiceFamily[]>> = {
  fa: { m: ["ganji", "amir", "reza", "gyro", "ganji_adabi", "musa", "reza_en"], f: ["khadijah", "haaniye"] },
  en: { m: ["ryan", "danny", "alan"], f: ["amy", "kathleen", "lessac"] },
  tr: { m: ["fahrettin", "fettah", "dfki"], f: [] },
};
/**
 * Who speaks with which voice unless the player picks: Persian men and police as Ganji (the clearest fast Piper
 * voice), women as Khadije (the clearest Persian of all, khabar's test); the police share the men's download.
 */
export const DEFAULT_PICK: Record<TtsLang, Record<Role, VoiceFamily | null>> = {
  fa: { m: "ganji", f: "khadijah", cop: "ganji" },
  en: { m: "ryan", f: "amy", cop: "ryan" },
  tr: { m: "fahrettin", f: null, cop: "fahrettin" },
};
const genderOf = (r: Role): "m" | "f" => (r === "f" ? "f" : "m");
/** A speaker of this language for this role (the police are men's voices). */
export const isFamily = (v: unknown, lang: TtsLang, role: Role): v is VoiceFamily => typeof v === "string" && (FAMILIES[lang][genderOf(role)] as string[]).includes(v);
/** Every speaker of a language, either gender. */
export const familiesOf = (lang: TtsLang) => [...FAMILIES[lang].m, ...FAMILIES[lang].f];

/** A speaker's build for this device: the int8 one on a phone where there is one (Matcha and Mimic 3 have none). */
export function buildOf(family: VoiceFamily, mobile: boolean): SherpaVoice {
  const all = SHERPA_VOICES.filter((v) => v.family === family);
  return (mobile && all.find((v) => v.light)) || all.find((v) => !v.light) || all[0];
}

/** Which speaker a person gets: one of `families` by who they are (`who`), the same each time; the first without one. */
export function familyFor(families: readonly VoiceFamily[], who?: number): VoiceFamily | null {
  if (!families.length) return null;
  return who == null ? families[0] : families[Math.abs(Math.floor(who)) % families.length];
}

/** The voice a role speaks with in a language on this device (`pick`: the player's choices; null: none — the phone's voice). */
export function voiceFor(kind: VoiceKind, o: { lang: TtsLang; mobile: boolean; pick?: Partial<Record<Role, VoiceFamily | null>> }): SherpaVoice | null {
  const role: Role = kind === "f" ? "f" : kind === "cop" ? "cop" : "m";
  const f = o.pick && role in o.pick ? o.pick[role] : DEFAULT_PICK[o.lang][role];
  return f && isFamily(f, o.lang, role) ? buildOf(f, o.mobile) : null;
}
/** A voice's own download (its model; the 12 MB runtime is shared by every voice). */
export const ownBytes = (v: SherpaVoice) => v.files[0].size + v.files[3].size;

/** Cache Storage name for the voice files (kept by the service worker; never cleared with the app's own caches). */
export const VOICE_CACHE = "sq-voices-sherpa-1";
/** Every file is stored under <origin> + this path + its SHA-256 (+ "?part=k" / "?done"): shared files once. */
export const VOICE_KEYS_PATH = "/voice-files/";
