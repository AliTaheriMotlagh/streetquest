// One player on the realtime server: a connected client or a bot. Keeps where they are
// (lat/lng — every client sees them in its own local metres), the last second of
// positions for lag compensation, health, guns and ammo, and their match stats.
import type { WebSocket } from "ws";
import { localFrame, type LL, type LocalFrame, type ServerMsg, F_CROUCH, F_DEAD, F_FOOT, G_BOMB, G_BOT, G_PASSIVE, G_SHIELD, G_ACTING } from "../src/lib/arena/protocol";
import { MAX_HP, WEAPON_BY_IDX, WEAPONS, type WeaponKey } from "../src/lib/arena/weapons";
import type { Team } from "../src/lib/arena/modes";
import type { Space } from "./space";

export type Sample = { t: number; lat: number; lng: number; y: number; crouch: boolean };
const HISTORY = 40;

export class Player {
  readonly sid: number;
  readonly userId: string;
  name: string;
  avatar: string;
  level: number;
  color = "#d7263d";
  friends: Set<string>;
  ws: WebSocket | null;
  frame: LocalFrame;
  bot: boolean;

  // where
  lat = 0;
  lng = 0;
  y = 0;
  yaw = 0;
  pitch = 0;
  vx = 0;
  vz = 0;
  flags = 0;
  vehicle = 0;
  weapon = 0;
  lastState = 0;
  placed = false;
  /** Where this drive began (strangers only see you once you've left it). */
  start: LL | null = null;
  history: Sample[] = [];

  // combat
  hp = MAX_HP;
  dead = false;
  diedAt = 0;
  respawnAt = 0;
  deathLL: LL | null = null;
  passive = true;
  passiveLockUntil = 0;
  shieldUntil = 0;
  loadout: WeaponKey[] = ["pistol", "smg"];
  ammo = new Map<WeaponKey, number>();
  reloadUntil = 0;
  reloading: WeaponKey | null = null;
  /** Shots allowed right now per gun (token bucket refilled at the gun's fire rate). */
  bucket = new Map<WeaponKey, { tokens: number; at: number }>();
  outsideSince = 0;
  zoneHitAt = 0;
  /** Where they last (re)spawned: no walking off during freeze time. */
  spawnLL: LL | null = null;
  lastHurtAt = 0;
  lastHurtBy = 0;

  // match
  space: Space | null = null;
  team: Team = 0;
  kills = 0;
  botKills = 0;
  deaths = 0;
  score = 0;
  primary: WeaponKey = "rifle";
  /** Where to put them back when their match ends. */
  returnLL: LL | null = null;
  carrying = false;
  actingUntil = 0;
  actingAt: LL | null = null;

  // link
  rtt = 0;
  known = new Set<number>();
  msgs = 0;
  msgWindow = 0;
  lastCorrection = 0;

  constructor(o: { sid: number; userId: string; name: string; avatar: string; level: number; friends?: string[]; ws: WebSocket | null; anchor: LL; bot?: boolean }) {
    this.sid = o.sid;
    this.userId = o.userId;
    this.name = o.name;
    this.avatar = o.avatar;
    this.level = o.level;
    this.friends = new Set(o.friends ?? []);
    this.ws = o.ws;
    this.frame = localFrame(o.anchor);
    this.bot = !!o.bot;
    this.fillAmmo();
  }

  get onFoot() {
    return (this.flags & F_FOOT) !== 0;
  }
  get crouch() {
    return (this.flags & F_CROUCH) !== 0;
  }
  get ll(): LL {
    return { lat: this.lat, lng: this.lng };
  }

  fillAmmo() {
    for (const w of this.loadout) this.ammo.set(w, WEAPONS[w].mag);
    this.reloadUntil = 0;
    this.reloading = null;
  }

  setLoadout(primary: WeaponKey) {
    this.primary = primary;
    this.loadout = primary === "pistol" ? ["pistol"] : [primary, "pistol"];
    this.fillAmmo();
  }

  moveTo(ll: LL, y: number, now: number) {
    this.lat = ll.lat;
    this.lng = ll.lng;
    this.y = y;
    this.placed = true;
    this.history.push({ t: now, lat: ll.lat, lng: ll.lng, y, crouch: this.crouch });
    if (this.history.length > HISTORY) this.history.shift();
  }

  /** Where they were at server time t (lag compensation), clamped to the history we have. */
  at(t: number): Sample {
    const h = this.history;
    if (!h.length) return { t, lat: this.lat, lng: this.lng, y: this.y, crouch: this.crouch };
    if (t <= h[0].t) return h[0];
    const last = h[h.length - 1];
    if (t >= last.t) return last;
    let i = h.length - 2;
    while (i > 0 && h[i].t > t) i--;
    const a = h[i], b = h[i + 1], k = (t - a.t) / Math.max(1, b.t - a.t);
    return { t, lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k, y: a.y + (b.y - a.y) * k, crouch: k < 0.5 ? a.crouch : b.crouch };
  }

  /** Teleport (spawn, warp home): forget the old trail so nobody is hit where we were. */
  place(ll: LL, y: number, yaw: number, now: number) {
    this.history = [];
    this.vx = this.vz = 0;
    this.yaw = yaw;
    this.spawnLL = ll;
    this.moveTo(ll, y, now);
    if (this.ws) {
      const p = this.frame.toXZ(ll.lat, ll.lng);
      this.send({ t: "spawn", x: p.x, y, z: p.z, yaw });
    }
  }

  revive(now: number, shieldS: number) {
    this.hp = MAX_HP;
    this.dead = false;
    this.respawnAt = 0;
    this.shieldUntil = now + shieldS * 1000;
    this.fillAmmo();
  }

  flags2(now: number) {
    return (this.passive ? G_PASSIVE : 0) | (now < this.shieldUntil ? G_SHIELD : 0) | (this.bot ? G_BOT : 0) | (this.carrying ? G_BOMB : 0) | (this.actingUntil > now ? G_ACTING : 0);
  }

  snapFlags() {
    return this.flags | (this.dead ? F_DEAD : 0);
  }

  send(m: ServerMsg) {
    const ws = this.ws;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  }

  sendBinary(b: ArrayBuffer) {
    const ws = this.ws;
    // Skip a snapshot rather than queue behind a slow connection (the next one supersedes it).
    if (ws && ws.readyState === 1 && ws.bufferedAmount < 64_000) ws.send(b);
  }

  status(space: string) {
    this.send({ t: "you", hp: this.hp, dead: this.dead, respawnAt: this.respawnAt, passive: this.passive, ammo: this.ammo.get(WEAPON_BY_IDX[this.weapon]) ?? 0, reloadUntil: this.reloadUntil, loadout: this.loadout, team: this.team, space });
  }
}
