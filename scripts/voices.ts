// npm run assets:voices — what people in the open city say (lib/street/barks.ts), recorded
// once and shipped as small files: public/sounds/voice/<id>-<voice>.mp3 (mono,
// loudness-matched, trimmed) and public/sounds/voice/manifest.json (the game reads it:
// drive/voices.ts). Free all the way: no key, no service — players download nothing extra.
//
// Where the voices come from, any of:
//   --from=<dir>    Piper's raw output, <id>-<voice>.wav — made in your own browser at
//                   /dev/voices (npm run dev; one button, Piper running as WebAssembly), which
//                   saves them in assets/voices/raw/. The usual way.
//   (no option)     the Piper command line (`piper`, or PIPER=/path/to/piper), models fetched
//                   into assets/voices/ with --download.
//   --import=<dir>  your own recordings (or another TTS's), <id>-<voice>.wav|mp3|m4a|ogg —
//                   only trimmed and levelled (the police still get the megaphone).
//   --list          writes every line to assets/voice-lines.tsv (id, voice, Persian, English):
//                   the script to record from.
// The game's voices, from Piper's Persian models (MIT; trained on CC0 recordings):
//   m   — fa_IR amir (a man)
//   f   — Mycroft Mimic 3's fa «haaniye» (CC0; a woman — Piper has no Persian woman's voice),
//         made at /dev/voices (the command-line route can't make it: it has no Mimic 3)
//   cop — fa_IR gyro through a megaphone's narrow band
//   --only=<id,…>   just these lines (bark ids), for trying one out
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BARKS, barkFile, textOf, type Bark, type VoiceKind } from "../src/lib/street/barks";

const MODELS = "assets/voices";
const OUT = "public/sounds/voice";
const PIPER = process.env.PIPER || "piper";
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg("only")?.split(",");
const from = arg("from"), imported = arg("import");

/** Each game voice: its Piper model, how fast it speaks (length scale), and the sound of it after (ffmpeg). */
export const VOICES: Record<VoiceKind, { model: string; speed: number; filter: string }> = {
  m: { model: "amir", speed: 0.95, filter: "highpass=f=70" },
  // A woman's own voice (Mimic 3's haaniye, from /dev/voices): only a little brightening.
  f: { model: "haaniye", speed: 0.95, filter: "highpass=f=90,equalizer=f=3500:t=q:w=1:g=2" },
  // A megaphone: the band a horn speaker carries, driven a little hard.
  cop: { model: "gyro", speed: 0.88, filter: "highpass=f=480,lowpass=f=3200,volume=9dB,alimiter=limit=0.7" },
};
const MEGAPHONE = VOICES.cop.filter;
/** The voices the Piper command line can make (not haaniye, a Mimic 3 voice). */
const PIPER_VOICES = [VOICES.m, VOICES.cop];
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse";
const LEVEL = "loudnorm=I=-16:TP=-1.5:LRA=7";

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

/** A shout is said a touch faster than the voice's usual pace. */
const speedOf = (b: Bark, v: VoiceKind) => (textOf(b, v).fa.includes("!") ? VOICES[v].speed * 0.92 : VOICES[v].speed);

/** One line's file → the shipped mp3. `raw`: Piper's own output (its pace and the voice's sound are applied here). */
function render(input: string, b: Bark, v: VoiceKind, raw: boolean, paced: boolean) {
  const chain = raw ? [...(paced ? [] : [`atempo=${(1 / speedOf(b, v)).toFixed(3)}`]), VOICES[v].filter] : v === "cop" ? [MEGAPHONE] : [];
  ffmpeg(["-i", input, "-af", [...chain, TRIM, LEVEL].join(","), "-ac", "1", "-ar", "24000", "-b:a", "48k", join(OUT, barkFile(b, v))]);
  console.log(`✔ ${barkFile(b, v)}  ${textOf(b, v).fa}`);
}

async function download() {
  mkdirSync(MODELS, { recursive: true });
  for (const { model } of PIPER_VOICES)
    for (const ext of ["onnx", "onnx.json"]) {
      const file = join(MODELS, `${model}.${ext}`);
      if (existsSync(file)) continue;
      process.stdout.write(`↓ ${model}.${ext} … `);
      const res = await fetch(`${HF}/${model}/medium/fa_IR-${model}-medium.${ext}`);
      if (!res.ok) throw new Error(`${model}: ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log("ok");
    }
}

/** A line's file in `dir` (<id>-<voice>.<ext>), or null. */
function findIn(dir: string, b: Bark, v: VoiceKind) {
  const base = barkFile(b, v).replace(/\.mp3$/, "");
  const f = readdirSync(dir).find((x) => x.startsWith(`${base}.`) && /\.(wav|mp3|m4a|ogg|flac|aiff?)$/i.test(x));
  return f ? join(dir, f) : null;
}

function writeList() {
  const rows = ["id\tvoice\tfile\tPersian\tEnglish", ...BARKS.flatMap((b) => b.voices.map((v) => [b.id, v === "m" ? "man" : v === "f" ? "woman" : "police", barkFile(b, v).replace(/\.mp3$/, ".wav"), textOf(b, v).fa, textOf(b, v).en].join("\t")))];
  writeFileSync("assets/voice-lines.tsv", rows.join("\n") + "\n");
  console.log(`${rows.length - 1} line(s) → assets/voice-lines.tsv`);
}

function writeManifest() {
  const files = readdirSync(OUT).filter((f) => f.endsWith(".mp3")).sort();
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        files,
        credits: [
          { title: "Piper text to speech", author: "Rhasspy (Michael Hansen)", url: "https://github.com/rhasspy/piper", license: "MIT" },
          { title: "Persian voices amir, ganji, gyro", author: "Piper voices (fa_IR)", url: "https://huggingface.co/rhasspy/piper-voices/tree/main/fa/fa_IR", license: "CC0" },
        ],
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`\n${files.length} line(s) in ${OUT}/manifest.json`);
}

async function main() {
  if (process.argv.includes("--list")) return writeList();
  mkdirSync(OUT, { recursive: true });
  const source = from ?? imported;
  if (source) {
    // From files: only the lines there replace what's shipped; the rest stay.
    let n = 0;
    for (const b of BARKS)
      for (const v of b.voices) {
        if (only && !only.includes(b.id)) continue;
        const f = findIn(source, b, v);
        if (!f) continue;
        // (The browser's Piper has no pace setting: it's set here.)
        render(f, b, v, !!from, false);
        n++;
      }
    if (!n) throw new Error(`no <id>-<voice> audio files in ${source} (npm run assets:voices -- --list writes the names)`);
    return writeManifest();
  }
  if (process.argv.includes("--download")) await download();
  for (const { model } of PIPER_VOICES) if (!existsSync(join(MODELS, `${model}.onnx`))) throw new Error(`no ${MODELS}/${model}.onnx — run with --download, or make the voices in your browser at /dev/voices and use --from=assets/voices/raw`);
  if (!only) for (const f of readdirSync(OUT)) if (f.endsWith(".mp3")) rmSync(join(OUT, f));
  const tmp = join(MODELS, "_tmp.wav");
  for (const b of BARKS) {
    if (only && !only.includes(b.id)) continue;
    for (const v of b.voices) {
      // (The Piper command line has no woman's voice: those come from /dev/voices.)
      if (v === "f") continue;
      execFileSync(PIPER, ["--model", join(MODELS, `${VOICES[v].model}.onnx`), "--length_scale", String(speedOf(b, v)), "--output_file", tmp], { input: textOf(b, v).fa, stdio: ["pipe", "ignore", "inherit"] });
      render(tmp, b, v, true, true);
    }
  }
  rmSync(tmp, { force: true });
  writeManifest();
}

if (process.argv[1]?.endsWith("voices.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
