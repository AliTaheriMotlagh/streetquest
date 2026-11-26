// The lag test from the terminal: every game mode (lib/perf/frameStats.ts SCENARIOS) in Chromium
// against a running server, as a fresh guest in Tehran, each scripted and measured by the game's
// own runner (components/perf/benchRunner.ts). Prints the table; exits 1 if a mode is laggy.
//
//   npm run test:lag                                 all modes, CPU slowed 4× (a mid-range phone)
//   npm run test:lag -- --only drive,foot --cpu 1    some modes, full speed
//   npm run test:lag -- --phone --headed             a phone screen (touch, 390×844 @3x), window shown
//   npm run test:lag -- --base https://…             another server (default http://localhost:3000)
//   PW_CHANNEL=chromium npm run test:lag             Playwright's own Chromium instead of the installed Chrome
//
// Headless Chromium draws WebGL in software (SwiftShader): its 3D numbers are far below a real
// GPU's. Use --headed on a Mac for real numbers; the phone itself via /dev/lag.
import { chromium } from "@playwright/test";
import { benchTable, SCENARIOS, scenarioUrl, type BenchResult } from "../src/lib/perf/frameStats";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? null : (process.argv[i + 1] ?? "");
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const base = (arg("base") ?? process.env.LAG_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const cpu = Number(arg("cpu") ?? 4);
const only = arg("only")?.split(",").filter(Boolean);
const phone = flag("phone");
const list = SCENARIOS.filter((s) => !only || only.includes(s.id));

async function main() {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL === "chromium" ? undefined : "chrome", headless: !flag("headed"), args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--use-angle=metal"] });
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: phone ? 3 : 1,
    hasTouch: phone,
    isMobile: phone,
    geolocation: { latitude: 35.7006, longitude: 51.4013 },
    permissions: ["geolocation"],
    locale: "en-US",
  });
  const page = await ctx.newPage();
  await page.goto(base);
  const guest = await page.request.post(`${base}/api/auth/guest`, { data: {} });
  if (!guest.ok()) throw new Error(`guest sign-in failed: ${guest.status()}`);
  const out: BenchResult[] = [];
  for (const s of list) {
    process.stdout.write(`${s.emoji} ${s.id} … `);
    const cdp = await ctx.newCDPSession(page);
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await page.goto(`${base}${scenarioUrl(s)}`);
    const handle = await page.waitForFunction(() => window.__sqBenchResult ?? null, null, { timeout: 180_000, polling: 1000 }).catch(() => null);
    const r = handle ? ((await handle.jsonValue()) as BenchResult) : null;
    const res: BenchResult = r ?? { id: s.id, stats: { frames: 0, seconds: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0, low1: 0, janks: 0, hitches: 0, jankShare: 0 }, verdict: "laggy", why: [], longTasks: 0, longTaskMs: 0, error: "timed out" };
    out.push(res);
    console.log(res.error ? `error: ${res.error}` : `${res.verdict} (${res.stats.fps} fps, p99 ${res.stats.p99} ms${res.gfx ? `, ${res.gfx.tier} ${res.gfx.calls} calls ${Math.round(res.gfx.triangles / 1000)}k tris` : ""})${res.why.length ? ` — ${res.why.join("; ")}` : ""}`);
    await cdp.detach();
  }
  await browser.close();
  console.log(`\n${base} · CPU ${cpu}× · ${phone ? "phone" : "desktop"} · ${flag("headed") ? "headed" : "headless (software WebGL)"}\n`);
  console.log(benchTable(out));
  const bad = out.filter((r) => r.verdict === "laggy");
  if (bad.length) {
    console.log(`\nLaggy: ${bad.map((r) => r.id).join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
