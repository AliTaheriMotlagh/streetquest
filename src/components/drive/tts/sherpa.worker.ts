// The on-device Persian voice, off the game's render thread, one voice per worker (drive/tts/neural.ts is the other
// end; the catalog: lib/tts/sherpa.ts). Ported from the khabar news site (src/scripts/voice-worker.ts): downloads the
// sherpa-onnx WebAssembly runtime and a model into Cache Storage in 8 MB parts (a dropped connection resumes where it
// stopped, a blocked mirror falls through to the next, a stalled one is dropped and tried again), checks every file
// against its SHA-256, then turns text into PCM, one line at a time. A classic worker: the runtime loads by importScripts.
// In:  { t: "init", cache, keys, bases, files, config } first, then { t: "download" } · { t: "load" } · { t: "say", id, text }
// Out: { t: "progress", loaded, total } · { t: "downloaded" } · { t: "audio", id, pcm, rate } · { t: "fail", msg, id? }
type Pack = { name: string; size: number; sha256: string };
type Job = { id: number; text: string };
type Emscripten = {
  _malloc(n: number): number;
  _free(p: number): void;
  lengthBytesUTF8(s: string): number;
  stringToUTF8(s: string, p: number, n: number): void;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _SherpaOnnxOfflineTtsGenerate(tts: number, text: number, sid: number, speed: number): number;
  _SherpaOnnxDestroyOfflineTtsGeneratedAudio(h: number): void;
};
declare function importScripts(...urls: string[]): void;
declare function createOfflineTts(m: unknown, config: unknown): { handle: number };

const scope = self as unknown as { Module?: unknown; postMessage(m: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };
const post = (m: unknown, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
/** Each file is stored in parts this big, so an interrupted download keeps what it already has. */
const PART = 8 * 1024 * 1024;
/** Lines waiting beyond this are dropped, oldest first (the moment passed). */
const QUEUE_MAX = 6;
/** A download that receives nothing for this long is dropped and resumed (filtered connections stall, not fail). */
const STALL_MS = 20_000;
/** Each file is tried this many rounds over every mirror before the download fails. */
const ROUNDS = 4;

let cacheName = "";
let keys = "";
let bases: string[] = [];
let files: Pack[] = [];
let config: unknown;
let preferred = 0;
const partKey = (f: Pack, k: number) => `${keys}${f.sha256}?part=${k}`;
const doneKey = (f: Pack) => `${keys}${f.sha256}?done`;

// ---------- download ----------
let downloading: Promise<void> | null = null;
function download() {
  downloading ??= (async () => {
    const cache = await caches.open(cacheName);
    // What another voice already brought (the runtime) isn't part of this download.
    const have = await Promise.all(files.map((f) => cache.match(doneKey(f))));
    const missing = files.filter((_, i) => !have[i]);
    const total = missing.reduce((s, f) => s + f.size, 0);
    let before = 0, shown = 0;
    const progress = (loaded: number, force = false) => {
      if (!force && performance.now() - shown < 250) return;
      shown = performance.now();
      post({ t: "progress", loaded, total });
    };
    for (const f of missing) {
      if (!(await cache.match(doneKey(f)))) await fetchAny(cache, f, (n, force) => progress(before + n, force));
      before += f.size;
    }
    progress(total, true);
  })().finally(() => (downloading = null));
  return downloading;
}

async function fetchAny(cache: Cache, f: Pack, progress: (loaded: number, force?: boolean) => void) {
  let error: unknown;
  for (let round = 0; round < ROUNDS; round++) {
    if (round) await new Promise((r) => setTimeout(r, round * 3000));
    for (let j = 0; j < bases.length; j++) {
      const k = (preferred + j) % bases.length;
      try {
        await fetchFile(cache, f, bases[k], progress);
        preferred = k;
        return;
      } catch (e) {
        error = e;
        if (!navigator.onLine) throw e;
      }
    }
  }
  throw error;
}

/** What's missing of one file from one mirror, part by part, then the whole file checked. */
async function fetchFile(cache: Cache, f: Pack, base: string, progress: (loaded: number, force?: boolean) => void) {
  let k = 0;
  while (k * PART < f.size && (await cache.match(partKey(f, k)))) k++;
  progress(k * PART, true);
  if (k * PART < f.size) {
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stop.abort(), STALL_MS);
    };
    watch();
    try {
      await fetchRest(cache, f, base, k, stop.signal, watch, progress);
    } finally {
      clearTimeout(timer);
    }
  }
  // Code and model run on the player's device: any mirror's copy must be exactly the pinned file.
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await read(cache, f)));
  if ([...hash].map((b) => b.toString(16).padStart(2, "0")).join("") !== f.sha256) {
    for (let i = 0; i < Math.ceil(f.size / PART); i++) await cache.delete(partKey(f, i));
    throw new Error("corrupt");
  }
  await cache.put(doneKey(f), new Response(JSON.stringify({ size: f.size })));
}

async function fetchRest(cache: Cache, f: Pack, base: string, k: number, signal: AbortSignal, alive: () => void, progress: (loaded: number, force?: boolean) => void) {
  const offset = k * PART;
  const res = await fetch(base + f.name, { signal, ...(offset ? { headers: { Range: `bytes=${offset}-` } } : {}) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  // A server that ignores Range sends the whole file: skip what is already stored.
  let skip = res.status === 206 ? 0 : offset;
  let buf = new Uint8Array(Math.min(PART, f.size - k * PART));
  let at = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    alive();
    if (done) break;
    let chunk = value;
    if (skip) {
      const n = Math.min(skip, chunk.length);
      skip -= n;
      chunk = chunk.subarray(n);
    }
    while (chunk.length && k * PART < f.size) {
      const n = Math.min(buf.length - at, chunk.length);
      buf.set(chunk.subarray(0, n), at);
      at += n;
      chunk = chunk.subarray(n);
      if (at === buf.length) {
        await cache.put(partKey(f, k), new Response(buf));
        k++;
        buf = new Uint8Array(Math.max(0, Math.min(PART, f.size - k * PART)));
        at = 0;
      }
    }
    progress(k * PART + at);
  }
  if (k * PART < f.size) throw new Error("incomplete");
}

async function read(cache: Cache, f: Pack) {
  const out = new Uint8Array(f.size);
  let at = 0;
  for (let k = 0; k < Math.ceil(f.size / PART); k++) {
    const part = await cache.match(partKey(f, k));
    if (!part) throw new Error("missing");
    const b = new Uint8Array(await part.arrayBuffer());
    if (at + b.length > f.size) throw new Error("missing");
    out.set(b, at);
    at += b.length;
  }
  return out;
}

// ---------- the model ----------
let M: Emscripten | null = null;
let tts = 0;
let loading: Promise<void> | null = null;

function load() {
  loading ??= (async () => {
    const cache = await caches.open(cacheName);
    if (!(await Promise.all(files.map((f) => cache.match(doneKey(f))))).every(Boolean)) await download();
    const [main, glue, wasm, data] = await Promise.all(files.map((f) => read(cache, f)));
    await new Promise<void>((resolve, reject) => {
      scope.Module = {
        wasmBinary: wasm,
        getPreloadedPackage: () => data.buffer,
        locateFile: (p: string) => p,
        print() {},
        printErr() {},
        onRuntimeInitialized: resolve,
        onAbort: (what: unknown) => reject(new Error(String(what))),
      };
      const js = (b: Uint8Array) => URL.createObjectURL(new Blob([b as BlobPart], { type: "text/javascript" }));
      importScripts(js(main), js(glue));
    });
    M = scope.Module as Emscripten;
    tts = createOfflineTts(M, config).handle;
    if (!tts) throw new Error("model");
  })();
  return loading;
}

/** One piece of text → mono PCM (a copy out of the runtime's heap) and its rate. */
function speak(text: string): { pcm: Float32Array; rate: number } {
  const m = M!;
  const n = m.lengthBytesUTF8(text) + 1;
  const p = m._malloc(n);
  m.stringToUTF8(text, p, n);
  const h = m._SherpaOnnxOfflineTtsGenerate(tts, p, 0, 1);
  m._free(p);
  if (!h) throw new Error("generate");
  const at = m.HEAP32[h / 4] / 4, count = m.HEAP32[h / 4 + 1], rate = m.HEAP32[h / 4 + 2];
  const pcm = m.HEAPF32.slice(at, at + count);
  m._SherpaOnnxDestroyOfflineTtsGeneratedAudio(h);
  return { pcm, rate };
}

// ---------- the queue ----------
const queue: Job[] = [];
let busy = false;

async function pump() {
  if (busy) return;
  busy = true;
  try {
    await load();
    while (queue.length) {
      const job = queue.shift()!;
      try {
        const { pcm, rate } = speak(job.text);
        post({ t: "audio", id: job.id, pcm, rate }, [pcm.buffer]);
      } catch (e) {
        post({ t: "fail", id: job.id, msg: String((e as Error).message ?? e) });
      }
      await new Promise((r) => setTimeout(r));
    }
  } catch (e) {
    for (const j of queue.splice(0)) post({ t: "fail", id: j.id, msg: String((e as Error).message ?? e) });
    loading = null;
    post({ t: "fail", msg: String((e as Error).message ?? e) });
  }
  busy = false;
}

scope.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.t === "init") {
    cacheName = m.cache;
    keys = m.keys;
    bases = m.bases;
    files = m.files;
    config = m.config;
  } else if (m.t === "download") {
    download().then(
      () => post({ t: "downloaded" }),
      (err) => post({ t: "fail", msg: String(err?.message ?? err) }),
    );
  } else if (m.t === "load") {
    load().catch(() => (loading = null));
  } else if (m.t === "say") {
    queue.push({ id: m.id, text: m.text });
    while (queue.length > QUEUE_MAX) post({ t: "fail", id: queue.shift()!.id, msg: "dropped" });
    void pump();
  }
};

export {};
