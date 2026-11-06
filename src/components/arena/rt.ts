"use client";
// The 3D city's realtime link (realtime/server.ts over a WebSocket).
//  - Asks the game for a ticket (/api/rt/ticket). No realtime server deployed (the game
//    on Vercel alone) → the same hub runs right here in the browser (`local`): the open
//    city's other players come over HTTP (drive/net.ts + server/arena.ts), and matches
//    are played with other people through the game server (relay.ts): a match I make is
//    open to my party and to players nearby, and I can join theirs.
//  - Reconnects with backoff (a fresh ticket each time), and drops the socket after a
//    minute in the background so nobody stands frozen in the street for others.
//  - Keeps the server clock (offset measured at the middle of each ping's round trip,
//    smoothed) so snapshots can be interpolated on the server's timeline. In someone
//    else's relayed match the clock is the host's (measured through the game server).
import { decodeSnap, encodeState, localFrame, OP_SNAP, PROTOCOL, type ClientMsg, type LL, type LocalFrame, type ServerMsg, type SnapEntity, type State } from "@/lib/arena/protocol";
import type { Hub, Identity } from "../../../realtime/hub";
import type { Player, Sock } from "../../../realtime/player";
import { Mixer, RelayGuest, RelayHost, relayApi } from "./relay";

export type RtHandlers = {
  snap: (t: number, list: SnapEntity[]) => void;
  /** One player's sample at its own time, drawn `delay` ms behind (relayed matches). */
  push: (e: SnapEntity, t: number, delay: number) => void;
  msg: (m: ServerMsg) => void;
  status: (on: boolean) => void;
};

const HIDDEN_DROP_MS = 60_000;
/** How far behind the realtime link's 20 Hz snapshots are drawn (remotes.ts RT_DELAY_MS). */
const LIVE_DELAY_MS = 110;

export class RtClient {
  sid = 0;
  offset = 0;
  rtt = 0;
  connected = false;
  /** null until the game says whether a realtime server exists. */
  available: boolean | null = null;
  /** No realtime server: the hub runs in this tab (matches go through the game server). */
  local = false;
  /** The next match I make goes to my party (else it's open to anyone nearby). */
  nextHost: { party: boolean } | null = null;
  private hub: Hub | null = null;
  private hubMe: Player | null = null;
  private hubTimer: ReturnType<typeof setInterval> | null = null;
  private loopback: Sock | null = null;
  private ws: WebSocket | null = null;
  private stopped = false;
  private fails = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private hiddenAt = 0;
  private synced = false;
  private frame: LocalFrame;
  private mixer: Mixer;
  private host: RelayHost | null = null;
  private guest: RelayGuest | null = null;
  private guestInMatch = false;
  private joining = false;
  private hostTried: string | null = null;
  private lastState: State | null = null;
  private returnTo: State | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private anchor: LL, private sim: boolean, private h: RtHandlers, private who: () => (Identity & { color?: string }) | null) {
    this.frame = localFrame(anchor);
    this.mixer = new Mixer(this.frame, () => this.sid, (e, t, d) => this.h.push(e, t, d));
  }

  /** My moves should go out: connected, or joining someone's relayed match (they let me in once they have my first move). */
  get linked() {
    return this.connected || !!this.guest;
  }
  /** In a relayed match: hosting it in this tab, or playing in someone else's. */
  get relay(): "host" | "guest" | null {
    return this.guest ? "guest" : this.host?.opened ? "host" : null;
  }
  /** How far behind other players are drawn (ms) — what a shot's lag compensation aims at. */
  get delay() {
    return this.guest ? this.mixer.late.delay : LIVE_DELAY_MS;
  }
  /** The same for humans in a match I host (they come through the game server). */
  get relayDelay() {
    return this.mixer.late.delay;
  }

  start() {
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisible);
    void this.connect();
  }

  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.retry) clearTimeout(this.retry);
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.close();
    this.host?.stop(true);
    this.host = null;
    this.guest?.stop(true);
    this.guest = null;
    if (this.hubTimer) clearInterval(this.hubTimer);
    if (this.hub && this.hubMe) this.hub.drop(this.hubMe);
    this.hub = this.hubMe = null;
  }

  serverNow() {
    return Date.now() + (this.guest ? this.guest.offset : this.offset);
  }

  send(m: ClientMsg) {
    if (this.guest) return this.guest.send(m);
    if (this.hub) {
      if (this.hubMe && m.t !== "ping") this.hub.message(this.hubMe, m);
    } else if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  sendState(s: State) {
    this.lastState = s;
    if (this.guest) return this.guest.state(s);
    if (this.hub) {
      if (!this.hubMe) return;
      this.hub.state(this.hubMe, s);
      this.host?.mine(s);
      return;
    }
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN && this.sid && ws.bufferedAmount < 16_000) ws.send(encodeState(s));
  }

  // ------------------------------------------------------------ relayed matches
  /** Step into someone's match through the game server (no realtime server). */
  async joinRelay(id: string) {
    if (this.guest || !this.hub || this.joining) return false;
    if (this.host?.opened && this.host.guestCount) {
      this.h.msg({ t: "err", text: "Finish your own match first — players are in it" });
      return false;
    }
    this.joining = true;
    const who = this.who();
    try {
      await relayApi({ action: "join", id, anchor: this.anchor, color: who?.color, sim: this.sim });
    } catch (e) {
      this.h.msg({ t: "err", text: (e as Error).message });
      return false;
    } finally {
      this.joining = false;
    }
    if (this.stopped) return false;
    this.host?.stop(true);
    this.host = null;
    // Away from my own hub while I'm in theirs.
    this.returnTo = this.lastState;
    if (this.hubMe) this.hub.drop(this.hubMe);
    this.hubMe = null;
    if (this.hubTimer) clearInterval(this.hubTimer);
    this.hubTimer = null;
    this.connected = false;
    this.sid = 0;
    this.mixer.clear();
    this.h.status(false);
    this.guestInMatch = false;
    const g = new RelayGuest(id, this.frame, {
      msg: (raw) => this.receive(raw),
      world: (t, list, d) => this.mixer.world(t, list, d),
      trail: (u, s, now) => this.mixer.trail(u, s, now),
      ended: (why) => this.endGuest(why, true),
      delay: () => this.mixer.late.delay,
    });
    this.guest = g;
    g.start();
    return true;
  }

  /** Leave someone's match: they send me back where I was (or I go back myself if they can't). */
  leaveRelay() {
    if (!this.guest) return;
    this.guest.send({ t: "leave" });
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => this.endGuest(null, true), 5000);
  }

  private endGuest(why: string | null, goBack: boolean) {
    const g = this.guest;
    if (!g) return;
    this.guest = null;
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
    g.stop(true);
    if (why) this.h.msg({ t: "toast", text: why });
    if (goBack) {
      this.h.msg({ t: "match", m: null });
      const r = this.returnTo;
      if (r) this.h.msg({ t: "spawn", x: r.x, y: 0, z: r.z, yaw: r.yaw });
    }
    this.connected = false;
    this.sid = 0;
    this.mixer.clear();
    this.h.status(false);
    this.joinLocal();
  }

  /** My hub made a match with me as its host: open it to my party / players nearby. */
  private hostMatch(id: string) {
    if (!this.hub || !this.hubMe || this.stopped) return;
    this.hostTried = id;
    // One hosted match at a time: a new one closes the old (its players go back to the city).
    this.host?.stop(true);
    const want = this.nextHost;
    this.nextHost = null;
    const host = new RelayHost(this.hub, id, this.hubMe, this.frame, {
      trail: (u, s, now) => this.mixer.trail(u, s, now),
      ended: () => {
        if (this.host === host) this.host = null;
      },
      // Not open to others (e.g. not playing from home): it stays practice with bots — say why if it was for the party.
      error: (text) => void (want?.party && this.h.msg({ t: "err", text })),
    });
    this.host = host;
    void host.open({ party: !!want?.party, color: this.who()?.color ?? "#d7263d", sim: this.sim }).then((ok) => {
      if (!ok && this.host === host) this.host = null;
    });
  }

  // ------------------------------------------------------------ connection
  private onVisible = () => {
    if (document.visibilityState === "hidden") this.hiddenAt = Date.now();
    else {
      this.hiddenAt = 0;
      if (!this.ws && !this.hub && !this.stopped && this.available) void this.connect();
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
    if (this.stopped || this.ws || this.hub) return;
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

  /** No realtime server: run the hub here (it has the same rules); other people join through the game server. */
  private async startLocal() {
    const who = this.who();
    if (!who) return void (this.retry = setTimeout(() => void this.connect(), 1500));
    const { Hub } = await import("../../../realtime/hub");
    if (this.stopped || this.hub) return;
    this.local = true;
    this.available = true;
    this.hub = new Hub((m, results) => {
      const host = this.host;
      if (host?.id === m.id && host.opened && host.guestCount) {
        void host.result(results, m.players.size).then((r) => {
          const mine = r?.rewards[who.id];
          if (mine) this.h.msg({ t: "toast", text: "+{xp} XP · +{coins} coins", vars: { xp: mine.xp, coins: mine.coins } });
          else if (r && who.id in r.rewards) this.h.msg({ t: "toast", text: "Daily match rewards used up — play again tomorrow for more" });
          else if (r?.practice) this.h.msg({ t: "toast", text: "Practice match done — matches with other players pay XP and coins" });
        });
      } else if (results.length) this.h.msg({ t: "toast", text: "Practice match done — matches with other players pay XP and coins" });
    });
    // Deliveries are queued, so a message handler that sends again never re-enters the hub.
    this.loopback = { readyState: 1, bufferedAmount: 0, close: () => {}, send: (d: string | ArrayBuffer) => queueMicrotask(() => this.hubMe && this.receive(d)) };
    this.joinLocal();
  }

  /** (Back) into my own hub's open city. */
  private joinLocal() {
    const who = this.who();
    if (!this.hub || this.hubMe || !this.loopback || !who || this.stopped) return;
    this.hubMe = this.hub.join(this.loopback, who, this.anchor);
    if (!this.hubTimer)
      this.hubTimer = setInterval(() => {
        const now = Date.now();
        this.hub?.tick(now);
        this.host?.afterTick(now);
      }, 50);
  }

  private receive(data: string | ArrayBuffer) {
    if (data instanceof ArrayBuffer) {
      const v = new DataView(data);
      if (v.byteLength && v.getUint8(0) === OP_SNAP) {
        const s = decodeSnap(v);
        // Hosting people through the game server: they're drawn from their own trails.
        if (s) this.host?.guestCount ? this.mixer.world(s.t, s.list, LIVE_DELAY_MS) : this.h.snap(s.t, s.list);
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
      this.offset = this.local || this.guest ? 0 : m.now - Date.now();
      this.synced = false;
      this.h.status(true);
      if (!this.local && !this.guest) {
        this.ping();
        this.pinger = setInterval(() => this.ping(), 2000);
      }
    } else if (m.t === "pong") {
      const now = Date.now(), rtt = now - m.c;
      if (!this.local && rtt >= 0 && rtt < 5000) {
        this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
        const off = m.s - (m.c + now) / 2;
        // Jump on the first sample, then glide (no visible hitch in interpolation).
        this.offset = this.synced ? this.offset + (off - this.offset) * 0.2 : off;
        this.synced = true;
      }
    } else if (m.t === "roster") this.mixer.roster(m.add, m.del);
    else if (m.t === "match" && m.m && this.hub && !this.guest && m.m.hostSid === this.sid && m.m.phase === "lobby" && this.hostTried !== m.m.id) this.hostMatch(m.m.id);
    this.h.msg(m);
    if (this.guest) {
      if (m.t === "match") {
        if (m.m) this.guestInMatch = true;
        // The referee sent me back to the city: once the rest of this batch (where to) is through.
        else queueMicrotask(() => this.endGuest(null, false));
      } else if (m.t === "err" && !this.guestInMatch) queueMicrotask(() => this.endGuest(null, true));
    }
  }

  private ping() {
    if (this.hiddenAt && Date.now() - this.hiddenAt > HIDDEN_DROP_MS) {
      this.close();
      return;
    }
    this.send({ t: "ping", c: Date.now(), rtt: Math.round(this.rtt) });
  }
}
