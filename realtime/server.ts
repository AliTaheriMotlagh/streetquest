// Street Arena realtime server: the 3D city's live layer over WebSockets.
//
//   npm run rt            (PORT=8787; needs the same AUTH_SECRET as the web app)
//
// The web app (Vercel/Render) stays as it is; this small Node process runs beside it
// (Render web service, Fly, a VPS — anything that keeps a socket open) and holds every
// player in memory: 20 Hz snapshots, gunfire refereed with lag compensation, matches
// and their bots. It needs no database: the web app signs a short-lived ticket with
// who you are (/api/rt/ticket), and match results go back to the web app signed
// (/api/rt/result), which pays out.
//
// Env: PORT, AUTH_SECRET, APP_URL (the web app, for results), RT_ORIGINS (allowed page
// origins, comma-separated; empty = any).
import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import { jwtVerify } from "jose";
import { WebSocketServer, type WebSocket } from "ws";
import { serverKey } from "../src/server/session";
import { isMode, RADII, type Difficulty, type Team } from "../src/lib/arena/modes";
import { decodeState, encodeSnap, F_FOOT, PROTOCOL, TICK_HZ, type ArenaGeo, type ClientMsg, type RosterEntry, type SnapEntity } from "../src/lib/arena/protocol";
import { isWeapon, WEAPON_BY_IDX } from "../src/lib/arena/weapons";
import { Match, type MatchResult } from "./match";
import { Player } from "./player";
import { World } from "./world";

const PORT = Number(process.env.PORT ?? 8787);
const APP_URL = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGINS = (process.env.RT_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const TICKET_KEY = new TextEncoder().encode(serverKey("rt"));
const RESULT_KEY = serverKey("rt-result");
const MAX_MSGS_PER_S = 120;
const FOOT_MPS = 11;
const VEHICLE_MPS = 130;

type Ticket = { sub: string; name: string; avatar: string; level: number; friends: string[]; virtual: boolean };

const world = new World();
const matches = new Map<string, Match>();
const players = new Map<string, Player>(); // by userId
/** Players following their real GPS: they see the city, nobody sees them. */
const hidden = new WeakSet<Player>();
let nextSid = 1;
const usedSids = new Set<number>();
const newSid = () => {
  for (let i = 0; i < 65_000; i++) {
    const s = nextSid;
    nextSid = (nextSid % 65_000) + 1;
    if (!usedSids.has(s)) {
      usedSids.add(s);
      return s;
    }
  }
  throw new Error("out of sids");
};

// ---------------------------------------------------------------- http + ws
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true, players: players.size, matches: matches.size, protocol: PROTOCOL }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 700_000,
  perMessageDeflate: false,
  verifyClient: ({ origin }: { origin: string }) => !ORIGINS.length || ORIGINS.includes(origin),
});

wss.on("connection", (ws: WebSocket) => {
  let me: Player | null = null;
  const hello = setTimeout(() => ws.close(4001, "hello"), 10_000);
  ws.binaryType = "arraybuffer";

  ws.on("message", async (data: ArrayBuffer | Buffer, isBinary: boolean) => {
    const now = Date.now();
    if (me) {
      // Rate limit per second; persistent flooding closes the socket.
      if (now - me.msgWindow > 1000) (me.msgWindow = now), (me.msgs = 0);
      if (++me.msgs > MAX_MSGS_PER_S) {
        if (me.msgs > MAX_MSGS_PER_S * 3) ws.close(4008, "flood");
        return;
      }
    }
    if (isBinary) {
      if (!me) return;
      const buf = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const s = decodeState(new DataView(buf as ArrayBuffer));
      if (s) onState(me, s, now);
      return;
    }
    let m: ClientMsg;
    try {
      m = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!me) {
      if (m.t !== "hello" || m.v !== PROTOCOL || typeof m.ticket !== "string") return ws.close(4002, "protocol");
      const ticket = await verify(m.ticket);
      const a = m.anchor;
      if (!ticket || !a || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return ws.close(4003, "ticket");
      clearTimeout(hello);
      // One connection per account: the newest wins.
      const old = players.get(ticket.sub);
      if (old) {
        old.ws?.close(4009, "replaced");
        drop(old, now);
      }
      me = new Player({ sid: newSid(), userId: ticket.sub, name: ticket.name, avatar: ticket.avatar, level: ticket.level, friends: ticket.friends, ws, anchor: a });
      if (!ticket.virtual) hidden.add(me);
      players.set(me.userId, me);
      world.add(me);
      me.send({ t: "welcome", sid: me.sid, now, passive: me.passive });
      me.status(world.id);
      return;
    }
    onMessage(me, m, now);
  });

  ws.on("close", () => {
    clearTimeout(hello);
    if (me && players.get(me.userId) === me) drop(me, Date.now());
  });
  ws.on("error", () => {});
});

async function verify(token: string): Promise<Ticket | null> {
  try {
    const { payload } = await jwtVerify(token, TICKET_KEY, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub, name: String(payload.name ?? "").slice(0, 24), avatar: String(payload.avatar ?? "🙂").slice(0, 8), level: Number(payload.level) || 1,
      friends: Array.isArray(payload.friends) ? payload.friends.slice(0, 500).map(String) : [], virtual: !!payload.virtual,
    };
  } catch {
    return null;
  }
}

function drop(p: Player, now: number) {
  const s = p.space;
  if (s instanceof Match) s.leave(p, now);
  else s?.remove(p);
  players.delete(p.userId);
  usedSids.delete(p.sid);
}

// ---------------------------------------------------------------- messages
function onState(p: Player, s: NonNullable<ReturnType<typeof decodeState>>, now: number) {
  if (hidden.has(p)) {
    // Viewers only tell us where to look from.
    p.moveTo(p.frame.toLL(s.x, s.z), 0, now);
    return;
  }
  if (p.dead) return;
  const space = p.space;
  if (space instanceof Match) s.flags |= F_FOOT; // matches are on foot
  const ll = p.frame.toLL(s.x, s.z);
  const y = Math.max(0, Math.min(400, s.y));
  if (p.placed && p.lastState) {
    const dt = Math.max(0.05, (now - p.lastState) / 1000);
    const here = p.frame.toXZ(p.lat, p.lng);
    const cap = (s.flags & F_FOOT ? FOOT_MPS : VEHICLE_MPS) * dt * 1.5 + 6;
    let ok = Math.hypot(s.x - here.x, s.z - here.z) <= cap;
    if (ok && space instanceof Match) ok = space.accept(p, ll, y);
    if (!ok) {
      // Snap them back (at most once a second, so a laggy client isn't spammed).
      if (now - p.lastCorrection > 1000) {
        p.lastCorrection = now;
        p.place(p.ll, p.y, p.yaw, now);
      }
      p.lastState = now;
      return;
    }
  }
  p.lastState = now;
  p.flags = s.flags;
  p.vehicle = s.vehicle;
  const w = WEAPON_BY_IDX[s.weapon];
  if (w && p.loadout.includes(w)) p.weapon = s.weapon;
  p.yaw = s.yaw;
  p.pitch = Math.max(-1.5, Math.min(1.5, s.pitch));
  p.vx = Math.max(-150, Math.min(150, s.vx));
  p.vz = Math.max(-150, Math.min(150, s.vz));
  p.moveTo(ll, y, now);
  if (!p.start) p.start = ll;
}

const lastCreate = new WeakMap<Player, number>();

function onMessage(p: Player, m: ClientMsg, now: number) {
  const space = p.space;
  switch (m.t) {
    case "ping":
      if (Number.isFinite(m.rtt)) p.rtt = Math.max(0, Math.min(5000, Number(m.rtt)));
      return p.send({ t: "pong", c: m.c, s: now });
    case "look":
      if (typeof m.color === "string" && /^#[0-9a-f]{6}$/i.test(m.color)) p.color = m.color;
      return;
    case "fire":
      if (!hidden.has(p)) space?.fire(p, m, now);
      return;
    case "reload":
      return space?.reload(p, now);
    case "passive":
      if (space === world) world.setPassive(p, !!m.on, now);
      return;
    case "respawn":
      if (space === world && [m.x, m.y, m.z].every(Number.isFinite)) world.respawn(p, p.frame.toLL(m.x, m.z), m.y, now);
      return;
    case "lobbies":
      return p.send({ t: "lobbies", list: [...matches.values()].filter((x) => x.phase !== "ended").map((x) => x.lobby(p)).filter((l) => l.dist < 3000).sort((a, b) => a.dist - b.dist).slice(0, 20) });
    case "create": {
      if (hidden.has(p)) return p.send({ t: "err", text: "Switch to Play from home to drive the 3D city" });
      if (space !== world || !p.placed) return;
      if (now - (lastCreate.get(p) ?? 0) < 5000) return;
      lastCreate.set(p, now);
      if (!isMode(m.mode) || !RADII.includes(m.radius as (typeof RADII)[number])) return;
      const diff: Difficulty = m.difficulty === "easy" || m.difficulty === "hard" ? m.difficulty : "normal";
      const geo: ArenaGeo = { roads: Array.isArray(m.geo?.roads) ? m.geo.roads : [], buildings: Array.isArray(m.geo?.buildings) ? m.geo.buildings : [] };
      const match = new Match(randomUUID().slice(0, 8), p, m.mode, m.radius, Math.max(0, Math.min(10, Math.floor(Number(m.bots) || 0))), diff, geo, { newSid, ended: report, disband });
      if (!match.playable) return p.send({ t: "err", text: "Not enough streets here for an arena — try a busier spot, or wait for the map to load" });
      matches.set(match.id, match);
      world.remove(p);
      match.join(p, now);
      return;
    }
    case "join": {
      const match = matches.get(String(m.id));
      if (!match || space !== world || hidden.has(p)) return;
      const why = match.canJoin(p);
      if (why) return p.send({ t: "err", text: why, vars: { m: match.radius + 250 } });
      world.remove(p);
      match.join(p, now);
      return;
    }
    case "leave":
      if (space instanceof Match) {
        space.leave(p, now);
        backToWorld(p, now);
      }
      return;
    case "start":
      if (space instanceof Match) space.start(p, now);
      return;
    case "team":
      if (space instanceof Match) space.setTeam(p, m.team as Team);
      return;
    case "loadout":
      if (space instanceof Match && isWeapon(m.primary)) space.setLoadout(p, m.primary);
      return;
    case "act":
      if (space instanceof Match) space.act(p, !!m.on, now);
      return;
  }
}

function backToWorld(p: Player, now: number) {
  p.team = 0;
  p.passive = true;
  p.carrying = false;
  p.setLoadout("smg");
  p.revive(now, 3);
  world.add(p);
  p.send({ t: "match", m: null });
  if (p.returnLL) p.place(p.returnLL, 0, p.yaw, now);
  p.status(world.id);
}

function disband(m: Match) {
  const now = Date.now();
  for (const p of [...m.players]) {
    m.remove(p);
    if (p.bot) usedSids.delete(p.sid);
    else backToWorld(p, now);
  }
  matches.delete(m.id);
}

/** Post a finished match to the web app, which pays out; tell each player what they got. */
async function report(m: Match, results: MatchResult[]) {
  if (!results.length) return;
  const body = JSON.stringify({ matchId: m.id, mode: m.mode, players: m.players.size, results });
  const sig = createHmac("sha256", RESULT_KEY).update(body).digest("hex");
  try {
    const res = await fetch(`${APP_URL}/api/rt/result`, { method: "POST", headers: { "content-type": "application/json", "x-rt-signature": sig }, body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json().catch(() => null)) as { rewards?: Record<string, { xp: number; coins: number } | null> } | null;
    for (const r of results) {
      const p = players.get(r.userId);
      const g = data?.rewards?.[r.userId];
      if (!p) continue;
      if (g) p.send({ t: "toast", text: "+{xp} XP · +{coins} coins", vars: { xp: g.xp, coins: g.coins } });
      else if (data?.rewards) p.send({ t: "toast", text: "Daily match rewards used up — play again tomorrow for more" });
    }
  } catch (e) {
    console.error("[rt] result post failed", (e as Error).message);
  }
}

// ---------------------------------------------------------------- the tick
let last = Date.now();
let matchViewAt = 0;
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - last) / 1000);
  last = now;
  world.index();
  world.tickReloads(now);
  for (const m of [...matches.values()]) m.tick(dt, now);
  const refresh = now - matchViewAt > 3000;
  if (refresh) matchViewAt = now;
  for (const m of matches.values())
    if (m.dirty || refresh) {
      const v = m.view();
      for (const p of m.humans) p.send({ t: "match", m: v });
      m.dirty = false;
    }
  for (const p of players.values()) {
    if (!p.ws || !p.space) continue;
    const list: SnapEntity[] = [];
    const add: RosterEntry[] = [];
    const seen = new Set<number>();
    for (const o of p.space.visible(p)) {
      if (hidden.has(o) || list.length >= 60) continue;
      seen.add(o.sid);
      if (!p.known.has(o.sid)) {
        p.known.add(o.sid);
        add.push({ sid: o.sid, id: o.userId, name: o.name, avatar: o.avatar, level: o.level, color: o.color, friend: p.friends.has(o.userId) || o.friends.has(p.userId), bot: o.bot });
      }
      const q = p.frame.toXZ(o.lat, o.lng);
      list.push({ sid: o.sid, x: q.x, y: o.y, z: q.z, yaw: o.yaw, pitch: o.pitch, vx: o.vx, vz: o.vz, flags: o.snapFlags(), vehicle: o.vehicle, weapon: o.weapon, hp: o.hp, flags2: o.flags2(now), team: o.team });
    }
    const del = [...p.known].filter((s) => !seen.has(s));
    for (const s of del) p.known.delete(s);
    if (add.length || del.length) p.send({ t: "roster", add, del });
    p.sendBinary(encodeSnap(now, list));
  }
}, 1000 / TICK_HZ);

server.listen(PORT, () => console.log(`[rt] Street Arena realtime on :${PORT} → results to ${APP_URL}`));
