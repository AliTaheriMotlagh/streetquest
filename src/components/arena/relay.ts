"use client";
// Street Arena matches between players without the realtime server, browser side
// (what travels how: lib/arena/relay; the server: server/arenaRelay.ts):
//  - RelayHost: my in-browser hub (rt.ts, local mode) runs a match; players who join it
//    through the game server become players in that hub, fed from their polls, and what
//    the referee tells them goes back the same way;
//  - RelayGuest: I'm in someone else's match: my moves and actions go up, the referee's
//    messages, its snapshots and everyone's moves come down;
//  - Mixer: every human is drawn from their own trail (one hop, so as fresh and smooth as
//    the network allows), with health, team and the rest from the referee; bots come
//    straight from the referee's snapshots.
import type { Hub, Identity } from "../../../realtime/hub";
import type { Player, Sock } from "../../../realtime/player";
import type { Team } from "@/lib/arena/modes";
import { F_DEAD, G_BOT, localFrame, type ClientMsg, type LL, type LocalFrame, type RosterEntry, type SnapEntity, type State } from "@/lib/arena/protocol";
import {
  capShots, ClockSync, decodeWorld, encodeWorld, HOST_GONE_MS, Lateness, packTrail, pushSample, reframe, RELAY_MUZZLE_SLACK_M, RELAY_REWIND_MS, toSample, toState, unpackTrail, WORLD_SNAPS, type Sample,
} from "@/lib/arena/relay";

export class RelayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function relayApi<T>(body: Record<string, unknown>, keepalive = false): Promise<T> {
  const res = await fetch("/api/arena", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new RelayError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

type PeerRow = { userId: string; name?: string; avatar?: string; level?: number; color?: string; anchor?: LL; trail: unknown; seenAt?: number; joinedAt?: number };
type Up = { at: number; m: ClientMsg };
export type Push = (e: SnapEntity, t: number, delay: number) => void;
/** A poll starts at most this often (≈ 6–7 a second)… */
const POLL_MS = 150;
/**
 * …with up to this many in flight at once: on a phone far from the server (Iran ↔ the US is
 * 250 ms and more, mobile networks jitter) one poll at a time means news only every round
 * trip; two overlapping halve that. Replies can then arrive out of order: messages are
 * numbered (one already handled is skipped), and an older reply never overwrites what a
 * newer one brought (trails, who's here).
 */
const IN_FLIGHT = 2;

// ---------------------------------------------------------------- drawing everyone
export class Mixer {
  private sidOf = new Map<string, number>();
  private meta = new Map<number, { hp: number; flags2: number; team: Team; dead: boolean }>();
  private lastAt = new Map<string, number>();
  readonly late = new Lateness();

  constructor(private frame: LocalFrame, private mySid: () => number, private push: Push) {}

  roster(add: RosterEntry[], del: number[]) {
    for (const r of add) if (!r.bot) this.sidOf.set(r.id, r.sid);
    if (!del.length) return;
    const gone = new Set(del);
    for (const [id, sid] of this.sidOf) if (gone.has(sid)) (this.sidOf.delete(id), this.lastAt.delete(id));
    for (const sid of del) this.meta.delete(sid);
  }

  /** The referee's view of everyone: bots are drawn from it, humans only take their health/team/state from it. */
  world(t: number, list: SnapEntity[], delay: number) {
    const me = this.mySid();
    for (const e of list) {
      if (e.sid === me) continue;
      if (e.flags2 & G_BOT) this.push(e, t, delay);
      else this.meta.set(e.sid, { hp: e.hp, flags2: e.flags2, team: e.team, dead: (e.flags & F_DEAD) !== 0 });
    }
  }

  /** A human's latest moves (their own samples, on the match clock). */
  trail(userId: string, samples: Sample[], matchNow: number) {
    const sid = this.sidOf.get(userId);
    if (!sid || sid === this.mySid()) return;
    const last = this.lastAt.get(userId) ?? 0;
    const fresh = samples.filter((s) => s.at > last);
    if (!fresh.length) return;
    this.late.add(matchNow - fresh[fresh.length - 1].at);
    for (const s of fresh) {
      this.lastAt.set(userId, s.at);
      const m = this.meta.get(sid) ?? { hp: 100, flags2: 0, team: 0, dead: false };
      const st = toState(this.frame, s);
      this.push({ ...st, sid, flags: st.flags | (m.dead ? F_DEAD : 0), hp: m.hp, flags2: m.flags2, team: m.team }, s.at, this.late.delay);
    }
  }

  clear() {
    this.sidOf.clear();
    this.meta.clear();
    this.lastAt.clear();
  }
}

// ---------------------------------------------------------------- hosting
type Guest = { userId: string; joinedAt: number; name: string; avatar: string; level: number; color: string; anchor: LL; p: Player | null; out: string[]; lastAt: number; pending: Up[]; done: boolean; trail: Sample[] };

/** My hub runs a match others join through the game server. */
export class RelayHost {
  private guests = new Map<string, Guest>();
  private ack = 0;
  private trail: Sample[] = [];
  private snaps: { t: number; list: SnapEntity[] }[] = [];
  private lastWorld = 0;
  private clock = new ClockSync();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Polls in flight, the last one started (its number), and the newest whose reply was used. */
  private inFlight = 0;
  private seq = 0;
  private usedSeq = 0;
  private stopped = false;
  private fails = 0;
  private sweepAt = 0;
  private startedAt = 0;
  private closingAt = 0;
  opened = false;

  constructor(
    private hub: Hub,
    readonly id: string,
    private me: Player,
    private frame: LocalFrame,
    private h: { trail: (userId: string, s: Sample[], matchNow: number) => void; ended: () => void; error: (text: string) => void },
  ) {
    // My own shots at relayed players aim where they were a poll or two ago.
    me.rewindMs = RELAY_REWIND_MS;
  }

  private get match() {
    return this.hub.matches.get(this.id) ?? null;
  }

  async open(o: { party: boolean; color: string; sim: boolean }) {
    const m = this.match;
    if (!m) return false;
    try {
      await relayApi({ action: "open", id: this.id, mode: m.mode, radius: m.radius, lat: m.frame.origin.lat, lng: m.frame.origin.lng, bots: m.botsWanted, anchor: this.frame.origin, color: o.color, party: o.party, sim: o.sim });
    } catch (e) {
      this.h.error((e as Error).message);
      this.stopped = true;
      return false;
    }
    this.opened = true;
    this.schedule(0);
    return true;
  }

  /** My own moves (my state on the local hub), for everyone else to draw. */
  mine(s: State, now = Date.now()) {
    pushSample(this.trail, toSample(this.frame, s, now));
  }

  /** After each hub step: keep a few snapshots of everyone (match frame) for the players. */
  afterTick(now: number) {
    const m = this.match;
    if (!m || now - this.lastWorld < 90) return;
    this.lastWorld = now;
    const list: SnapEntity[] = [];
    for (const o of m.players) {
      if (!o.placed) continue;
      const q = m.frame.toXZ(o.lat, o.lng);
      list.push({ sid: o.sid, x: q.x, y: o.y, z: q.z, yaw: o.yaw, pitch: o.pitch, vx: o.vx, vz: o.vz, flags: o.snapFlags(), vehicle: o.vehicle, weapon: o.weapon, hp: o.hp, flags2: o.flags2(now), team: o.team });
    }
    this.snaps.push({ t: now, list });
    if (this.snaps.length > WORLD_SNAPS) this.snaps.shift();
  }

  /** The match finished: tell the game server (it pays when people really played) and show each player what they got. */
  async result(results: { userId: string }[], players: number) {
    const m = this.match;
    if (!m || !results.length) return null;
    try {
      const r = await relayApi<{ rewards: Record<string, { xp: number; coins: number } | null>; practice: boolean }>({ action: "result", id: this.id, mode: m.mode, players, results });
      if (r.practice) return r;
      for (const g of this.guests.values()) {
        const got = r.rewards[g.userId];
        if (!g.p) continue;
        if (got) g.p.send({ t: "toast", text: "+{xp} XP · +{coins} coins", vars: { xp: got.xp, coins: got.coins } });
        else if (g.userId in r.rewards) g.p.send({ t: "toast", text: "Daily match rewards used up — play again tomorrow for more" });
      }
      return r;
    } catch {
      return null;
    }
  }

  get guestCount() {
    return [...this.guests.values()].filter((g) => g.p).length;
  }

  stop(close = true) {
    if (this.stopped && !this.opened) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const g of this.guests.values()) if (g.p) this.hub.drop(g.p);
    this.guests.clear();
    if (close && this.opened) void relayApi({ action: "close", id: this.id }, true).catch(() => {});
    this.opened = false;
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), ms);
  }

  private gap() {
    if (this.fails) return Math.min(5000, 400 * 2 ** this.fails);
    // Someone's playing (or being sent home): as often as the network allows (at most every POLL_MS). Waiting for players: once a second.
    return this.guestCount || this.closingAt ? Math.max(0, POLL_MS - (Date.now() - this.startedAt)) : 1000;
  }

  private async poll() {
    this.timer = null;
    // Waiting for players (once a second): never two at once.
    if (this.stopped || this.inFlight >= (this.guestCount || this.closingAt ? IN_FLIGHT : 1)) return;
    const m = this.match;
    // The match is over (disbanded): deliver everyone's goodbye (back to the city), then close the room.
    if (!m) {
      const now = Date.now();
      this.closingAt ||= now;
      const pending = [...this.guests.values()].some((g) => g.out.length);
      if ((!pending && now - this.closingAt > 2500) || now - this.closingAt > 8000) {
        this.stop(true);
        this.h.ended();
        return;
      }
    }
    this.inFlight++;
    const mySeq = ++this.seq;
    this.startedAt = Date.now();
    // The next one may start before this one's back.
    if (this.guestCount) this.schedule(POLL_MS);
    const out = [...this.guests.values()].filter((g) => g.out.length).map((g) => ({ to: g.userId, body: capShots(g.out.splice(0)) }));
    const now = Date.now();
    const sweep = now - this.sweepAt > 4000;
    if (sweep) this.sweepAt = now;
    const body = {
      action: "host", id: this.id, ack: this.ack, out, trail: packTrail(this.trail), snap: this.snaps.length ? encodeWorld(this.snaps) : undefined,
      phase: m?.phase ?? "ended", humans: m?.humans.length ?? 1, bots: m ? [...m.players].filter((p) => p.bot).length : 0, clock: -this.clock.offset, sweep,
    };
    const sentAt = Date.now();
    try {
      const r = await relayApi<{ now: number; msgs: { id: number; from: string; body: Up[] }[]; peers: PeerRow[] }>(body);
      this.fails = 0;
      this.clock.sample(sentAt, Date.now(), r.now);
      this.me.rtt = Math.round(this.clock.rtt);
      // An older reply than one already used: its messages (the new ones) count, its view of who's here doesn't.
      const newest = mySeq > this.usedSeq;
      if (newest) this.usedSeq = mySeq;
      this.apply(r.msgs, newest ? r.peers : null);
    } catch (e) {
      // Not delivered: send it again next time.
      for (const o of out) this.guests.get(o.to)?.out.unshift(...o.body);
      if (e instanceof RelayError && (e.status === 410 || e.status === 404 || e.status === 403)) {
        this.stopped = true;
        this.opened = false;
        this.h.ended();
        this.inFlight--;
        return;
      }
      this.fails = Math.min(4, this.fails + 1);
    } finally {
      if (this.inFlight > 0 && !this.stopped) this.inFlight--;
    }
    this.schedule(this.gap());
  }

  private apply(msgs: { id: number; from: string; body: Up[] }[], peers: PeerRow[] | null) {
    const now = Date.now();
    const m = this.match;
    const here = new Set<string>();
    for (const row of peers ?? []) {
      if (row.userId === this.me.userId) continue;
      here.add(row.userId);
      let g = this.guests.get(row.userId);
      // Left and came back: a new player.
      if (g && (row.joinedAt ?? 0) > g.joinedAt) {
        if (g.p) this.hub.drop(g.p);
        g = undefined;
      }
      if (!g) {
        g = { userId: row.userId, joinedAt: row.joinedAt ?? 0, name: row.name ?? "?", avatar: row.avatar ?? "🙂", level: row.level ?? 1, color: row.color ?? "#d7263d", anchor: row.anchor ?? this.frame.origin, p: null, out: [], lastAt: 0, pending: [], done: false, trail: [] };
        this.guests.set(row.userId, g);
      }
      g.trail = unpackTrail(row.trail);
      this.h.trail(row.userId, g.trail, now);
    }
    // Players who left (or were swept as gone) — only by the newest view of the room.
    if (peers)
    for (const [id, g] of this.guests)
      if (!here.has(id)) {
        if (g.p) this.hub.drop(g.p);
        this.guests.delete(id);
      }
    for (const row of msgs) {
      // Already handled (an overlapping poll brought it first).
      if (row.id <= this.ack) continue;
      this.ack = row.id;
      const g = this.guests.get(row.from);
      if (g && Array.isArray(row.body)) g.pending.push(...row.body.filter((u) => u && typeof u.at === "number" && u.m && typeof u.m === "object"));
    }
    for (const g of this.guests.values()) {
      if (g.done && !g.p) continue;
      if (!g.p) {
        if (!g.trail.length || !m) continue;
        this.admit(g, now);
        if (!g.p) continue;
      }
      this.feed(g, now);
      // Back in my open city after the match (the referee said goodbye): let them go once it's delivered.
      if (g.p.space && g.p.space !== m) g.done = true;
      // (They leave the room themselves once they've heard it; until then they stay out.)
      if (g.done && !g.out.length) {
        this.hub.drop(g.p);
        g.p = null;
      }
    }
  }

  /** A new player: into my hub where their trail says they are, then straight into the match. */
  private admit(g: Guest, now: number) {
    const m = this.match;
    if (!m) return;
    const sock: Sock = { readyState: 1, bufferedAmount: 0, send: (d) => void (typeof d === "string" && g.out.push(d)), close: () => void (g.done = true) };
    const who: Identity = { id: g.userId, name: g.name, avatar: g.avatar, level: g.level, friends: [], virtual: true };
    const p = this.hub.join(sock, who, g.anchor, now);
    p.rewindMs = RELAY_REWIND_MS;
    p.slackM = RELAY_MUZZLE_SLACK_M;
    p.color = g.color;
    const s = g.trail[g.trail.length - 1];
    this.hub.state(p, toState(p.frame, s), Math.min(now, s.at));
    g.lastAt = s.at;
    g.p = p;
    m.allow.add(g.userId);
    this.hub.message(p, { t: "join", id: m.id }, now);
    if (p.space !== m) g.done = true; // full or over: the referee told them why
  }

  /** Their moves and actions since last time, in the order they happened (each at its own time). */
  private feed(g: Guest, now: number) {
    const p = g.p!;
    const events: ({ at: number; s: Sample } | { at: number; m: ClientMsg })[] = [];
    for (const s of g.trail) if (s.at > g.lastAt) events.push({ at: s.at, s });
    for (const u of g.pending.splice(0)) events.push({ at: u.at, m: u.m });
    events.sort((a, b) => a.at - b.at);
    let t = g.lastAt;
    for (const e of events) {
      // Their clock is lined up with mine only roughly: never out of order, never in the future.
      t = Math.min(now, Math.max(t, e.at));
      if ("s" in e) {
        this.hub.state(p, toState(p.frame, e.s), t);
        g.lastAt = Math.max(g.lastAt, e.s.at);
      } else if (e.m.t === "ping") p.rtt = Math.max(0, Math.min(5000, Number(e.m.rtt) || 0));
      else this.hub.message(p, e.m, t);
    }
  }
}

// ---------------------------------------------------------------- joining
/** I'm in someone else's match. */
export class RelayGuest {
  private ack = 0;
  private trail: Sample[] = [];
  private up: Up[] = [];
  private clock = new ClockSync();
  private hostClock = 0;
  private lastWorldT = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Polls in flight, the last one started (its number), and the newest whose reply was used. */
  private inFlight = 0;
  private seq = 0;
  private usedSeq = 0;
  private stopped = false;
  private fails = 0;
  private quietSince = 0;
  private startedAt = 0;
  private pingAt = 0;

  constructor(
    readonly id: string,
    private frame: LocalFrame,
    private h: { msg: (raw: string) => void; world: (t: number, list: SnapEntity[], delay: number) => void; trail: (userId: string, s: Sample[], matchNow: number) => void; ended: (why: string | null) => void; delay: () => number },
  ) {}

  /** The host's clock minus mine (the match clock). */
  get offset() {
    return this.clock.offset + this.hostClock;
  }
  get rtt() {
    return this.clock.rtt;
  }
  private matchNow() {
    return Date.now() + this.offset;
  }

  start() {
    this.schedule(0);
  }

  send(m: ClientMsg) {
    if (m.t === "ping") return;
    this.up.push({ at: this.matchNow(), m });
    // Actions go out with the next poll as soon as pacing allows (moves can wait).
    if (this.inFlight < IN_FLIGHT && this.timer) this.schedule(Math.max(0, POLL_MS - (Date.now() - this.startedAt)));
  }

  state(s: State) {
    pushSample(this.trail, toSample(this.frame, s, this.matchNow()));
  }

  stop(leave: boolean) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (leave) void relayApi({ action: "leave", id: this.id }, true).catch(() => {});
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), ms);
  }

  private async poll() {
    this.timer = null;
    if (this.stopped || this.inFlight >= IN_FLIGHT) return;
    this.inFlight++;
    const mySeq = ++this.seq;
    this.startedAt = Date.now();
    // The next one may start before this one's back.
    this.schedule(POLL_MS);
    // Now and then, my round trip for the scoreboard's ping column.
    if (this.clock.synced && this.startedAt - this.pingAt > 2000) {
      this.pingAt = this.startedAt;
      this.up.push({ at: this.matchNow(), m: { t: "ping", c: 0, rtt: Math.round(this.clock.rtt) } });
    }
    const up = this.up.splice(0);
    const sentAt = Date.now();
    try {
      const r = await relayApi<{ now: number; clock: number; snap: string | null; origin: LL; msgs: { id: number; body: string[] }[]; peers: PeerRow[] }>({ action: "guest", id: this.id, ack: this.ack, trail: packTrail(this.trail), up });
      this.fails = 0;
      this.quietSince = 0;
      this.clock.sample(sentAt, Date.now(), r.now);
      this.hostClock = r.clock;
      const now = this.matchNow();
      for (const row of r.msgs) {
        // Already handled (an overlapping poll brought it first).
        if (row.id <= this.ack) continue;
        this.ack = row.id;
        if (Array.isArray(row.body)) for (const raw of row.body) if (!this.stopped && typeof raw === "string") this.h.msg(raw);
      }
      if (this.stopped) return;
      for (const s of decodeWorld(r.snap)) {
        if (s.t <= this.lastWorldT) continue;
        this.lastWorldT = s.t;
        this.h.world(s.t, s.list.map((e) => reframe(e, r.origin, this.frame)), this.h.delay());
      }
      // Everyone's trails from the newest reply only (an older one would pull them back).
      if (mySeq > this.usedSeq) {
        this.usedSeq = mySeq;
        for (const p of r.peers) this.h.trail(p.userId, unpackTrail(p.trail), now);
      }
    } catch (e) {
      this.up.unshift(...up);
      if (e instanceof RelayError && (e.status === 410 || e.status === 404 || e.status === 403 || e.status === 401)) {
        this.stopped = true;
        this.inFlight--;
        this.h.ended(e.message);
        return;
      }
      this.fails = Math.min(4, this.fails + 1);
      this.quietSince ||= Date.now();
      // Can't reach the game for a while: the match carries on without me.
      if (Date.now() - this.quietSince > HOST_GONE_MS * 2) {
        this.stopped = true;
        this.inFlight--;
        this.h.ended(null);
        return;
      }
    } finally {
      if (this.inFlight > 0 && !this.stopped) this.inFlight--;
    }
    this.schedule(this.fails ? Math.min(4000, 300 * 2 ** this.fails) : Math.max(0, POLL_MS - (Date.now() - this.startedAt)));
  }
}

export const frameOf = (anchor: LL) => localFrame(anchor);
