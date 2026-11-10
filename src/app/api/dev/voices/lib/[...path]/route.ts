// Development only (404 in production): what /dev/voices needs to run Piper, from this
// server instead of the CDNs — a 13 MB WebAssembly file or a 60 MB model downloaded by the
// browser from jsDelivr / Hugging Face is often cut off on Iran's connections. Fetched here
// once (with retries and a long wait), kept in assets/voices/lib/ (gitignored), then served
// from disk. Only these files:
//   ort/<version>/ort-wasm-simd-threaded.{mjs,wasm}   the ONNX runtime (onnxruntime-web)
//   piper/piper_phonemize.{wasm,data}                  Piper's phonemizer (espeak-ng)
//   model/fa_IR-{amir,gyro}-medium.onnx[.json]         Piper's Persian voices (men)
//   model/fa-haaniye-low.onnx[.json]                   Mimic 3's Persian woman's voice
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

const DIR = join(process.cwd(), "assets/voices/lib");
const TYPES: Record<string, string> = { mjs: "text/javascript", wasm: "application/wasm", json: "application/json" };

/** Where a file comes from, or null if it isn't one of ours. */
function sourceOf(parts: string[]): string | null {
  const [kind, a, b] = parts;
  if (kind === "ort" && /^\d+\.\d+\.\d+$/.test(a ?? "") && /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(b ?? "")) return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${a}/dist/${b}`;
  if (kind === "piper" && parts.length === 2 && /^piper_phonemize\.(wasm|data)$/.test(a ?? "")) return `https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/${a}`;
  const m = kind === "model" && parts.length === 2 ? (a ?? "").match(/^fa_IR-(amir|gyro)-medium\.onnx(\.json)?$/) : null;
  if (m) return `https://huggingface.co/diffusionstudio/piper-voices/resolve/main/fa/fa_IR/${m[1]}/medium/${a}`;
  // A woman's voice (Piper has none in Persian): Mycroft Mimic 3's «haaniye», CC0.
  const w = kind === "model" && parts.length === 2 ? (a ?? "").match(/^fa-haaniye-low\.onnx(\.json)?$/) : null;
  // (The model is in Git LFS: github.com/…/raw/ gives the file, raw.githubusercontent only a pointer.)
  if (w) return w[1] ? "https://raw.githubusercontent.com/MycroftAI/mimic3-voices/master/voices/fa/haaniye_low/config.json" : "https://github.com/MycroftAI/mimic3-voices/raw/master/voices/fa/haaniye_low/generator.onnx";
  return null;
}

const inflight = new Map<string, Promise<void>>();
/** Download once (shared by concurrent requests), a few tries, each allowed several minutes. */
function fetchTo(url: string, file: string) {
  let p = inflight.get(file);
  if (!p) {
    p = (async () => {
      let last: unknown;
      for (let i = 0; i < 4; i++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
          if (!res.ok) throw new Error(`${res.status} ${url}`);
          const buf = Buffer.from(await res.arrayBuffer());
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(`${file}.part`, buf);
          renameSync(`${file}.part`, file);
          return;
        } catch (e) {
          last = e;
        }
      }
      throw last;
    })().finally(() => inflight.delete(file));
    inflight.set(file, p);
  }
  return p;
}

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const parts = (await ctx.params).path;
  const src = sourceOf(parts);
  if (!src) return new Response(null, { status: 404 });
  const file = join(DIR, ...parts);
  if (!existsSync(file)) {
    try {
      await fetchTo(src, file);
    } catch (e) {
      return new Response(`Couldn't download ${src}: ${(e as Error).message}`, { status: 502 });
    }
  }
  const ext = file.split(".").pop() ?? "";
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "content-length": String(statSync(file).size), "cache-control": "no-store" },
  });
}
