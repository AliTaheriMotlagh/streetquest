"use client";
// The 3D city's realtime link (realtime/server.ts over a WebSocket).
//  - Asks the game for a ticket (/api/rt/ticket). No realtime server deployed (the game
//    on Vercel alone) → the same hub runs right here in the browser (`local`): matches
//    against bots work, and other players in the open city come over HTTP instead
//    (drive/net.ts + server/arena.ts).
//  - Reconnects with backoff (a fresh ticket each time), and drops the socket after a
//    minute in the background so nobody stands frozen in the street for others.
//  - Keeps the server clock (offset measured at the middle of each ping's round trip,
//    smoothed) so snapshots can be interpolated on the server's timeline.
import { decodeSnap, encodeState, OP_SNAP, PROTOCOL, type ClientMsg, type LL, type ServerMsg, type SnapEntity, type State } from "@/lib/arena/protocol";
import type { Hub, Identity } from "../../../realtime/hub";
import type { Player } from "../../../realtime/player";

export type RtHandlers = {
  snap: (t: number, list: SnapEntity[]) => void;
  msg: (m: ServerMsg) => void;
  status: (on: boolean) => void;
};

const HIDDEN_DROP_MS = 60_000;

export class RtClient {
  sid = 0;
  offset = 0;
  rtt = 0;
  connected = false;
  /** null until the game says whether a realtime server exists. */
  available: boolean | null = null;
  /** No realtime server: the hub runs in this tab (just me and bots). */
  local = false;
  private hub: Hub | null = null;
  private hubMe: Player | null = null;
  private hubTimer: ReturnType<typeof setInterval> | null = null;
  private ws: WebSocket | null = null;
  private stopped = false;
  private fails = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private hiddenAt = 0;
  private synced = false;

  constructor(private anchor: LL, private sim: boolean, private h: RtHandlers, private who: () => Identity | null) {}

  start() {
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisible);
    void this.connect();
  }

  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.retry) clearTimeout(this.retry);
    this.close();
    if (this.hubTimer) clearInterval(this.hubTimer);
    if (this.hub && this.hubMe) this.hub.drop(this.hubMe);
    this.hub = this.hubMe = null;
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  send(m: ClientMsg) {
    if (this.hub && this.hubMe) {
      if (m.t !== "ping") this.hub.message(this.hubMe, m);
    } else if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendState(s: State) {
    if (this.hub && this.hubMe) return this.hub.state(this.hubMe, s);
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN && this.sid && ws.bufferedAmount < 16_000) ws.send(encodeState(s));
  }

  private onVisible = () => {
    if (document.visibilityState === "hidden") this.hiddenAt = Date.now();
    else {
      this.hiddenAt = 0;
      if (!this.ws && !this.stopped && this.available) void this.connect();
    }
  };

  private close() {
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onerror = null;
      try {
        ws.close();
      } catch {}
    }
    if (this.connected) {
      this.connected = false;
      this.sid = 0;
      this.h.status(false);
    }
  }

  private later() {
    if (this.stopped || this.available === false) return;
    this.fails = Math.min(6, this.fails + 1);
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.connect(), Math.min(30_000, 1000 * 2 ** this.fails) * (0.8 + Math.random() * 0.4));
  }

  private async connect() {
    if (this.stopped || this.ws) return;
    let pass: { url: string | null; ticket: string | null };
    try {
      const res = await fetch(`/api/rt/ticket${this.sim ? "?sim=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return this.later();
      pass = await res.json();
    } catch {
      return this.later();
    }
    if (!pass.url || !pass.ticket) return this.startLocal();
    this.available = true;
    if (this.stopped || this.ws) return;
    const ticket = pass.ticket;
    const ws = new WebSocket(pass.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "hello", v: PROTOCOL, ticket, anchor: this.anchor } satisfies ClientMsg));
    };
    ws.onmessage = (e) => this.receive(e.data as string | ArrayBuffer);
    ws.onerror = () => {};
    ws.onclose = (e) => {
      this.ws = null;
      this.close();
      // Replaced by another tab, or a ticket the server didn't take: don't fight it.
      if (e.code === 4009 || e.code === 4003) this.fails = 6;
      this.later();
    };
  }

  /** No realtime server: run the hub here (it has the same rules; only bots to play with). */
  private async startLocal() {
    const who = this.who();
    if (!who) return void (this.retry = setTimeout(() => void this.connect(), 1500));
    const { Hub } = await import("../../../realtime/hub");
    if (this.stopped || this.hub) return;
    this.local = true;
    this.available = true;
    this.hub = new Hub((_m, results) => {
      if (results.length) this.h.msg({ t: "toast", text: "Practice match done — matches with friends pay XP and coins once the live server is on" });
    });
    // Deliveries are queued, so a message handler that sends again never re-enters the hub.
    const sock = { readyState: 1, bufferedAmount: 0, close: () => {}, send: (d: string | ArrayBuffer) => queueMicrotask(() => this.receive(d)) };
    this.hubMe = this.hub.join(sock, who, this.anchor);
    this.hubTimer = setInterval(() => this.hub?.tick(), 50);
  }

  private receive(data: string | ArrayBuffer) {
    if (data instanceof ArrayBuffer) {
      const v = new DataView(data);
      if (v.byteLength && v.getUint8(0) === OP_SNAP) {
        const s = decodeSnap(v);
        if (s) this.h.snap(s.t, s.list);
      }
      return;
    }
    let m: ServerMsg;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m.t === "welcome") {
      this.sid = m.sid;
      this.fails = 0;
      this.connected = true;
      this.offset = this.local ? 0 : m.now - Date.now();
      this.synced = false;
      this.h.status(true);
      if (!this.local) {
        this.ping();
        this.pinger = setInterval(() => this.ping(), 2000);
      }
    } else if (m.t === "pong") {
      const now = Date.now(), rtt = now - m.c;
      if (rtt >= 0 && rtt < 5000) {
        this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
        const off = m.s - (m.c + now) / 2;
        // Jump on the first sample, then glide (no visible hitch in interpolation).
        this.offset = this.synced ? this.offset + (off - this.offset) * 0.2 : off;
        this.synced = true;
      }
    }
    this.h.msg(m);
  }

  private ping() {
    if (this.hiddenAt && Date.now() - this.hiddenAt > HIDDEN_DROP_MS) {
      this.close();
      return;
    }
    this.send({ t: "ping", c: Date.now(), rtt: Math.round(this.rtt) });
  }
}
