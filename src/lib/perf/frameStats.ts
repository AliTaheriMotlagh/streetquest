// The lag test's numbers (pure; tests/frameStats.test.ts). A run of a game mode records the
// time between frames; this turns them into what a player feels:
//  - fps: frames per second over the run;
//  - p50 / p95 / p99: the frame time most frames beat (ms) — p99 is the hitch you notice;
//  - 1% low: the fps of the slowest 1% of frames (what reviewers call "1% lows");
//  - janks: frames that took more than twice the target (a visible stutter), and hitches (>100 ms: a freeze);
//  - the verdict: smooth / ok / laggy against the scenario's budget.
// components/perf/benchRunner.ts records, /dev/lag shows, scripts/lag-test.ts runs it headless.
import { msg } from "../i18n";

export type FrameStats = {
  frames: number;
  seconds: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  low1: number;
  janks: number;
  hitches: number;
  /** Share of the run's time spent in janky frames (0…1). */
  jankShare: number;
};

export type Verdict = "smooth" | "ok" | "laggy";
export type Budget = { /** The fps the mode aims at. */ fps: number; /** The p99 frame (ms) a smooth run stays under. */ p99: number; /** Janks a minute still called smooth. */ janksPerMin: number };

/** Phones and laptops on 60 Hz: 60 fps for the 2D map, 3D aims at 50 and accepts 30 as "ok". */
export const BUDGETS: Record<"map" | "3d", Budget> = {
  map: { fps: 55, p99: 34, janksPerMin: 6 },
  "3d": { fps: 45, p99: 50, janksPerMin: 12 },
};

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Frame intervals (ms) → the run's numbers. `targetMs` is the display's frame (16.7 at 60 Hz):
 * a jank is a frame over twice it. Gaps over 1 s (a tab in the background, a debugger) are
 * dropped: they aren't lag the game made.
 */
export function frameStats(intervals: number[], targetMs = 1000 / 60): FrameStats {
  const ms = intervals.filter((d) => Number.isFinite(d) && d > 0 && d < 1000);
  const total = ms.reduce((a, b) => a + b, 0);
  if (!ms.length || total <= 0) return { frames: 0, seconds: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0, low1: 0, janks: 0, hitches: 0, jankShare: 0 };
  const sorted = [...ms].sort((a, b) => a - b);
  // 1% low: the mean of the slowest 1% of frames as fps (at least one frame).
  const slow = sorted.slice(-Math.max(1, Math.floor(sorted.length / 100)));
  const slowMean = slow.reduce((a, b) => a + b, 0) / slow.length;
  const jank = ms.filter((d) => d > targetMs * 2);
  return {
    frames: ms.length,
    seconds: r1(total / 1000),
    fps: r1((ms.length * 1000) / total),
    p50: r1(pct(sorted, 50)),
    p95: r1(pct(sorted, 95)),
    p99: r1(pct(sorted, 99)),
    worst: r1(sorted[sorted.length - 1]),
    low1: r1(1000 / slowMean),
    janks: jank.length,
    hitches: ms.filter((d) => d > 100).length,
    jankShare: Math.round((jank.reduce((a, b) => a + b, 0) / total) * 1000) / 1000,
  };
}

/**
 * Smooth: at the budget's fps, p99 under its limit and few janks a minute. Laggy: under 30 fps
 * (24 for 3D at the lowest tier would be worse than a console's floor), a 1% low under 15, or
 * any hitch every ten seconds. Anything between is ok.
 */
export function judge(s: FrameStats, b: Budget): Verdict {
  if (!s.frames) return "laggy";
  const perMin = s.seconds > 0 ? (s.janks / s.seconds) * 60 : 0;
  const hitchEvery = s.hitches ? s.seconds / s.hitches : Infinity;
  if (s.fps < 30 || s.low1 < 15 || hitchEvery < 10) return "laggy";
  if (s.fps >= b.fps && s.p99 <= b.p99 && perMin <= b.janksPerMin) return "smooth";
  return "ok";
}

/** Why a run isn't smooth, worst first (keys for t()). */
export function whyNotSmooth(s: FrameStats, b: Budget): string[] {
  const out: string[] = [];
  if (s.fps < b.fps) out.push(msg("Frame rate under target"));
  if (s.p99 > b.p99) out.push(msg("Slow frames (p99) over budget"));
  if (s.seconds > 0 && (s.janks / s.seconds) * 60 > b.janksPerMin) out.push(msg("Too many stutters"));
  if (s.hitches) out.push(msg("Freezes over 100 ms"));
  return out;
}

/** One step of a scenario's script: at `at` seconds, set the controls (or call an action). */
export type BenchStep = { at: number; do: string };
export type Scenario = {
  id: string;
  label: string;
  emoji: string;
  /** Where it starts: the 2D map or the 3D city. */
  kind: "map" | "3d";
  /** Seconds measured (after the warm-up). */
  seconds: number;
  /** Seconds the scene gets to load before the clock starts. */
  warmup: number;
  steps: BenchStep[];
};

/**
 * Every game mode, scripted so each run does the same thing: the steps are actions the
 * runner knows (components/perf/benchRunner.ts ACTIONS). Each 3D run starts in the car.
 */
export const SCENARIOS: Scenario[] = [
  { id: "map", label: msg("2D map: pan and zoom"), emoji: "🗺️", kind: "map", seconds: 15, warmup: 4, steps: [{ at: 0, do: "mapTour" }] },
  { id: "idle3d", label: msg("3D city: standing still"), emoji: "🏙️", kind: "3d", seconds: 10, warmup: 8, steps: [] },
  { id: "drive", label: msg("Driving through the city"), emoji: "🚗", kind: "3d", seconds: 20, warmup: 8, steps: [{ at: 0, do: "gas" }, { at: 0, do: "weave" }, { at: 12, do: "nitro" }] },
  { id: "foot", label: msg("On foot: walking and running"), emoji: "🚶", kind: "3d", seconds: 15, warmup: 8, steps: [{ at: 0, do: "getOut" }, { at: 1, do: "walk" }, { at: 6, do: "sprint" }, { at: 11, do: "look" }] },
  { id: "shoot", label: msg("On foot: shooting"), emoji: "🔫", kind: "3d", seconds: 12, warmup: 8, steps: [{ at: 0, do: "getOut" }, { at: 1, do: "aim" }, { at: 1.5, do: "fire" }, { at: 4, do: "walk" }] },
  { id: "hero", label: msg("Hero moves: Sky Rings"), emoji: "🦸", kind: "3d", seconds: 15, warmup: 8, steps: [{ at: 0, do: "swingRings" }, { at: 1, do: "walk" }, { at: 1.5, do: "grapple" }] },
  { id: "sky", label: msg("Skydive"), emoji: "🪂", kind: "3d", seconds: 15, warmup: 8, steps: [{ at: 0, do: "skydive" }, { at: 0.5, do: "gas" }, { at: 9, do: "pull" }] },
  { id: "camera", label: msg("Every camera"), emoji: "🎥", kind: "3d", seconds: 12, warmup: 8, steps: [{ at: 0, do: "gas" }, { at: 3, do: "cam" }, { at: 6, do: "cam" }, { at: 9, do: "cam" }] },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? null;
/** The page a scenario runs in (the runner reads ?bench=). */
export const scenarioUrl = (s: Scenario) => (s.kind === "map" ? `/play?bench=${s.id}` : `/play?drive=1&bench=${s.id}`);

export type BenchResult = {
  id: string;
  stats: FrameStats;
  verdict: Verdict;
  why: string[];
  /** Long tasks (> 50 ms of main-thread work) seen while measuring, and their total ms. */
  longTasks: number;
  longTaskMs: number;
  /** The renderer at the end of the run (3D only). */
  gfx?: { tier: string; level: number; dpr: number; calls: number; triangles: number; textures: number };
  heapMB?: number;
  /** What failed, when it couldn't run (no 3D, never loaded). */
  error?: string;
};

/**
 * What one frame of the 3D city may cost per tier: draw calls (CPU and driver time — the iPad 7's
 * wall) and triangles (vertex work and memory). Measured at Valiasr, Tehran (35.7006, 51.4013) at
 * 1280×800 in Nov 2026: low 268 calls / 1.14M triangles before the low tier's 20-triangle trees,
 * medium 307 / 1.86M, high 327 / 1.97M, ultra 322 / 2.07M; after (lite city on low too): low 173 / 0.26M, high
 * 299 / 1.93M (M1, Chrome, standing still). The budgets sit a little above those so a
 * run that grows past them (a new prop without instancing, a forgotten LOD) is caught by test:lag.
 */
export const GFX_BUDGETS: Record<"low" | "medium" | "high" | "ultra", { calls: number; triangles: number }> = {
  low: { calls: 240, triangles: 500_000 },
  medium: { calls: 360, triangles: 2_100_000 },
  high: { calls: 400, triangles: 2_300_000 },
  ultra: { calls: 420, triangles: 2_500_000 },
};

/** Why a frame's renderer numbers are over its tier's budget (keys for t()); empty when within it or unknown. */
export function gfxOver(g: BenchResult["gfx"]): string[] {
  const b = g && GFX_BUDGETS[g.tier as keyof typeof GFX_BUDGETS];
  if (!g || !b) return [];
  const out: string[] = [];
  if (g.calls > b.calls) out.push(msg("Draw calls over budget"));
  if (g.triangles > b.triangles) out.push(msg("Triangles over budget"));
  return out;
}

/** The result of one run, judged against its budget (and, in 3D, its tier's draw budget: over it is never "smooth"). */
export function benchResult(s: Scenario, intervals: number[], extra: Omit<BenchResult, "id" | "stats" | "verdict" | "why"> = { longTasks: 0, longTaskMs: 0 }): BenchResult {
  const stats = frameStats(intervals);
  const b = BUDGETS[s.kind];
  if (extra.error) return { id: s.id, stats, verdict: "laggy", why: [], ...extra };
  const over = gfxOver(extra.gfx);
  let verdict = judge(stats, b);
  if (over.length && verdict === "smooth") verdict = "ok";
  return { id: s.id, stats, verdict, why: [...whyNotSmooth(stats, b), ...over], ...extra };
}

/** All runs as one line each, for the terminal and "copy". */
export function benchTable(results: BenchResult[]): string {
  const head = "mode          verdict  fps   1%low  p50   p95   p99   worst  janks hitch longtasks";
  const rows = results.map((r) => {
    const s = r.stats;
    const cell = (v: number | string, w: number) => String(v).padEnd(w);
    return `${cell(r.id, 14)}${cell(r.error ? "error" : r.verdict, 9)}${cell(s.fps, 6)}${cell(s.low1, 7)}${cell(s.p50, 6)}${cell(s.p95, 6)}${cell(s.p99, 6)}${cell(s.worst, 7)}${cell(s.janks, 6)}${cell(s.hitches, 6)}${r.longTasks}${r.error ? `  (${r.error})` : ""}`;
  });
  return [head, ...rows].join("\n");
}
