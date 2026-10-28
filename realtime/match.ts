// One Street Arena match, played inside a circle on the real streets around where the
// host stood. Lobby → warm-up (everyone at a spawn, frozen) → live → results, then
// everyone goes back to the open city where they were before.
//
// The host's client sends the streets and buildings inside the circle with the request
// (it has the map loaded); the server turns them into a street graph (nav.ts) for spawns,
// bomb sites and bots, and a building index for line of sight — bullets and bots don't
// go through walls. Results are posted to the game server (/api/rt/result), which pays
// out with a daily cap.
import { distanceM } from "../src/lib/geo";
import { FootprintIndex } from "../src/lib/arena/geom";
import {
  BOMB_REACH_M, BOMB_TIMER_S, bombSide, DEFUSE_S, FREEZE_S, JOIN_MARGIN_M, MAX_BOTS, MAX_PLAYERS, MODES, OUTSIDE_DPS, OUTSIDE_GRACE_S, PLANT_S, RESPAWN_S, RESULTS_S,
  ROUND_END_S, ROUND_S, ROUNDS_TO_WIN, SITE_R, SPAWN_SHIELD_S, WARMUP_S,
  type Difficulty, type LobbyView, type MatchView, type ModeDef, type ModeKey, type Phase, type Team,
} from "../src/lib/arena/modes";
import { localFrame, type ArenaGeo, type LL, F_FOOT } from "../src/lib/arena/protocol";
import { PRIMARIES, WEAPONS, type WeaponKey } from "../src/lib/arena/weapons";
import { BOT_NAMES, newBrain, tickBot, type Brain } from "./bots";
import { Nav } from "./nav";
import { Player } from "./player";
import { Space } from "./space";

const LOBBY_IDLE_MS = 10 * 60_000;
const BOMB_BLAST_M = 18;
/** Team spawns sit this far out (× radius) on opposite sides. */
const SPAWN_OUT = 0.5;

type Bomb = NonNullable<MatchView["bomb"]>;
export type MatchResult = { userId: string; name: string; kills: number; botKills: number; deaths: number; score: number; won: boolean; place: number; rounds: number };

export class Match extends Space {
  readonly def: ModeDef;
  readonly frame: ReturnType<typeof localFrame>;
  readonly index = new FootprintIndex();
  readonly nav: Nav;
  readonly createdAt = Date.now();
  host: Player;
  phase: Phase = "lobby";
  until = 0;
  round = 0;
  teamScore: [number, number, number] = [0, 0, 0];
  sites: { name: string; x: number; z: number }[] = [];
  /** Spawn areas by side: "a" (attackers / Red) and "b" (defenders / Blue). */
  private spawnA: number[] = [];
  private spawnB: number[] = [];
  bomb: Bomb | null = null;
  winner: MatchView["winner"] = null;
  private brains = new Map<Player, Brain>();
  private decided = false;
  private touched = Date.now();
  dirty = true;

  constructor(
    id: string,
    host: Player,
    readonly mode: ModeKey,
    readonly radius: number,
    public botsWanted: number,
    readonly difficulty: Difficulty,
    geo: ArenaGeo,
    private hooks: { newSid: () => number; ended: (m: Match, results: MatchResult[]) => void; disband: (m: Match) => void },
  ) {
    super(id);
    this.def = MODES[mode];
    this.host = host;
    const center = host.ll;
    this.frame = localFrame(center);
    // Host frame → match frame.
    const conv = (x: number, z: number) => {
      const ll = host.frame.toLL(x, z);
      return this.frame.toXZ(ll.lat, ll.lng);
    };
    const keep = this.radius + 40;
    for (const b of geo.buildings.slice(0, 4000)) {
      if (!Array.isArray(b.p) || b.p.length < 6 || b.p.length > 400) continue;
      const pts: number[] = [];
      for (let i = 0; i + 1 < b.p.length; i += 2) {
        const q = conv(Number(b.p[i]), Number(b.p[i + 1]));
        pts.push(q.x, q.z);
      }
      if (!pts.every(Number.isFinite)) continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 2) (minX = Math.min(minX, pts[i])), (maxX = Math.max(maxX, pts[i])), (minZ = Math.min(minZ, pts[i + 1])), (maxZ = Math.max(maxZ, pts[i + 1]));
      if (Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minZ), Math.abs(maxZ))) > keep * 1.5) continue;
      this.index.add({ pts, minX, maxX, minZ, maxZ, h: Math.max(2, Math.min(300, Number(b.h) || 8)), mh: Math.max(0, Math.min(50, Number(b.mh) || 0)) });
    }
    const roads: number[][] = [];
    for (const line of geo.roads.slice(0, 3000)) {
      if (!Array.isArray(line) || line.length < 4 || line.length > 2000) continue;
      const out: number[] = [];
      for (let i = 0; i + 1 < line.length; i += 2) {
        const q = conv(Number(line[i]), Number(line[i + 1]));
        out.push(q.x, q.z);
      }
      if (out.every(Number.isFinite)) roads.push(out);
    }
    this.nav = new Nav(roads, this.radius, this.index);
    this.geo = { frame: this.frame, index: this.index };
    this.layout();
  }

  /** Enough streets to play on? (Checked before the match is announced.) */
  get playable() {
    return this.nav.nodes.length >= 25 && this.spawnA.length > 0 && this.spawnB.length > 0 && (this.mode !== "bomb" || this.sites.length === 2);
  }

  /** Two spawn areas on opposite sides of the circle, and (bomb) two sites on the defenders' half. */
  private layout() {
    const N = this.nav.nodes;
    if (!N.length) return;
    let bestAxis = 0, bestScore = -Infinity;
    // Spawns half way out: close enough that the first fight comes in ~20 s of running.
    const R = this.radius * SPAWN_OUT;
    // Try a few axes; keep the one whose ends both have streets near the spot.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const ax = Math.cos(a) * R, az = Math.sin(a) * R;
      const na = this.nav.nearest(ax, az), nb = this.nav.nearest(-ax, -az);
      const score = Math.hypot(na.x - nb.x, na.z - nb.z) - Math.hypot(na.x - ax, na.z - az) - Math.hypot(nb.x + ax, nb.z + az);
      if (score > bestScore) (bestScore = score), (bestAxis = a);
    }
    const ax = Math.cos(bestAxis), az = Math.sin(bestAxis);
    const ea = this.nav.nearest(ax * R, az * R), eb = this.nav.nearest(-ax * R, -az * R);
    const around = (c: { x: number; z: number }) => {
      const list = N.filter((n) => Math.hypot(n.x - c.x, n.z - c.z) < 40).map((n) => n.i);
      return list.length >= 4 ? list : N.slice().sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z)).slice(0, 6).map((n) => n.i);
    };
    this.spawnA = around(ea);
    this.spawnB = around(eb);
    if (this.mode === "bomb") {
      // Defenders' half (toward B), 25–70% of the way out, ~0.8 × radius apart: far enough to
      // split the defence, close enough to rotate before the bomb goes off.
      const cands = N.filter((n) => {
        const r = Math.hypot(n.x, n.z);
        return r > this.radius * 0.25 && r < this.radius * 0.7 && n.x * -ax + n.z * -az > this.radius * 0.05;
      });
      const want = this.radius * 0.8;
      let best: [typeof N[0], typeof N[0]] | null = null, bd = 0, miss = Infinity;
      for (let i = 0; i < cands.length; i += Math.max(1, Math.floor(cands.length / 60)))
        for (let j = i + 1; j < cands.length; j += Math.max(1, Math.floor(cands.length / 60))) {
          const d = Math.hypot(cands[i].x - cands[j].x, cands[i].z - cands[j].z);
          if (Math.abs(d - want) < miss) (miss = Math.abs(d - want)), (bd = d), (best = [cands[i], cands[j]]);
        }
      if (best && bd > this.radius * 0.35) this.sites = [{ name: "A", x: best[0].x, z: best[0].z }, { name: "B", x: best[1].x, z: best[1].z }];
    }
  }

  // ------------------------------------------------------------ people
  get humans() {
    return [...this.players].filter((p) => !p.bot);
  }
  private teamCount(t: Team) {
    return [...this.players].filter((p) => p.team === t).length;
  }

  canJoin(p: Player): string | null {
    if (this.phase === "ended") return "This match is over";
    if (this.humans.length >= MAX_PLAYERS) return "This match is full";
    if (distanceM(p.ll, this.frame.origin) > this.radius + JOIN_MARGIN_M) return "Drive closer to join — you need to be within {m} m";
    return null;
  }

  join(p: Player, now: number) {
    p.returnLL = p.ll;
    p.team = this.def.teams ? (this.teamCount(1) <= this.teamCount(2) ? 1 : 2) : 0;
    // Take a bot's place on that team, if there is one.
    if (this.phase !== "lobby") {
      const bot = [...this.players].find((b) => b.bot && b.team === p.team);
      if (bot) this.dropBot(bot);
    }
    p.kills = p.deaths = p.score = p.botKills = 0;
    p.carrying = false;
    p.actingUntil = 0;
    p.passive = false;
    p.setLoadout(p.primary);
    p.revive(now, SPAWN_SHIELD_S);
    this.add(p);
    if (this.phase === "lobby") this.place(p, now);
    else if (this.mode === "bomb" && this.phase === "live") {
      // Mid-round: sit this round out.
      p.dead = true;
      p.hp = 0;
      p.respawnAt = 0;
    } else this.place(p, now);
    this.touched = now;
    this.dirty = true;
  }

  leave(p: Player, now: number) {
    if (p.carrying) this.dropBomb(p);
    this.remove(p);
    p.team = 0;
    p.carrying = false;
    if (p === this.host) {
      const next = this.humans[0];
      if (next) this.host = next;
    }
    this.dirty = true;
    if (!this.humans.length) {
      this.decided = true;
      this.hooks.disband(this);
    } else if (this.phase !== "lobby" && this.phase !== "ended") this.checkRound(now);
  }

  setTeam(p: Player, t: Team) {
    if (!this.def.teams || (t !== 1 && t !== 2) || this.phase !== "lobby") return;
    p.team = t;
    this.dirty = true;
  }

  setLoadout(p: Player, w: WeaponKey) {
    if (!PRIMARIES.includes(w) && w !== "pistol") return;
    p.primary = w;
    // Takes effect now in the lobby / freeze time, otherwise at the next spawn.
    if (this.phase === "lobby" || this.phase === "warmup" || p.dead) p.setLoadout(w);
    p.status(this.id);
  }

  private addBot(team: Team, now: number) {
    const n = [...this.players].filter((p) => p.bot).length;
    const taken = new Set([...this.players].map((p) => p.name));
    const free = BOT_NAMES.map((x) => `${x} 🤖`).filter((x) => !taken.has(x));
    const name = free.length ? free[Math.floor(Math.random() * free.length)] : `Bot ${n + 1} 🤖`;
    const b = new Player({ sid: this.hooks.newSid(), userId: `bot:${this.id}:${n}`, name, avatar: "🤖", level: 1, ws: null, anchor: this.frame.origin, bot: true });
    b.team = team;
    b.passive = false;
    b.setLoadout(Math.random() < 0.6 ? "rifle" : "smg");
    b.weapon = WEAPONS[b.loadout[0]].idx;
    b.flags = F_FOOT;
    b.color = "#7d8597";
    this.add(b);
    const at = this.spawnPoint(b);
    this.brains.set(b, newBrain(at.x, at.z));
    this.place(b, now);
  }

  private dropBot(b: Player) {
    if (b.carrying) this.dropBomb(b);
    this.brains.delete(b);
    this.remove(b);
  }

  /** Bring the bots up to what the host asked for, balancing the teams. */
  private fillBots(now: number) {
    const want = Math.max(0, Math.min(MAX_BOTS, this.botsWanted, MAX_PLAYERS - this.humans.length));
    let have = [...this.players].filter((p) => p.bot).length;
    while (have < want) {
      const t: Team = this.def.teams ? (this.teamCount(1) <= this.teamCount(2) ? 1 : 2) : 0;
      this.addBot(t, now);
      have++;
    }
  }

  // ------------------------------------------------------------ spawning
  private sideOf(p: Player): "a" | "b" {
    if (this.mode === "bomb") return bombSide(p.team, Math.max(1, this.round)) === "attack" ? "a" : "b";
    return p.team === 2 ? "b" : "a";
  }

  private spawnPoint(p: Player): { x: number; z: number; yaw: number } {
    const N = this.nav.nodes;
    let node;
    if (this.def.teams) {
      const pool = this.sideOf(p) === "a" ? this.spawnA : this.spawnB;
      node = N[pool[Math.floor(Math.random() * pool.length)]];
    } else {
      // Deathmatch: the candidate farthest from everyone alive.
      const others = [...this.players].filter((o) => o !== p && !o.dead && o.placed).map((o) => this.frame.toXZ(o.lat, o.lng));
      let best = N[0], bd = -1;
      for (let k = 0; k < 24; k++) {
        const n = this.nav.random();
        const d = others.length ? Math.min(...others.map((o) => Math.hypot(o.x - n.x, o.z - n.z))) : Math.random();
        if (d > bd) (bd = d), (best = n);
      }
      node = best;
    }
    // Face the middle.
    return { x: node.x, z: node.z, yaw: Math.atan2(node.x, node.z) };
  }

  private place(p: Player, now: number) {
    const s = this.spawnPoint(p);
    p.place(this.frame.toLL(s.x, s.z), 0, s.yaw, now);
    const br = this.brains.get(p);
    if (br) Object.assign(br, newBrain(s.x, s.z));
    p.status(this.id);
  }

  // ------------------------------------------------------------ flow
  start(by: Player, now: number) {
    if (by !== this.host || this.phase !== "lobby") return;
    this.fillBots(now);
    if (this.players.size < this.def.minPlayers) return by.send({ t: "err", text: "Need at least {n} players — add bots or wait for friends", vars: { n: this.def.minPlayers } });
    this.teamScore = [0, 0, 0];
    for (const p of this.players) (p.kills = p.deaths = p.score = p.botKills = 0);
    if (this.mode === "bomb") this.startRound(now);
    else {
      this.phase = "warmup";
      this.until = now + WARMUP_S * 1000;
      for (const p of this.players) {
        p.revive(now, WARMUP_S + SPAWN_SHIELD_S);
        p.setLoadout(p.primary);
        this.place(p, now);
      }
    }
    this.dirty = true;
  }

  private startRound(now: number) {
    this.round++;
    this.phase = "warmup";
    this.until = now + FREEZE_S * 1000;
    this.winner = null;
    for (const p of this.players) {
      p.carrying = false;
      p.actingUntil = 0;
      p.revive(now, FREEZE_S);
      p.setLoadout(p.primary);
      this.place(p, now);
    }
    const attackers = [...this.players].filter((p) => bombSide(p.team, this.round) === "attack");
    const humans = attackers.filter((p) => !p.bot);
    const carrier = (humans.length ? humans : attackers)[Math.floor(Math.random() * (humans.length || attackers.length))];
    if (carrier) {
      carrier.carrying = true;
      this.bomb = { state: "carried", carrier: carrier.sid, lat: carrier.lat, lng: carrier.lng, at: 0, site: "" };
    } else this.bomb = null;
    this.dirty = true;
  }

  canHurt(a: Player, b: Player, now: number) {
    if (this.phase !== "live" || a.dead || b.dead) return false;
    if (a === b) return true;
    void now;
    return !this.def.teams || a.team !== b.team;
  }

  *visible(p: Player) {
    for (const o of this.players) if (o !== p && o.placed) yield o;
  }

  /** Movement check for a player's reported position (match frame): no walking through walls or leaving during freeze. */
  accept(p: Player, ll: LL, y: number) {
    if (p.dead) return false;
    const q = this.frame.toXZ(ll.lat, ll.lng);
    if (this.index.inside(q.x, q.z, y + 0.5)) return false;
    if (this.phase === "warmup" && p.spawnLL && distanceM(ll, p.spawnLL) > 4) return false;
    return true;
  }

  onKill(victim: Player, killer: Player | null, w: WeaponKey | "zone" | "bomb", head: boolean, now: number) {
    victim.deaths++;
    if (killer && killer !== victim && (!this.def.teams || killer.team !== victim.team)) {
      killer.kills++;
      if (victim.bot) killer.botKills++;
      killer.score += 100 + (head ? 25 : 0);
      if (this.mode === "tdm") this.teamScore[killer.team]++;
    }
    if (this.def.respawn) victim.respawnAt = now + RESPAWN_S * 1000;
    if (victim.carrying) this.dropBomb(victim);
    this.feed(victim, killer, w, head);
    victim.status(this.id);
    killer?.status(this.id);
    this.dirty = true;
    this.checkRound(now);
  }

  private dropBomb(p: Player) {
    p.carrying = false;
    if (this.bomb && this.bomb.state === "carried") Object.assign(this.bomb, { state: "dropped", carrier: 0, lat: p.lat, lng: p.lng });
    this.dirty = true;
  }

  /** Hold-to-act (bomb): plant at a site with the bomb, defuse beside a planted one. */
  act(p: Player, on: boolean, now: number) {
    if (!on) {
      if (p.actingUntil) (p.actingUntil = 0), (this.dirty = true);
      return;
    }
    // Already planting / defusing: it finishes (or is cancelled) in tickBomb — even when its time
    // is up this very tick, a repeat request must not restart it.
    if (this.mode !== "bomb" || this.phase !== "live" || p.dead || p.actingUntil || !this.bomb) return;
    const side = bombSide(p.team, this.round);
    const q = this.frame.toXZ(p.lat, p.lng);
    if (side === "attack" && p.carrying && this.bomb.state === "carried") {
      if (!this.sites.some((s) => Math.hypot(s.x - q.x, s.z - q.z) <= SITE_R)) return p.send({ t: "err", text: "Plant the bomb inside site A or B" });
      p.actingUntil = now + PLANT_S * 1000;
    } else if (side === "defend" && this.bomb.state === "planted") {
      const b = this.frame.toXZ(this.bomb.lat, this.bomb.lng);
      if (Math.hypot(b.x - q.x, b.z - q.z) > BOMB_REACH_M + 0.5) return;
      p.actingUntil = now + DEFUSE_S * 1000;
    } else return;
    p.actingAt = p.ll;
    this.dirty = true;
  }

  tick(dt: number, now: number) {
    this.tickReloads(now);
    if (this.phase === "lobby") {
      if (now - this.touched > LOBBY_IDLE_MS) {
        for (const p of this.humans) p.send({ t: "toast", text: "The lobby closed — nobody started it" });
        this.end(now, null, "idle", true);
      }
      return;
    }
    for (const [b, br] of this.brains) tickBot(this, b, br, dt, now);

    if (this.phase === "warmup" && now >= this.until) {
      this.phase = "live";
      this.until = this.mode === "bomb" ? now + ROUND_S * 1000 : now + this.def.timeLimitS * 1000;
      this.dirty = true;
    }
    if (this.phase === "live") {
      for (const p of this.players) {
        // Respawns.
        if (p.dead && this.def.respawn && p.respawnAt && now >= p.respawnAt) {
          p.revive(now, SPAWN_SHIELD_S);
          p.setLoadout(p.primary);
          this.place(p, now);
          this.dirty = true;
        }
        if (p.dead || !p.placed) continue;
        // The circle.
        const out = distanceM(p.ll, this.frame.origin) > this.radius;
        if (!out) p.outsideSince = 0;
        else if (!p.outsideSince) p.outsideSince = now;
        else if (now - p.outsideSince > OUTSIDE_GRACE_S * 1000 && now - p.zoneHitAt >= 1000) {
          p.zoneHitAt = now;
          this.hurt(p, null, OUTSIDE_DPS, "body", "zone", now);
        }
      }
      if (this.mode === "bomb") this.tickBomb(now);
      else this.checkLimits(now);
    }
    if (this.phase === "roundEnd" && now >= this.until) {
      if (this.teamScore[1] >= ROUNDS_TO_WIN || this.teamScore[2] >= ROUNDS_TO_WIN) this.finish(now);
      else this.startRound(now);
    }
    if (this.phase === "ended" && now >= this.until) this.hooks.disband(this);
  }

  private tickBomb(now: number) {
    const bomb = this.bomb;
    if (!bomb) return;
    // Pick up a dropped bomb.
    if (bomb.state === "dropped")
      for (const p of this.players) {
        if (p.dead || bombSide(p.team, this.round) !== "attack") continue;
        if (distanceM(p.ll, bomb) < BOMB_REACH_M) {
          p.carrying = true;
          Object.assign(bomb, { state: "carried", carrier: p.sid });
          this.dirty = true;
          break;
        }
      }
    if (bomb.state === "carried") {
      const c = [...this.players].find((p) => p.sid === bomb.carrier);
      if (c) (bomb.lat = c.lat), (bomb.lng = c.lng);
    }
    // Planting / defusing in progress.
    for (const p of this.players) {
      if (!p.actingUntil) continue;
      if (p.dead || (p.actingAt && distanceM(p.ll, p.actingAt) > 1.5)) {
        p.actingUntil = 0;
        this.dirty = true;
        continue;
      }
      if (now < p.actingUntil) continue;
      p.actingUntil = 0;
      if (p.carrying && bomb.state === "carried") {
        const q = this.frame.toXZ(p.lat, p.lng);
        const site = this.sites.reduce((a, s) => (Math.hypot(s.x - q.x, s.z - q.z) < Math.hypot(a.x - q.x, a.z - q.z) ? s : a));
        p.carrying = false;
        p.score += 150;
        Object.assign(bomb, { state: "planted", carrier: 0, lat: p.lat, lng: p.lng, at: now + BOMB_TIMER_S * 1000, site: site.name });
        this.until = bomb.at;
        for (const o of this.humans) o.send({ t: "toast", text: "💣 Bomb planted at site {s}!", vars: { s: site.name } });
      } else if (bomb.state === "planted") {
        p.score += 200;
        bomb.state = "defused";
        this.roundOver("defend", "defused", now);
      }
      this.dirty = true;
    }
    if (bomb.state === "planted" && now >= bomb.at) {
      bomb.state = "exploded";
      // The round is the attackers' first: the blast's kills must not re-judge it.
      this.roundOver("attack", "exploded", now);
      for (const p of this.players) {
        const d = distanceM(p.ll, bomb);
        if (d < BOMB_BLAST_M) this.hurt(p, null, Math.round(200 * (1 - d / BOMB_BLAST_M)), "body", "bomb", now);
      }
      return;
    }
    this.checkRound(now);
  }

  /** Elimination and the clock (bomb). */
  private checkRound(now: number) {
    if (this.mode !== "bomb") return this.checkLimits(now);
    if (this.phase !== "live" || !this.bomb) return;
    const alive = (side: "attack" | "defend") => [...this.players].filter((p) => !p.dead && bombSide(p.team, this.round) === side).length;
    const planted = this.bomb.state === "planted";
    if (alive("defend") === 0) return this.roundOver("attack", "elimination", now);
    if (alive("attack") === 0 && !planted) return this.roundOver("defend", "elimination", now);
    if (!planted && now >= this.until) return this.roundOver("defend", "time", now);
  }

  private roundOver(side: "attack" | "defend", reason: string, now: number) {
    if (this.phase !== "live") return;
    const team = ([1, 2] as Team[]).find((t) => bombSide(t, this.round) === side) ?? 1;
    this.teamScore[team]++;
    for (const p of this.players) if (p.team === team) p.score += 50;
    this.winner = { team, sid: 0, reason };
    this.phase = "roundEnd";
    this.until = now + ROUND_END_S * 1000;
    this.dirty = true;
  }

  private checkLimits(now: number) {
    if (this.phase !== "live") return;
    const lim = this.def.killLimit;
    if (this.mode === "ffa") {
      const top = [...this.players].sort((a, b) => b.kills - a.kills)[0];
      if (top && (top.kills >= lim || now >= this.until)) {
        this.winner = { team: 0, sid: top.sid, reason: top.kills >= lim ? "limit" : "time" };
        this.finish(now);
      }
    } else if (this.mode === "tdm") {
      const [, r, b] = this.teamScore;
      if (r >= lim || b >= lim || now >= this.until) {
        this.winner = { team: r === b ? 0 : r > b ? 1 : 2, sid: 0, reason: r >= lim || b >= lim ? "limit" : "time" };
        this.finish(now);
      }
    }
  }

  private finish(now: number) {
    if (this.mode === "bomb") {
      const [, r, b] = this.teamScore;
      this.winner = { team: r === b ? 0 : r > b ? 1 : 2, sid: 0, reason: "rounds" };
    }
    this.end(now, this.winner, this.winner?.reason ?? "", false);
  }

  private end(now: number, winner: MatchView["winner"], reason: string, silent: boolean) {
    if (this.decided) return;
    this.decided = true;
    this.phase = "ended";
    this.until = now + (silent ? 0 : RESULTS_S * 1000);
    this.winner = winner ? { ...winner, reason } : null;
    for (const p of this.players) p.actingUntil = 0;
    this.dirty = true;
    if (silent) return;
    const ranked = [...this.players].sort((a, b) => b.score - a.score || b.kills - a.kills);
    const results: MatchResult[] = ranked
      .map((p, i) => ({ p, place: i + 1 }))
      .filter(({ p }) => !p.bot)
      .map(({ p, place }) => ({
        userId: p.userId, name: p.name, kills: p.kills, botKills: p.botKills, deaths: p.deaths, score: p.score, place,
        won: this.def.teams ? !!winner?.team && p.team === winner.team : winner?.sid === p.sid,
        rounds: this.mode === "bomb" ? this.teamScore[p.team] : 0,
      }));
    this.hooks.ended(this, results);
  }

  // ------------------------------------------------------------ views
  view(): MatchView {
    const players = [...this.players].map((p) => ({ sid: p.sid, name: p.name, avatar: p.avatar, team: p.team, kills: p.kills, deaths: p.deaths, score: p.score, alive: !p.dead, bot: p.bot, ping: Math.round(p.rtt) }));
    players.sort((a, b) => b.score - a.score || b.kills - a.kills);
    return {
      id: this.id, mode: this.mode, hostSid: this.host.sid, phase: this.phase, center: this.frame.origin, radius: this.radius, until: this.until, round: this.round,
      teamScore: this.teamScore, players, sites: this.sites.map((s) => ({ name: s.name, ...this.frame.toLL(s.x, s.z) })), bomb: this.bomb ? { ...this.bomb } : null,
      bots: this.botsWanted, difficulty: this.difficulty, winner: this.winner, killLimit: this.def.killLimit,
    };
  }

  lobby(viewer: Player): LobbyView {
    return {
      id: this.id, mode: this.mode, hostName: this.host.name, lat: this.frame.origin.lat, lng: this.frame.origin.lng, radius: this.radius,
      players: this.humans.length, bots: [...this.players].filter((p) => p.bot).length || this.botsWanted, max: MAX_PLAYERS, phase: this.phase, dist: Math.round(distanceM(viewer.ll, this.frame.origin)),
    };
  }
}
