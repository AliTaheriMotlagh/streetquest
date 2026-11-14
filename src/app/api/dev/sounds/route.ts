// Development only (404 in production): what /dev/sounds reads and writes.
//   GET                     every slot (lib/soundSlots.ts) with its source takes (assets/sounds/<slot>/) and shipped files (manifest)
//   GET ?src=<slot>/<file>  one source take, to listen to or edit
//   POST ?slot=&name=       save a take (the page sends WAV: a recording, an upload, an edit)
//   DELETE ?slot=&name=     remove a source take
//   POST ?build=1           run `npm run assets:sounds` (ffmpeg: trims, levels, writes public/sounds + the manifest)
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { readManifest, slotGroup, SOUND_KEYS, SOUND_SLOTS, type SoundKey } from "@/lib/soundSlots";

const SRC = join(process.cwd(), "assets/sounds");
const off = () => process.env.NODE_ENV === "production";
const FILE = /^[\w .()-]{1,80}\.(wav|mp3|ogg|flac|m4a|aiff?)$/i;
const isSlot = (k: string | null): k is SoundKey => !!k && (SOUND_KEYS as string[]).includes(k);
const TYPES: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aif: "audio/aiff", aiff: "audio/aiff" };

export async function GET(req: Request) {
  if (off()) return new Response(null, { status: 404 });
  const src = new URL(req.url).searchParams.get("src");
  if (src) {
    const [slot, name] = src.split("/");
    const path = join(SRC, slot ?? "", name ?? "");
    if (!isSlot(slot) || !FILE.test(name ?? "") || !existsSync(path)) return new Response(null, { status: 404 });
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { "content-type": TYPES[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream", "content-length": String(statSync(path).size), "cache-control": "no-store" } });
  }
  const manifestPath = join(process.cwd(), "public/sounds/manifest.json");
  const manifest = existsSync(manifestPath) ? readManifest(JSON.parse(readFileSync(manifestPath, "utf8"))) : {};
  const slots = SOUND_KEYS.map((key) => {
    const dir = join(SRC, key);
    const sources = existsSync(dir) ? readdirSync(dir).filter((f) => FILE.test(f)).sort() : [];
    return { key, group: slotGroup(key), ...SOUND_SLOTS[key], sources, shipped: (manifest as Record<string, string[]>)[key] ?? [] };
  });
  return Response.json({ slots });
}

export async function POST(req: Request) {
  if (off()) return new Response(null, { status: 404 });
  const q = new URL(req.url).searchParams;
  if (q.get("build")) return Response.json(await build());
  const slot = q.get("slot"), name = q.get("name") ?? "";
  if (!isSlot(slot) || !FILE.test(name)) return new Response("Not a slot or a file name", { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 200 || buf.length > 30_000_000) return new Response("Not a sound", { status: 400 });
  mkdirSync(join(SRC, slot), { recursive: true });
  writeFileSync(join(SRC, slot, name), buf);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (off()) return new Response(null, { status: 404 });
  const q = new URL(req.url).searchParams;
  const slot = q.get("slot"), name = q.get("name") ?? "";
  if (!isSlot(slot) || !FILE.test(name)) return new Response("Not a slot or a file name", { status: 400 });
  rmSync(join(SRC, slot, name), { force: true });
  return Response.json({ ok: true });
}

/** `npm run assets:sounds`, its output's tail (it needs ffmpeg on this machine). */
function build(): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/sounds.ts"], { cwd: process.cwd(), env: process.env });
    let log = "";
    const add = (d: Buffer) => (log = (log + d.toString()).slice(-6000));
    p.stdout.on("data", add);
    p.stderr.on("data", add);
    const timer = setTimeout(() => p.kill(), 5 * 60_000);
    p.on("close", (code) => (clearTimeout(timer), resolve({ ok: code === 0, log })));
    p.on("error", (e) => (clearTimeout(timer), resolve({ ok: false, log: `${log}\n${e.message}` })));
  });
}
