// The device's tier from a short GPU benchmark (pure; tests/tier.test.ts). The GPU's name alone
// can't place a device: iOS and Safari report every Apple chip as "Apple GPU", so a 2019 iPad
// (A10) and an M4 iPad Pro looked the same and both started on "high". The benchmark
// (components/drive/graphics/bench.ts) draws a fixed shader into a 512×512 target for ~0.1–0.3 s
// and reports how many million pixels it shades per millisecond; this turns that into a tier
// ceiling, keeps it per device + browser version, and says when to run it again.
import type { Tier } from "@/components/drive/graphics/quality";

/** Bump when the benchmark's shader or size changes: every device measures again. */
export const BENCH_VERSION = 1;
/** A result is trusted this long (thermal state and drivers drift; a month is plenty). */
export const BENCH_TTL_MS = 30 * 24 * 3600_000;

export type BenchScore = {
  /** Million pixels of the benchmark shader per millisecond (higher = faster GPU). */
  mpxPerMs: number;
  /** Wall time the run took (ms). */
  ms: number;
  /** Draws measured; 0 = it couldn't run (no WebGL2, context lost). */
  draws: number;
};
export type SavedBench = BenchScore & { v: number; key: string; at: number };

/**
 * Tier ceilings by score. Measured on this benchmark (Nov 2026): Apple M1 1.85 Mpx/ms in both Chrome
 * (ANGLE Metal) and WebKit, SwiftShader 0.09. Others scaled from their GPUs' FP32 throughput against
 * the M1's ~2.6 TFLOPS: A10 (iPad 7th gen) ~0.2 → low; A12–A14, Adreno 618–650 ~0.35–0.6 → medium;
 * A15–A17, M1, M2 ~1–2.5 → high; M-Pro/Max and desktop cards → ultra. The ceiling only lowers what
 * the GPU's name picked (combineTier).
 */
export const BENCH_TIERS: { min: number; tier: Tier }[] = [
  { min: 2.4, tier: "ultra" },
  { min: 0.9, tier: "high" },
  { min: 0.3, tier: "medium" },
  { min: 0, tier: "low" },
];

const ORDER: Tier[] = ["low", "medium", "high", "ultra"];
const lower = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/** The highest tier a score supports. */
export function benchTier(s: Pick<BenchScore, "mpxPerMs" | "draws">): Tier | null {
  if (!s.draws || !(s.mpxPerMs > 0)) return null;
  return (BENCH_TIERS.find((b) => s.mpxPerMs >= b.min) ?? BENCH_TIERS[BENCH_TIERS.length - 1]).tier;
}

/**
 * GPU names that say nothing about the chip: Safari's "Apple GPU" (every iPhone, iPad and Mac),
 * Firefox's resistFingerprinting / generic renderer strings, or nothing at all.
 */
export const maskedGpu = (gpu: string) => !gpu || /^apple gpu$|webkit webgl|^mozilla$|generic renderer|^angle \(apple, apple gpu/.test(gpu.trim());

/**
 * The tier to start in: what the GPU's name and the device's limits picked (`named`), never above
 * what the benchmark measured. With a masked name the benchmark is all there is, so it may also
 * lift a cautious guess by one step, up to "high" (an M-series iPad whose name says only "Apple GPU").
 */
export function combineTier(named: Tier, bench: Tier | null, masked: boolean): Tier {
  if (!bench) return named;
  // Lifted at most to "high": a masked name is a phone, a tablet or Safari, where "ultra" stays a hand pick.
  if (masked && ORDER.indexOf(bench) > ORDER.indexOf(named)) return ORDER[Math.min(ORDER.indexOf(named) + 1, ORDER.indexOf(bench), ORDER.indexOf("high"))];
  return lower(named, bench);
}

/** What a saved result is tied to: the GPU, the browser build (updates change drivers), the benchmark. */
export const benchKey = (gpu: string, ua: string) => `${BENCH_VERSION}|${gpu}|${ua}`;

/** A saved result still stands: same device and browser build, same benchmark, not too old. */
export function benchFresh(saved: SavedBench | null | undefined, key: string, now: number): saved is SavedBench {
  return !!saved && saved.v === BENCH_VERSION && saved.key === key && now - saved.at >= 0 && now - saved.at < BENCH_TTL_MS && saved.draws > 0;
}

/**
 * How many draws the next batch gets: the benchmark starts tiny (a slow phone must not freeze),
 * doubles until a batch takes long enough to time well (≥ 8 ms — Safari's clock is 1 ms coarse),
 * and stops when the time budget is spent. Returns 0 to stop.
 */
export function nextBatch(prev: { draws: number; ms: number } | null, spentMs: number, budgetMs = 250): number {
  if (spentMs >= budgetMs) return 0;
  if (!prev) return 2;
  if (prev.ms >= 8) {
    // Long enough: one more of the same size if it fits, else done.
    return spentMs + prev.ms <= budgetMs ? prev.draws : 0;
  }
  const next = prev.draws * 2;
  // Predict this batch's time; never start one that would blow the budget.
  const est = prev.ms > 0 ? (prev.ms / prev.draws) * next : 0;
  return next <= 4096 && spentMs + est <= budgetMs ? next : 0;
}

/** The score from timed batches: only batches long enough to trust (≥ 8 ms), else the longest one. */
export function scoreBatches(batches: { draws: number; ms: number }[], px: number, wallMs: number): BenchScore {
  const good = batches.filter((b) => b.ms >= 8);
  const use = good.length ? good : batches.slice().sort((a, b) => b.ms - a.ms).slice(0, 1);
  const draws = use.reduce((a, b) => a + b.draws, 0);
  const ms = use.reduce((a, b) => a + b.ms, 0);
  if (!draws || ms <= 0) return { mpxPerMs: 0, ms: wallMs, draws: 0 };
  return { mpxPerMs: Math.round(((px * draws) / 1e6 / ms) * 1000) / 1000, ms: Math.round(wallMs), draws };
}

/**
 * "Auto" learned to start lower on this device (sustained slowness): it unlearns one step after
 * five minutes at full resolution with every effect on (graphics/engine.ts), so one hot afternoon
 * isn't forever — long enough that a tier that only just copes doesn't bounce visit to visit.
 */
export const PROMOTE_AFTER_MS = 5 * 60_000;
