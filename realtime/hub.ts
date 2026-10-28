// The heart of Street Arena's live layer, with no Node or network code: who's connected,
// the open city (World), the matches, what each message does, and the 20 Hz tick that
// sends everyone their snapshot.
//
// Two homes:
//  - realtime/server.ts: the WebSocket server (real multiplayer; tickets checked there);
//  - components/arena/rt.ts: inside the browser when no realtime server is deployed
//    (the game on Vercel alone). Then it's just you — and bots — in matches, and the
//    open city's other players come over HTTP instead (server/arena.ts).
import { isMode, RADII, type Difficulty, type Team } from "../src/lib/arena/modes";
import { encodeSnap, F_FOOT, type ArenaGeo, type ClientMsg, type LL, type RosterEntry, type SnapEntity, type State } from "../src/lib/arena/protocol";
import { isWeapon, WEAPON_BY_IDX } from "../src/lib/arena/weapons";
import { Match, type MatchResult } from "./match";
import { Player, type Sock } from "./player";
import { World } from "./world";

const FOOT_MPS = 11;
const VEHICLE_MPS = 130;

export type Identity = { id: string; name: string; avatar: string; level: number; friends: string[]; virtual: boolean };

export class Hub {
  readonly world = new World();
  readonly matches = new Map<string, Match>();
  readonly players = new Map<string, Player>(); // by user id
  /** Players following their real GPS: they see the city, nobody sees them. */
  private hidden = new WeakSet<Player>();
  private nextSid = 1;
  private usedSids = new Set<number>();
  private lastCreate = new WeakMap<Player, number>();
  private last = Date.now();
  private matchViewAt = 0;

  /** report: a finished match's human players (the server pays them out; the browser can't). */
  constructor(private report: (m: Match, results: MatchResult[]) => void) {}

  private newSid = () => {
    for (let i = 0; i < 65_000; i++) {
      const s = this.nextSid;
      this.nextSid = (this.nextSid % 65_000) + 1;
      if (!this.usedSids.has(s)) {
        this.usedSids.add(s);
        return s;
      }
    }
    throw new Error("out of sids");
  };

  /** Someone connected (identity already checked). An older connection of theirs is dropped. */
  join(sock: Sock, who: Identity, anchor: LL, now = Date.now()) {
    const old = this.players.get(who.id);
    if (old) {
      old.ws?.close(4009, "replaced");
      this.drop(old, now);
    }
    const p = new Player({ sid: this.newSid(), userId: who.id, name: who.name, avatar: who.avatar, level: who.level, friends: who.friends, ws: sock, anchor });
    if (!who.virtual) this.hidden.add(p);
    this.players.set(p.userId, p);
    this.world.add(p);
    p.send({ t: "welcome", sid: p.sid, now, passive: p.passive });
    p.status(this.world.id);
    return p;
  }

  drop(p: Player, now = Date.now()) {
    if (this.players.get(p.userId) !== p) return;
    const s = p.space;
    if (s instanceof Match) s.leave(p, now);
    else s?.remove(p);
    this.players.delete(p.userId);
    this.usedSids.delete(p.sid);
  }

  state(p: Player, s: State, now = Date.now()) {
    if (this.hidden.has(p)) {
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

  message(p: Player, m: ClientMsg, now = Date.now()) {
    const space = p.space;
    const world = this.world;
    switch (m.t) {
      case "ping":
        if (Number.isFinite(m.rtt)) p.rtt = Math.max(0, Math.min(5000, Number(m.rtt)));
        return p.send({ t: "pong", c: m.c, s: now });
      case "look":
        if (typeof m.color === "string" && /^#[0-9a-f]{6}$/i.test(m.color)) p.color = m.color;
        return;
      case "fire":
        if (!this.hidden.has(p)) space?.fire(p, m, now);
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
        return p.send({ t: "lobbies", list: [...this.matches.values()].filter((x) => x.phase !== "ended").map((x) => x.lobby(p)).filter((l) => l.dist < 3000).sort((a, b) => a.dist - b.dist).slice(0, 20) });
      case "create": {
        if (this.hidden.has(p)) return p.send({ t: "err", text: "Switch to Play from home to drive the 3D city" });
        if (space !== world || !p.placed) return;
        if (now - (this.lastCreate.get(p) ?? 0) < 5000) return;
        this.lastCreate.set(p, now);
        if (!isMode(m.mode) || !RADII.includes(m.radius as (typeof RADII)[number])) return;
        const diff: Difficulty = m.difficulty === "easy" || m.difficulty === "hard" ? m.difficulty : "normal";
        const geo: ArenaGeo = { roads: Array.isArray(m.geo?.roads) ? m.geo.roads : [], buildings: Array.isArray(m.geo?.buildings) ? m.geo.buildings : [] };
        const id = Math.random().toString(36).slice(2, 10);
        const match = new Match(id, p, m.mode, m.radius, Math.max(0, Math.min(10, Math.floor(Number(m.bots) || 0))), diff, geo, { newSid: this.newSid, ended: this.report, disband: (x) => this.disband(x) });
        if (!match.playable) return p.send({ t: "err", text: "Not enough streets here for an arena — try a busier spot, or wait for the map to load" });
        this.matches.set(match.id, match);
        world.remove(p);
        match.join(p, now);
        return;
      }
      case "join": {
        const match = this.matches.get(String(m.id));
        if (!match || space !== world || this.hidden.has(p)) return;
        const why = match.canJoin(p);
        if (why) return p.send({ t: "err", text: why, vars: { m: match.radius + 250 } });
        world.remove(p);
        match.join(p, now);
        return;
      }
      case "leave":
        if (space instanceof Match) {
          space.leave(p, now);
          this.backToWorld(p, now);
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

  private backToWorld(p: Player, now: number) {
    p.team = 0;
    p.passive = true;
    p.carrying = false;
    p.setLoadout("smg");
    p.revive(now, 3);
    this.world.add(p);
    p.send({ t: "match", m: null });
    if (p.returnLL) p.place(p.returnLL, 0, p.yaw, now);
    p.status(this.world.id);
  }

  private disband(m: Match) {
    const now = Date.now();
    for (const p of [...m.players]) {
      m.remove(p);
      if (p.bot) this.usedSids.delete(p.sid);
      else this.backToWorld(p, now);
    }
    this.matches.delete(m.id);
  }

  /** One step: matches, then everyone's snapshot (each in their own local metres). */
  tick(now = Date.now()) {
    const dt = Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    this.world.index();
    this.world.tickReloads(now);
    for (const m of [...this.matches.values()]) m.tick(dt, now);
    const refresh = now - this.matchViewAt > 3000;
    if (refresh) this.matchViewAt = now;
    for (const m of this.matches.values())
      if (m.dirty || refresh) {
        const v = m.view();
        for (const p of m.humans) p.send({ t: "match", m: v });
        m.dirty = false;
      }
    for (const p of this.players.values()) {
      if (!p.ws || !p.space) continue;
      const list: SnapEntity[] = [];
      const add: RosterEntry[] = [];
      const seen = new Set<number>();
      for (const o of p.space.visible(p)) {
        if (this.hidden.has(o) || list.length >= 60) continue;
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
  }
}
