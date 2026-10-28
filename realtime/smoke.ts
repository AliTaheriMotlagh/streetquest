// Smoke test for the realtime server (npm run rt, then npm run rt:smoke): two scripted
// players fight in the open city, then play a team match with bots on a street grid.
// Prints what happened; exits non-zero if something basic is broken.
import { SignJWT } from "jose";
import WebSocket from "ws";
import { serverKey } from "../src/server/session";
import { decodeSnap, encodeState, localFrame, F_FOOT, type ServerMsg } from "../src/lib/arena/protocol";

const KEY = new TextEncoder().encode(serverKey("rt"));
const ORIGIN = { lat: 35.7, lng: 51.4 };
const F = localFrame(ORIGIN);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Friends: strangers only see (and can shoot) each other 300 m away from where they started.
async function ticket(sub: string, name: string) {
  return new SignJWT({ name, avatar: "🙂", level: 5, friends: ["user-a", "user-b"], virtual: true }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("10m").sign(KEY);
}

type C = { ws: WebSocket; sid: number; msgs: ServerMsg[]; snaps: number; lastSnap: number; x: number; z: number; y: number; yaw: number; seen: Map<number, { x0: number; z0: number; x: number; z: number }> };
async function client(sub: string, name: string, x: number, z: number): Promise<C> {
  const ws = new WebSocket("ws://localhost:8787");
  const c: C = { ws, sid: 0, msgs: [], snaps: 0, lastSnap: 0, x, z, y: 0, yaw: 0, seen: new Map() };
  ws.binaryType = "arraybuffer";
  ws.on("message", (d: ArrayBuffer | string, bin: boolean) => {
    if (bin) {
      const s = decodeSnap(new DataView(d as ArrayBuffer));
      if (s) {
        c.snaps++;
        c.lastSnap = s.list.length;
        for (const e of s.list) {
          const p = c.seen.get(e.sid);
          if (p) Object.assign(p, { x: e.x, z: e.z });
          else c.seen.set(e.sid, { x0: e.x, z0: e.z, x: e.x, z: e.z });
        }
      }
      return;
    }
    const m = JSON.parse(d.toString()) as ServerMsg;
    c.msgs.push(m);
    if (m.t === "welcome") c.sid = m.sid;
    if (m.t === "spawn") Object.assign(c, { x: m.x, z: m.z, y: m.y });
  });
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ t: "hello", v: 1, ticket: await ticket(sub, name), anchor: ORIGIN }));
  await sleep(300);
  return c;
}
const state = (c: C) => c.ws.send(encodeState({ flags: F_FOOT, vehicle: 0, weapon: 1, x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: 0, vx: 0, vz: 0 }));
const count = (c: C, t: string) => c.msgs.filter((m) => m.t === t).length;

async function main() {
  const a = await client("user-a", "Alice", 0, 0);
  const b = await client("user-b", "Bob", 20, 0);
  console.log("welcome sids", a.sid, b.sid);
  // Open city: both report, both turn fighting on.
  for (let i = 0; i < 6; i++) (state(a), state(b), await sleep(60));
  a.ws.send(JSON.stringify({ t: "passive", on: false }));
  b.ws.send(JSON.stringify({ t: "passive", on: false }));
  await sleep(200);
  // A shoots B in the chest: from A's eye toward B (20 m east).
  for (let i = 0; i < 6; i++) {
    const o: [number, number, number] = [0, 1.62, 0];
    const d = [20, 1.2 - 1.62, 0], l = Math.hypot(...d);
    a.ws.send(JSON.stringify({ t: "fire", w: "smg", at: Date.now() - 100, o, d: [d.map((v) => v / l)] }));
    await sleep(90);
  }
  await sleep(300);
  const hits = a.msgs.filter((m) => m.t === "hit");
  console.log("open city: hits", hits.length, "B hp", (b.msgs.filter((m) => m.t === "hit").at(-1) as { hp: number } | undefined)?.hp, "kill msgs", count(b, "kill"));
  // A shot that misses (aimed far left) must not hit.
  const before = a.msgs.filter((m) => m.t === "hit").length;
  a.ws.send(JSON.stringify({ t: "fire", w: "smg", at: Date.now() - 100, o: [0, 1.62, 0], d: [[0, 0, -1]] }));
  await sleep(200);
  console.log("miss registered as hit?", a.msgs.filter((m) => m.t === "hit").length !== before);

  // A team match with bots on a street grid with blocks between the streets.
  const roads: number[][] = [];
  for (let k = -300; k <= 300; k += 40) (roads.push([-300, k, 300, k]), roads.push([k, -300, k, 300]));
  const buildings: { p: number[]; h: number; mh: number }[] = [];
  for (let x = -300; x < 300; x += 40) for (let z = -300; z < 300; z += 40) buildings.push({ p: [x + 8, z + 8, x + 32, z + 8, x + 32, z + 32, x + 8, z + 32], h: 12, mh: 0 });
  const MODE = process.env.SMOKE_MODE ?? "tdm";
  a.ws.send(JSON.stringify({ t: "create", mode: MODE, radius: 150, bots: 6, difficulty: "hard", geo: { roads, buildings } }));
  await sleep(500);
  const err = a.msgs.filter((m) => m.t === "err");
  if (err.length) console.log("errors", err);
  const mv = a.msgs.filter((m) => m.t === "match").at(-1) as Extract<ServerMsg, { t: "match" }> | undefined;
  console.log("match created:", mv?.m?.id, mv?.m?.phase, "players", mv?.m?.players.length);
  b.ws.send(JSON.stringify({ t: "join", id: mv?.m?.id }));
  await sleep(300);
  // Bomb: humans defend round 1, so a bot carries the bomb (and must plant it).
  if (MODE === "bomb") for (const c of [a, b]) c.ws.send(JSON.stringify({ t: "team", team: 2 }));
  await sleep(200);
  a.ws.send(JSON.stringify({ t: "start" }));
  await sleep(200);
  a.seen.clear();
  // Play ~25 s: both humans stand at their spawns reporting state.
  const t0 = Date.now();
  const LIVE_MS = Number(process.env.SMOKE_SECONDS ?? 25) * 1000;
  while (Date.now() - t0 < LIVE_MS) {
    state(a);
    state(b);
    await sleep(50);
  }
  const last = a.msgs.filter((m) => m.t === "match").at(-1) as Extract<ServerMsg, { t: "match" }> | undefined;
  if (!last?.m) {
    console.log("FAIL: no match view");
    process.exit(1);
  }
  const m = last.m;
  const bombs = [...new Set(a.msgs.filter((x) => x.t === "match").map((x) => (x as Extract<ServerMsg, { t: "match" }>).m?.bomb?.state).filter(Boolean))];
  if (m.mode === "bomb") console.log("round", m.round, "sites", m.sites.map((x) => x.name).join(""), "bomb states seen", bombs.join(","), "toasts", a.msgs.filter((x) => x.t === "toast").map((x) => (x as { text: string }).text).join(" | "));
  console.log("phase", m.phase, "teamScore", m.teamScore, "players", m.players.map((p) => `${p.name}:${p.kills}/${p.deaths}${p.bot ? "(bot)" : ""}`).join(" "));
  console.log("hits on B", b.msgs.filter((x) => x.t === "hit" && x.to === b.sid).length, "kills seen", a.msgs.filter((x) => x.t === "kill").map((x) => `${(x as { killerName: string }).killerName}>${(x as { victimName: string }).victimName}`).join(", "));
  console.log("A: shots heard", count(a, "shot"), "hits on A", a.msgs.filter((x) => x.t === "hit" && x.to === a.sid).length, "kill feed", count(a, "kill"), "snaps", a.snaps, "last snap size", a.lastSnap);
  const errs = [...a.msgs, ...b.msgs].filter((x) => x.t === "err");
  if (errs.length) console.log("errs", errs);
  a.ws.send(JSON.stringify({ t: "leave" }));
  await sleep(300);
  const back = a.msgs.filter((x) => x.t === "match").at(-1) as Extract<ServerMsg, { t: "match" }>;
  console.log("after leave, A match:", back.m === null ? "null (back in city)" : back.m.phase);
  a.ws.close();
  b.ws.close();
  await sleep(200);
  const moved = [...a.seen.values()].map((p) => Math.hypot(p.x - p.x0, p.z - p.z0));
  console.log("bots moved (m):", moved.map((d) => Math.round(d)).join(" "));
  const ok = hits.length > 0 && m.players.length >= 8 && count(a, "shot") > 0 && moved.some((d) => d > 20);
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}
main();
