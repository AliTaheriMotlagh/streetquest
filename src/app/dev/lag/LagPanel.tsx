"use client";
// The lag test panel: runs each game mode in a frame of its own (/play?bench=<id>), one after
// the other, and shows what each felt like — fps, 1% lows, p50/p95/p99 frame times, stutters,
// freezes, long tasks and the renderer's load — with a verdict against the mode's budget.
// The frame is shown full size while it runs: a hidden frame isn't drawn at the real rate.
// Earlier runs on this device stay (localStorage) so a change can be compared before/after.
// ?auto=1 starts everything at once (scripts/lag-test.ts reads window.__sqLag when done).
import { useEffect, useRef, useState } from "react";
import { benchTable, BUDGETS, SCENARIOS, scenarioUrl, type BenchResult, type Scenario } from "@/lib/perf/frameStats";

type Run = { at: number; device: string; results: BenchResult[] };
const HISTORY = "sq-lag-history";
const MAX_RUN_S = 150;

declare global {
  interface Window {
    __sqLag?: BenchResult[];
  }
}

const device = () => (typeof navigator === "undefined" ? "" : `${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? navigator.platform} · ${screen.width}×${screen.height}@${devicePixelRatio}x · ${navigator.hardwareConcurrency ?? "?"} cores`);
const load = (): Run[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY) ?? "[]") as Run[];
  } catch {
    return [];
  }
};
const save = (runs: Run[]) => {
  try {
    localStorage.setItem(HISTORY, JSON.stringify(runs.slice(0, 12)));
  } catch {}
};

const tone = (v: BenchResult["verdict"], err?: string) => (err ? "bad" : v === "smooth" ? "ok" : v === "ok" ? "warn" : "bad");

export default function LagPanel() {
  const [pick, setPick] = useState<Set<string>>(() => new Set(SCENARIOS.map((s) => s.id)));
  const [results, setResults] = useState<BenchResult[]>([]);
  const [running, setRunning] = useState<Scenario | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [copied, setCopied] = useState(false);
  const stop = useRef(false);

  useEffect(() => setHistory(load()), []);

  const runOne = (s: Scenario) =>
    new Promise<BenchResult>((done) => {
      setRunning(s);
      const timer = setTimeout(() => finish({ id: s.id, stats: { frames: 0, seconds: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0, low1: 0, janks: 0, hitches: 0, jankShare: 0 }, verdict: "laggy", why: [], longTasks: 0, longTaskMs: 0, error: "timed out" }), MAX_RUN_S * 1000);
      const onMsg = (e: MessageEvent) => {
        if (e.origin !== location.origin || e.data?.type !== "sq-bench" || e.data.result?.id !== s.id) return;
        finish(e.data.result as BenchResult);
      };
      function finish(r: BenchResult) {
        clearTimeout(timer);
        removeEventListener("message", onMsg);
        done(r);
      }
      addEventListener("message", onMsg);
    });

  const runAll = async (ids?: string[]) => {
    stop.current = false;
    const list = SCENARIOS.filter((s) => (ids ?? [...pick]).includes(s.id));
    const out: BenchResult[] = [];
    setResults([]);
    for (const s of list) {
      if (stop.current) break;
      const r = await runOne(s);
      out.push(r);
      setResults([...out]);
    }
    setRunning(null);
    window.__sqLag = out;
    if (out.length) {
      const next = [{ at: Date.now(), device: device(), results: out }, ...load()];
      save(next);
      setHistory(next);
    }
  };

  useEffect(() => {
    if (new URLSearchParams(location.search).get("auto") === "1") {
      const only = new URLSearchParams(location.search).get("only");
      void runAll(only ? only.split(",") : undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prev = history.find((h) => h.results.length && h.at < (history[0]?.at ?? 0)) ?? null;
  const before = (id: string) => prev?.results.find((r) => r.id === id);
  const copy = () => {
    void navigator.clipboard?.writeText(`${device()}\n${benchTable(results)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="dev-main">
      <div>
        <h1>⏱️ Lag test</h1>
        <p className="lead">
          Every game mode, scripted the same way each time and measured frame by frame. Run it on the phone you care about, with nothing else open. Smooth = {BUDGETS.map.fps}+ fps on the 2D map and {BUDGETS["3d"].fps}+ in 3D, the slowest 1% of frames under {BUDGETS["3d"].p99} ms, and almost no stutters.
        </p>
        <p className="small muted">{device()}</p>
      </div>

      <section className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <b className="grow">Modes</b>
          <button className="btn sm" onClick={() => setPick(new Set(SCENARIOS.map((s) => s.id)))}>All</button>
          <button className="btn sm" onClick={() => setPick(new Set())}>None</button>
        </div>
        <div className="row">
          {SCENARIOS.map((s) => (
            <label key={s.id} className="pill" style={{ cursor: "pointer", padding: "5px 10px" }}>
              <input type="checkbox" checked={pick.has(s.id)} disabled={!!running} onChange={(e) => setPick((p) => (e.target.checked ? new Set(p).add(s.id) : new Set([...p].filter((x) => x !== s.id))))} />
              {s.emoji} {s.label} <span className="muted">· {s.seconds}s</span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {!running ? (
            <button className="btn primary" disabled={!pick.size} onClick={() => void runAll()}>▶ Run {pick.size} mode{pick.size === 1 ? "" : "s"}</button>
          ) : (
            <button className="btn danger" onClick={() => (stop.current = true)}>■ Stop after this one</button>
          )}
          {!!results.length && !running && <button className="btn" onClick={copy}>{copied ? "Copied" : "Copy results"}</button>}
          <span className="small muted">~{SCENARIOS.filter((s) => pick.has(s.id)).reduce((a, s) => a + s.seconds + s.warmup + 10, 0)} s with loading</span>
        </div>
      </section>

      {running && (
        <section className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <b className="grow">{running.emoji} {running.label}</b>
            <span className="small muted">loading, then {running.warmup}s warm-up and {running.seconds}s measured…</span>
          </div>
          <iframe key={running.id} src={scenarioUrl(running)} title={running.label} allow="fullscreen; gamepad; geolocation" style={{ width: "100%", height: "min(72vh, 820px)", border: "1px solid var(--line)", borderRadius: 12, background: "#000" }} />
        </section>
      )}

      {!!results.length && (
        <section className="card" style={{ overflowX: "auto" }}>
          <h2>Results</h2>
          <table>
            <thead>
              <tr>
                <th>Mode</th><th>Verdict</th><th>FPS</th><th>1% low</th><th>p50</th><th>p95</th><th>p99</th><th>Worst</th><th>Stutters</th><th>Freezes</th><th className="hide-sm">Long tasks</th><th className="hide-sm">3D load</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const s = SCENARIOS.find((x) => x.id === r.id);
                const b = before(r.id);
                const delta = b && !r.error && !b.error ? Math.round((r.stats.fps - b.stats.fps) * 10) / 10 : null;
                return (
                  <tr key={r.id}>
                    <td>{s?.emoji} {s?.label ?? r.id}</td>
                    <td>
                      <span className={`pill ${tone(r.verdict, r.error)}`}>{r.error ? "error" : r.verdict}</span>
                      {(r.error || r.why.length > 0) && <div className="small muted">{r.error ?? r.why.join(" · ")}</div>}
                    </td>
                    <td>
                      <b>{r.stats.fps}</b>
                      {delta != null && delta !== 0 && <span className={`small ${delta > 0 ? "" : "muted"}`} style={{ color: delta > 0 ? "var(--green)" : "var(--red)" }}> {delta > 0 ? "+" : ""}{delta}</span>}
                    </td>
                    <td>{r.stats.low1}</td>
                    <td>{r.stats.p50} ms</td>
                    <td>{r.stats.p95} ms</td>
                    <td>{r.stats.p99} ms</td>
                    <td>{r.stats.worst} ms</td>
                    <td>{r.stats.janks}</td>
                    <td>{r.stats.hitches}</td>
                    <td className="hide-sm">{r.longTasks} <span className="muted small">({r.longTaskMs} ms)</span></td>
                    <td className="hide-sm small muted">{r.gfx ? `${r.gfx.tier} L${r.gfx.level} · ${r.gfx.dpr.toFixed(2)}x · ${r.gfx.calls} calls · ${Math.round(r.gfx.triangles / 1000)}k tris` : "—"}{r.heapMB ? ` · ${r.heapMB} MB` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {prev && <p className="small muted">Change in fps is against the run of {new Date(prev.at).toLocaleString()}.</p>}
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h2>Earlier runs on this device</h2>
          {history.map((h) => (
            <div key={h.at} className="row small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="muted" style={{ minWidth: 150 }}>{new Date(h.at).toLocaleString()}</span>
              {h.results.map((r) => (
                <span key={r.id} className={`pill ${tone(r.verdict, r.error)}`} title={r.error ?? `${r.stats.fps} fps, p99 ${r.stats.p99} ms`}>
                  {SCENARIOS.find((s) => s.id === r.id)?.emoji} {r.error ? "×" : r.stats.fps}
                </span>
              ))}
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm danger" onClick={() => (save([]), setHistory([]))}>Clear history</button>
          </div>
        </section>
      )}

      <section className="card small muted">
        <b>From the terminal:</b> <code>npm run test:lag</code> runs the same test in Chromium as a mid-range phone (CPU slowed 4×) against the dev server and fails if a mode is laggy. <code>npm run test:lag -- --only drive,foot --cpu 1</code> for a subset at full speed.
      </section>
    </main>
  );
}
