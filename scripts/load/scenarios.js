// k6 load test: many simulated players doing what the real game does, at its real rates.
// Players come from scripts/load/seed.ts (.load/players.json). Run through npm:
//
//   npm run load:test                         (mix of everything, VUS=100, 2 min)
//   VUS=400 HOLD=3m SCENARIO=map npm run load:test
//
// Scenarios (SCENARIO=map|city|arena|mix):
//   map   — the 2D game: /api/sync every 4 s (12 s idle), GPS ping /api/loc every ~20 s,
//           /api/world every 25 s, /api/online every 30 s;
//   city  — the 3D city: /api/drive presence 1–4 a second (Drive's net.ts) + the sync poll;
//   arena — a relayed Street Arena host (no realtime server): /api/arena host poll every
//           150 ms, the lobby list every 3 s;
//   mix   — 70 % map, 20 % city, 10 % arena.
// Env: BASE (http://localhost:3300), VUS, RAMP (30s), HOLD (2m), P95_MS (800).
// The summary is one line per endpoint (count, rps, p50/p95/p99, failures) and lands in
// .load/summary.json as well — short enough to paste or diff between runs.
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { Rate } from "k6/metrics";

/** Sync polls answered "same" (nothing new: the server read one row). */
const syncSame = new Rate("sync_same");

const BASE = __ENV.BASE || "http://localhost:3300";
const VUS = Number(__ENV.VUS || 100);
const RAMP = __ENV.RAMP || "30s";
const HOLD = __ENV.HOLD || "2m";
const P95 = Number(__ENV.P95_MS || 800);
const WHICH = __ENV.SCENARIO || "mix";

const players = new SharedArray("players", () => JSON.parse(open("../../.load/players.json")));

const share = { map: 0.7, city: 0.2, arena: 0.1 };
function scenario(name, exec) {
  const vus = WHICH === "mix" ? Math.max(1, Math.round(VUS * share[name])) : VUS;
  return { executor: "ramping-vus", exec, startVUs: 0, stages: [{ duration: RAMP, target: vus }, { duration: HOLD, target: vus }, { duration: "10s", target: 0 }], gracefulRampDown: "5s", tags: { scenario: name } };
}
const all = { map: scenario("map", "mapPlayer"), city: scenario("city", "cityPlayer"), arena: scenario("arena", "arenaHost") };
const endpoints = ["sync", "loc", "world", "online", "drive", "arena_host", "arena_list", "arena_open"];

export const options = {
  scenarios: WHICH === "mix" ? all : { [WHICH]: all[WHICH] },
  // Per-endpoint thresholds also make k6 keep each endpoint's own numbers for the summary.
  thresholds: Object.fromEntries(
    endpoints.flatMap((e) => [
      [`http_req_duration{name:${e}}`, [`p(95)<${P95}`]],
      [`http_req_failed{name:${e}}`, ["rate<0.02"]],
    ]),
  ),
  summaryTrendStats: ["count", "p(50)", "p(95)", "p(99)", "max"],
  // One cookie per VU, set by hand: k6's jar would share nothing anyway.
  noCookiesReset: true,
};

// Each VU is one player (VU ids wrap if there are more VUs than seeded players).
function me() {
  const p = players[(exec.vu.idInTest - 1) % players.length];
  if (!me.cache || me.cache.id !== p.id) me.cache = { ...p, lat: p.lat, lng: p.lng, params: { headers: { cookie: `sq_session=${p.token}`, "content-type": "application/json" } } };
  return me.cache;
}
const jitter = (s) => s * (0.85 + Math.random() * 0.3);
const tag = (params, name) => ({ ...params, tags: { name } });
function ok(r, name) {
  const good = r.status >= 200 && r.status < 300;
  // A failed check per endpoint and status (0 + k6's error code: refused, reset, timeout) for the summary.
  if (!good) check(r, { [`${name} ${r.status || `net ${r.error_code}`}`]: () => false });
  return good;
}
function walk(p, metres) {
  p.lat += ((Math.random() - 0.5) * metres) / 111_000;
  p.lng += ((Math.random() - 0.5) * metres) / 90_000;
}

// ---------------------------------------------------------------- the 2D game
export function mapPlayer() {
  const p = me();
  if (!p.next) {
    // First tick: what opening the game does.
    p.since = 0;
    p.next = { loc: 0, world: 0, online: Math.random() * 30 };
    p.t = 0;
  }
  const sync = http.get(`${BASE}/api/sync?since=${p.since || Date.now()}${p.since ? "&q=1" : ""}`, tag(p.params, "sync"));
  if (ok(sync, "sync")) {
    const b = sync.json();
    if (p.since) syncSame.add(!!(b && b.same));
    if (b && b.now && !b.same) p.since = b.now;
  }
  if (p.t >= p.next.loc) {
    walk(p, 30);
    ok(http.post(`${BASE}/api/loc`, JSON.stringify({ lat: p.lat, lng: p.lng, acc: 12 }), tag(p.params, "loc")), "loc");
    p.next.loc = p.t + jitter(20);
  }
  if (p.t >= p.next.world) {
    ok(http.get(`${BASE}/api/world?lat=${p.lat}&lng=${p.lng}&alat=${p.lat.toFixed(6)}&alng=${p.lng.toFixed(6)}`, tag(p.params, "world")), "world");
    p.next.world = p.t + jitter(25);
  }
  if (p.t >= p.next.online) {
    ok(http.get(`${BASE}/api/online`, tag(p.params, "online")), "online");
    p.next.online = p.t + jitter(30);
  }
  // A third of players are idle (12 s polls), the rest active (4 s).
  const gap = jitter(exec.vu.idInTest % 3 === 0 ? 12 : 4);
  p.t += gap;
  sleep(gap);
}

// ---------------------------------------------------------------- the 3D city
export function cityPlayer() {
  const p = me();
  if (p.t == null) (p.t = 0), (p.nextSync = 0);
  walk(p, 15);
  const r = http.post(`${BASE}/api/drive`, JSON.stringify({ lat: p.lat, lng: p.lng, yaw: Math.random() * 6.28, speed: 12, vehicle: "car", sim: true }), tag(p.params, "drive"));
  let gap = 1;
  if (ok(r, "drive")) {
    const b = r.json();
    // Drive's net.ts: faster with people around.
    if (b && b.others && b.others.length) gap = 0.4;
  }
  if (p.t >= p.nextSync) {
    ok(http.get(`${BASE}/api/sync?since=${Date.now()}`, tag(p.params, "sync")), "sync");
    p.nextSync = p.t + jitter(4);
  }
  p.t += gap;
  sleep(gap);
}

// ---------------------------------------------------------------- Street Arena (relayed)
export function arenaHost() {
  const p = me();
  if (!p.room) {
    p.room = `lt${String(exec.vu.idInTest).padStart(6, "0")}`;
    p.ack = 0;
    p.t = 0;
    p.nextList = 0;
    const r = http.post(`${BASE}/api/arena`, JSON.stringify({ action: "open", id: p.room, mode: "ffa", radius: 120, lat: p.lat, lng: p.lng, bots: 4, anchor: { lat: p.lat, lng: p.lng }, sim: true }), tag(p.params, "arena_open"));
    if (!ok(r, "arena_open")) {
      p.room = null;
      sleep(5);
      return;
    }
  }
  const trail = [[Date.now() % 1e6, Math.random() * 50, 0, Math.random() * 50, 0]];
  const r = http.post(`${BASE}/api/arena`, JSON.stringify({ action: "host", id: p.room, ack: p.ack, trail, out: [], phase: "live", humans: 1, bots: 4, clock: 60 }), tag(p.params, "arena_host"));
  if (ok(r, "arena_host")) {
    const b = r.json();
    if (b && typeof b.ack === "number") p.ack = b.ack;
  } else if (r.status === 410) p.room = null;
  if (p.t >= p.nextList) {
    ok(http.post(`${BASE}/api/arena`, JSON.stringify({ action: "list", lat: p.lat, lng: p.lng }), tag(p.params, "arena_list")), "arena_list");
    p.nextList = p.t + 3;
  }
  p.t += 0.15;
  sleep(0.15);
}

// ---------------------------------------------------------------- compact summary
export function handleSummary(data) {
  const m = data.metrics;
  const secs = (data.state.testRunDurationMs || 1) / 1000;
  const lines = [`${WHICH} · ${VUS} VUs · ${secs.toFixed(0)} s · ${BASE}`, "endpoint      count    rps    p50    p95    p99   fail"];
  const rows = {};
  for (const e of endpoints) {
    const d = m[`http_req_duration{name:${e}}`];
    if (!d || !d.values.count) continue;
    const v = d.values;
    const f = m[`http_req_failed{name:${e}}`];
    const failed = f ? `${(f.values.rate * 100).toFixed(1)}%` : "-";
    rows[e] = { count: v.count, rps: +(v.count / secs).toFixed(1), p50: Math.round(v["p(50)"]), p95: Math.round(v["p(95)"]), p99: Math.round(v["p(99)"]), fail: failed };
    const r = rows[e];
    lines.push(`${e.padEnd(12)}${String(r.count).padStart(7)}${String(r.rps).padStart(7)}${String(r.p50).padStart(7)}${String(r.p95).padStart(7)}${String(r.p99).padStart(7)}${String(r.fail).padStart(7)}`);
  }
  const total = m.http_reqs ? m.http_reqs.values : { count: 0, rate: 0 };
  const failRate = m.http_req_failed ? m.http_req_failed.values.rate : 0;
  lines.push(`total ${total.count} req · ${total.rate.toFixed(1)} rps · ${(failRate * 100).toFixed(2)} % failed`);
  const crossed = Object.entries(m).filter(([, v]) => v.thresholds && Object.values(v.thresholds).some((t) => !t.ok)).map(([k]) => k);
  if (m.sync_same) lines.push(`sync answered "same": ${(m.sync_same.values.rate * 100).toFixed(1)} % of quiet polls`);
  const why = (data.root_group.checks || []).filter((c) => c.fails).sort((a, b) => b.fails - a.fails).slice(0, 8);
  if (why.length) lines.push(`failures: ${why.map((c) => `${c.name} ×${c.fails}`).join(", ")}`);
  lines.push(crossed.length ? `crossed: ${crossed.map((k) => k.replace(/http_req_(duration|failed)\{name:(\w+)\}/, (_, w, n) => `${n} ${w === "duration" ? "p95" : "fails"}`)).join(", ")}` : "thresholds ok");
  return { stdout: lines.join("\n") + "\n", ".load/summary.json": JSON.stringify({ scenario: WHICH, vus: VUS, seconds: secs, rps: total.rate, failRate, endpoints: rows, crossed }, null, 1) };
}
