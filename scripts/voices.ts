// npm run assets:voices — record what people in the open city say (lib/street/barks.ts) in
// Persian, with Piper (https://github.com/rhasspy/piper, MIT; offline, nothing sent anywhere).
//
// Every line is spoken in each voice that can say it and written as
// public/sounds/voice/<id>-<voice>.mp3 (mono, loudness-matched, small), and
// public/sounds/voice/manifest.json lists what's there (the game reads it: drive/voices.ts).
// The voices are Piper's Persian models, trained on CC0 recordings:
//   m   — fa_IR amir (a man)
//   f   — fa_IR ganji, pitched up (Piper has no Persian woman's voice yet)
//   cop — fa_IR gyro through a megaphone's narrow band
// Needs Piper (the `piper` command, or PIPER=/path/to/piper) and ffmpeg. The models are
// downloaded once into assets/voices/ (gitignored) with --download.
//   --download   fetch the voice models first
//   --only=<id>  just these lines (comma-separated bark ids), for trying one out
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BARKS, barkFile, type VoiceKind } from "../src/lib/street/barks";

const MODELS = "assets/voices";
const OUT = "public/sounds/voice";
const PIPER = process.env.PIPER || "piper";
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR";
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

/** Each game voice: its Piper model, how fast it speaks, and the sound of it after (ffmpeg). */
const VOICES: Record<VoiceKind, { model: string; speed: number; filter: string }> = {
  m: { model: "amir", speed: 0.95, filter: "highpass=f=70" },
  // Up about four semitones, the length kept (a woman's range from a man's voice).
  f: { model: "ganji", speed: 0.92, filter: "asetrate=22050*1.26,aresample=22050,atempo=0.79,highpass=f=120" },
  // A megaphone: the band a horn speaker carries, driven a little hard.
  cop: { model: "gyro", speed: 0.88, filter: "highpass=f=480,lowpass=f=3200,volume=9dB,alimiter=limit=0.7" },
};

async function download() {
  mkdirSync(MODELS, { recursive: true });
  for (const { model } of Object.values(VOICES))
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

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

async function main() {
  if (process.argv.includes("--download")) await download();
  for (const { model } of Object.values(VOICES)) if (!existsSync(join(MODELS, `${model}.onnx`))) throw new Error(`no ${MODELS}/${model}.onnx — run with --download`);
  mkdirSync(OUT, { recursive: true });
  if (!only) for (const f of readdirSync(OUT)) if (f.endsWith(".mp3")) rmSync(join(OUT, f));
  const tmp = join(MODELS, "_tmp.wav");
  for (const b of BARKS) {
    if (only && !only.includes(b.id)) continue;
    for (const v of b.voices) {
      const voice = VOICES[v];
      // A shout is said a touch faster than the voice's usual pace.
      const speed = b.fa.includes("!") ? voice.speed * 0.92 : voice.speed;
      execFileSync(PIPER, ["--model", join(MODELS, `${voice.model}.onnx`), "--length_scale", String(speed), "--output_file", tmp], { input: b.fa, stdio: ["pipe", "ignore", "inherit"] });
      ffmpeg(["-i", tmp, "-af", `${voice.filter},silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=7`, "-ac", "1", "-ar", "24000", "-b:a", "48k", join(OUT, barkFile(b, v))]);
      console.log(`✔ ${barkFile(b, v)}  ${b.fa}`);
    }
  }
  rmSync(tmp, { force: true });
  const files = readdirSync(OUT).filter((f) => f.endsWith(".mp3")).sort();
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify({
      files,
      credits: [
        { title: "Piper text to speech", author: "Rhasspy (Michael Hansen)", url: "https://github.com/rhasspy/piper", license: "MIT" },
        { title: "Persian voices amir, ganji, gyro", author: "Piper voices (fa_IR)", url: "https://huggingface.co/rhasspy/piper-voices/tree/main/fa/fa_IR", license: "CC0" },
      ],
    }, null, 1) + "\n",
  );
  console.log(`\n${files.length} line(s) in ${OUT}/manifest.json`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
