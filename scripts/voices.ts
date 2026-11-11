// npm run assets:voices — what people in the open city say (lib/street/barks.ts), recorded
// once and shipped as small files: public/sounds/voice/<id>-<voice>.mp3 (Persian) and
// public/sounds/voice/en/<id>-<voice>.mp3 (English; mono, loudness-matched, trimmed) plus
// public/sounds/voice/manifest.json (the game reads it: drive/voices.ts). Free all the way:
// no key, no service — players download nothing extra.
//
// Where the voices come from, any of:
//   --from=<dir>    Piper's raw output, <id>-<voice>.wav (English in <dir>/en/) — made in your own
//                   browser at /dev/voices (npm run dev; one button, Piper running as WebAssembly),
//                   which saves them in assets/voices/raw/. The usual way.
//   (no option)     the Piper command line (`piper`, or PIPER=/path/to/piper), models fetched
//                   into assets/voices/ with --download.
//   --import=<dir>  your own recordings (or another TTS's), <id>-<voice>.wav|mp3|m4a|ogg (English in
//                   <dir>/en/) — only trimmed and levelled (the police still get the megaphone/radio).
//   --list          writes every line to assets/voice-lines.tsv (id, voice, Persian, English):
//                   the script to record from.
//   --lang=fa|en    just that language (default: both). Players not in Persian hear the English
//                   files (lib/street/voiceLang.ts, drive/voices.ts).
//   --models        downloads what /dev/voices needs into assets/voices/lib/ (every model and
//                   Piper's runtime; the dev server would fetch them on first use otherwise), so
//                   the page opens without waiting. Needs a connection that reaches Hugging Face.
// The game's voices (voiceLang.ts MODELS has each licence; permissive only):
//   fa  m — Piper fa_IR amir · f — Mycroft Mimic 3's «haaniye» (CC0; Piper has no Persian woman,
//        so only /dev/voices can make it) · cop — fa_IR gyro through a megaphone's narrow band
//   en  m — John, Norman (public domain) · f — LJ Speech (public domain), Alba (CC BY 4.0) ·
//        cop — Bryce (public domain) through a radio's band. Each line's voice is fixed by its id.
//   --only=<id,…>   just these lines (bark ids), for trying one out
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BARKS, type Bark, type VoiceKind } from "../src/lib/street/barks";
import { jobsFor, lineFile, lineText, MODELS, voiceFor, VOICE_LANGS, type VoiceLang } from "../src/lib/street/voiceLang";

const MODELS_DIR = "assets/voices";
const LIB = "assets/voices/lib";
const OUT = "public/sounds/voice";
const PIPER = process.env.PIPER || "piper";
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg("only")?.split(",");
const from = arg("from"), imported = arg("import");
const oneLang = arg("lang") as VoiceLang | undefined;
if (oneLang && !VOICE_LANGS.includes(oneLang)) throw new Error(`--lang=${oneLang}: fa or en`);
const LANGS: VoiceLang[] = oneLang ? [oneLang] : VOICE_LANGS;

/** Each kind of voice: how fast it speaks (Piper length scale) and the sound of it after (ffmpeg), per language. */
export const VOICES: Record<VoiceLang, Record<VoiceKind, { speed: number; filter: string }>> = {
  fa: {
    m: { speed: 0.95, filter: "highpass=f=70" },
    // A woman's own voice (Mimic 3's haaniye, from /dev/voices): only a little brightening.
    f: { speed: 0.95, filter: "highpass=f=90,equalizer=f=3500:t=q:w=1:g=2" },
    // A megaphone: the band a horn speaker carries, driven a little hard.
    cop: { speed: 0.88, filter: "highpass=f=480,lowpass=f=3200,volume=9dB,alimiter=limit=0.7" },
  },
  en: {
    m: { speed: 0.95, filter: "highpass=f=70" },
    f: { speed: 0.95, filter: "highpass=f=90" },
    // A police radio: a narrower band than the megaphone, driven hard.
    cop: { speed: 0.9, filter: "highpass=f=450,lowpass=f=3000,volume=9dB,alimiter=limit=0.7" },
  },
};
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse";
const LEVEL = "loudnorm=I=-16:TP=-1.5:LRA=7";

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

/** A shout is said a touch faster than the voice's usual pace. */
const speedOf = (b: Bark, v: VoiceKind, lang: VoiceLang) => (lineText(b, v, lang).includes("!") ? VOICES[lang][v].speed * 0.92 : VOICES[lang][v].speed);

/** One line's file → the shipped mp3. `raw`: Piper's own output (its pace and the voice's sound are applied here). */
function render(input: string, b: Bark, v: VoiceKind, lang: VoiceLang, raw: boolean, paced: boolean) {
  const chain = raw ? [...(paced ? [] : [`atempo=${(1 / speedOf(b, v, lang)).toFixed(3)}`]), VOICES[lang][v].filter] : v === "cop" ? [VOICES[lang].cop.filter] : [];
  const out = join(OUT, lineFile(b, v, lang));
  mkdirSync(dirname(out), { recursive: true });
  ffmpeg(["-i", input, "-af", [...chain, TRIM, LEVEL].join(","), "-ac", "1", "-ar", "24000", "-b:a", "48k", out]);
  console.log(`✔ ${lineFile(b, v, lang)}  ${lineText(b, v, lang)}`);
}

async function get(url: string, file: string) {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  process.stdout.write(`↓ ${file} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log("ok");
}

/** Piper's own models (not haaniye) of the chosen languages, into `dir`. */
async function models(dir: string) {
  for (const m of MODELS) if (m.hf && LANGS.includes(m.lang)) for (const ext of ["onnx", "onnx.json"]) await get(`${HF}/${m.hf}/${m.id}.${ext}`, join(dir, `${m.id}.${ext}`));
}

/**
 * What /dev/voices serves from assets/voices/lib/ (app/api/dev/voices/lib): the models,
 * Piper's phonemizer and the ONNX runtime — the same files the dev server fetches on first use.
 */
async function libModels() {
  await models(join(LIB, "model"));
  for (const f of ["wasm", "data"]) await get(`https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.${f}`, join(LIB, "piper", `piper_phonemize.${f}`));
  const bundle = await (await fetch("https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm")).text();
  const ver = bundle.match(/onnxruntime-web@([\d.]+)/)?.[1] ?? "1.27.0";
  for (const f of ["mjs", "wasm"]) await get(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ver}/dist/ort-wasm-simd-threaded.${f}`, join(LIB, "ort", ver, `ort-wasm-simd-threaded.${f}`));
  console.log(`\nDone: ${LIB}/ (the Persian woman's voice «haaniye» is fetched by the dev server when first used). Now: npm run dev, open /dev/voices.`);
}

/** A line's file in `dir` (<id>-<voice>.<ext>), or null. */
function findIn(dir: string, b: Bark, v: VoiceKind) {
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((x) => x.startsWith(`${b.id}-${v}.`) && /\.(wav|mp3|m4a|ogg|flac|aiff?)$/i.test(x));
  return f ? join(dir, f) : null;
}

function writeList() {
  const rows = ["id\tvoice\tfile\tPersian\tEnglish\tEnglish file", ...jobsFor("fa").map((j) => [j.b.id, j.v === "m" ? "man" : j.v === "f" ? "woman" : "police", j.raw, j.text, lineText(j.b, j.v, "en"), `en/${j.raw}`].join("\t"))];
  writeFileSync("assets/voice-lines.tsv", rows.join("\n") + "\n");
  console.log(`${rows.length - 1} line(s) → assets/voice-lines.tsv`);
}

function writeManifest() {
  const mp3 = (d: string) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".mp3")).sort() : []);
  const files = mp3(OUT), en = mp3(join(OUT, "en"));
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        files,
        en,
        credits: [
          { title: "Piper text to speech", author: "Rhasspy (Michael Hansen)", url: "https://github.com/rhasspy/piper", license: "MIT" },
          ...MODELS.map((m) => ({ title: `${m.label} (${m.lang})`, author: "Piper voices", url: m.source, license: m.licence })),
        ],
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`\n${files.length} Persian + ${en.length} English line(s) in ${OUT}/manifest.json`);
}

async function main() {
  if (process.argv.includes("--list")) return writeList();
  if (process.argv.includes("--models")) return libModels();
  mkdirSync(OUT, { recursive: true });
  const source = from ?? imported;
  if (source) {
    // From files: only the lines there replace what's shipped; the rest stay.
    let n = 0;
    for (const lang of LANGS) {
      const dir = lang === "fa" ? source : join(source, "en");
      for (const b of BARKS)
        for (const v of b.voices) {
          if (only && !only.includes(b.id)) continue;
          const f = findIn(dir, b, v);
          if (!f) continue;
          // (The browser's Piper has no pace setting: it's set here.)
          render(f, b, v, lang, !!from, false);
          n++;
        }
    }
    if (!n) throw new Error(`no <id>-<voice> audio files in ${source} (English: ${join(source, "en")}) (npm run assets:voices -- --list writes the names)`);
    return writeManifest();
  }
  if (process.argv.includes("--download")) await models(MODELS_DIR);
  // The command line makes every voice Piper has (not the Persian women's haaniye: that is /dev/voices).
  const jobs = LANGS.flatMap((l) => jobsFor(l)).filter((j) => j.model.hf && (!only || only.includes(j.b.id)));
  for (const m of new Set(jobs.map((j) => j.model.id))) if (!existsSync(join(MODELS_DIR, `${m}.onnx`))) throw new Error(`no ${MODELS_DIR}/${m}.onnx — run with --download, or make the voices in your browser at /dev/voices and use --from=assets/voices/raw`);
  if (!only) for (const lang of LANGS) {
    const d = lang === "fa" ? OUT : join(OUT, lang);
    if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith(".mp3")) rmSync(join(d, f));
  }
  const tmp = join(MODELS_DIR, "_tmp.wav");
  for (const j of jobs) {
    execFileSync(PIPER, ["--model", join(MODELS_DIR, `${voiceFor(j.b, j.v, j.lang).id}.onnx`), "--length_scale", String(speedOf(j.b, j.v, j.lang)), "--output_file", tmp], { input: j.text, stdio: ["pipe", "ignore", "inherit"] });
    render(tmp, j.b, j.v, j.lang, true, true);
  }
  rmSync(tmp, { force: true });
  writeManifest();
}

if (process.argv[1]?.endsWith("voices.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
