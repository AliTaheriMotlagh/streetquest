// The on-device voices' worker: runs Piper / Mimic 3 models (ONNX, WebAssembly) off the game's
// render thread. Messages (drive/tts/neural.ts is the other end):
//   in   { type: "say", id, text, model: NeuralModel, base, ortUrl, phonemizerUrl }
//   out  { type: "audio", id, pcm (transferred), rate } | { type: "error", id, message }
//        { type: "progress", model, loaded, total } while a model downloads (once — then Cache Storage)
// The phonemizer is espeak-ng (Piper's build); the model files come from `base` (the voice host).
/// <reference lib="webworker" />
import { haaniyeIds, piperIds } from "@/lib/tts/ids";
import type { NeuralModel } from "@/lib/tts/neural";

type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: unknown, dims: number[]) => unknown;
  InferenceSession: { create: (m: ArrayBuffer, o: object) => Promise<Session> };
};
type Session = { run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> };
type Phonemize = (o: object) => Promise<{ callMain: (a: string[]) => void }>;
type Cfg = { espeak?: { voice?: string }; audio?: { sample_rate?: number }; inference?: { noise_scale?: number; length_scale?: number; noise_w?: number }; phoneme_id_map: Record<string, number[]> };
type Say = { type: "say"; id: number; text: string; model: NeuralModel; base: string; ortUrl: string; phonemizerUrl: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const CACHE = "sq-voices-1";
let ort: Ort | null = null;
let phonemize: Phonemize | null = null;
const sessions = new Map<string, Promise<{ s: Session; cfg: Cfg }>>();

/** A file from the voice host, kept in Cache Storage after the first time (the models are ~60 MB). */
async function file(url: string, model?: string): Promise<Response> {
  const cache = typeof caches !== "undefined" ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) return hit;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`${r.status} ${url}`);
  const total = Number(r.headers.get("content-length")) || 0;
  // Read it in pieces to say how far the download is.
  const reader = r.body.getReader(), parts: Uint8Array[] = [];
  let loaded = 0, lastSent = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (model && loaded - lastSent > 1_000_000) ctx.postMessage({ type: "progress", model, loaded, total }), (lastSent = loaded);
  }
  const body = new Blob(parts as BlobPart[]);
  const copy = new Response(body, { headers: { "content-type": r.headers.get("content-type") ?? "application/octet-stream" } });
  await cache?.put(url, copy.clone()).catch(() => {});
  if (model) ctx.postMessage({ type: "progress", model, loaded, total: loaded });
  return copy;
}

async function runtime(m: Say) {
  if (!ort) {
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ m.ortUrl);
    ort = (mod.default ?? mod) as Ort;
    ort.env.wasm.wasmPaths = `${m.base}ort/1.27.0/`;
    // One thread: the game needs the rest of the phone.
    ort.env.wasm.numThreads = 1;
  }
  if (!phonemize) {
    const ph = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ m.phonemizerUrl);
    phonemize = (ph as { createPiperPhonemize: Phonemize }).createPiperPhonemize;
  }
  return { ort, phonemize };
}

function session(m: Say) {
  const key = m.model.id;
  let s = sessions.get(key);
  if (!s) {
    s = (async () => {
      const { ort } = await runtime(m);
      // haaniye borrows the Persian Piper model's phoneme map (to read its symbols back).
      const cfgFile = m.model.kind === "haaniye" ? "fa_IR-amir-medium" : m.model.file;
      const [cfg, bytes] = await Promise.all([
        file(`${m.base}model/${cfgFile}.onnx.json`).then((r) => r.json() as Promise<Cfg>),
        file(`${m.base}model/${m.model.file}.onnx`, m.model.id).then((r) => r.arrayBuffer()),
      ]);
      return { s: await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] }), cfg };
    })();
    s.catch(() => sessions.delete(key));
    sessions.set(key, s);
  }
  return s;
}

/** espeak-ng's phonemes for the text (one symbol per codepoint, " " between words). */
function phonemes(m: Say, lang: string, cfg: Cfg) {
  const sym = new Map<number, string>();
  for (const [s, ids] of Object.entries(cfg.phoneme_id_map)) for (const id of ids) if (!sym.has(id)) sym.set(id, s);
  return new Promise<string[]>((resolve, reject) => {
    void phonemize!({
      print: (line: string) => {
        try {
          const r = JSON.parse(line) as { phonemes?: (string | string[])[]; phoneme_ids?: number[] };
          const given = (r.phonemes ?? []).flat();
          resolve(given.length ? given : (r.phoneme_ids ?? []).map((id) => sym.get(id) ?? "").filter((s) => s && s !== "^" && s !== "$" && s !== "_"));
        } catch (e) {
          reject(e);
        }
      },
      printErr: () => {},
      locateFile: (u: string) => (u.endsWith(".wasm") ? `${m.base}piper/piper_phonemize.wasm` : u.endsWith(".data") ? `${m.base}piper/piper_phonemize.data` : u),
    }).then((mod) => mod.callMain(["-l", lang, "--input", JSON.stringify([{ text: m.text }]), "--espeak_data", "/espeak-ng-data"]), reject);
  });
}

async function say(m: Say) {
  const { s, cfg } = await session(m);
  const { ort } = await runtime(m);
  const haaniye = m.model.kind === "haaniye";
  const symbols = await phonemes(m, haaniye ? "fa" : cfg.espeak?.voice ?? "fa", cfg);
  const ids = haaniye ? haaniyeIds(symbols) : piperIds(symbols, cfg.phoneme_id_map);
  const inf = haaniye ? [0.333, 1.0, 0.333] : [cfg.inference?.noise_scale ?? 0.667, cfg.inference?.length_scale ?? 1, cfg.inference?.noise_w ?? 0.8];
  const out = await s.run({
    input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from(inf), [3]),
  });
  return { pcm: Float32Array.from(out.output.data), rate: haaniye ? 22050 : cfg.audio?.sample_rate ?? 22050 };
}

// One line at a time (the model is single-threaded anyway); the newest waiting lines first would
// reorder a conversation, so it's first come, first served.
let chain: Promise<unknown> = Promise.resolve();
ctx.onmessage = (e: MessageEvent<Say>) => {
  const m = e.data;
  if (m?.type !== "say") return;
  chain = chain.then(() =>
    say(m).then(
      ({ pcm, rate }) => ctx.postMessage({ type: "audio", id: m.id, pcm, rate }, [pcm.buffer]),
      (err: Error) => ctx.postMessage({ type: "error", id: m.id, message: String(err?.message ?? err) }),
    ),
  );
};
