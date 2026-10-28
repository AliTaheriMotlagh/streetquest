// Street Arena realtime server: the 3D city's live layer over WebSockets.
//
//   npm run rt            (PORT=8787; needs the same AUTH_SECRET as the web app)
//
// The web app (Vercel/Render) stays as it is; this small Node process runs beside it
// (Render web service, Fly, a VPS — anything that keeps a socket open) and holds every
// player in memory: 20 Hz snapshots, gunfire refereed with lag compensation, matches
// and their bots (hub.ts). It needs no database: the web app signs a short-lived ticket
// with who you are (/api/rt/ticket), and match results go back to the web app signed
// (/api/rt/result), which pays out.
//
// Env: PORT, AUTH_SECRET, APP_URL (the web app, for results), RT_ORIGINS (allowed page
// origins, comma-separated; empty = any).
import { createHmac } from "node:crypto";
import http from "node:http";
import { jwtVerify } from "jose";
import { WebSocketServer, type WebSocket } from "ws";
import { serverKey } from "../src/server/session";
import { decodeState, PROTOCOL, TICK_HZ, type ClientMsg } from "../src/lib/arena/protocol";
import { Hub, type Identity } from "./hub";
import type { Match, MatchResult } from "./match";
import type { Player } from "./player";

const PORT = Number(process.env.PORT ?? 8787);
const APP_URL = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGINS = (process.env.RT_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const TICKET_KEY = new TextEncoder().encode(serverKey("rt"));
const RESULT_KEY = serverKey("rt-result");
const MAX_MSGS_PER_S = 120;

const hub = new Hub((m, results) => void report(m, results));

// ---------------------------------------------------------------- http + ws
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true, players: hub.players.size, matches: hub.matches.size, protocol: PROTOCOL }));
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
      if (s) hub.state(me, s, now);
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
      const who = await verify(m.ticket);
      const a = m.anchor;
      if (!who || !a || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return ws.close(4003, "ticket");
      clearTimeout(hello);
      me = hub.join(ws, who, a, now);
      return;
    }
    hub.message(me, m, now);
  });

  ws.on("close", () => {
    clearTimeout(hello);
    if (me) hub.drop(me);
  });
  ws.on("error", () => {});
});

async function verify(token: string): Promise<Identity | null> {
  try {
    const { payload } = await jwtVerify(token, TICKET_KEY, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      id: payload.sub, name: String(payload.name ?? "").slice(0, 24), avatar: String(payload.avatar ?? "🙂").slice(0, 8), level: Number(payload.level) || 1,
      friends: Array.isArray(payload.friends) ? payload.friends.slice(0, 500).map(String) : [], virtual: !!payload.virtual,
    };
  } catch {
    return null;
  }
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
      const p = hub.players.get(r.userId);
      const g = data?.rewards?.[r.userId];
      if (!p) continue;
      if (g) p.send({ t: "toast", text: "+{xp} XP · +{coins} coins", vars: { xp: g.xp, coins: g.coins } });
      else if (data?.rewards) p.send({ t: "toast", text: "Daily match rewards used up — play again tomorrow for more" });
    }
  } catch (e) {
    console.error("[rt] result post failed", (e as Error).message);
  }
}

setInterval(() => hub.tick(), 1000 / TICK_HZ);
server.listen(PORT, () => console.log(`[rt] Street Arena realtime on :${PORT} → results to ${APP_URL}`));
