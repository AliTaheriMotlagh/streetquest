// npm run assets:sounds — turn the recordings in assets/sounds/<slot>/ into the game's sounds.
//
// For every slot in src/lib/soundSlots.ts: each source file (wav, mp3, ogg, flac, aiff, m4a)
// is trimmed of leading silence, cut to the slot's length (one-shots), loudness-matched
// (EBU R128, so a crash and a horn sit at the same level before the game mixes them), made
// mono unless the slot is stereo ambience, and written as public/sounds/<slot>-<n>.mp3; then
// public/sounds/manifest.json lists what's there. A slot without files is left to the synth.
//
// The source recordings are yours to license (e.g. a soundsnap.ir subscription): sources
// stay out of git (assets/sounds is gitignored); the converted files are what ships.
//   --check   only report which slots have files, convert nothing
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOUND_KEYS, SOUND_SLOTS, slotFile, type SoundManifest } from "../src/lib/soundSlots";

const SRC = "assets/sounds";
const OUT = "public/sounds";
const AUDIO = /\.(wav|mp3|ogg|flac|aiff?|m4a)$/i;
const check = process.argv.includes("--check");

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

mkdirSync(SRC, { recursive: true });
for (const k of SOUND_KEYS) mkdirSync(join(SRC, k), { recursive: true });
if (!check) mkdirSync(OUT, { recursive: true });

const manifest: SoundManifest = {};
for (const key of SOUND_KEYS) {
  const slot = SOUND_SLOTS[key];
  const files = readdirSync(join(SRC, key)).filter((f) => AUDIO.test(f)).sort();
  console.log(`${files.length ? "✔" : "·"} ${key.padEnd(11)} ${files.length} file(s)  — ${slot.what}${files.length ? "" : `  (search: "${slot.search}")`}`);
  if (check) continue;
  // Old conversions of this slot go (a file removed from the sources disappears from the game).
  for (const f of existsSync(OUT) ? readdirSync(OUT) : []) if (f.startsWith(`${key}-`) && f.endsWith(".mp3")) rmSync(join(OUT, f));
  if (!files.length) continue;
  manifest[key] = files.map((f, n) => {
    const out = slotFile(key, n);
    const filters = [
      // Leading silence off (loops keep theirs so they stay seamless).
      ...("loop" in slot && slot.loop ? [] : ["silenceremove=start_periods=1:start_threshold=-45dB"]),
      "loudnorm=I=-16:TP=-1.5:LRA=11",
    ];
    ffmpeg([
      "-i", join(SRC, key, f),
      "-t", String(slot.maxS),
      "-af", filters.join(","),
      "-ac", "stereo" in slot && slot.stereo ? "2" : "1",
      "-ar", "44100",
      "-codec:a", "libmp3lame", "-b:a", "stereo" in slot && slot.stereo ? "128k" : "96k",
      join(OUT, out),
    ]);
    return out;
  });
}
if (!check) {
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const n = Object.values(manifest).reduce((s, f) => s + (f?.length ?? 0), 0);
  console.log(`\n${n} sound(s) in ${OUT}/manifest.json`);
}
