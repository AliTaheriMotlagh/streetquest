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
import { aimDir, eyeHeight, rayPlayer, spreadDir, type Normal, type Ray } from "@/lib/arena/geom";
import { BOMB_REACH_M, bombSide, MODES, SITE_R, TEAM_COLORS, type LobbyView, type MatchView, type Team } from "@/lib/arena/modes";
import { F_AIM, F_AIR, F_CROUCH, F_FIRE, F_FOOT, F_RELOAD, F_SPRINT, G_PASSIVE, type ArenaGeo, type RosterEntry, type ServerMsg } from "@/lib/arena/protocol";
import { damageAt, isSecondary, MAX_HP, PRIMARIES, shotGap, WEAPON_BY_IDX, WEAPONS, type WeaponKey, type Zone } from "@/lib/arena/weapons";
import { VEHICLE_KEYS, type VehicleKey } from "@/lib/vehicles";
import type { CollisionWorld } from "../drive/physics";
import type { Others } from "../drive/others";
import { makeSign } from "../drive/world3d";
import { Avatar, loadSoldier } from "./avatar";
import { newFoot, stepFoot, type FootBody, type FootInput } from "./foot";
import { fovFor } from "@/lib/view";
import { beepSound, boomSound, clinkSound, doorSound, emptySound, engineStartSound, lockSound, fireSound, flashSound, hitSound, hurtSound, killSound, reloadSound, shotSound, smokeSound, throwSound } from "./gunsound";
import { flashSeconds, fullGear, isThrow, smokeBlocks, THROW_GAP_MS, THROW_KEYS, THROWABLES, throwVelocity, type ThrowKey, type Vec3 } from "@/lib/arena/throwables";
import { Nades } from "./nades";
import { rumble } from "../drive/gamepad";
import { medalFor, nextRun, NO_RUN, type KillRun } from "@/lib/arena/medals";
import { sfx } from "../game/sfx";
import { errorText } from "../game/client";
import { HTTP_DELAY_MS, Remotes, RT_DELAY_MS } from "./remotes";
import type { OtherDriver } from "../drive/net";
import type { ArenaEvent } from "@/server/arena";
import { RtClient } from "./rt";
import { relayApi } from "./relay";
import { Decals } from "./decals";
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
  /** The last hit I took: a blood splash over the screen (k 0–1 by damage), keyed so each hit replays it. */
  bleed: { id: number; k: number } | null;
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
  /** A UAV is up (enemies show through walls). */
  uav: boolean;
  /** Hardpoint: am I standing in the zone. */
  onHill: boolean;
  /** Grenades and C4 left this life, the one in hand, and whether my C4 is out (the button sets it off). */
  gear: Record<ThrowKey, number>;
  throwKey: ThrowKey;
  c4Out: boolean;
  /** Lining a throw up (the arc is showing). */
  aimingThrow: boolean;
  /** A flashbang blinded me for s seconds (keyed so each one replays the white-out). */
  flash: { id: number; s: number } | null;
  /** Standing in a fire. */
  burning: boolean;
  /** No realtime server: the open city's fights go over HTTP and matches through the game server. */
  local: boolean;
  /** In a match relayed through the game server: hosting it (in this tab) or playing in someone's. */
  relay: "host" | "guest" | null;
  /** The banner for what I just pulled off (lib/arena/medals.ts), while it shows; kills since I last died. */
  medal: { id: number; text: string; big: boolean } | null;
  streak: number;
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
  /** How far (m) the body of the street car I could get into from here is, or null (none in reach). */
  streetCar: (x: number, z: number) => number | null;
  /** Get into that street car (it waits where it stood until I'm in): its name, or null if it's gone. */
  takeCar: (x: number, z: number) => string | null;
  street: (x: number, z: number) => { x: number; z: number; yaw: number } | null;
  arenaGeo: (r: number) => ArenaGeo;
  /** Hop out (park the car where it is and stand at x, z) or back in. */
  setFoot: (on: boolean, at?: { x: number; z: number; yaw: number }) => void;
  /** Put the car somewhere (the referee's correction). */
  placeCar: (x: number, z: number, yaw: number) => void;
  toast: (text: string) => void;
  /** Who I am (the in-browser hub needs it when there's no realtime server). */
  me: () => { id: string; username: string; avatar: string; level: number } | null;
  /** The open city's people, cars and police (drive/street.ts) — outside matches only. */
  npc?: NpcTargets;
  /** May I get back into my own car (a burnt-out wreck: no)? */
  carUsable?: () => boolean;
};

/** What bullets and blasts meet in the open city besides players (drive/street.ts). */
export type NpcTargets = {
  /** The nearest person, car or officer a bullet meets within `maxT` m, and what hitting it does (damage, the bullet's heading). */
  ray(r: Ray, maxT: number): { t: number; body: boolean; zone: Zone; hit(dmg: number, dx: number, dz: number): boolean } | null;
  /** I fired here. */
  shot(x: number, z: number): void;
  /** A grenade or C4 went off here (`mine`: I threw it). */
  blast(x: number, z: number, mine: boolean): void;
  /** I'm knocked out (the street's damage took the last of my health). */
  down(): void;
};

/** My fight state from the HTTP presence (/api/drive) when there's no realtime server. */
export type HttpMe = { hp: number; dead: boolean; respawnAt: number; passive: boolean; events: ArenaEvent[] };
/** Players from the HTTP presence get sids from here up (the in-browser hub's are small). */
const HTTP_SID = 50_000;
/** On the HTTP presence (a few reports a second) "just fired" lasts longer, so others see it. */
const HTTP_FIRE_MS = 350;

const AUTO_FIRE_KEY = "sq_arena_autofire";
const PRIMARY_KEY = "sq_arena_primary";
const SECONDARY_KEY = "sq_arena_secondary";
const CAM_KEY = "sq_arena_cam";
const THROW_KEY = "sq_arena_throw";
const SENS_MOUSE = 0.0022;
export const SENS_TOUCH = 0.0058;
const CAR_REACH_M = 4.5;
const FEED_MS = 6000;
/** How long a medal's banner stays up. */
const MEDAL_MS = 2400;
/** How long the blood splash of a hit stays on the screen. */
const BLEED_MS = 1600;
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
/** The surface the last bullet raycast met. */
const hitN: Normal = { x: 0, y: 1, z: 0 };

export class Combat {
  readonly input: CombatInput = { mx: 0, mz: 0, sprint: false, crouch: false, aim: false, jump: false, fire: false, lookX: 0, lookY: 0, act: false };
  readonly rt: RtClient;
  readonly remotes: Remotes;
  private vfx: Vfx;
  /** Bullet holes, blood and scorch marks left in the city. */
  private decals: Decals;
  /** Grenades and C4: in flight, smoke clouds, fires, the throw's arc. */
  private nades: Nades;
  private gear: Record<ThrowKey, number> = fullGear();
  throwKey: ThrowKey = ((k) => (isThrow(k) ? k : "frag"))(store.get(THROW_KEY));
  private throwHeld = false;
  private thrownAt = 0;
  private flashFx: { id: number; s: number; at: number } | null = null;
  /** Camera shake from a blast nearby (0–1, dies away). */
  private shake = 0;
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
  /**
   * Hurt by the street (police fire, a blast, my car blowing up) outside matches: counted
   * apart from the referee's health (which only other players change), and a knock-out of
   * its own — up again a few seconds later where I fell.
   */
  private streetDmg = 0;
  private streetUpAt = 0;
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
  /** The last hit I took (the HUD splashes blood on the screen, stronger for a bigger hit). */
  private bleed: { id: number; k: number; at: number } | null = null;
  private feedId = 0;
  /** My kills without dying, the multi-kill chain, and the banner they earned. */
  private run: KillRun = NO_RUN;
  private medal: { id: number; text: string; big: boolean; at: number } | null = null;
  /** The match whose first kill has happened (first blood is for that one kill only). */
  private bloodFor: string | null = null;
  private lastSend = 0;
  private hudAt = 0;
  private hudSig = "";
  private listeners = new Set<() => void>();
  private snapshot: CombatHud;
  /** A game controller is in use: it owns the move / fire / aim input, the keyboard block steps aside. */
  padOn = false;
  get canRespawn() {
    return this.snapshot.canRespawn;
  }
  private autoFire = store.get(AUTO_FIRE_KEY) !== "0";
  /** The main gun I take into matches (everyone also carries the pistol). */
  primary: WeaponKey = ((p) => (p && PRIMARIES.includes(p as WeaponKey) ? (p as WeaponKey) : "rifle"))(store.get(PRIMARY_KEY));
  /** The sidearm that goes with it (the pistol or the heavy pistol). */
  secondary: WeaponKey = ((p) => (isSecondary(p) ? p : "pistol"))(store.get(SECONDARY_KEY));
  private beepAt = 0;
  private lastBomb: string | null = null;
  // match furniture
  private arena: THREE.Group | null = null;
  private arenaKey = "";
  private bombMesh: THREE.Mesh | null = null;
  private hillMesh: THREE.Mesh[] | null = null;
  /** A UAV is up until then (Date.now()). */
  private uavUntil = 0;
  private hitEl: HTMLElement | null = null;
  private crossEl: HTMLElement | null = null;
  private keys = new Set<string>();
  private disposed = false;
  private myAccent = "";
  /** The party a match I'm creating is for (the realtime server's matches: the party is told its id). */
  private partyFor: string | null = null;
  private partyMatch: string | null = null;

  constructor(private h: CombatHost) {
    this.vfx = new Vfx(h.scene);
    this.decals = new Decals(h.scene, h.collision);
    this.nades = new Nades(h.scene, h.collision, this.vfx, this.decals);
    this.vm = new Viewmodel(h.el.clientWidth / Math.max(1, h.el.clientHeight));
    this.remotes = new Remotes(h.scene, h.frame, h.others, h.shadows);
    this.rt = new RtClient(h.frame.origin, h.sim, {
      snap: (st, list) => this.remotes.snap(st, list.filter((e) => e.sid !== this.rt.sid)),
      push: (e, st, delay) => void (e.sid !== this.rt.sid && this.remotes.push(e, st, delay)),
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
      return m && { id: m.id, name: m.username, avatar: m.avatar, level: m.level, friends: [], virtual: h.canDrive(), color: h.vehicle().paint };
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

  /** Out of the fight for now: dead (the referee says so) or knocked out by the street. */
  private get down() {
    return this.dead || this.streetUpAt > 0;
  }

  /** Knocked out by the street right now. */
  get streetDown() {
    return this.streetUpAt > 0;
  }

  /**
   * Hurt by the street (not another player): only on foot, outside matches. `from` turns the
   * damage arrow toward where it came from. A knock-out stands me up again 5 s later.
   */
  streetHurt(dmg: number, from?: { x: number; z: number }) {
    const me = this.me;
    if (!me || this.inMatch || this.down || dmg <= 0) return;
    this.streetDmg += dmg;
    hurtSound();
    this.bleed = { id: ++this.feedId, k: Math.min(1, 0.3 + dmg / 70), at: performance.now() };
    navigator.vibrate?.(30);
    rumble(0.5, 0.3, 120);
    if (from) {
      const a = Math.atan2(-(from.x - me.x), -(from.z - me.z));
      this.hurt = [...this.hurt.filter((x) => performance.now() - x.at < 1200).slice(-3), { id: ++this.feedId, angle: a, at: performance.now() }];
    }
    if (this.hp - this.streetDmg <= 0) {
      this.streetUpAt = performance.now() + 5000;
      sfx("down");
      this.h.npc?.down();
    }
    this.publish(true);
  }

  /** Thrown out of my exploding car: on my feet beside it, already hurt. */
  ejectFromCar(x: number, z: number, yaw: number, dmg: number) {
    if (this.me || this.inMatch) return;
    const c = this.h.collision.collide(x, z, 0.4, 0, 1.7);
    this.h.setFoot(true, { x: c.x, z: c.z, yaw });
    this.enterFoot(c.x, c.z, yaw);
    this.streetHurt(dmg);
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
      bleed: this.bleed && performance.now() - this.bleed.at < BLEED_MS ? { id: this.bleed.id, k: this.bleed.k } : null,
      onFoot: !!this.me,
      nearCar: !!this.me && !this.inMatch && (this.ownCarAt() < CAR_REACH_M || this.h.streetCar(this.me.x, this.me.z) != null),
      hp: Math.round(Math.max(0, this.hp - this.streetDmg)),
      dead: this.dead || this.streetUpAt > 0,
      respawnIn: this.streetUpAt > 0 ? Math.max(0, Math.ceil((this.streetUpAt - performance.now()) / 1000)) : this.dead && this.respawnAt ? Math.max(0, Math.ceil((this.respawnAt - sNow) / 1000)) : 0,
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
      scoped: this.weapon === "sniper" && this.input.aim && !!this.me && !this.down && now >= this.reloadUntil,
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
      relay: this.rt.relay,
      medal: this.medal && Date.now() - this.medal.at < MEDAL_MS ? { id: this.medal.id, text: this.medal.text, big: this.medal.big } : null,
      streak: this.run.streak,
      uav: Date.now() < this.uavUntil,
      onHill: !!m?.hill && m.phase === "live" && !this.dead && this.distTo(m.hill) <= m.hill.r,
      gear: this.gear,
      throwKey: this.throwKey,
      c4Out: this.nades.myC4(),
      aimingThrow: this.throwHeld && !!this.me && !this.down,
      flash: this.flashFx && performance.now() - this.flashFx.at < this.flashFx.s * 1000 + 600 ? { id: this.flashFx.id, s: this.flashFx.s } : null,
      burning: !!this.me && !this.down && this.nades.inFire(this.me.x, this.me.z),
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
    const sig = JSON.stringify([s.rt, s.onFoot, s.nearCar, s.hp, s.dead, s.respawnIn, s.canRespawn, s.passive, s.inMatch, s.team, s.weapon, s.loadout, s.ammo, s.reloading, s.scoped, s.cam, s.feed.map((f) => f.id), s.match, s.lobbies, s.act && [s.act.kind, s.act.can, Math.round(s.act.progress * 20)], s.outside, s.hurt.map((x) => x.id), s.autoFire, s.carrying, s.match && Math.floor(this.rt.serverNow() / 1000), s.medal?.id, s.streak, s.relay, s.bleed?.id, THROW_KEYS.map((k) => s.gear[k]).join(), s.throwKey, s.c4Out, s.aimingThrow, s.flash?.id, s.burning]);
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
    // The door, shut behind me, and the car locked (not a helicopter: nothing to lock).
    doorSound(true);
    setTimeout(() => doorSound(false), 520);
    if (!v.flies) setTimeout(() => lockSound(), 1300);
  }

  /** Metres from me (on foot) to the middle of my parked car; Infinity without one. */
  private ownCarAt() {
    const p = this.h.parked();
    return p && this.me ? Math.hypot(p.x - this.me.x, p.z - this.me.z) : Infinity;
  }

  /** Into my own car, or into whichever street car (parked or stopped in traffic) is nearer. */
  getIn() {
    if (!this.me || this.inMatch) return;
    const own = this.ownCarAt(), street = this.down ? null : this.h.streetCar(this.me.x, this.me.z);
    // (Mine is measured to its middle, a street car to its body: about a metre between them.)
    if (street != null && (street < own - 1 || this.h.carUsable?.() === false)) {
      const name = this.h.takeCar(this.me.x, this.me.z);
      if (!name) return;
      this.h.toast(t("You took the {car}", { car: name }));
    } else if (own > CAR_REACH_M) return;
    else if (this.h.carUsable?.() === false) return this.h.toast(t("Your car is a wreck — take another one off the street, or pick one in the garage"));
    this.leaveFoot();
    this.h.setFoot(false);
    // In: the door, shut, and the engine turning over.
    doorSound(true);
    setTimeout(() => doorSound(false), 450);
    if (!this.h.vehicle().flies) setTimeout(() => engineStartSound(), 800);
  }

  private partyIds: string[] = [];
  /** My party's members: we always see each other in the open city (the referee needs both of us to say so). */
  setParty(ids: string[]) {
    if ([...ids].sort().join() === [...this.partyIds].sort().join()) return;
    this.partyIds = ids;
    this.rt.send({ t: "party", ids });
  }

  /** The city moved my car on purpose (start line, going to the host): tell the referee, so it isn't taken for a speed hack. */
  warp(x: number, z: number, yaw: number) {
    if (this.inMatch || this.me) return;
    this.rt.send({ t: "warp", x, y: 0, z, yaw });
  }

  /** Back in the car wherever it's parked (a trip to the party's host takes the car). */
  backInCar() {
    if (!this.me || this.inMatch) return;
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
        const text = errorText(res, data);
        if (text) this.h.toast(text);
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
    if (!this.me || this.down || now < this.reloadUntil || (this.ammo.get(this.weapon) ?? 0) >= W.mag) return;
    this.reloadLen = W.reloadS * 1000;
    this.reloadUntil = now + this.reloadLen;
    this.rt.send({ t: "reload" });
    reloadSound(W.reloadS);
    this.publish(true);
  }

  // ------------------------------------------------------------ grenades and C4
  /** The next kind of grenade in hand (the HUD shows how many of each are left). */
  cycleThrow() {
    const i = THROW_KEYS.indexOf(this.throwKey);
    this.throwKey = THROW_KEYS[(i + 1) % THROW_KEYS.length];
    store.set(THROW_KEY, this.throwKey);
    this.publish(true);
  }

  pickThrow(k: ThrowKey) {
    this.throwKey = k;
    store.set(THROW_KEY, k);
    this.publish(true);
  }

  /**
   * The throw button (G, or the touch button): hold to see the arc, let go to throw. With
   * my C4 already out, pressing it sets the C4 off instead.
   */
  holdThrow(on: boolean) {
    if (on) {
      if (!this.me || this.down || this.throwHeld) return;
      if (this.throwKey === "c4" && this.nades.myC4()) {
        this.rt.send({ t: "detonate" });
        beepSound(true);
        return;
      }
      if ((this.gear[this.throwKey] ?? 0) <= 0) {
        emptySound();
        this.h.toast(t("No {name} left", { name: t(THROWABLES[this.throwKey].name) }));
        return;
      }
      this.throwHeld = true;
      this.publish(true);
      return;
    }
    if (!this.throwHeld) return;
    this.throwHeld = false;
    this.nades.preview(null);
    this.throwNow();
    this.publish(true);
  }

  /** Where a throw leaves my hand and how fast: along where I'm looking, lifted into an arc. */
  private throwFrom(me: FootBody): { o: Vec3; v: Vec3 } | null {
    const cam = this.h.camera;
    cam.getWorldDirection(camFwd);
    const def = THROWABLES[this.throwKey];
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const eye = eyeHeight(me.crouch);
    const o: Vec3 = [me.x + rx * 0.2 + camFwd.x * 0.35, me.y + eye - 0.1, me.z + rz * 0.2 + camFwd.z * 0.35];
    // C4 is lobbed at your feet a few metres on; the rest are thrown hard.
    const lob = def.sticky ? 0.05 : 0.18;
    return { o, v: throwVelocity(def, { dx: camFwd.x, dy: camFwd.y, dz: camFwd.z }, { vx: me.vx, vz: me.vz }, lob) };
  }

  private throwNow() {
    const me = this.me, k = this.throwKey, now = performance.now();
    if (!me || this.down || (this.gear[k] ?? 0) <= 0 || now - this.thrownAt < THROW_GAP_MS) return;
    if (this.match && this.match.phase !== "live") return this.h.toast(t("Wait for the round to start"));
    if (!this.inMatch && this.passive) return this.h.toast(t("Turn off passive mode to fight"));
    const tr = this.throwFrom(me);
    if (!tr) return;
    const flight = this.nades.fly(k, tr.o, tr.v);
    this.rt.send({ t: "throw", k, o: tr.o, v: tr.v, rest: flight.rest });
    this.nades.mine(k, flight, this.rt.sid);
    this.gear = { ...this.gear, [k]: this.gear[k] - 1 };
    this.thrownAt = now;
    throwSound();
    this.vm.fire(0.02);
  }

  /** A grenade or C4 went off at (x, y, z): its effect, its sound, and what it does to me. */
  private onBoom(id: number, k: ThrowKey, by: number, x: number, y: number, z: number) {
    const H = this.h, cam = H.camera;
    this.nades.boom(id, k, by, by === this.rt.sid, x, y, z);
    const dx = x - cam.position.x, dy = y + 0.2 - cam.position.y, dz = z - cam.position.z;
    const dist = Math.hypot(dx, dy, dz) || 0.01;
    if (k === "frag" || k === "c4") {
      boomSound({ x, y: y + 0.2, z }, k === "frag" ? 0.7 : 1);
      this.shake = Math.max(this.shake, Math.min(1, (k === "c4" ? 16 : 10) / (dist + 2)));
      if (dist < 15) navigator.vibrate?.(k === "c4" ? 160 : 90);
      // In the open city it throws people and cars about too.
      if (!this.inMatch) H.npc?.blast(x, z, by === this.rt.sid);
    } else if (k === "flash") {
      // How blind am I: how near, how squarely I'm looking at it, and nothing in between.
      cam.getWorldDirection(camFwd);
      const facing = (camFwd.x * dx + camFwd.y * dy + camFwd.z * dz) / dist;
      const ray = { ox: cam.position.x, oy: cam.position.y, oz: cam.position.z, dx: dx / dist, dy: dy / dist, dz: dz / dist };
      const clear = H.collision.raycast(ray, dist) >= dist - 0.3 && !smokeBlocks(this.nades.smokes(), cam.position.x, cam.position.y, cam.position.z, x, y + 0.2, z);
      const s = this.dead ? 0 : flashSeconds(dist, facing, clear);
      flashSound({ x, y: y + 0.2, z }, s);
      if (s > 0) this.flashFx = { id: ++this.feedId, s, at: performance.now() };
    } else if (k === "smoke") smokeSound({ x, y: y + 0.2, z });
    else if (k === "molotov") fireSound({ x, y: y + 0.2, z }, THROWABLES.molotov.lastsS);
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
        rumble(e.kill ? 0.8 : 0.4, 0.3, e.kill ? 220 : 90);
        if (this.me) {
          const q = H.frame.toXZ(e.lat, e.lng);
          this.hurt = [...this.hurt.filter((x) => performance.now() - x.at < 1200).slice(-3), { id: ++this.feedId, angle: Math.atan2(-(q.x - this.me.x), -(q.z - this.me.z)), at: performance.now() }];
        }
        if (e.kill) {
          this.dead = true;
          sfx("down");
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
    shotSound(W.sound, from);
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
  /** Where I am (on foot or in the car), for matches nearby. */
  private here() {
    const p = this.me ?? this.h.vehicle();
    return this.h.frame.toLatLng(p.x, p.z);
  }
  lobbiesRefresh() {
    // No realtime server: matches other people host in their browsers, through the game server.
    if (this.rt.local)
      void relayApi<{ rooms: LobbyView[] }>({ action: "list", ...this.here() })
        .then((r) => {
          this.lobbies = r.rooms;
          this.publish(true);
        })
        .catch(() => {});
    else this.rt.send({ t: "lobbies" });
  }
  /** A new match here. For my party: its members may join from anywhere (and are pulled in). */
  create(mode: MatchView["mode"], radius: number, bots: number, difficulty: MatchView["difficulty"], party?: { id: string; members: string[] }) {
    if (!this.h.canDrive()) return this.h.toast(t("Switch to Play from home to fight in Street Arena"));
    this.partyFor = party?.id ?? null;
    this.rt.nextHost = { party: !!party };
    this.rt.send({ t: "create", mode, radius, bots, difficulty, geo: this.h.arenaGeo(radius), ...(party ? { invite: party.members } : {}) });
  }
  join(id: string, kind?: LobbyView["kind"]) {
    if (!this.h.canDrive()) return this.h.toast(t("Switch to Play from home to fight in Street Arena"));
    if (kind === "relay" || (!kind && this.rt.local)) void this.rt.joinRelay(id);
    else this.rt.send({ t: "join", id });
  }
  leave() {
    if (this.rt.relay === "guest") this.rt.leaveRelay();
    else this.rt.send({ t: "leave" });
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
    this.rt.send({ t: "loadout", primary: w, secondary: this.secondary });
  }
  setSecondary(w: WeaponKey) {
    this.secondary = w;
    store.set(SECONDARY_KEY, w);
    this.rt.send({ t: "loadout", primary: this.primary, secondary: w });
  }

  private async partyArena(body: { partyId?: string; id: string | null; mode?: string }) {
    try {
      await fetch("/api/party", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "arena", kind: "ws", ...body }) });
    } catch {}
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
        if (this.partyIds.length) this.rt.send({ t: "party", ids: this.partyIds });
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
        if (m.gear) this.gear = { ...m.gear };
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
        // In the open city while driving, it's the referee putting my car back (a jump it didn't believe).
        if (!this.me && !this.match && this.space === "world") {
          H.placeCar(m.x, m.z, m.yaw);
          break;
        }
        // Matches are on foot: a spawn while driving parks the car and gets me out.
        if (!this.me) {
          H.setFoot(true, { x: m.x, z: m.z, yaw: m.yaw });
          this.enterFoot(m.x, m.z, m.yaw);
        } else Object.assign(this.me, { x: m.x, z: m.z, y: m.y, yaw: m.yaw, vx: 0, vz: 0, vy: 0, air: false });
        this.recoilP = this.recoilY = 0;
        break;
      }
      case "hit": {
        // In the open city without a realtime server my health lives on the game server
        // (fromHttp); the in-browser hub's world only has me in it (my own grenade).
        if (this.httpMode && this.space === "world") break;
        const mine = m.from === this.rt.sid && m.to !== this.rt.sid;
        if (m.to === this.rt.sid) {
          this.hp = m.hp;
          if (m.kill) this.dead = true;
          hurtSound();
          if (m.kill) sfx("down");
          this.bleed = { id: ++this.feedId, k: Math.min(1, 0.3 + m.dmg / 70), at: performance.now() };
          // Flinch: a hit knocks the aim up a little, harder for a bigger one.
          if (this.me && !m.kill) {
            this.me.pitch = Math.min(1.35, this.me.pitch + 0.01 + Math.min(0.045, m.dmg / 1600));
            this.me.yaw += (Math.random() - 0.5) * Math.min(0.05, m.dmg / 1200);
          }
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
        // A pool of blood where they fell (on foot; not for the arena's edge).
        const fell = m.victim === me ? this.me : this.remotes.pose(m.victim);
        if (fell && m.w !== "zone" && (m.victim === me || this.remotes.pose(m.victim)?.foot)) this.decals.pool(fell.x, fell.z);
        // Medals: multi-kills and runs without dying, first blood of a match, headshots.
        const firstBlood = !!this.match && this.bloodFor !== this.match.id;
        if (this.match) this.bloodFor = this.match.id;
        if (m.victim === me) this.run = NO_RUN;
        else if (m.killer === me) {
          this.run = nextRun(this.run, Date.now());
          const medal = medalFor({ multi: this.run.multi, streak: this.run.streak, head: m.head, firstBlood });
          if (medal) {
            this.medal = { id: ++this.feedId, text: t(medal.text, { n: this.run.streak }), big: medal.big, at: Date.now() };
            sfx(medal.big ? "levelup" : "capture");
            setTimeout(() => this.publish(true), MEDAL_MS + 50);
          }
        }
        break;
      }
      case "shot": {
        const from = this.remotes.muzzle(m.sid, v3) ?? v3.set(m.x, m.y, m.z);
        this.vfx.flash(from.x, from.y, from.z);
        // What the bullet met, as this city has it: a wall short of where the referee ended
        // it (it doesn't know every building), else a body standing at the end of its path.
        const W = WEAPONS[m.w] ?? WEAPONS.rifle;
        const lx = m.ex - m.x, ly = m.ey - m.y, lz = m.ez - m.z, len = Math.hypot(lx, ly, lz) || 1;
        const ux = lx / len, uy = ly / len, uz = lz / len;
        const wall = H.collision.raycast({ ox: m.x, oy: m.y, oz: m.z, dx: ux, dy: uy, dz: uz }, len + 0.3, hitN);
        const body = !Number.isFinite(wall) && len < W.range - 1;
        const end = Number.isFinite(wall) ? wall : len;
        const ex = m.x + ux * end, ey = m.y + uy * end, ez = m.z + uz * end;
        this.vfx.tracer(from.x, from.y, from.z, ex, ey, ez);
        if (Number.isFinite(wall) || body) this.impact(ex, ey, ez, ux, uy, uz, body, W.key === "sniper", W.pellets > 1 ? 0.6 : 1);
        shotSound(WEAPONS[m.w]?.sound ?? WEAPONS.rifle.sound, from);
        break;
      }
      case "nade":
        if (isThrow(m.k)) this.nades.thrown(m.id, m.k, m.by, m.o, m.v, (this.rt.serverNow() - m.at) / 1000, m.by === this.rt.sid);
        break;
      case "boom":
        if (isThrow(m.k)) this.onBoom(m.id, m.k, m.by, m.x, m.y, m.z);
        break;
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
          this.rt.send({ t: "loadout", primary: this.primary, secondary: this.secondary });
          // A party match on the realtime server: tell the party where it is (relayed ones are listed by the game server itself).
          if (this.partyFor && !this.rt.local && m.m.hostSid === this.rt.sid) {
            this.partyMatch = m.m.id;
            void this.partyArena({ partyId: this.partyFor, id: m.m.id, mode: m.m.mode });
          }
          this.partyFor = null;
        }
        if (!m.m && prev && this.partyMatch === prev.id) {
          this.partyMatch = null;
          void this.partyArena({ id: null });
        }
        const mm = m.m;
        // A new match or round (or leaving one): no smoke, fire or C4 carries over.
        if ((prev?.id ?? null) !== (mm?.id ?? null) || (mm && prev && mm.round !== prev.round)) this.nades.clear();
        if (mm && prev?.id === mm.id && mm.phase !== prev.phase) {
          // A round starts, a round is won or lost, the match is over.
          const won = !!mm.winner && (mm.winner.team ? mm.winner.team === this.team : mm.winner.sid === this.rt.sid);
          if (mm.phase === "live") sfx("go");
          else if (mm.phase === "roundEnd" && mm.winner) sfx(won ? "capture" : "lose");
          else if (mm.phase === "ended") sfx(won ? "win" : "lose");
        }
        const b = mm?.bomb;
        if (b && b.state !== this.lastBomb && this.lastBomb) {
          if (b.state === "planted") sfx("alarm");
          else if (b.state === "defused") sfx("cut");
        }
        if (b?.state === "exploded" && this.lastBomb !== "exploded") {
          const p = H.frame.toXZ(b.lat, b.lng);
          this.vfx.explosion(p.x, 0, p.z);
          boomSound({ x: p.x, y: 0.5, z: p.z });
        }
        this.lastBomb = b?.state ?? null;
        this.syncArena();
        break;
      }
      case "uav":
        this.remotes.revealUntil = Date.now() + m.ms;
        this.uavUntil = this.remotes.revealUntil;
        H.toast(m.mine ? t("📡 UAV online — enemies show through walls") : t("📡 {name} called in a UAV", { name: m.by }));
        sfx("levelup");
        setTimeout(() => this.publish(true), m.ms + 50);
        break;
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
    const key = m ? `${m.id}|${m.radius}|${m.sites.map((s) => s.name).join()}|${m.hill ? `${m.hill.lat.toFixed(6)},${m.hill.lng.toFixed(6)}` : ""}` : "";
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
        this.hillMesh = null;
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
        // Hardpoint: a glowing disc and a beacon, coloured by who holds it.
        if (m.hill) {
          const p = this.h.frame.toXZ(m.hill.lat, m.hill.lng);
          const disc = new THREE.Mesh(new THREE.CircleGeometry(m.hill.r, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(p.x, 0.12, p.z);
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(m.hill.r, m.hill.r, 6, 48, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
          beam.position.set(p.x, 3, p.z);
          const sign = makeSign("🚩", t("Hardpoint"), "#ffffff", { big: true });
          sign.sprite.position.set(p.x, 8, p.z);
          g.add(disc, beam, sign.sprite);
          this.hillMesh = [disc, beam];
        }
        const bomb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: "#3b2b22", emissive: "#ff2a2a", emissiveIntensity: 0.4 }));
        bomb.visible = false;
        g.add(bomb);
        this.bombMesh = bomb;
        this.h.scene.add(g);
        this.arena = g;
      }
    }
    if (this.hillMesh && m?.hill) {
      const c = m.hill.contested ? "#ffb020" : m.hill.owner ? TEAM_COLORS[m.hill.owner] : "#ffffff";
      for (const mesh of this.hillMesh) (mesh.material as THREE.MeshBasicMaterial).color.set(c);
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
      if (k === "g") this.holdThrow(true);
      if (k === "4") this.cycleThrow();
      if (k === "enter" && this.snapshot.canRespawn) this.respawn();
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === "g") this.holdThrow(false);
    };
    const blur = () => {
      this.keys.clear();
      this.input.fire = this.input.aim = false;
      this.throwHeld = false;
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
    if (!H.touch && me && !this.padOn) {
      const k = this.keys;
      inp.mz = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
      inp.mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      inp.sprint = k.has("shift");
      if (k.has("control")) inp.crouch = true;
      inp.act = k.has("e");
    }

    // The street's knock-out wears off (up again where I fell); its damage heals slowly
    // after a quiet spell; a match starts everyone clean.
    if (this.streetUpAt && (performance.now() >= this.streetUpAt || this.inMatch)) {
      this.streetUpAt = 0;
      this.streetDmg = 0;
      this.publish(true);
    } else if (this.streetDmg > 0 && !this.streetUpAt && (this.inMatch || performance.now() - (this.bleed?.at ?? 0) > 8000)) {
      this.streetDmg = this.inMatch ? 0 : Math.max(0, this.streetDmg - dt * 4);
      this.publish();
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
      const assist = H.touch && !this.down ? this.assistTarget(me) : null;
      if (assist) {
        lx *= 0.55;
        ly *= 0.55;
        if (Math.abs(inp.mx) + Math.abs(inp.mz) > 0.1 || Math.abs(lx) + Math.abs(ly) > 0.0005) {
          me.yaw += assist.dyaw * Math.min(1, dt * 3);
          me.pitch += assist.dpitch * Math.min(1, dt * 3);
        }
      }
      if (!this.down) {
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
      const moveIn = this.down || frozen ? { ...inp, mx: 0, mz: 0, jump: false, sprint: false } : fireHeld ? { ...inp, sprint: false } : inp;
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
      const canFire = !this.down && !reloading && !frozen && !me.sprint && now >= this.nextShot;
      const wants = W.auto ? fireHeld : fireHeld && !this.triggerWas;
      this.triggerWas = fireHeld;
      if (wants && canFire) {
        if ((this.ammo.get(this.weapon) ?? 0) <= 0) {
          emptySound();
          this.reload();
          this.nextShot = now + 300;
        } else this.shoot(me, sNow, now, speed);
      }
      if (!reloading && (this.ammo.get(this.weapon) ?? 0) === 0 && !this.down && now > this.nextShot) this.reload();

      // -- lining up a throw: the arc it would fly
      if (this.throwHeld && !this.down) {
        const t = this.throwFrom(me);
        this.nades.preview(t && this.nades.fly(this.throwKey, t.o, t.v));
      } else this.nades.preview(null);

      // -- my soldier (third person) and the camera
      const fps = this.cam === "fps" && !this.down;
      if (this.avatar) {
        const accent = this.inMatch && this.team ? TEAM_COLORS[this.team as 1 | 2] : "#f0c05a";
        if (accent !== this.myAccent) (this.myAccent = accent), this.avatar.setColors("#7d8a6a", accent);
        this.avatar.group.visible = !fps;
        this.avatar.group.position.set(me.x, me.y, me.z);
        this.avatar.update(dt, { vx: me.vx, vz: me.vz, yaw: me.yaw, pitch: me.pitch, crouch: me.crouch, air: me.air, dead: this.down }, 0);
      }
      this.placeCamera(me, dt, fps);
      const scoped = this.snapshot.scoped;
      this.vm.visible = fps && !scoped && !this.down;
      this.vm.update(dt, { speed, lookX: lx, lookY: ly, ads: inp.aim && !reloading, reload: reloading ? 1 - (this.reloadUntil - performance.now()) / this.reloadLen : -1, air: me.air, sprint: me.sprint });

      // -- crosshair: grows with spread
      if (this.crossEl) {
        const spread = this.spread(me, speed);
        const px = (spread / Math.tan(((H.camera.fov / 2) * Math.PI) / 180)) * (H.el.clientHeight / 2);
        this.crossEl.style.setProperty("--spread", `${Math.max(4, Math.min(80, px)).toFixed(1)}px`);
        this.crossEl.classList.toggle("on-target", !!assist?.onTarget);
        this.crossEl.classList.toggle("hidden", this.down || scoped || (inp.aim && fps));
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
    this.decals.tick(dt);
    this.nades.tick(dt, (x, z) => clinkSound({ x, y: 0.1, z }));
    this.shake *= Math.exp(-dt * 4);
    if (!me) this.nades.preview(null);
    this.hurt = this.hurt.filter((x) => now - x.at < 1200);

    // -- my state out, 20×/s
    if (now - this.lastSend >= 50 && this.rt.linked) {
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

  /**
   * Where a bullet stopped (unit direction d): blood thrown on behind a body; sparks, dust
   * and a hole on a wall or the ground (whose normal the last raycast left in hitN).
   */
  private impact(x: number, y: number, z: number, dx: number, dy: number, dz: number, body: boolean, big: boolean, blood: number) {
    if (body) {
      this.vfx.impact(x, y, z, "body");
      this.decals.spray(x, y, z, dx, dy, dz, blood);
      return;
    }
    this.vfx.impact(x, y, z, hitN.y > 0.5 ? "ground" : "wall");
    this.decals.hole(x, y, z, hitN, big);
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
    /** Whom the shot hit (as I drew them): the referee looks back as far as I saw them. */
    let hitSid: number | null = null;
    /** People and officers in the street my shot hit (marked here: no referee for them). */
    const npcHits: { head: boolean; kill: boolean }[] = [];
    // Where the bullet visibly leaves: the third-person gun, or just below-right of the eye.
    const muzzle = this.avatar && this.cam === "tps" ? this.avatar.muzzle(v3) : v3.set(ox + rx * 0.12 + dx * 0.6, oy - 0.12 + dy * 0.6, oz + rz * 0.12 + dz * 0.6);
    for (let i = 0; i < W.pellets; i++) {
      const d = spreadDir({ dx, dy, dz }, spread);
      dirs.push([d.dx, d.dy, d.dz]);
      const ray: Ray = { ox, oy, oz, dx: d.dx, dy: d.dy, dz: d.dz };
      let tt = H.collision.raycast(ray, W.range, hitN);
      let body = false;
      let who: { sid: number; zone: "head" | "body" | "legs" } | null = null;
      for (const tg of this.remotes.targets()) {
        if (!tg.foot || !this.hostile(tg)) continue;
        const hit = rayPlayer(ray, tg.x, tg.y, tg.z, tg.crouch);
        if (hit && hit.t < tt) (tt = hit.t), (body = true), (who = { sid: tg.sid, zone: hit.zone });
      }
      // The open city's people, cars and police (my client is their referee).
      const npc = this.inMatch ? null : (H.npc?.ray(ray, Math.min(tt, W.range)) ?? null);
      if (npc && npc.t < tt) {
        tt = npc.t;
        body = npc.body;
        who = null;
        const killed = npc.hit(damageAt(W, npc.t, npc.zone), d.dx, d.dz);
        if (npc.body) npcHits.push({ head: npc.zone === "head", kill: killed });
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
      if (Number.isFinite(tt)) this.impact(ex, ey, ez, d.dx, d.dy, d.dz, body, W.key === "sniper", W.pellets > 1 ? 0.6 : 1);
      if (who && hitSid == null) hitSid = who.sid;
    }
    this.vfx.flash(muzzle.x, muzzle.y, muzzle.z, W.key === "shotgun" || W.key === "sniper");
    if (!this.inMatch) for (const [sid, h] of httpHits) this.httpHit(sid, h.zone, h.n);
    if (!this.inMatch) H.npc?.shot(me.x, me.z);
    if (npcHits.length) {
      const head = npcHits.some((x) => x.head), kill = npcHits.some((x) => x.kill);
      hitSound(head);
      if (kill) killSound();
      const el = this.hitEl;
      if (el) {
        el.classList.remove("on", "kill", "head");
        void el.offsetWidth;
        el.classList.add("on", ...(kill ? ["kill"] : []), ...(head ? ["head"] : []));
      }
    }
    this.rt.send({ t: "fire", w: W.key, at: sNow - (hitSid != null ? this.remotes.delayOf(hitSid) : this.rt.delay), o: [ox, oy, oz], d: dirs });
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
    rumble(Math.min(1, W.kick * 6), 0.35, 50);
    shotSound(W.sound);
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
      // Not through smoke, nor walls.
      if (smokeBlocks(this.nades.smokes(), cam.position.x, cam.position.y, cam.position.z, tg.x, cy, tg.z)) continue;
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
    const aiming = this.input.aim && !this.down;
    const eye = eyeHeight(me.crouch);
    const pitch = this.down ? -0.5 : me.pitch;
    const d = aimDir(me.yaw, pitch);
    if (fps) {
      cam.position.set(me.x, me.y + eye, me.z);
      this.camPos.copy(cam.position);
    } else {
      // Over the right shoulder; pulled in when aiming, orbiting the body when dead.
      // A narrow (portrait) screen sees less to the sides: shoulder in (the view itself opens up there — lib/view.ts).
      const narrow = Math.min(1, cam.aspect / 1.3);
      const back = (this.down ? 5 : aiming ? 1.7 : 3) * (1 + (1 - narrow) * 0.12);
      const side = (this.down ? 0 : aiming ? 0.72 : 0.7) * (0.35 + 0.65 * narrow);
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
    // A blast nearby rattles the view.
    if (this.shake > 0.01) {
      const k = this.shake * 0.035;
      cam.rotateX((Math.random() - 0.5) * k);
      cam.rotateY((Math.random() - 0.5) * k);
      cam.rotateZ((Math.random() - 0.5) * k * 0.6);
    }
    const fov = fovFor(aiming ? (fps ? W.adsFov : Math.max(40, W.adsFov + 12)) : fps ? 72 : 66, cam.aspect);
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
    if (this.me && this.cam === "fps" && !this.down) this.vm.render(this.h.renderer);
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
    this.nades.dispose();
    this.decals.dispose();
    this.vm.dispose();
    this.avatar?.dispose();
    this.match = null;
    this.syncArena();
    this.listeners.clear();
  }
}
