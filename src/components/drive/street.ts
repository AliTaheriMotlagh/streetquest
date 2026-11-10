"use client";
// Street life in the open 3D city — the crime-game layer over the traffic and the people
// (outside matches; a match is a clean shooter):
//  - crashes: your car dents, smokes, catches fire and explodes (carDamage.ts, numbers in
//    lib/street/damage.ts); the cars you hit are shoved off their lane and hurt the same
//    way; explosions throw cars and people about and set the cars next to them burning;
//  - people (people.ts) run from gunfire, crashes and blasts, dive out of the way of a
//    speeding car, and are knocked down or killed by what hits them;
//  - crime: what a passer-by or an officer sees raises the wanted level (lib/street/
//    wanted.ts) and the police come (police.ts): patrol cars that chase, ram and box you
//    in, officers who arrest you or shoot. Out of sight long enough, they lose you; stopped
//    beside them, you're arrested;
//  - bullets: arena/combat.ts asks `npc` what its shot met (people, cars, officers) — my
//    client is the referee for these, nobody else sees them (they're local, like traffic).
// The HUD (StreetHud.tsx) reads a tiny store: stars, the car's health, the big banners.
import * as THREE from "three";
import { CAR_RESTITUTION, felt, massOf } from "@/lib/street/carPhysics";
import { blastOnCar, blastOnPerson, bulletDamage, burnCar, crashDamage, dentDepth, hurtCar } from "@/lib/street/damage";
import { calm, report, response, tickWanted, type Crime, type Witness } from "@/lib/street/wanted";
import { rayFootprint, type Ray } from "@/lib/arena/geom";
import { WEAPONS } from "@/lib/arena/weapons";
import { boomSound, crashSound, fireSound, hornSound, shotSound, Siren, skidSound, thudSound } from "../arena/gunsound";
import { SampleLoop, warmSamples } from "../game/samples";
import { SOUND_KEYS } from "@/lib/soundSlots";
import type { Combat, NpcTargets } from "../arena/combat";
import { CarDamage } from "./carDamage";
import type { Crowd } from "./people";
import { CollisionWorld, forward } from "./physics";
import { Police, type PoliceEvent } from "./police";
import { StreetFx } from "./streetFx";
import type { Solid, SolidHit, TrafficCars, TrafficEvent } from "./traffic";
import { FLEET } from "@/lib/fleet";

/** My car's mass (kg) from its collision radius (a hatchback ≈ 1 t; a truck-sized one more). */
const myMass = (r: number, heavy: boolean) => massOf({ len: r * 3.2, wid: r * 1.4, hgt: heavy ? 2.4 : 1.45 });

export type StreetHost = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  collision: CollisionWorld;
  obstacles: CollisionWorld;
  crowd: Crowd;
  traffic: TrafficCars;
  lite: boolean;
  shadows: boolean;
  combat: () => Combat | null;
  /** A street spot near (x, z), within `maxD` m, or null. */
  street: (x: number, z: number, maxD: number) => { x: number; z: number; yaw: number } | null;
  /** Shove my car (m/s): a patrol car ramming it, a blast. */
  push: (vx: number, vz: number) => void;
  /** Shake the camera (0–1). */
  shake: (k: number) => void;
};

/** Me, this frame. `car*`: where my car is (parked while I'm on foot). */
export type StreetMe = { x: number; z: number; vx: number; vz: number; yaw: number; onFoot: boolean; inCar: boolean; flying: boolean; matchOn: boolean; carX: number; carZ: number; carYaw: number; carR: number };

export type Banner = "wanted" | "lost" | "busted" | "wrecked" | "down" | "fire";
export type StreetHud = {
  stars: number;
  /** An officer sees me now (the stars burn steady; searching, they blink). */
  seen: boolean;
  /** My car's health (0–100) while I drive a hurt one, else null. */
  car: number | null;
  burning: boolean;
  banner: { id: number; kind: Banner } | null;
};

const BANNER_MS = 2800;
/** A patrol car joins the chase at most this often (ms). */
const DISPATCH_MS = 2600;
const v3 = new THREE.Vector3();

export class StreetLife {
  wanted = calm();
  readonly police: Police;
  readonly fx: StreetFx;
  /** My car's health and dents. */
  readonly car = new CarDamage();
  /** Patrol cars, solid for my car. */
  readonly solid = new CollisionWorld();
  private siren = new Siren();
  /** Cars I hit or shot (and when): their explosions are my doing. */
  private byMe = new WeakMap<object, number>();
  private shotAt = 0;
  private dispatchAt = 0;
  private honkAt = 0;
  private dodgeAt = 0;
  private seen = false;
  /** When the last crime was reported: the police know where you are for a while after. */
  private crimeAt = -Infinity;
  /** People and officers already counted as hit or killed (a burst is one crime per victim). */
  private hurtIds = new Set<number>();
  private killedIds = new Set<number>();
  private me: StreetMe | null = null;
  /** When my car last crashed into something by itself (performance.now ms). */
  private crashAt = 0;
  private bannerAt = 0;
  private banner: StreetHud["banner"] = null;
  private bannerId = 0;
  private snapshot: StreetHud = { stars: 0, seen: false, car: null, burning: false, banner: null };
  private sig = "";
  private listeners = new Set<() => void>();
  private hudAt = 0;

  /** The city around you (a recorded loop, when there is one: lib/soundSlots.ts). */
  private city = new SampleLoop("city", 0.35);

  constructor(private h: StreetHost) {
    warmSamples(SOUND_KEYS);
    this.police = new Police(h.scene, h.collision, h.obstacles, h.lite, h.shadows);
    this.fx = new StreetFx(h.scene, h.lite);
    h.traffic.world = h.collision;
    h.traffic.extra = (put) => this.police.draw(put);
    h.traffic.solids = () => this.solids();
  }

  /**
   * The patrol cars and mine as the traffic's crashes see them: a loose car sliding into
   * one of them shoves and hurts it (and a patrol car at speed can knock traffic about).
   */
  private solids(): Solid[] {
    const me = this.me;
    if (!me || me.matchOn) return [];
    const pd = FLEET.samand, pm = massOf(pd);
    const out: Solid[] = this.police.units.map((u) => ({
      x: u.body.x, z: u.body.z, yaw: u.body.yaw, vx: u.body.vx, vz: u.body.vz, len: pd.len, wid: pd.wid, mass: pm,
      moving: Math.hypot(u.body.vx, u.body.vz) > 2,
      hit: (h) => this.police.shove(u, h.dvx, h.dvz, h.spin, crashDamage(h.felt)),
    }));
    if (!me.flying) {
      const len = Math.max(2, me.carR * 3.2), wid = Math.max(0.8, me.carR * 1.4);
      out.push({
        x: me.carX, z: me.carZ, yaw: me.carYaw, vx: me.inCar ? me.vx : 0, vz: me.inCar ? me.vz : 0, len, wid,
        // Parked while I'm on foot: it's in the way, but nothing moves it.
        mass: me.inCar ? myMass(me.carR, false) : Infinity,
        moving: false,
        hit: (h) => this.hitMe(h),
      });
    }
    return out;
  }

  /** A loose street car slid into mine. */
  private hitMe(h: SolidHit) {
    const me = this.me;
    // My own crash into that car was just counted (Drive's collision): not twice.
    if (!me || performance.now() - this.crashAt < 250) return;
    const k = Math.min(1, Math.max(0, h.felt - 2) / 16);
    if (me.inCar) this.h.push(h.dvx, h.dvz);
    const dmg = crashDamage(h.felt);
    if (dmg > 0) {
      this.hurtMyCar(dmg);
      this.car.dent(h.x, 0.55, h.z, dentDepth(h.felt));
    }
    if (h.felt > 2) {
      this.fx.sparks(h.x, 0.5, h.z, k);
      this.fx.debris(h.x, 0.6, h.z, k, h.nx, h.nz);
      crashSound(k, Math.hypot(h.x - me.x, h.z - me.z));
      if (me.inCar) {
        this.h.shake(Math.min(0.8, 0.15 + k));
        navigator.vibrate?.(Math.round(20 + 80 * k));
      }
    }
  }

  // ------------------------------------------------------------ the HUD's store
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private publish(force = false) {
    const now = performance.now();
    if (!force && now - this.hudAt < 120) return;
    this.hudAt = now;
    const me = this.me;
    const hurt = !!me?.inCar && this.car.health.hp < 100;
    const s: StreetHud = {
      stars: this.wanted.stars,
      seen: this.seen,
      car: hurt ? Math.round(this.car.health.hp) : null,
      burning: !!me?.inCar && this.car.health.hp <= 0 && !this.car.health.exploded,
      banner: this.banner && now - this.bannerAt < BANNER_MS ? this.banner : null,
    };
    const sig = JSON.stringify(s);
    if (sig === this.sig) return;
    this.sig = sig;
    this.snapshot = s;
    for (const l of this.listeners) l();
  }

  private say(kind: Banner) {
    this.banner = { id: ++this.bannerId, kind };
    this.bannerAt = performance.now();
    this.publish(true);
  }

  // ------------------------------------------------------------ crime
  /** A crime at x, z: who saw it decides what it costs (`cop`: done to the police, they always know). */
  private crime(c: Crime, x: number, z: number, cop = false) {
    const seen: Witness = cop || this.police.sees(x, z) ? 2 : this.h.crowd.witnesses(x, z, 40) > 0 ? 1 : 0;
    const before = this.wanted.stars;
    if (seen) this.crimeAt = performance.now();
    if (report(this.wanted, c, seen) > before) this.say("wanted");
  }

  /** One crime per victim and outcome: hurting them once, killing them once. */
  private victim(id: number, killed: boolean) {
    const set = killed ? this.killedIds : this.hurtIds;
    if (set.has(id)) return false;
    set.add(id);
    if (set.size > 400) set.clear();
    return true;
  }

  /** What bullets and blasts meet besides players (arena/combat.ts asks). */
  readonly npc: NpcTargets = {
    ray: (r: Ray, maxT: number) => {
      let best: ReturnType<NpcTargets["ray"]> = null;
      const p = this.h.crowd.ray(r, maxT);
      if (p)
        best = {
          t: p.t,
          body: true,
          zone: p.zone,
          hit: (dmg, dx, dz) => {
            const at = this.h.crowd.where(p.id);
            const killed = this.h.crowd.shoot(p.id, dmg, dx, dz);
            if (at && this.victim(p.id, killed)) this.crime(killed ? "killPerson" : "hitPerson", at.x, at.z);
            return killed;
          },
        };
      const o = this.police.rayOfficer(r, best?.t ?? maxT);
      if (o)
        best = {
          t: o.t,
          body: true,
          zone: o.zone,
          hit: (dmg) => {
            const killed = this.police.hurtOfficer(o.o, dmg);
            if (this.victim(-o.o.id, killed)) this.crime(killed ? "killCop" : "hitCop", o.o.x, o.o.z, true);
            return killed;
          },
        };
      const c = this.h.traffic.ray(r, best?.t ?? maxT);
      if (c)
        best = {
          t: c.t,
          body: false,
          zone: "body",
          hit: (dmg) => {
            this.byMe.set(c.ref, performance.now());
            this.h.traffic.shoot(c.ref, bulletDamage(dmg));
            return false;
          },
        };
      for (const f of this.police.footprints()) {
        const t = rayFootprint(r, f, best?.t ?? maxT);
        if (t < (best?.t ?? maxT) && this.police.isUnit(f.ref)) {
          const u = f.ref;
          best = {
            t,
            body: false,
            zone: "body",
            hit: (dmg) => {
              this.police.shootCar(u, bulletDamage(dmg));
              if (this.victim(-u.id - 1_000_000, false)) this.crime("hitCop", u.body.x, u.body.z, true);
              return false;
            },
          };
        }
      }
      return best;
    },
    shot: (x, z) => {
      this.h.crowd.alarm(x, z, 45);
      this.h.traffic.alarm(x, z, 35);
      // A burst of fire is one report, not one per bullet.
      const now = performance.now();
      if (now - this.shotAt > 3500) {
        this.shotAt = now;
        this.crime("shots", x, z);
      }
    },
    blast: (x, z, mine) => this.explode(x, z, mine, true),
    down: () => {
      this.say("down");
      this.wanted = calm();
      this.police.standDown();
    },
  };

  /** Into a street car I took: a carjacking if someone was driving it; its health is mine now. */
  tookCar(t: { driven: boolean; hp: number }, x: number, z: number) {
    this.car.reset(t.hp);
    if (t.driven) this.crime("carjack", x, z);
  }

  /** A different car from the garage: as good as new. */
  freshCar() {
    this.car.reset();
  }

  /** My car can be driven (not a burnt-out wreck). */
  get carUsable() {
    return !this.car.health.exploded;
  }

  // ------------------------------------------------------------ crashes and blasts
  /**
   * My car hit something at (x, z) — `into` m/s straight into it, along normal (nx, nz) —
   * and `ref` says what (a street car, a patrol car, nothing: a wall).
   */
  crash(c: { ref?: object; into: number; nx: number; nz: number; x: number; z: number; heavy: boolean }) {
    const me = this.me;
    if (!me || me.matchOn || c.into < 2) return;
    this.crashAt = performance.now();
    const k = Math.min(1, (c.into - 2) / 16);
    const other = c.ref ? this.h.traffic.massOfRef(c.ref) : null;
    if (c.ref && other) {
      // Momentum: the struck car takes the speed it's handed in proportion to the masses
      // (a Pride shunts a Pride on; a bus hardly moves).
      const mine = myMass(me.carR, c.heavy), dv = (c.into * (1 + CAR_RESTITUTION) * mine) / (mine + other);
      this.h.traffic.bump(c.ref, -c.nx * dv, -c.nz * dv, crashDamage(felt(dv)));
      this.byMe.set(c.ref, performance.now());
    } else if (this.police.isUnit(c.ref)) {
      this.police.bump(c.ref, -c.nx * c.into, -c.nz * c.into, crashDamage(c.into));
      if (c.into > 4) this.crime("rammedCop", c.x, c.z, true);
    }
    const dmg = crashDamage(c.into, c.heavy ? 0.45 : 1);
    if (dmg > 0) {
      this.hurtMyCar(dmg);
      this.car.dent(c.x, 0.55, c.z, dentDepth(c.into));
    }
    this.fx.sparks(c.x, 0.5, c.z, k);
    this.fx.debris(c.x, 0.6, c.z, k, -c.nx, -c.nz);
    crashSound(k, 0);
    this.h.shake(Math.min(0.8, 0.15 + k));
    navigator.vibrate?.(Math.round(20 + 80 * k));
    if (c.into > 6) this.h.crowd.alarm(c.x, c.z, 15 + 25 * k);
  }

  private hurtMyCar(dmg: number) {
    if (hurtCar(this.car.health, dmg)) this.say("fire");
  }

  /** A blast at x, z (a car blowing up, a grenade): everything near is hurt and thrown; everyone runs. */
  private explode(x: number, z: number, byMe: boolean, grenade = false) {
    const me = this.me;
    if (!me || me.matchOn) return;
    if (!grenade) {
      this.fx.explosion(x, 0.6, z);
      const cam = this.h.camera.position, d = Math.hypot(cam.x - x, cam.z - z);
      boomSound(d);
      this.h.shake(Math.min(1, 14 / (d + 2)));
      if (d < 20) navigator.vibrate?.(120);
    }
    const people = this.h.crowd.blast(x, z, blastOnPerson);
    this.h.traffic.blast(x, z, blastOnCar);
    this.police.blast(x, z, blastOnCar, blastOnPerson);
    // Me: on foot, hurt by it; in the car, the car takes it and is thrown.
    const dm = Math.hypot(me.x - x, me.z - z);
    if (me.onFoot && !grenade) this.h.combat()?.streetHurt(blastOnPerson(dm).damage, { x, z });
    else if (me.inCar) {
      const b = blastOnCar(dm);
      if (b.damage > 0) {
        this.hurtMyCar(b.damage);
        this.h.push(((me.x - x) / (dm || 1)) * b.push, ((me.z - z) / (dm || 1)) * b.push);
      }
    }
    this.h.crowd.alarm(x, z, 70);
    this.h.traffic.alarm(x, z, 60);
    if (byMe) {
      this.crime("explosion", x, z);
      if (people.killed) this.crime("killPerson", x, z);
    }
  }

  /** My own car blowing up: the shell stays, charred; inside it, I'm thrown out hurt. */
  private myCarBoom(me: StreetMe) {
    this.car.char();
    const f = forward(me.carYaw);
    if (me.inCar) {
      this.h.combat()?.ejectFromCar(me.carX - f.fz * 2.4, me.carZ + f.fx * 2.4, me.carYaw, 45);
      this.say("wrecked");
    }
    // (I'm out of the car now, so the blast doesn't hit me twice.)
    this.me = { ...me, onFoot: false, inCar: false };
    this.explode(me.carX, me.carZ, false);
    this.me = me;
  }

  // ------------------------------------------------------------ every frame
  tick(dt: number, me: StreetMe) {
    this.me = me;
    // The street's hum: quieter with the windows up, none in a match.
    this.city.level(me.matchOn ? 0 : me.inCar ? 0.45 : 1);
    if (me.matchOn) {
      if (this.police.units.length) this.police.clear();
      if (this.wanted.stars) this.wanted = calm();
      this.siren.level(0);
      this.fx.tick(dt);
      this.publish();
      return;
    }
    const now = performance.now();
    const crowd = this.h.crowd, traffic = this.h.traffic;

    // People and the cars that hit them: mine (that's on me), traffic, the police.
    if (me.inCar && !me.flying) {
      const sp = Math.hypot(me.vx, me.vz), f = forward(me.yaw);
      if (sp > 0.6) {
        let killed = 0, hurt = 0;
        for (const off of [1.3, -0.9]) {
          const r = crowd.hitBy(me.x + f.fx * off, me.z + f.fz * off, me.carR, me.vx, me.vz);
          (killed += r.killed), (hurt += r.hurt);
        }
        if (killed || hurt) {
          thudSound(0);
          this.h.shake(0.25);
          this.crime(killed ? "killPerson" : "hitPerson", me.x, me.z);
        }
      }
      // A car coming fast: people dive out of its way.
      if (sp > 7 && now - this.dodgeAt > 350) {
        this.dodgeAt = now;
        crowd.alarm(me.x + f.fx * 7, me.z + f.fz * 7, 4.5);
      }
    }
    for (const m of traffic.movers()) crowd.hitBy(m.x, m.z, m.r, m.vx, m.vz);
    for (const u of this.police.units) if (u.body.speed > 2) crowd.hitBy(u.body.x, u.body.z, 1.3, u.body.vx, u.body.vz);

    // What the traffic did (fires, explosions, horns).
    for (const e of traffic.events.splice(0)) this.onTraffic(e, now);

    // The police: dispatched by the stars, then their events.
    const resp = this.wanted.stars ? response(this.wanted.stars) : null;
    const combat = this.h.combat();
    this.police.myCar = me.inCar ? { x: me.carX, z: me.carZ, r: me.carR, vx: me.vx, vz: me.vz } : null;
    this.police.tick(dt, { x: me.x, z: me.z, vx: me.vx, vz: me.vz, onFoot: me.onFoot, inCar: me.inCar, down: !!combat?.streetDown }, resp);
    for (const e of this.police.events.splice(0)) this.onPolice(e, me);
    this.dispatch(me, resp, now);
    this.solid.add("police", this.police.footprints());
    traffic.blockers = this.police.units.map((u) => ({ x: u.body.x, z: u.body.z }));

    // The wanted level's clocks: seen, searching, lost; arrested.
    if (this.wanted.stars) {
      this.seen = this.police.sees(me.x, me.z);
      // Right after a crime they know where you are (the patrol cars are still on their way).
      const known = this.seen || now - this.crimeAt < 12_000;
      const speed = Math.hypot(me.vx, me.vz);
      // Cuffed: on foot with an officer at arm's length; in a stopped car with one at the door.
      const cuffable = !combat?.streetDown && (me.onFoot ? speed < 2.6 && this.police.beside(me.x, me.z, 2.2, 0) : me.inCar && speed < 1.2 && this.police.beside(me.x, me.z, 5.5, 0));
      const out = tickWanted(this.wanted, dt, known, cuffable);
      if (out === "lost") this.say("lost");
      if (out === "busted") this.say("busted");
      if (out) this.police.standDown();
    } else {
      this.seen = false;
      tickWanted(this.wanted, dt, false, false);
      if (this.police.chasing.length) this.police.standDown();
    }

    // My car burning down, then the blast.
    if (burnCar(this.car.health, dt)) this.myCarBoom(me);

    // Smoke and fire from every hurt car (mine too).
    const smoking = [...traffic.damaged(), ...this.police.damaged()];
    const look = this.car.look;
    if (look !== "ok" && look !== "dented") {
      const f = forward(me.carYaw), front = this.car.health.exploded ? 0 : 1.4;
      smoking.push({ x: me.carX + f.fx * front, y: 0.95, z: me.carZ + f.fz * front, look, burnT: this.car.health.burn });
    }
    this.fx.smoke(smoking, dt);
    this.fx.tick(dt);

    // The siren, louder the nearer the nearest patrol car.
    const near = this.police.nearest(me.x, me.z);
    this.siren.level(this.police.chasing.length ? Math.max(0, 1 - near / 220) : 0);
    this.publish();
  }

  /** Another patrol car when the stars ask for more: from a street out of sight, at a distance. */
  private dispatch(me: StreetMe, resp: ReturnType<typeof response> | null, now: number) {
    if (!resp || this.police.chasing.length >= resp.cars || now - this.dispatchAt < DISPATCH_MS) return;
    this.dispatchAt = now;
    // Up or down the street you're on first (a straight run at you), then anywhere around;
    // a spot with a clear line to you beats one behind the buildings.
    const here = this.h.street(me.x, me.z, 30);
    const dirs = here ? [here.yaw, here.yaw + Math.PI] : [];
    let fallback: { x: number; z: number } | null = null;
    for (let i = 0; i < 12; i++) {
      // (The street's heading as an angle for cos/sin: forward(yaw) is (−sin yaw, −cos yaw).)
      const a = i < dirs.length ? Math.atan2(-Math.cos(dirs[i]), -Math.sin(dirs[i])) : Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 50;
      const s = this.h.street(me.x + Math.cos(a) * r, me.z + Math.sin(a) * r, 40);
      if (!s) continue;
      const dx = me.x - s.x, dz = me.z - s.z, d = Math.hypot(dx, dz);
      if (d < 55) continue;
      const clear = this.h.collision.raycast({ ox: s.x, oy: 1.2, oz: s.z, dx: dx / d, dy: 0, dz: dz / d }, d) >= d - 2;
      if (!clear) {
        fallback ??= s;
        continue;
      }
      // Facing you (it turns on its own anyway).
      return this.police.spawn(s.x, s.z, Math.atan2(-dx, -dz));
    }
    if (fallback) this.police.spawn(fallback.x, fallback.z, Math.atan2(-(me.x - fallback.x), -(me.z - fallback.z)));
  }

  private onTraffic(e: TrafficEvent, now: number) {
    const me = this.me!;
    const d = Math.hypot(e.x - me.x, e.z - me.z);
    if (e.kind === "honk") {
      if (now - this.honkAt > 300 && d < 70) {
        this.honkAt = now;
        hornSound(d, 0.88 + ((e.x * 7.3 + e.z) % 1 + 1) % 1 * 0.25);
      }
    } else if (e.kind === "fire") {
      if (d < 60) fireSound(d, 1);
    } else if (e.kind === "crash") {
      // Two street cars met: metal, glass, sparks; people near look round and run.
      const k = Math.min(1, ((e.into ?? 0) - 2) / 16);
      if (d < 90) crashSound(k, d);
      if (k > 0.3 && d < 60) setTimeout(() => skidSound(k, d), 80);
      this.fx.sparks(e.x, 0.5, e.z, k);
      this.fx.debris(e.x, 0.6, e.z, k);
      if (d < 25) this.h.shake(Math.min(0.4, k * 0.5 * (1 - d / 25)));
      if ((e.into ?? 0) > 6) this.h.crowd.alarm(e.x, e.z, 10 + 20 * k);
    } else {
      const when = this.byMe.get(e.ref);
      this.explode(e.x, e.z, when != null && now - when < 90_000);
    }
  }

  private onPolice(e: PoliceEvent, me: StreetMe) {
    if (e.kind === "boom" || e.kind === "fire") {
      if (e.kind === "boom") this.explode(e.x, e.z, false);
      return;
    }
    if (e.kind === "ram") {
      if (!me.inCar) return;
      const k = Math.min(1, e.into / 15);
      this.h.push(e.nx * e.into * 0.7, e.nz * e.into * 0.7);
      this.hurtMyCar(crashDamage(e.into, 0.8));
      this.car.dent(e.x - e.nx * me.carR, 0.55, e.z - e.nz * me.carR, dentDepth(e.into) * 0.8);
      this.fx.sparks(e.x - e.nx * me.carR, 0.5, e.z - e.nz * me.carR, k);
      this.fx.debris(e.x - e.nx * me.carR, 0.6, e.z - e.nz * me.carR, k, e.nx, e.nz);
      crashSound(k, 0);
      this.h.shake(Math.min(0.7, 0.15 + k));
      return;
    }
    // An officer fired.
    const m = this.police.muzzle(e.at, v3);
    const d = Math.hypot(e.x - me.x, e.z - me.z);
    this.fx.vfx.tracer(m.x, m.y, m.z, e.tx, e.ty, e.tz);
    this.fx.vfx.flash(m.x, m.y, m.z);
    shotSound(WEAPONS.pistol.sound, d, 0);
    if (!e.hit) return this.fx.vfx.impact(e.tx, Math.max(0.05, e.ty), e.tz, e.ty < 0.3 ? "ground" : "wall");
    if (e.onCar) {
      this.hurtMyCar(3.5);
      this.fx.sparks(e.tx, e.ty, e.tz, 0.1);
    } else this.h.combat()?.streetHurt(4 + this.wanted.stars * 1.6 + Math.random() * 4, { x: e.x, z: e.z });
  }

  /** Nothing of this in a match, or when drive mode closes. */
  clear() {
    this.police.clear();
    this.wanted = calm();
    this.siren.level(0);
    this.publish(true);
  }

  dispose() {
    this.siren.stop();
    this.city.stop();
    this.police.dispose();
    this.fx.dispose();
    this.h.traffic.extra = null;
    this.listeners.clear();
  }
}
