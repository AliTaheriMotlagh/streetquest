"use client";
// The lag test's runner, inside the game page (/play?bench=<scenario>, see lib/perf/frameStats.ts):
// waits for the mode to load, plays the scenario's script on the real controls, records every
// frame (requestAnimationFrame), the long tasks (main-thread work over 50 ms) and the renderer's
// counts, and posts the result to the page that opened it (/dev/lag) — or leaves it on
// window.__sqBenchResult for scripts/lag-test.ts.
//
// The game exposes its handles only during a bench: Drive sets window.__sq3d, GameMap window.__sqMap.
import { benchResult, scenarioById, type BenchResult, type Scenario } from "@/lib/perf/frameStats";

type Input3d = { gas: number; brake: number; steer: number; nitro: boolean };
type Combat = { onFoot: boolean; getOut: () => void; toggleCam: () => void; input: { mx: number; mz: number; sprint: boolean; aim: boolean; fire: boolean; lookX: number; grapple?: boolean } };
type Stats = { tier: string; level: number; dpr: number; calls: number; triangles: number; textures: number };
export type Bench3d = { api: { skydive: () => void; pull: () => void; swingRings: () => void; cycleCam: () => void } | null; input: Input3d; combat: Combat | null; stats: () => Stats; booted: () => boolean };
type MapLike = { panBy: (p: [number, number], o?: { animate: boolean }) => void; setZoom: (z: number, o?: { animate: boolean }) => void; getZoom: () => number };

declare global {
  interface Window {
    __sq3d?: Bench3d;
    __sqMap?: MapLike;
    __sqBenchResult?: BenchResult;
  }
}

const KEY = "sq-bench";
/** The scenario this page runs (null: a normal game). Read once: /play drops its query after loading. */
export function benchId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(location.search).get("bench");
    if (q) sessionStorage.setItem(KEY, q);
    return q ?? sessionStorage.getItem(KEY);
  } catch {
    return new URLSearchParams(location.search).get("bench");
  }
}
export const benchOn = () => !!benchId();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(get: () => T | null | undefined | false, ms: number): Promise<T | null> {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const v = get();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

/** What each step of a script does, given the time since the clock started (s) — continuous ones run every frame. */
type Action = { once?: (h: Bench3d | null, m: MapLike | null) => void; each?: (t: number, h: Bench3d | null, m: MapLike | null) => void };
const ACTIONS: Record<string, Action> = {
  gas: { each: (_t, h) => h && (h.input.gas = 1) },
  weave: { each: (t, h) => h && (h.input.steer = Math.sin(t * 0.9) * 0.5) },
  nitro: { once: (h) => h && (h.input.nitro = true) },
  getOut: { once: (h) => h?.combat && !h.combat.onFoot && h.combat.getOut() },
  walk: { each: (t, h) => h?.combat && ((h.combat.input.mz = 1), (h.combat.input.lookX = Math.sin(t * 0.6) * 2)) },
  sprint: { once: (h) => h?.combat && (h.combat.input.sprint = true) },
  look: { each: (t, h) => h?.combat && (h.combat.input.lookX = Math.sin(t * 2) * 6) },
  aim: { once: (h) => h?.combat && (h.combat.input.aim = true) },
  fire: { each: (t, h) => h?.combat && (h.combat.input.fire = Math.floor(t * 4) % 2 === 0) },
  grapple: { each: (t, h) => h?.combat && (h.combat.input.grapple = t % 3 < 2) },
  swingRings: { once: (h) => h?.api?.swingRings() },
  skydive: { once: (h) => h?.api?.skydive() },
  pull: { once: (h) => h?.api?.pull() },
  cam: { once: (h) => (h?.combat?.onFoot ? h.combat.toggleCam() : h?.api?.cycleCam()) },
  // The 2D map: a slow circle with a zoom in and out, as a player browsing would.
  mapTour: {
    once: (_h, m) => m?.setZoom(16, { animate: false }),
    each: (t, _h, m) => {
      if (!m) return;
      m.panBy([Math.cos(t * 0.8) * 6, Math.sin(t * 0.8) * 6], { animate: false });
      const want = 15 + Math.round((Math.sin(t * 0.4) + 1) * 1.5);
      if (m.getZoom() !== want) m.setZoom(want, { animate: true });
    },
  },
};

function release(h: Bench3d | null) {
  if (!h) return;
  Object.assign(h.input, { gas: 0, steer: 0, nitro: false });
  if (h.combat) Object.assign(h.combat.input, { mx: 0, mz: 0, sprint: false, aim: false, fire: false, lookX: 0, grapple: false });
}

/** Run one scenario on this page and report it. */
export async function runBench(s: Scenario): Promise<BenchResult> {
  const fail = (error: string) => benchResult(s, [], { longTasks: 0, longTaskMs: 0, error });
  let h: Bench3d | null = null, m: MapLike | null = null;
  if (s.kind === "3d") {
    h = await until(() => (window.__sq3d?.booted() ? window.__sq3d : null), 90_000);
    if (!h) return fail("3D never finished loading");
  } else {
    m = await until(() => window.__sqMap, 30_000);
    if (!m) return fail("map never loaded");
  }
  await sleep(s.warmup * 1000);

  // Long tasks (Chrome, Edge, Android; Safari has none: counted as 0).
  let longTasks = 0, longTaskMs = 0;
  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => ((longTasks += 1), (longTaskMs += e.duration))));
    obs.observe({ type: "longtask", buffered: false });
  } catch {
    obs = null;
  }

  const intervals: number[] = [];
  const started = new Set<number>();
  const t0 = performance.now();
  await new Promise<void>((done) => {
    let last = t0;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      if (now > last) intervals.push(now - last);
      last = now;
      s.steps.forEach((st, i) => {
        if (t < st.at) return;
        const a = ACTIONS[st.do];
        if (!a) return;
        if (!started.has(i)) (started.add(i), a.once?.(h, m));
        a.each?.(t - st.at, h, m);
      });
      if (t >= s.seconds) return done();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  obs?.disconnect();
  release(h);
  // The first interval is from the clock's start to the first frame: not a frame.
  intervals.shift();
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return benchResult(s, intervals, {
    longTasks,
    longTaskMs: Math.round(longTaskMs),
    gfx: h ? h.stats() : undefined,
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : undefined,
  });
}

/** Start the scenario this page was opened for (once), and hand the result back. */
let ran = false;
export function startBenchIfAsked() {
  const id = benchId();
  if (!id || ran) return;
  ran = true;
  const s = scenarioById(id);
  void (async () => {
    const r = s ? await runBench(s) : benchResult({ id, label: id, emoji: "", kind: "3d", seconds: 0, warmup: 0, steps: [] }, [], { longTasks: 0, longTaskMs: 0, error: "unknown scenario" });
    window.__sqBenchResult = r;
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    window.parent?.postMessage({ type: "sq-bench", result: r }, location.origin);
  })();
}
