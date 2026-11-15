// Downloading the game (pure; tests/gameDownload.test.ts): the 3D city's files — car, people and
// arena models, the 3D decoder, fonts, sounds, the people's recorded voices — fetched once into the
// phone's caches (the service worker serves them from there: app/sw.js), so the city starts at once
// next time and works offline. The list comes from /api/game-files (built with the app); this file
// decides what to fetch, which cache each file belongs in, and how the progress reads.
//  - only the voices of the player's language (the others are never heard);
//  - nothing the cache already holds (a second download fetches only what changed);
//  - the speed is a moving average (one stalled second doesn't swing the time left to "hours").

export type GameFile = { /** Path under the site ("/models/cars/peugeot_405.3f9a.glb"). */ u: string; /** Bytes. */ b: number };
export type GameFiles = { version: string; files: GameFile[] };

/** The service worker's caches (app/sw.js/route.ts: CARS, ASSETS) — a file put here is served from here. */
export const CARS_CACHE = "sq-cars-v1";
export const ASSETS_CACHE = "sq-assets-v1";
/** Which cache holds a file (null: not one the service worker keeps). */
export function cacheFor(u: string): string | null {
  if (u.startsWith("/models/cars/") || u.startsWith("/models/people/")) return CARS_CACHE;
  if (u.startsWith("/models/") || u.startsWith("/fonts/") || u.startsWith("/draco/") || u.startsWith("/sounds/")) return ASSETS_CACHE;
  return null;
}

/** The folders a download covers (app/api/game-files lists them). */
export const GAME_DIRS = ["models", "draco", "fonts", "sounds"] as const;

/** Voices in other languages than `lang` ("fa" | "en" | "tr") are left out. */
export function forLanguage(files: readonly GameFile[], lang: string): GameFile[] {
  return files.filter((f) => {
    const m = /^\/sounds\/voice\/(?:(en|tr)\/)?[^/]+\.mp3$/.exec(f.u);
    if (!m) return true;
    return (m[1] ?? "fa") === lang;
  });
}

/** What's still to fetch (not in `have`), and how big that and the whole set are. */
export function plan(files: readonly GameFile[], have: ReadonlySet<string>): { todo: GameFile[]; bytes: number; total: number; had: number } {
  const todo: GameFile[] = [];
  let bytes = 0, total = 0;
  for (const f of files) {
    if (!cacheFor(f.u)) continue;
    total += f.b;
    if (have.has(f.u)) continue;
    todo.push(f);
    bytes += f.b;
  }
  // The biggest first: the long downloads start early, the small ones fill in round them.
  todo.sort((a, b) => b.b - a.b);
  return { todo, bytes, total, had: total - bytes };
}

export type Speed = { at: number; done: number; bps: number };
/** Weight of the newest sample in the moving average of the speed. */
const SPEED_ALPHA = 0.3;
/** The speed after `done` bytes at `now` ms (samples closer than 250 ms apart are merged). */
export function nextSpeed(s: Speed | null, done: number, now: number): Speed {
  if (!s) return { at: now, done, bps: 0 };
  const dt = now - s.at;
  if (dt < 250) return s;
  const bps = ((done - s.done) * 1000) / dt;
  return { at: now, done, bps: s.bps ? s.bps + SPEED_ALPHA * (bps - s.bps) : bps };
}

export type DownloadState = {
  phase: "idle" | "checking" | "downloading" | "done" | "failed";
  /** Bytes fetched this run, and how many this run has to fetch. */
  done: number;
  bytes: number;
  /** The whole game's size, and how much of it was already on the phone. */
  total: number;
  had: number;
  files: number;
  filesDone: number;
  bps: number;
};
export const IDLE: DownloadState = { phase: "idle", done: 0, bytes: 0, total: 0, had: 0, files: 0, filesDone: 0, bps: 0 };

/** 0…100 of the whole game on the phone. */
export const pctOf = (s: DownloadState) => (s.total ? Math.min(100, ((s.had + s.done) / s.total) * 100) : s.phase === "done" ? 100 : 0);
/** Seconds left at the current speed (null while it isn't known). */
export const etaOf = (s: DownloadState) => (s.bps > 1 && s.bytes > s.done ? Math.ceil((s.bytes - s.done) / s.bps) : null);

/** "850 KB", "4.2 MB" (one decimal under 10 MB), "17 MB". */
export function fmtBytes(n: number): { n: number; unit: "KB" | "MB" } {
  if (n < 1024 * 1024) return { n: Math.max(1, Math.round(n / 1024)), unit: "KB" };
  const mb = n / (1024 * 1024);
  return { n: mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb), unit: "MB" };
}

/**
 * Whether to download by itself when the 3D city opens: not on a connection that asks to save data
 * or a slow one (2G/3G) — there the player asks for it (Settings).
 */
export const autoDownload = (c: { saveData?: boolean; effectiveType?: string } | null | undefined) => !c?.saveData && !["slow-2g", "2g", "3g"].includes(c?.effectiveType ?? "");
