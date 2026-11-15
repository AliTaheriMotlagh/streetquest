"use client";
// Downloading the game onto the phone (the rules: lib/gameDownload.ts). Started when the 3D city
// opens (unless the connection asks to save data — then from Settings), it fetches every file the
// city uses into the service worker's caches, three at a time, counting bytes as they arrive, so the
// loading screen can say "4.2 of 17 MB · 1.3 MB/s · 9 s left". A file already on the phone is
// skipped, so a second run (a new version) fetches only what changed; once all are in, the version
// is remembered and nothing is checked again until the set changes. Never blocks the game: the city
// loads alongside, and a failed file is simply fetched again the next time.
import { getLocale } from "@/lib/i18n";
import { voiceLangOf } from "@/lib/street/voiceLang";
import { autoDownload, cacheFor, forLanguage, IDLE, nextSpeed, plan, type DownloadState, type GameFile, type GameFiles, type Speed } from "@/lib/gameDownload";

const DONE_KEY = "sq_game_dl";
/** Files fetched at once. */
const PARALLEL = 3;

let state: DownloadState = IDLE;
const listeners = new Set<() => void>();
let lastEmit = 0;
function set(s: Partial<DownloadState>, force = false) {
  state = { ...state, ...s };
  // At most ~8 updates a second while bytes stream in (each one re-renders the loading screen).
  const now = performance.now();
  if (!force && now - lastEmit < 120) return;
  lastEmit = now;
  listeners.forEach((l) => l());
}
export const downloadState = () => state;
export const onDownload = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

let running: Promise<void> | null = null;
let stop: AbortController | null = null;

/** Whether this device should start by itself (not on a data-saving or 2G/3G connection). */
export function shouldAutoDownload() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return autoDownload(c);
}

/** One file into its cache, its bytes counted as they arrive. */
async function fetchInto(f: GameFile, cache: Cache, signal: AbortSignal, onBytes: (n: number) => void) {
  const res = await fetch(f.u, { signal, cache: "no-cache" });
  if (!res.ok || !res.body) throw new Error(String(res.status));
  const reader = res.body.getReader(), parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onBytes(value.length);
  }
  await cache.put(f.u, new Response(new Blob(parts as BlobPart[], { type: res.headers.get("content-type") ?? "" }), { headers: res.headers }));
}

/** Download the game (again: the running download). `force`: even if this version is marked done. */
export function startGameDownload(force = false): Promise<void> {
  if (running) return running;
  if (typeof caches === "undefined" || typeof fetch === "undefined") return Promise.resolve();
  stop = new AbortController();
  const signal = stop.signal;
  running = (async () => {
    set({ ...IDLE, phase: "checking" }, true);
    const list = (await fetch("/api/game-files", { signal }).then((r) => r.json())) as GameFiles;
    let marked: string | null = null;
    try {
      marked = localStorage.getItem(DONE_KEY);
    } catch {}
    const files = forLanguage(list.files, voiceLangOf(getLocale()));
    // What the caches already hold (one lookup per cache, then O(1) per file).
    const have = new Set<string>();
    for (const name of new Set(files.map((f) => cacheFor(f.u)).filter((x): x is string => !!x))) {
      for (const r of await (await caches.open(name)).keys()) have.add(new URL(r.url).pathname);
    }
    const p = plan(files, have);
    if (!p.todo.length || (!force && marked === list.version && p.bytes < p.total * 0.02)) {
      set({ phase: "done", total: p.total, had: p.total, done: 0, bytes: 0, files: 0, filesDone: 0, bps: 0 }, true);
      return;
    }
    set({ phase: "downloading", bytes: p.bytes, total: p.total, had: p.had, files: p.todo.length, filesDone: 0, done: 0, bps: 0 }, true);
    let done = 0, filesDone = 0, failed = 0, speed: Speed | null = nextSpeed(null, 0, performance.now());
    const queue = [...p.todo];
    const worker = async () => {
      for (let f = queue.shift(); f && !signal.aborted; f = queue.shift()) {
        const file = f;
        try {
          await fetchInto(file, await caches.open(cacheFor(file.u)!), signal, (n) => {
            done += n;
            speed = nextSpeed(speed, done, performance.now());
            set({ done, bps: speed.bps });
          });
          filesDone++;
        } catch {
          if (signal.aborted) return;
          failed++;
        }
        set({ filesDone, done });
      }
    };
    // Once a second even when nothing arrives: a stalled connection shows its speed falling and the
    // time left growing, instead of the last estimate frozen on screen.
    const tick = setInterval(() => {
      speed = nextSpeed(speed, done, performance.now());
      set({ bps: speed.bps });
    }, 1000);
    await Promise.all(Array.from({ length: PARALLEL }, worker)).finally(() => clearInterval(tick));
    if (signal.aborted) return set({ phase: "idle" }, true);
    if (!failed)
      try {
        localStorage.setItem(DONE_KEY, list.version);
      } catch {}
    set({ phase: failed ? "failed" : "done", done: p.bytes, bps: 0 }, true);
  })()
    .catch(() => {
      if (!signal.aborted) set({ phase: "failed" }, true);
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** Stop a running download (what's in stays in). */
export function stopGameDownload() {
  stop?.abort();
}

// Dev tools: the state from the console (window.__sqDownload()).
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") (window as unknown as { __sqDownload?: () => DownloadState }).__sqDownload = downloadState;
