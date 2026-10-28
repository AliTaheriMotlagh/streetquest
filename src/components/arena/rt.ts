"use client";
// The 3D city's realtime link (realtime/server.ts over a WebSocket).
//  - Asks the game for a ticket (/api/rt/ticket); no realtime server configured → stays
//    off, and the city falls back to its HTTP presence (drive/net.ts).
//  - Reconnects with backoff (a fresh ticket each time), and drops the socket after a
//    minute in the background so nobody stands frozen in the street for others.
//  - Keeps the server clock (offset measured at the middle of each ping's round trip,
//    smoothed) so snapshots can be interpolated on the server's timeline.
import { decodeSnap, encodeState, OP_SNAP, PROTOCOL, type ClientMsg, type LL, type ServerMsg, type SnapEntity, type State } from "@/lib/arena/protocol";

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
  private ws: WebSocket | null = null;
  private stopped = false;
  private fails = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private hiddenAt = 0;
  private synced = false;

  constructor(private anchor: LL, private sim: boolean, private h: RtHandlers) {}

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
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendState(s: State) {
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
    if (!pass.url || !pass.ticket) {
      this.available = false;
      this.h.status(false);
      return;
    }
    this.available = true;
    if (this.stopped || this.ws) return;
    const ticket = pass.ticket;
    const ws = new WebSocket(pass.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "hello", v: PROTOCOL, ticket, anchor: this.anchor } satisfies ClientMsg));
    };
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const v = new DataView(e.data);
        if (v.byteLength && v.getUint8(0) === OP_SNAP) {
          const s = decodeSnap(v);
          if (s) this.h.snap(s.t, s.list);
        }
        return;
      }
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (m.t === "welcome") {
        this.sid = m.sid;
        this.fails = 0;
        this.connected = true;
        this.offset = m.now - Date.now();
        this.synced = false;
        this.h.status(true);
        this.ping();
        this.pinger = setInterval(() => this.ping(), 2000);
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
    };
    ws.onerror = () => {};
    ws.onclose = (e) => {
      this.ws = null;
      this.close();
      // Replaced by another tab, or a ticket the server didn't take: don't fight it.
      if (e.code === 4009 || e.code === 4003) this.fails = 6;
      this.later();
    };
  }

  private ping() {
    if (this.hiddenAt && Date.now() - this.hiddenAt > HIDDEN_DROP_MS) {
      this.close();
      return;
    }
    this.send({ t: "ping", c: Date.now(), rtt: Math.round(this.rtt) });
  }
}
