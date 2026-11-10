// npm run assets:sounds — turn the recordings in assets/sounds/<slot>/ into the game's sounds.
//
// For every slot in src/lib/soundSlots.ts: each source file (wav, mp3, ogg, flac, aiff, m4a)
// is trimmed of leading silence, cut to the slot's length (one-shots), loudness-matched
// (EBU R128, so a crash and a horn sit at the same level before the game mixes them), made
// mono unless the slot is stereo ambience, and written as public/sounds/<slot>-<n>.mp3; then
// public/sounds/manifest.json lists what's there. A slot without files is left to the synth.
//
// Sources are either yours (dropped in by hand — e.g. bought with a soundsnap.ir subscription)
// or the free ones listed in assets/sound-sources.json (CC0 / public domain / CC BY), which
// --fetch downloads and mixes into takes (assets/sounds/<slot>/auto-<n>.wav: several short
// hits layered into one crash, a honk cut out of a longer recording…). Sources stay out of
// git (assets/sounds is gitignored); the converted files and the manifest — with the credits
// /credits shows — are what ships.
//   --fetch   download assets/sound-sources.json's sources and build its takes first
//   --check   only report which slots have files, convert nothing
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOUND_KEYS, SOUND_SLOTS, slotFile, type SoundCredit, type SoundKey, type SoundManifest } from "../src/lib/soundSlots";

const SRC = "assets/sounds";
const OUT = "public/sounds";
const AUDIO = /\.(wav|mp3|ogg|flac|aiff?|m4a)$/i;
const check = process.argv.includes("--check");
const fetchFirst = process.argv.includes("--fetch");
const SOURCES = "assets/sound-sources.json";
const DL = join(SRC, "_src");
const UA = "StreetQuest-asset-script/1.0 (game sound effects)";

type Source = { url: string; page: string; title: string; author: string; license: string; zip?: boolean };
type Layer = { src: string; at?: number; gain?: number; from?: number; len?: number; rate?: number };
type Take = { slot: SoundKey; layers: Layer[] };
const list = JSON.parse(readFileSync(SOURCES, "utf8")) as { sources: Record<string, Source>; takes: Take[] };

/** Download every source once (a zip is unpacked into its own folder). */
async function download() {
  mkdirSync(DL, { recursive: true });
  for (const [id, s] of Object.entries(list.sources)) {
    if (!/^(CC0|Public domain|CC BY [0-9.]+)$/.test(s.license)) throw new Error(`${id}: ${s.license} isn't a licence the game can ship`);
    const file = join(DL, s.zip ? `${id}.zip` : `${id}${s.url.match(/\.(ogg|wav|mp3|flac|oga)$/i)?.[0] ?? ".audio"}`);
    if (!existsSync(file)) {
      process.stdout.write(`↓ ${id} … `);
      let res = await fetch(s.url, { headers: { "user-agent": UA } });
      // Too fast for Wikimedia: back off and try again (as long as it asks, up to ~1 min in all).
      for (let tries = 1; res.status === 429 && tries <= 5; tries++) {
        await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 4 * tries) * 1000));
        res = await fetch(s.url, { headers: { "user-agent": UA } });
      }
      if (!res.ok) throw new Error(`${id}: ${res.status} ${s.url}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log("ok");
      // Polite to Wikimedia's servers.
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (s.zip && !existsSync(join(DL, id))) execFileSync("unzip", ["-oqj", file, "-d", join(DL, id)]);
  }
}

/** A layer's file: "<id>" or "<zip id>/<member>". */
function layerFile(src: string) {
  const [id, member] = src.split("/");
  const s = list.sources[id];
  if (!s) throw new Error(`unknown source ${id}`);
  if (s.zip) return join(DL, id, member);
  return join(DL, readdirSync(DL).find((f) => f.startsWith(`${id}.`))!);
}

/** Mix every take into assets/sounds/<slot>/auto-<n>.wav; the credits of what was used. */
function buildTakes(): SoundCredit[] {
  for (const k of SOUND_KEYS) for (const f of readdirSync(join(SRC, k))) if (f.startsWith("auto-")) rmSync(join(SRC, k, f));
  const n: Partial<Record<SoundKey, number>> = {};
  const used = new Set<string>();
  for (const t of list.takes) {
    const i = (n[t.slot] = (n[t.slot] ?? 0) + 1);
    const args: string[] = [];
    const chains = t.layers.map((l, j) => {
      used.add(l.src.split("/")[0]);
      if (l.from) args.push("-ss", String(l.from));
      if (l.len) args.push("-t", String(l.len));
      args.push("-i", layerFile(l.src));
      const rate = l.rate ?? 1, at = Math.round(l.at ?? 0);
      return `[${j}:a]aresample=44100,aformat=channel_layouts=stereo,asetrate=${Math.round(44100 * rate)},aresample=44100,adelay=${at}|${at},volume=${l.gain ?? 0}dB[l${j}]`;
    });
    const mix = `${chains.join(";")};${t.layers.map((_, j) => `[l${j}]`).join("")}amix=inputs=${t.layers.length}:normalize=0:duration=longest[out]`;
    ffmpeg([...args, "-filter_complex", mix, "-map", "[out]", join(SRC, t.slot, `auto-${i}.wav`)]);
  }
  return [...used].map((id) => {
    const s = list.sources[id];
    return { title: s.title, author: s.author, url: s.page, license: s.license };
  });
}

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

mkdirSync(SRC, { recursive: true });
for (const k of SOUND_KEYS) mkdirSync(join(SRC, k), { recursive: true });
if (!check) mkdirSync(OUT, { recursive: true });

// The free sources' credits survive a plain re-run (no --fetch) from the last manifest.
const before = existsSync(join(OUT, "manifest.json")) ? (JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")) as SoundManifest) : {};
let credits: SoundCredit[] = before.credits ?? [];
if (fetchFirst && !check) {
  await download();
  credits = buildTakes();
}
const hasAuto = SOUND_KEYS.some((k) => readdirSync(join(SRC, k)).some((f) => f.startsWith("auto-")));
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
    const loop = "loop" in slot && !!slot.loop, stereo = "stereo" in slot && !!slot.stereo;
    const input = ["-i", join(SRC, key, f), "-t", String(slot.maxS)];
    // Leading silence off (loops keep theirs so they stay seamless).
    const shape = loop ? [] : ["silenceremove=start_periods=1:start_threshold=-45dB"];
    // Loops are long enough for EBU R128 loudness; a one-shot under a few seconds isn't (it
    // reads far too quiet or loud), so its peak is set instead: every hit peaks at −2 dB (MP3 encoding overshoots a little).
    const level = loop ? ["loudnorm=I=-18:TP=-1.5:LRA=11"] : [`volume=${-2 - peakOf(input, shape)}dB`];
    ffmpeg([
      ...input,
      "-af", [...shape, ...level].join(","),
      "-ac", stereo ? "2" : "1",
      "-ar", "44100",
      // Ambience is long: a lower rate keeps it light for phones.
      "-codec:a", "libmp3lame", "-b:a", stereo ? "64k" : "96k",
      join(OUT, out),
    ]);
    return out;
  });
}

/** A file's peak (dBFS) after these filters. */
function peakOf(input: string[], filters: string[]) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...input, "-af", [...filters, "volumedetect"].join(","), "-f", "null", "-"], { encoding: "utf8" });
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr ?? "");
  return m ? Number(m[1]) : -1;
}
if (!check) {
  if (hasAuto && credits.length) manifest.credits = credits;
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const n = SOUND_KEYS.reduce((s, k) => s + (manifest[k]?.length ?? 0), 0);
  console.log(`\n${n} sound(s) in ${OUT}/manifest.json`);
}
