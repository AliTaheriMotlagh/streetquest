"use client";
// The startup GPU benchmark (rules and thresholds: lib/perf/tier.ts). Draws a fixed ALU-heavy
// blended shader into a 512×512 target on a throwaway WebGL2 context in small, growing batches, each
// closed by a 1-pixel readPixels so the clock measures the GPU's work, not the queue. Runs once
// per device and browser build (≤ ~0.25 s, behind the 3D loading screen) and is kept on the device.
import { BENCH_VERSION, benchFresh, benchKey, nextBatch, scoreBatches, type BenchScore, type SavedBench } from "@/lib/perf/tier";

const KEY = "sq_gfx_bench";
const SIZE = 512;

const VERT = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
// ~24 rounds of the kind of maths a lit, fogged, tone-mapped pixel does (mul-adds, a sin, a fract).
const FRAG = `#version 300 es
precision highp float;
uniform float u_t;
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy * 0.0021 + u_t;
  float a = 0.0;
  for (int i = 0; i < 24; i++) {
    p = vec2(p.x * p.x - p.y * p.y, 2.0 * p.x * p.y) * 0.45 + vec2(sin(p.y + u_t), 0.31);
    a += fract(p.x * 0.13 + p.y * 0.07);
  }
  o = vec4(a * 0.04, fract(p), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

/** Runs the benchmark now (synchronously). `draws: 0` when it can't run here. */
export function runBench(budgetMs = 250): BenchScore {
  const t0 = performance.now();
  const none: BenchScore = { mpxPerMs: 0, ms: 0, draws: 0 };
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = document.createElement("canvas").getContext("webgl2", { antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) return none;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return none;
    gl.useProgram(prog);
    const uT = gl.getUniformLocation(prog, "u_t");
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, SIZE, SIZE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, SIZE, SIZE);
    gl.bindVertexArray(gl.createVertexArray());
    // Blended, so every draw's pixels are shaded: tile-based GPUs (Apple, Mali, PowerVR, Adreno)
    // otherwise drop an opaque full-screen draw that a later one covers, and only the last counts.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const px = new Uint8Array(4);
    const batch = (n: number) => {
      const s = performance.now();
      for (let i = 0; i < n; i++) (gl!.uniform1f(uT, i * 0.001), gl!.drawArrays(gl!.TRIANGLES, 0, 3));
      gl!.readPixels(0, 0, 1, 1, gl!.RGBA, gl!.UNSIGNED_BYTE, px);
      return performance.now() - s;
    };
    batch(1); // warm-up: the driver finishes compiling on first use
    const done: { draws: number; ms: number }[] = [];
    let prev: { draws: number; ms: number } | null = null;
    for (;;) {
      const n = nextBatch(prev, performance.now() - t0, budgetMs);
      if (!n) break;
      prev = { draws: n, ms: batch(n) };
      done.push(prev);
    }
    return scoreBatches(done, SIZE * SIZE, performance.now() - t0);
  } catch {
    return none;
  } finally {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

let mem: { key: string; s: BenchScore | null } | null = null;

/** The kept result for this device and browser, or a fresh run (kept for next time). Never throws. */
export function benchScore(gpu: string): BenchScore | null {
  if (typeof window === "undefined") return null;
  const key = benchKey(gpu, navigator.userAgent);
  // Once a page: Settings asks on every render, and private mode keeps no localStorage.
  if (mem?.key === key) return mem.s;
  mem = { key, s: storedOrRun(key) };
  return mem.s;
}

function storedOrRun(key: string): BenchScore | null {
  // The lag test and screenshots want the tier the GPU name gives, run to run.
  if (/[?&](bench|nobench)=/.test(location.search)) return null;
  let saved: SavedBench | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {}
  if (benchFresh(saved, key, Date.now())) return saved;
  const s = runBench();
  if (!s.draws) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: BENCH_VERSION, key, at: Date.now() } satisfies SavedBench));
  } catch {}
  return s;
}

/** Forget the kept result (Settings → quality "auto" picked again re-measures). */
export const forgetBench = () => {
  mem = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
};
