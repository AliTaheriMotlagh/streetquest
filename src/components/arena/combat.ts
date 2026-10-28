"use client";
// Street Arena inside the 3D city: get out of the car, walk the real streets and fight —
// in the open city (GTA Online style, opt-in, passive mode by default) or in a match on
// the streets around you (deathmatch, team deathmatch, bomb defusal; see lib/arena).
//
// Drive.tsx owns the scene, the city and the car; this class owns everything on foot and
// everything live:
//  - the realtime link (rt.ts) — my state out 20×/s, everyone else in (remotes.ts);
//  - my soldier: movement (foot.ts), third- or first-person camera, the gun in hand
//    (viewmodel.ts in first person, the avatar's in third);
//  - shooting: the bullet goes from my eye toward whatever is under the crosshair, my
//    client draws the hit at once, the server referees it (lag-compensated) and says
//    what really happened (hit markers and kills come from the server, never guessed);
//  - touch aim assist (slowdown + gentle pull near a target) and optional auto-fire;
//  - the HUD's state, published through a tiny store (≤ 10 updates a second; the
//    crosshair and hit marker are written straight to the DOM every frame).
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { t } from "@/lib/i18n";
import { aimDir, eyeHeight, rayPlayer, spreadDir, type Ray } from "@/lib/arena/geom";
import { BOMB_REACH_M, bombSide, MODES, SITE_R, TEAM_COLORS, type LobbyView, type MatchView, type Team } from "@/lib/arena/modes";
import { F_AIM, F_AIR, F_CROUCH, F_FIRE, F_FOOT, F_RELOAD, F_SPRINT, G_PASSIVE, type ArenaGeo, type RosterEntry, type ServerMsg } from "@/lib/arena/protocol";
import { MAX_HP, shotGap, WEAPON_BY_IDX, WEAPONS, type WeaponKey } from "@/lib/arena/weapons";
import { VEHICLE_KEYS, type VehicleKey } from "@/lib/vehicles";
import type { CollisionWorld } from "../drive/physics";
import type { Others } from "../drive/others";
import { makeSign } from "../drive/world3d";
import { Avatar, loadSoldier } from "./avatar";
import { newFoot, stepFoot, type FootBody, type FootInput } from "./foot";
import { beepSound, boomSound, emptySound, hitSound, hurtSound, killSound, reloadSound, shotSound } from "./gunsound";
import { HTTP_DELAY_MS, Remotes, RT_DELAY_MS } from "./remotes";
import type { OtherDriver } from "../drive/net";
import type { ArenaEvent } from "@/server/arena";
import { RtClient } from "./rt";
import { Vfx } from "./vfx";
import { Viewmodel } from "./viewmodel";

export type CombatInput = FootInput & {
  fire: boolean;
  /** Look accumulated since the last frame (radians). */
  lookX: number;
  lookY: number;
  act: boolean;
};

export type FeedLine = { id: number; killer: string; victim: string; w: string; head: boolean; mine: boolean; me: boolean; kc: string; vc: string; at: number };

export type CombatHud = {
  rt: "off" | "connecting" | "on";
  onFoot: boolean;
  nearCar: boolean;
  hp: number;
  dead: boolean;
  respawnIn: number;
  canRespawn: boolean;
  passive: boolean;
  inMatch: boolean;
  team: Team;
  weapon: WeaponKey;
  loadout: WeaponKey[];
  ammo: number;
  mag: number;
  reloading: boolean;
  scoped: boolean;
  cam: "tps" | "fps";
  feed: FeedLine[];
  match: MatchView | null;
  lobbies: LobbyView[];
  act: { kind: "plant" | "defuse"; can: boolean; progress: number } | null;
  outside: boolean;
  hurt: { id: number; angle: number; at: number }[];
  autoFire: boolean;
  carrying: boolean;
  /** No realtime server: matches are practice with bots; the open city's fights go over HTTP. */
  local: boolean;
};

export type CombatHost = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  el: HTMLElement;
  frame: Frame;
  collision: CollisionWorld;
  obstacles: CollisionWorld;
  others: Others;
  shadows: boolean;
  touch: boolean;
  sim: boolean;
  /** May I move freely (play from home / test mode)? Otherwise I only watch. */
  canDrive: () => boolean;
  /** My vehicle now: what I broadcast while driving. */
  vehicle: () => { x: number; z: number; alt: number; yaw: number; vx: number; vz: number; key: VehicleKey; paint: string; flies: boolean };
  /** Where my car is parked while I'm on foot. */
  parked: () => { x: number; z: number } | null;
  street: (x: number, z: number) => { x: number; z: number; yaw: number } | null;
  arenaGeo: (r: number) => ArenaGeo;
  /** Hop out (park the car where it is and stand at x, z) or back in. */
  setFoot: (on: boolean, at?: { x: number; z: number; yaw: number }) => void;
  toast: (text: string) => void;
  /** Who I am (the in-browser hub needs it when there's no realtime server). */
  me: () => { id: string; username: string; avatar: string; level: number } | null;
};

/** My fight state from the HTTP presence (/api/drive) when there's no realtime server. */
export type HttpMe = { hp: number; dead: boolean; respawnAt: number; passive: boolean; events: ArenaEvent[] };
/** Players from the HTTP presence get sids from here up (the in-browser hub's are small). */
const HTTP_SID = 50_000;
/** On the HTTP presence (a few reports a second) "just fired" lasts longer, so others see it. */
const HTTP_FIRE_MS = 350;

const AUTO_FIRE_KEY = "sq_arena_autofire";
const PRIMARY_KEY = "sq_arena_primary";
const CAM_KEY = "sq_arena_cam";
const SENS_MOUSE = 0.0022;
export const SENS_TOUCH = 0.0058;
const CAR_REACH_M = 4.5;
const FEED_MS = 6000;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const v3 = new THREE.Vector3();
const v3b = new THREE.Vector3();
const camFwd = new THREE.Vector3();

export class Combat {
  readonly input: CombatInput = { mx: 0, mz: 0, sprint: false, crouch: false, aim: false, jump: false, fire: false, lookX: 0, lookY: 0, act: false };
  readonly rt: RtClient;
  readonly remotes: Remotes;
  private vfx: Vfx;
  private vm: Viewmodel;
  me: FootBody | null = null;
  private avatar: Avatar | null = null;
  private cam: "tps" | "fps" = store.get(CAM_KEY) === "fps" ? "fps" : "tps";
  private camPos = new THREE.Vector3();
  private recoilP = 0;
  private recoilY = 0;
  private bloom = 0;
  // guns (predicted locally; the server keeps the real count)
  private loadout: WeaponKey[] = ["pistol", "smg"];
  private weapon: WeaponKey = "smg";
  private ammo = new Map<WeaponKey, number>();
  private reloadUntil = 0;
  private reloadLen = 0;
  private nextShot = 0;
  private firedAt = 0;
  private triggerWas = false;
  // server's word
  private hp = MAX_HP;
  private dead = false;
  private respawnAt = 0;
  private passive = true;
  private team: Team = 0;
  private space = "world";
  private match: MatchView | null = null;
  private lobbies: LobbyView[] = [];
  private feed: FeedLine[] = [];
  private hurt: CombatHud["hurt"] = [];
  private feedId = 0;
  private lastSend = 0;
  private hudAt = 0;
  private hudSig = "";
  private listeners = new Set<() => void>();
  private snapshot: CombatHud;
  private autoFire = store.get(AUTO_FIRE_KEY) !== "0";
  /** The main gun I take into matches (everyone also carries the pistol). */
  primary: WeaponKey = ((p) => (p && p in WEAPONS && p !== "pistol" ? (p as WeaponKey) : "rifle"))(store.get(PRIMARY_KEY));
  private beepAt = 0;
  private lastBomb: string | null = null;
  // match furniture
  private arena: THREE.Group | null = null;
  private arenaKey = "";
  private bombMesh: THREE.Mesh | null = null;
  private hitEl: HTMLElement | null = null;
  private crossEl: HTMLElement | null = null;
  private keys = new Set<string>();
  private disposed = false;
  private myAccent = "";

  constructor(private h: CombatHost) {
    this.vfx = new Vfx(h.scene);
    this.vm = new Viewmodel(h.el.clientWidth / Math.max(1, h.el.clientHeight));
    this.remotes = new Remotes(h.scene, h.frame, h.others, h.shadows);
    this.rt = new RtClient(h.frame.origin, h.sim, {
      snap: (st, list) => this.remotes.snap(st, list.filter((e) => e.sid !== this.rt.sid)),
      msg: (m) => this.onMsg(m),
      status: (on) => {
        this.remotes.ownsDrivers = !this.rt.local;
        if (!on) {
          this.remotes.clear();
          this.match = null;
          this.space = "world";
        }
        this.publish(true);
      },
    }, () => {
      const m = h.me();
      return m && { id: m.id, name: m.username, avatar: m.avatar, level: m.level, friends: [], virtual: h.canDrive() };
    });
    this.fill();
    this.snapshot = this.build();
    this.rt.start();
    this.bindDesktop();
    loadSoldier().catch(() => {});
  }

  // ------------------------------------------------------------ store for the HUD
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  /** The crosshair and hit marker elements (painted every frame, not through React). */
  bindHud(cross: HTMLElement | null, hit: HTMLElement | null) {
    this.crossEl = cross;
    this.hitEl = hit;
  }

  get onFoot() {
    return !!this.me;
  }
  get inMatch() {
    return this.space !== "world" && !!this.match;
  }
  /** Is the realtime link carrying other players (so the HTTP presence can stand down)? */
  get live() {
    return this.rt.connected && !this.rt.local;
  }
  /** No realtime server: the open city's other players and fights come over HTTP. */
  get httpMode() {
    return this.rt.local;
  }
  serverNow() {
    return this.rt.serverNow();
  }
  get sid() {
    return this.rt.sid;
  }
  /** Look sensitivity multiplier right now (aiming down sights slows it). */
  lookScale = () => (this.input.aim ? WEAPONS[this.weapon].adsFov / 70 : 1);
  jump = () => {
    this.input.jump = true;
  };

  private build(): CombatHud {
    const now = Date.now();
    const sNow = this.rt.serverNow();
    const W = WEAPONS[this.weapon];
    const parked = this.h.parked();
    const m = this.match;
    let act: CombatHud["act"] = null;
    if (m?.mode === "bomb" && m.phase === "live" && this.me && !this.dead && m.bomb) {
      const side = bombSide(this.team, m.round);
      const d = (p: { lat: number; lng: number }) => this.distTo(p);
      const mine = m.bomb.carrier === this.rt.sid;
      if (side === "attack" && mine) act = { kind: "plant", can: m.sites.some((s) => d(s) <= SITE_R), progress: this.actProgress(sNow) };
      else if (side === "defend" && m.bomb.state === "planted" && d(m.bomb) <= BOMB_REACH_M + 0.5) act = { kind: "defuse", can: true, progress: this.actProgress(sNow) };
    }
    return {
      rt: this.rt.available === false ? "off" : this.rt.connected ? "on" : "connecting",
      onFoot: !!this.me,
      nearCar: !!this.me && !!parked && !this.inMatch && Math.hypot(parked.x - this.me.x, parked.z - this.me.z) < CAR_REACH_M,
      hp: Math.round(this.hp),
      dead: this.dead,
      respawnIn: this.dead && this.respawnAt ? Math.max(0, Math.ceil((this.respawnAt - sNow) / 1000)) : 0,
      // (A moment's margin over HTTP: our clocks differ a little.)
      canRespawn: this.dead && !this.inMatch && sNow >= this.respawnAt + (this.httpMode ? 600 : 0),
      passive: this.passive,
      inMatch: this.inMatch,
      team: this.team,
      weapon: this.weapon,
      loadout: this.loadout,
      ammo: this.ammo.get(this.weapon) ?? 0,
      mag: W.mag,
      reloading: now < this.reloadUntil,
      scoped: this.weapon === "sniper" && this.input.aim && !!this.me && !this.dead && now >= this.reloadUntil,
      cam: this.cam,
      feed: this.feed,
      match: m,
      lobbies: this.lobbies,
      act,
      outside: !!m && m.phase === "live" && !this.dead && this.distTo(m.center) > m.radius,
      // Damage arrows, relative to where I'm facing now.
      hurt: this.hurt.map((x) => ({ ...x, angle: x.angle - (this.me?.yaw ?? 0) })),
      autoFire: this.autoFire,
      carrying: !!m?.bomb && m.bomb.state === "carried" && m.bomb.carrier === this.rt.sid,
      local: this.rt.local,
    };
  }

  /** Metres from me (on foot) to a point; Infinity in the car. */
  private distTo(p: { lat: number; lng: number }) {
    if (!this.me) return Infinity;
    const a = this.h.frame.toXZ(p.lat, p.lng);
    return Math.hypot(a.x - this.me.x, a.z - this.me.z);
  }

  private actStart = 0;
  private actProgress(sNow: number) {
    if (!this.input.act || !this.actStart || !this.match?.bomb) return 0;
    const len = this.match.bomb.state === "planted" ? 6000 : 3200;
    return Math.min(1, (sNow - this.actStart) / len);
  }

  private publish(force = false) {
    const now = performance.now();
    if (!force && now - this.hudAt < 100) return;
    this.hudAt = now;
    const s = this.build();
    const sig = JSON.stringify([s.rt, s.onFoot, s.nearCar, s.hp, s.dead, s.respawnIn, s.canRespawn, s.passive, s.inMatch, s.team, s.weapon, s.loadout, s.ammo, s.reloading, s.scoped, s.cam, s.feed.map((f) => f.id), s.match, s.lobbies, s.act && [s.act.kind, s.act.can, Math.round(s.act.progress * 20)], s.outside, s.hurt.map((x) => x.id), s.autoFire, s.carrying, s.match && Math.floor(this.rt.serverNow() / 1000)]);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    this.snapshot = s;
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------ actions (HUD, menu)
  getOut() {
    if (this.me || !this.h.canDrive()) return;
    const v = this.h.vehicle();
    if (v.flies && v.alt > 0.8) return this.h.toast(t("Land first to get out"));
    if (Math.hypot(v.vx, v.vz) > 6) return this.h.toast(t("Slow down to get out"));
    // Step out on the driver's side.
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    let x = v.x - rx * 2, z = v.z - rz * 2;
    const c = this.h.collision.collide(x, z, 0.4, 0, 1.7);
    (x = c.x), (z = c.z);
    this.h.setFoot(true, { x, z, yaw: v.yaw });
    this.enterFoot(x, z, v.yaw);
  }

  getIn() {
    if (!this.me || this.inMatch) return;
    const p = this.h.parked();
    if (!p || Math.hypot(p.x - this.me.x, p.z - this.me.z) > CAR_REACH_M) return;
    this.leaveFoot();
    this.h.setFoot(false);
  }

  private enterFoot(x: number, z: number, yaw: number) {
    this.me = newFoot(x, z, yaw);
    this.camPos.set(x, 2, z);
    if (!this.avatar)
      loadSoldier()
        .then((tpl) => {
          if (this.disposed || this.avatar || !this.me) return;
          this.avatar = new Avatar(tpl, "#7d8a6a", "#f0c05a", this.h.shadows);
          this.myAccent = "";
          this.avatar.setWeapon(this.weapon);
          this.h.scene.add(this.avatar.group);
        })
        .catch(() => this.h.toast(t("Couldn't load the soldier — check your connection")));
    this.publish(true);
  }

  private leaveFoot() {
    this.me = null;
    this.input.fire = this.input.aim = false;
    this.avatar?.dispose();
    this.avatar = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.publish(true);
  }

  setPassive(on: boolean) {
    if (!this.httpMode) return this.rt.send({ t: "passive", on });
    void this.arenaPost<{ passive: boolean }>({ action: "passive", on }).then((r) => {
      if (!r) return;
      this.passive = r.passive;
      this.passiveSetAt = Date.now();
      this.publish(true);
    });
  }

  /** server/arena.ts, for the open city without a realtime server. Errors are toasted. */
  private async arenaPost<T>(body: object): Promise<T | null> {
    try {
      const res = await fetch("/api/drive/arena", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.error) this.h.toast(data.error);
        return null;
      }
      return data as T;
    } catch {
      return null;
    }
  }

  toggleCam() {
    this.cam = this.cam === "tps" ? "fps" : "tps";
    store.set(CAM_KEY, this.cam);
    this.publish(true);
  }

  setAutoFire(on: boolean) {
    this.autoFire = on;
    store.set(AUTO_FIRE_KEY, on ? "1" : "0");
    this.publish(true);
  }

  swap(to?: WeaponKey) {
    const next = to ?? this.loadout[(this.loadout.indexOf(this.weapon) + 1) % this.loadout.length];
    if (!next || next === this.weapon || !this.loadout.includes(next)) return;
    this.weapon = next;
    this.reloadUntil = 0;
    this.nextShot = performance.now() + 350;
    this.vm.setWeapon(next);
    this.avatar?.setWeapon(next);
    this.publish(true);
  }

  reload() {
    const W = WEAPONS[this.weapon];
    const now = performance.now();
    if (!this.me || this.dead || now < this.reloadUntil || (this.ammo.get(this.weapon) ?? 0) >= W.mag) return;
    this.reloadLen = W.reloadS * 1000;
    this.reloadUntil = now + this.reloadLen;
    this.rt.send({ t: "reload" });
    reloadSound(W.reloadS);
    this.publish(true);
  }

  respawn() {
    if (!this.dead || this.inMatch || !this.me) return;
    const s = this.h.street(this.me.x, this.me.z) ?? { x: this.me.x, z: this.me.z, yaw: this.me.yaw };
    if (!this.httpMode) return this.rt.send({ t: "respawn", x: s.x, y: 0, z: s.z });
    void this.arenaPost<{ hp: number }>({ action: "respawn" }).then((r) => {
      if (!r || !this.me) return;
      this.dead = false;
      this.hp = r.hp;
      this.fill();
      Object.assign(this.me, { x: s.x, z: s.z, yaw: s.yaw, vx: 0, vz: 0 });
      this.publish(true);
    });
  }

  // ------------------------------------------------------------ the HTTP presence (no realtime server)
  private httpSids = new Map<string, number>();
  private httpNext = 0;
  private httpLast = new Map<number, { x: number; z: number; t: number; fx: number }>();
  /** Newest hit event already shown (server clock), so a hit is never shown twice; null = not read yet. */
  private lastEventAt: number | null = null;
  /** When I last switched passive mode: a report already on its way still carries the old value. */
  private passiveSetAt = 0;

  /** What my soldier adds to my /api/drive report. */
  footReport() {
    const me = this.me;
    if (!me) return { flags: 0 };
    const now = performance.now();
    return {
      flags: F_FOOT | (me.crouch ? F_CROUCH : 0) | (this.input.aim ? F_AIM : 0) | (me.sprint ? F_SPRINT : 0) | (me.air ? F_AIR : 0) | (now < this.reloadUntil ? F_RELOAD : 0) | (now - this.firedAt < HTTP_FIRE_MS ? F_FIRE : 0),
      pitch: me.pitch,
      weapon: WEAPONS[this.weapon].idx,
    };
  }

  /**
   * Another /api/drive answer: players on foot become soldiers (sampled at their report
   * times, converted to my clock), their shots flash and bang, and my own health and the
   * hits I took arrive. Only used when there's no realtime server.
   */
  fromHttp(list: OtherDriver[], me: HttpMe | null, offset: number) {
    if (!this.httpMode) return;
    const H = this.h;
    const add: RosterEntry[] = [];
    const seen = new Set<number>();
    for (const o of list) {
      if (!(o.flags & F_FOOT)) continue;
      let sid = this.httpSids.get(o.id);
      if (!sid) {
        sid = HTTP_SID + (this.httpNext++ % 15_000);
        this.httpSids.set(o.id, sid);
        add.push({ sid, id: o.id, name: o.name, avatar: o.avatar, level: o.level, color: o.color, friend: o.friend, bot: false });
      }
      seen.add(sid);
      const p = H.frame.toXZ(o.lat, o.lng);
      const t = o.at - offset;
      // Reports carry no velocity for walkers: take it from the last two positions.
      const prev = this.httpLast.get(sid);
      const dt = prev ? (t - prev.t) / 1000 : 0;
      const vx = prev && dt > 0.05 ? (p.x - prev.x) / dt : 0, vz = prev && dt > 0.05 ? (p.z - prev.z) / dt : 0;
      let fx = prev?.fx ?? 0;
      if (o.flags & F_FIRE && t > fx + 150) {
        fx = t;
        this.httpShot(sid, p.x, o.alt, p.z, o.yaw, o.pitch, o.weapon);
      }
      this.httpLast.set(sid, { x: p.x, z: p.z, t, fx });
      this.remotes.push({ sid, x: p.x, y: o.alt, z: p.z, yaw: o.yaw, pitch: o.pitch, vx, vz, flags: o.flags, vehicle: 0, weapon: o.weapon, hp: o.hp, flags2: o.passive ? G_PASSIVE : 0, team: 0 }, t, HTTP_DELAY_MS);
    }
    const del: number[] = [];
    for (const [id, sid] of this.httpSids)
      if (!seen.has(sid)) (del.push(sid), this.httpSids.delete(id), this.httpLast.delete(sid));
    if (add.length || del.length) this.remotes.roster(add, del);

    if (me && !this.inMatch) {
      const wasDead = this.dead;
      if (Date.now() - this.passiveSetAt > 3000) this.passive = me.passive;
      this.respawnAt = me.respawnAt ? me.respawnAt - offset : 0;
      // Hits from before I opened the city are old news.
      this.lastEventAt ??= Math.max(0, ...me.events.map((e) => e.at));
      this.dead = me.dead;
      if (!me.dead || !wasDead) this.hp = me.hp;
      if (wasDead && !me.dead) this.fill();
      for (const e of me.events) {
        if (e.at <= this.lastEventAt) continue;
        this.lastEventAt = e.at;
        this.hp = e.hp;
        hurtSound();
        navigator.vibrate?.(e.kill ? 120 : 25);
        if (this.me) {
          const q = H.frame.toXZ(e.lat, e.lng);
          this.hurt = [...this.hurt.filter((x) => performance.now() - x.at < 1200).slice(-3), { id: ++this.feedId, angle: Math.atan2(-(q.x - this.me.x), -(q.z - this.me.z)), at: performance.now() }];
        }
        if (e.kill) {
          this.dead = true;
          this.pushFeed(e.name, H.me()?.username ?? "", e.w, e.zone === "head", false, true);
        }
      }
    }
    this.publish();
  }

  /** Someone on the HTTP presence fired: flash, tracer along their aim, and the bang. */
  private httpShot(sid: number, x: number, y: number, z: number, yaw: number, pitch: number, weapon: number) {
    const W = WEAPONS[WEAPON_BY_IDX[weapon] ?? "rifle"];
    const from = this.remotes.muzzle(sid, v3) ?? v3.set(x, y + 1.4, z);
    const d = aimDir(yaw, pitch);
    const len = Math.min(W.range, 60);
    this.vfx.flash(from.x, from.y, from.z);
    this.vfx.tracer(from.x, from.y, from.z, from.x + d.dx * len, from.y + d.dy * len, from.z + d.dz * len);
    const cam = this.h.camera;
    cam.getWorldDirection(camFwd);
    const dx = from.x - cam.position.x, dz = from.z - cam.position.z, dist = Math.hypot(dx, dz) || 1;
    shotSound(W.sound, dist, (dx * -camFwd.z + dz * camFwd.x) / dist);
  }

  private pushFeed(killer: string, victim: string, w: string, head: boolean, mine: boolean, me: boolean) {
    this.feed = [...this.feed.filter((f) => Date.now() - f.at < FEED_MS).slice(-4), { id: ++this.feedId, killer, victim, w, head, mine, me, kc: "#ffffff", vc: "#ffffff", at: Date.now() }];
  }

  /** My bullet hit someone on the HTTP presence: tell the game server, show what it says. */
  private httpHit(sid: number, zone: "head" | "body" | "legs", pellets: number) {
    const target = this.remotes.info(sid)?.id;
    if (!target) return;
    void this.arenaPost<{ ok: boolean; kill?: boolean; victim?: string }>({ action: "hit", target, weapon: this.weapon, zone, pellets }).then((r) => {
      if (!r?.ok) return;
      hitSound(zone === "head");
      if (r.kill) {
        killSound();
        this.pushFeed(this.h.me()?.username ?? "", r.victim ?? "", this.weapon, zone === "head", true, false);
        this.h.toast(t("You took down {name}", { name: r.victim ?? "" }));
      }
      const el = this.hitEl;
      if (el) {
        el.classList.remove("on", "kill", "head");
        void el.offsetWidth;
        el.classList.add("on", ...(r.kill ? ["kill"] : []), ...(zone === "head" ? ["head"] : []));
      }
      this.publish(true);
    });
  }

  // matches
  lobbiesRefresh() {
    this.rt.send({ t: "lobbies" });
  }
  create(mode: MatchView["mode"], radius: number, bots: number, difficulty: MatchView["difficulty"]) {
    if (!this.h.canDrive()) return this.h.toast(t("Switch to Play from home to fight in Street Arena"));
    this.rt.send({ t: "create", mode, radius, bots, difficulty, geo: this.h.arenaGeo(radius) });
  }
  join(id: string) {
    if (!this.h.canDrive()) return this.h.toast(t("Switch to Play from home to fight in Street Arena"));
    this.rt.send({ t: "join", id });
  }
  leave() {
    this.rt.send({ t: "leave" });
  }
  start() {
    this.rt.send({ t: "start" });
  }
  setTeam(team: Team) {
    this.rt.send({ t: "team", team });
  }
  setPrimary(w: WeaponKey) {
    this.primary = w;
    store.set(PRIMARY_KEY, w);
    this.rt.send({ t: "loadout", primary: w });
  }

  // ------------------------------------------------------------ server messages
  private fill() {
    for (const w of this.loadout) this.ammo.set(w, WEAPONS[w].mag);
    this.reloadUntil = 0;
  }

  private onMsg(m: ServerMsg) {
    const H = this.h;
    switch (m.t) {
      case "welcome":
        this.passive = m.passive;
        this.rt.send({ t: "look", color: H.vehicle().paint });
        break;
      case "roster":
        this.remotes.roster(m.add, m.del);
        break;
      case "you": {
        const wasDead = this.dead;
        const loadoutChanged = m.loadout.join() !== this.loadout.join();
        // In the open city without a realtime server, health and passive mode live on the
        // game server (fromHttp); the in-browser hub only runs matches.
        if (!(this.httpMode && m.space === "world")) {
          this.hp = m.hp;
          this.dead = m.dead;
          this.respawnAt = m.respawnAt;
          this.passive = m.passive;
        } else if (wasDead && this.space !== "world") (this.dead = false), (this.hp = MAX_HP);
        this.team = m.team;
        this.space = m.space;
        if (loadoutChanged) {
          this.loadout = m.loadout;
          this.fill();
          if (!this.loadout.includes(this.weapon)) this.swap(this.loadout[0]);
        }
        if (wasDead && !m.dead) this.fill();
        this.remotes.myTeam = this.team;
        break;
      }
      case "spawn": {
        // Matches are on foot: a spawn while driving parks the car and gets me out.
        if (!this.me) {
          H.setFoot(true, { x: m.x, z: m.z, yaw: m.yaw });
          this.enterFoot(m.x, m.z, m.yaw);
        } else Object.assign(this.me, { x: m.x, z: m.z, y: m.y, yaw: m.yaw, vx: 0, vz: 0, vy: 0, air: false });
        this.recoilP = this.recoilY = 0;
        break;
      }
      case "hit": {
        const mine = m.from === this.rt.sid && m.to !== this.rt.sid;
        if (m.to === this.rt.sid) {
          this.hp = m.hp;
          if (m.kill) this.dead = true;
          hurtSound();
          navigator.vibrate?.(m.kill ? 120 : 25);
          if (this.me && m.from && m.from !== this.rt.sid) {
            const a = Math.atan2(-(m.fx - this.me.x), -(m.fz - this.me.z));
            this.hurt = [...this.hurt.filter((x) => performance.now() - x.at < 1200).slice(-3), { id: ++this.feedId, angle: a, at: performance.now() }];
          }
        }
        if (mine) {
          hitSound(m.zone === "head");
          if (m.kill) killSound();
          const el = this.hitEl;
          if (el) {
            el.classList.remove("on", "kill", "head");
            void el.offsetWidth;
            el.classList.add("on", ...(m.kill ? ["kill"] : []), ...(m.zone === "head" ? ["head"] : []));
          }
        }
        break;
      }
      case "kill": {
        const me = this.rt.sid;
        const tc = (team: Team, name: string) => (team ? TEAM_COLORS[team] : name ? "#ffffff" : "#ffb020");
        this.feed = [
          ...this.feed.filter((f) => Date.now() - f.at < FEED_MS).slice(-4),
          { id: ++this.feedId, killer: m.killerName, victim: m.victimName, w: m.w, head: m.head, mine: m.killer === me, me: m.victim === me, kc: tc(m.killerTeam, m.killerName), vc: tc(m.victimTeam, m.victimName), at: Date.now() },
        ];
        if (m.killer === me && m.victim !== me) H.toast(t("You took down {name}", { name: m.victimName }));
        break;
      }
      case "shot": {
        const from = this.remotes.muzzle(m.sid, v3) ?? v3.set(m.x, m.y, m.z);
        this.vfx.flash(from.x, from.y, from.z);
        this.vfx.tracer(from.x, from.y, from.z, m.ex, m.ey, m.ez);
        this.vfx.impact(m.ex, m.ey, m.ez, m.ey < 0.1 ? "ground" : "wall");
        const cam = H.camera;
        cam.getWorldDirection(camFwd);
        const dx = m.x - cam.position.x, dz = m.z - cam.position.z, d = Math.hypot(dx, dz) || 1;
        const pan = (dx * -camFwd.z + dz * camFwd.x) / d;
        shotSound(WEAPONS[m.w]?.sound ?? WEAPONS.rifle.sound, d, pan);
        break;
      }
      case "lobbies":
        this.lobbies = m.list;
        break;
      case "match": {
        const prev = this.match;
        this.match = m.m;
        this.remotes.inMatch = !!m.m;
        if (!m.m) this.space = "world";
        if (m.m && !prev) {
          H.toast(t("Joined {mode}", { mode: t(MODES[m.m.mode].name) }));
          this.rt.send({ t: "loadout", primary: this.primary });
        }
        const b = m.m?.bomb;
        if (b?.state === "exploded" && this.lastBomb !== "exploded") {
          const p = H.frame.toXZ(b.lat, b.lng);
          this.vfx.explosion(p.x, 0, p.z);
          boomSound(this.me ? Math.hypot(p.x - this.me.x, p.z - this.me.z) : 50);
        }
        this.lastBomb = b?.state ?? null;
        this.syncArena();
        break;
      }
      case "toast":
        H.toast(t(m.text, m.vars));
        break;
      case "err":
        H.toast(t(m.text, m.vars));
        break;
    }
    this.publish(m.t !== "roster");
  }

  /** The arena's edge (a glowing wall), bomb sites and the bomb, while in a match. */
  private syncArena() {
    const m = this.match;
    const key = m ? `${m.id}|${m.radius}|${m.sites.map((s) => s.name).join()}` : "";
    if (key !== this.arenaKey) {
      this.arenaKey = key;
      if (this.arena) {
        this.arena.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) (mesh.geometry.dispose(), (mesh.material as THREE.Material).dispose());
        });
        this.arena.removeFromParent();
        this.arena = null;
        this.bombMesh = null;
      }
      if (m) {
        const g = new THREE.Group();
        const c = this.h.frame.toXZ(m.center.lat, m.center.lng);
        const wall = new THREE.Mesh(
          new THREE.CylinderGeometry(m.radius, m.radius, 30, 96, 1, true),
          new THREE.MeshBasicMaterial({ color: "#ff3b4e", transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
        );
        wall.position.set(c.x, 15, c.z);
        g.add(wall);
        for (const s of m.sites) {
          const p = this.h.frame.toXZ(s.lat, s.lng);
          const ring = new THREE.Mesh(new THREE.RingGeometry(SITE_R - 0.4, SITE_R, 48), new THREE.MeshBasicMaterial({ color: "#ffb020", transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(p.x, 0.15, p.z);
          const sign = makeSign("🎯", t("Site {s}", { s: s.name }), "#ffb020", { big: true });
          sign.sprite.position.set(p.x, 7, p.z);
          g.add(ring, sign.sprite);
        }
        const bomb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: "#3b2b22", emissive: "#ff2a2a", emissiveIntensity: 0.4 }));
        bomb.visible = false;
        g.add(bomb);
        this.bombMesh = bomb;
        this.h.scene.add(g);
        this.arena = g;
      }
    }
    const b = m?.bomb;
    if (this.bombMesh) {
      const show = !!b && (b.state === "dropped" || b.state === "planted");
      this.bombMesh.visible = show;
      if (b && show) {
        const p = this.h.frame.toXZ(b.lat, b.lng);
        this.bombMesh.position.set(p.x, 0.13, p.z);
      }
    }
  }

  // ------------------------------------------------------------ desktop input
  private bindDesktop() {
    const el = this.h.el;
    const canvasClick = () => {
      if (this.me && !this.h.touch && !document.pointerLockElement) void el.requestPointerLock?.();
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== el || !this.me) return;
      const k = this.input.aim ? WEAPONS[this.weapon].adsFov / 70 : 1;
      this.input.lookX += e.movementX * SENS_MOUSE * k;
      this.input.lookY += e.movementY * SENS_MOUSE * k;
    };
    const down = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      if (e.button === 0) this.input.fire = true;
      if (e.button === 2) this.input.aim = true;
    };
    const up = (e: MouseEvent) => {
      if (e.button === 0) this.input.fire = false;
      if (e.button === 2) this.input.aim = false;
    };
    const ctx = (e: Event) => this.me && e.preventDefault();
    const wheel = (e: WheelEvent) => {
      if (document.pointerLockElement === el) this.swap();
      void e;
    };
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "f" && !e.repeat) {
        if (this.me) this.getIn();
        else if (!this.h.vehicle().flies) this.getOut();
      }
      if (!this.me) return;
      if ([" ", "tab"].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (e.repeat) return;
      if (k === "r") this.reload();
      if (k === "q" || k === "1" || k === "2") this.swap(k === "1" ? this.loadout[0] : k === "2" ? this.loadout[1] : undefined);
      if (k === "c") this.input.crouch = !this.input.crouch;
      if (k === " ") this.input.jump = true;
      if (k === "v") this.toggleCam();
      if (k === "enter" && this.snapshot.canRespawn) this.respawn();
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => {
      this.keys.clear();
      this.input.fire = this.input.aim = false;
    };
    el.addEventListener("click", canvasClick);
    document.addEventListener("mousemove", move);
    el.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    el.addEventListener("contextmenu", ctx);
    el.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    this.unbind = () => {
      el.removeEventListener("click", canvasClick);
      document.removeEventListener("mousemove", move);
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      el.removeEventListener("contextmenu", ctx);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }
  private unbind = () => {};

  /** Keys that belong to the soldier (Drive ignores them while I'm on foot). */
  ownsKey(k: string) {
    return !!this.me || k === "f";
  }

  // ------------------------------------------------------------ the frame
  /**
   * Runs every frame. On foot it moves me, aims, shoots and places the camera (returns
   * true: Drive skips its own camera). Always: remote players, effects, the live link.
   */
  tick(dt: number, now: number): boolean {
    const H = this.h;
    const sNow = this.rt.serverNow();
    const inp = this.input;
    const me = this.me;
    const W = WEAPONS[this.weapon];

    // Keyboard into the shared input (touch writes it directly).
    if (!H.touch && me) {
      const k = this.keys;
      inp.mz = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
      inp.mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      inp.sprint = k.has("shift");
      if (k.has("control")) inp.crouch = true;
      inp.act = k.has("e");
    }

    if (me) {
      const reloading = performance.now() < this.reloadUntil;
      if (this.reloadUntil && !reloading) {
        this.reloadUntil = 0;
        this.ammo.set(this.weapon, W.mag);
        this.publish(true);
      }
      // -- look (with touch aim assist)
      let lx = inp.lookX, ly = inp.lookY;
      inp.lookX = inp.lookY = 0;
      const assist = H.touch && !this.dead ? this.assistTarget(me) : null;
      if (assist) {
        lx *= 0.55;
        ly *= 0.55;
        if (Math.abs(inp.mx) + Math.abs(inp.mz) > 0.1 || Math.abs(lx) + Math.abs(ly) > 0.0005) {
          me.yaw += assist.dyaw * Math.min(1, dt * 3);
          me.pitch += assist.dpitch * Math.min(1, dt * 3);
        }
      }
      if (!this.dead) {
        me.yaw -= lx;
        me.pitch = Math.max(-1.35, Math.min(1.35, me.pitch - ly));
      }
      // Recoil recovers toward where you were aiming.
      const rec = Math.min(1, dt * 7);
      me.pitch -= this.recoilP * rec;
      this.recoilP -= this.recoilP * rec;
      this.recoilY *= 1 - rec;
      this.bloom *= Math.exp(-dt * 5);

      // -- move (pulling the trigger ends a sprint, so a shot is never swallowed)
      const frozen = this.match?.phase === "warmup" || (this.match?.phase === "live" && this.input.act && !!this.snapshot.act);
      const fireHeld = inp.fire || (this.autoFire && H.touch && !!assist?.onTarget);
      const moveIn = this.dead || frozen ? { ...inp, mx: 0, mz: 0, jump: false, sprint: false } : fireHeld ? { ...inp, sprint: false } : inp;
      const speed = stepFoot(me, moveIn, dt, W.mobility, (x, z, r, y, tall) => {
        const a = H.collision.collide(x, z, r, y, tall);
        const b = H.obstacles.collide(a.x, a.z, r, y, tall);
        return { x: b.x, z: b.z, hit: b.hit ?? a.hit };
      });
      inp.jump = false;

      // -- act (plant / defuse), held
      if (inp.act && this.snapshot.act?.can && !this.actStart) {
        this.actStart = sNow;
        this.rt.send({ t: "act", on: true });
      } else if ((!inp.act || !this.snapshot.act) && this.actStart) {
        this.actStart = 0;
        this.rt.send({ t: "act", on: false });
      }

      // -- shoot
      const canFire = !this.dead && !reloading && !frozen && !me.sprint && now >= this.nextShot;
      const wants = W.auto ? fireHeld : fireHeld && !this.triggerWas;
      this.triggerWas = fireHeld;
      if (wants && canFire) {
        if ((this.ammo.get(this.weapon) ?? 0) <= 0) {
          emptySound();
          this.reload();
          this.nextShot = now + 300;
        } else this.shoot(me, sNow, now, speed);
      }
      if (!reloading && (this.ammo.get(this.weapon) ?? 0) === 0 && !this.dead && now > this.nextShot) this.reload();

      // -- my soldier (third person) and the camera
      const fps = this.cam === "fps" && !this.dead;
      if (this.avatar) {
        const accent = this.inMatch && this.team ? TEAM_COLORS[this.team as 1 | 2] : "#f0c05a";
        if (accent !== this.myAccent) (this.myAccent = accent), this.avatar.setColors("#7d8a6a", accent);
        this.avatar.group.visible = !fps;
        this.avatar.group.position.set(me.x, me.y, me.z);
        this.avatar.update(dt, { vx: me.vx, vz: me.vz, yaw: me.yaw, pitch: me.pitch, crouch: me.crouch, air: me.air, dead: this.dead }, 0);
      }
      this.placeCamera(me, dt, fps);
      const scoped = this.snapshot.scoped;
      this.vm.visible = fps && !scoped && !this.dead;
      this.vm.update(dt, { speed, lookX: lx, lookY: ly, ads: inp.aim && !reloading, reload: reloading ? 1 - (this.reloadUntil - performance.now()) / this.reloadLen : -1, air: me.air, sprint: me.sprint });

      // -- crosshair: grows with spread
      if (this.crossEl) {
        const spread = this.spread(me, speed);
        const px = (spread / Math.tan(((H.camera.fov / 2) * Math.PI) / 180)) * (H.el.clientHeight / 2);
        this.crossEl.style.setProperty("--spread", `${Math.max(4, Math.min(80, px)).toFixed(1)}px`);
        this.crossEl.classList.toggle("on-target", !!assist?.onTarget);
        this.crossEl.classList.toggle("hidden", this.dead || scoped || (inp.aim && fps));
      }
    }

    // -- bomb beeps
    const b = this.match?.bomb;
    if (b?.state === "planted" && now > this.beepAt) {
      const left = (b.at - sNow) / 1000;
      this.beepAt = now + Math.max(120, Math.min(1000, left * 30));
      beepSound(left < 10);
      if (this.bombMesh) (this.bombMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 3;
    } else if (this.bombMesh) {
      const mat = this.bombMesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity += (0.4 - mat.emissiveIntensity) * Math.min(1, dt * 8);
    }

    // -- everyone else and the effects
    this.remotes.tick(dt, sNow, H.camera.position);
    this.vfx.tick(dt);
    this.hurt = this.hurt.filter((x) => now - x.at < 1200);

    // -- my state out, 20×/s
    if (now - this.lastSend >= 50 && this.rt.connected) {
      this.lastSend = now;
      const v = H.vehicle();
      const vi = Math.max(0, VEHICLE_KEYS.indexOf(v.key));
      if (me)
        this.rt.sendState({
          flags: F_FOOT | (me.crouch ? F_CROUCH : 0) | (inp.aim ? F_AIM : 0) | (me.sprint ? F_SPRINT : 0) | (me.air ? F_AIR : 0) | (performance.now() < this.reloadUntil ? F_RELOAD : 0) | (now - this.firedAt < 150 ? F_FIRE : 0),
          vehicle: vi, weapon: W.idx, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, vx: me.vx, vz: me.vz,
        });
      else this.rt.sendState({ flags: 0, vehicle: vi, weapon: W.idx, x: v.x, y: v.alt, z: v.z, yaw: v.yaw, pitch: 0, vx: v.vx, vz: v.vz });
    }
    this.publish();
    return !!me;
  }

  private spread(me: FootBody, speed: number) {
    const W = WEAPONS[this.weapon];
    let s = (this.input.aim ? W.ads : W.hip) + this.bloom + (speed > 0.5 ? W.move * Math.min(1, speed / 4) : 0) + (me.air ? 0.06 : 0);
    if (me.crouch) s *= 0.75;
    return s;
  }

  /** The eye, and where the crosshair points: camera ray to the first wall or player. */
  private aimPoint(range: number) {
    const cam = this.h.camera;
    cam.getWorldDirection(camFwd);
    const ray: Ray = { ox: cam.position.x, oy: cam.position.y, oz: cam.position.z, dx: camFwd.x, dy: camFwd.y, dz: camFwd.z };
    let tt = this.h.collision.raycast(ray, range + 5);
    for (const tg of this.remotes.targets()) {
      if (tg.dead || !tg.foot) continue;
      const hit = rayPlayer(ray, tg.x, tg.y, tg.z, tg.crouch);
      if (hit && hit.t < tt) tt = hit.t;
    }
    if (!Number.isFinite(tt)) tt = range;
    return v3b.set(ray.ox + ray.dx * tt, ray.oy + ray.dy * tt, ray.oz + ray.dz * tt);
  }

  private hostile(tg: { team: number; passive: boolean; dead: boolean }) {
    if (tg.dead) return false;
    if (this.inMatch) return this.match?.mode === "ffa" || tg.team !== this.team;
    return !this.passive && !tg.passive;
  }

  private shoot(me: FootBody, sNow: number, now: number, speed: number) {
    const H = this.h;
    const W = WEAPONS[this.weapon];
    const eye = eyeHeight(me.crouch);
    // From the eye (a little to the right of it over the shoulder) toward the crosshair.
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const sh = this.cam === "tps" ? 0.18 : 0;
    const ox = me.x + rx * sh, oy = me.y + eye, oz = me.z + rz * sh;
    const target = this.aimPoint(W.range);
    let dx = target.x - ox, dy = target.y - oy, dz = target.z - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    (dx /= l), (dy /= l), (dz /= l);
    const spread = this.spread(me, speed);
    const dirs: [number, number, number][] = [];
    const httpHits = new Map<number, { zone: "head" | "body" | "legs"; n: number }>();
    // Where the bullet visibly leaves: the third-person gun, or just below-right of the eye.
    const muzzle = this.avatar && this.cam === "tps" ? this.avatar.muzzle(v3) : v3.set(ox + rx * 0.12 + dx * 0.6, oy - 0.12 + dy * 0.6, oz + rz * 0.12 + dz * 0.6);
    for (let i = 0; i < W.pellets; i++) {
      const d = spreadDir({ dx, dy, dz }, spread);
      dirs.push([d.dx, d.dy, d.dz]);
      const ray: Ray = { ox, oy, oz, dx: d.dx, dy: d.dy, dz: d.dz };
      let tt = H.collision.raycast(ray, W.range);
      let body = false;
      let who: { sid: number; zone: "head" | "body" | "legs" } | null = null;
      for (const tg of this.remotes.targets()) {
        if (!tg.foot || !this.hostile(tg)) continue;
        const hit = rayPlayer(ray, tg.x, tg.y, tg.z, tg.crouch);
        if (hit && hit.t < tt) (tt = hit.t), (body = true), (who = { sid: tg.sid, zone: hit.zone });
      }
      // Players on the HTTP presence: my client is the one that saw the hit, so it reports it.
      if (who && who.sid >= HTTP_SID) {
        const cur = httpHits.get(who.sid);
        const rank = { legs: 0, body: 1, head: 2 };
        httpHits.set(who.sid, { zone: !cur || rank[who.zone] > rank[cur.zone] ? who.zone : cur.zone, n: (cur?.n ?? 0) + 1 });
      }
      const end = Number.isFinite(tt) ? tt : W.range;
      const ex = ox + d.dx * end, ey = oy + d.dy * end, ez = oz + d.dz * end;
      if (i < 3) this.vfx.tracer(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez);
      if (Number.isFinite(tt)) this.vfx.impact(ex, ey, ez, body ? "body" : ey < 0.1 ? "ground" : "wall");
    }
    this.vfx.flash(muzzle.x, muzzle.y, muzzle.z, W.key === "shotgun" || W.key === "sniper");
    if (!this.inMatch) for (const [sid, h] of httpHits) this.httpHit(sid, h.zone, h.n);
    this.rt.send({ t: "fire", w: W.key, at: sNow - RT_DELAY_MS, o: [ox, oy, oz], d: dirs });
    this.ammo.set(W.key, (this.ammo.get(W.key) ?? 1) - 1);
    this.nextShot = now + shotGap(W) * 1000;
    this.firedAt = now;
    this.bloom = Math.min(0.12, this.bloom + W.bloom);
    const ads = this.input.aim ? 0.6 : 1;
    const kp = W.kick * ads * (me.crouch ? 0.8 : 1);
    me.pitch = Math.min(1.35, me.pitch + kp);
    this.recoilP += kp * 0.55;
    me.yaw += (Math.random() - 0.5) * W.wobble * 2 * ads;
    this.vm.fire(W.kick);
    shotSound(W.sound, 0, 0);
    this.publish(true);
  }

  /** Touch aim assist: the nearest hostile soldier close to the crosshair, if any. */
  private assistTarget(me: FootBody) {
    const cam = this.h.camera;
    cam.getWorldDirection(camFwd);
    const W = WEAPONS[this.weapon];
    let best: { dyaw: number; dpitch: number; ang: number; onTarget: boolean } | null = null;
    const ray: Ray = { ox: cam.position.x, oy: cam.position.y, oz: cam.position.z, dx: camFwd.x, dy: camFwd.y, dz: camFwd.z };
    for (const tg of this.remotes.targets()) {
      if (!tg.foot || !this.hostile(tg) || tg.shield) continue;
      const cy = tg.y + (tg.crouch ? 0.8 : 1.15);
      const dx = tg.x - cam.position.x, dy = cy - cam.position.y, dz = tg.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > W.range || d < 0.5) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * camFwd.x + dy * camFwd.y + dz * camFwd.z) / d)));
      const window = Math.max(0.035, Math.min(0.09, 1.6 / d));
      if (ang > window || (best && ang > best.ang)) continue;
      // Not through walls.
      const wall = this.h.collision.raycast({ ox: cam.position.x, oy: cam.position.y, oz: cam.position.z, dx: dx / d, dy: dy / d, dz: dz / d }, d);
      if (wall < d - 0.5) continue;
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const onTarget = !!rayPlayer(ray, tg.x, tg.y, tg.z, tg.crouch, 0.08);
      best = { dyaw: Math.atan2(Math.sin(wantYaw - me.yaw), Math.cos(wantYaw - me.yaw)), dpitch: wantPitch - me.pitch, ang, onTarget };
    }
    return best;
  }

  private placeCamera(me: FootBody, dt: number, fps: boolean) {
    const H = this.h;
    const cam = H.camera;
    const W = WEAPONS[this.weapon];
    const aiming = this.input.aim && !this.dead;
    const eye = eyeHeight(me.crouch);
    const pitch = this.dead ? -0.5 : me.pitch;
    const d = aimDir(me.yaw, pitch);
    if (fps) {
      cam.position.set(me.x, me.y + eye, me.z);
      this.camPos.copy(cam.position);
    } else {
      // Over the right shoulder; pulled in when aiming, orbiting the body when dead.
      // A narrow (portrait) screen sees less to the sides: shoulder in, camera back a little.
      const narrow = Math.min(1, cam.aspect / 1.3);
      const back = (this.dead ? 5 : aiming ? 1.7 : 3) * (1 + (1 - narrow) * 0.35);
      const side = (this.dead ? 0 : aiming ? 0.72 : 0.7) * (0.35 + 0.65 * narrow);
      const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
      const px = me.x, py = me.y + (me.crouch ? 1.2 : 1.6), pz = me.z;
      const want = v3.set(px + rx * side - d.dx * back, py + 0.32 - d.dy * back, pz + rz * side - d.dz * back);
      // Keep a wall between the shoulder and the camera from swallowing the view.
      const vx = want.x - px, vy = want.y - py, vz = want.z - pz, vl = Math.hypot(vx, vy, vz) || 1;
      const hit = H.collision.raycast({ ox: px, oy: py, oz: pz, dx: vx / vl, dy: vy / vl, dz: vz / vl }, vl);
      if (hit < vl) want.set(px + (vx / vl) * Math.max(0.3, hit - 0.25), py + (vy / vl) * Math.max(0.3, hit - 0.25), pz + (vz / vl) * Math.max(0.3, hit - 0.25));
      this.camPos.lerp(want, 1 - Math.exp(-dt * 22));
      cam.position.copy(this.camPos);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(cam.position.x + d.dx * 10, cam.position.y + d.dy * 10, cam.position.z + d.dz * 10);
    const fov = aiming ? (fps ? W.adsFov : Math.max(40, W.adsFov + 12)) : fps ? 72 : 66;
    const near = fps ? 0.05 : 0.15;
    const f = cam.fov + (fov - cam.fov) * Math.min(1, dt * 14);
    if (Math.abs(cam.fov - f) > 0.01 || cam.near !== near) {
      cam.fov = f;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  }

  /** After the city: the first-person gun on top. */
  renderOverlay() {
    if (this.me && this.cam === "fps" && !this.dead) this.vm.render(this.h.renderer);
  }

  resize(w: number, hgt: number) {
    this.vm.resize(w / Math.max(1, hgt));
  }

  dots() {
    return this.remotes.dots();
  }

  dispose() {
    this.disposed = true;
    this.unbind();
    this.rt.stop();
    this.remotes.dispose();
    this.vfx.dispose();
    this.vm.dispose();
    this.avatar?.dispose();
    this.match = null;
    this.syncArena();
    this.listeners.clear();
  }
}
