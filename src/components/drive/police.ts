"use client";
// The police of the open 3D city (street.ts runs them; lib/street/wanted.ts says how hard):
//  - patrol cars — Samands in the police's dark green with a white band down each side, a
//    flashing red-blue light bar and the siren — that
//    come in from a street out of sight and chase you on the same car physics as yours
//    (stepGround), feeling their way round walls with whiskers and backing out when stuck;
//    from two stars they ram you;
//  - officers who get out when a car pulls up near you: they run at you to arrest you, and
//    from two stars they shoot (at you on foot; from three, at your car too), with real
//    misses — further and faster is harder to hit. They're a real officer model (green
//    uniform and cap) on the arena soldier's skeleton, and as mortal as anyone;
//  - patrol cars are solid (their footprints' `ref` is the unit), take crash and bullet
//    damage like any car, and burn and blow up the same way.
// When the stars go out they drive off and vanish out of sight.
import * as THREE from "three";
import { FLEET, type FleetKey } from "@/lib/fleet";
import { VEHICLES } from "@/lib/vehicles";
import { burnCar, carLook, dentCar, dentDepth, freshCar, holeCar, hurtCar, localHit, localShot, type CarHealth } from "@/lib/street/damage";
import { rayPlayer, type Ray } from "@/lib/arena/geom";
import type { Response } from "@/lib/street/wanted";
import { Avatar, loadPolice, loadSoldier } from "../arena/avatar";
import { forward, stepGround, type Body, type CollisionWorld } from "./physics";
import { box, type Footprint } from "./tileMesh";
import type { FleetInstances } from "./fleet3d";
import { POLICE_WHITE } from "./livery";

const KEY: FleetKey = "samand";
const DEF = VEHICLES.samand;
/** Iran's police green (the patrol cars' body), and the white band down their sides. */
const WHITE = new THREE.Color(POLICE_WHITE);
/** The light bar: a red lens at each end of a pale housing (three pieces a car). */
const BAR = { lens: 0.36, mid: 0.3, hgt: 0.13, dep: 0.27 };
const BURNT = new THREE.Color("#17140f");
/** Police uniform and the band on the cap. */
const UNIFORM = "#3d4a3a", ACCENT = "#1d2c52";
/** Officers on foot at once (lite phones less). */
const OFFICERS_MAX = 6;

type Officer = {
  id: number;
  unit: Unit;
  avatar: Avatar | null;
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  hp: number;
  dead: boolean;
  /** Seconds since it died (bodies go after a while). */
  since: number;
  /** Next shot (performance.now ms). */
  next: number;
  /** A shot just went off (for the gun's flash). */
  flash: number;
};

export type Unit = {
  id: number;
  body: Body;
  health: CarHealth;
  /** Seconds it has made no progress (then it backs out), and seconds left reversing. */
  stuck: number;
  reverse: number;
  officers: Officer[];
  /** Done chasing: driving off to vanish out of sight. */
  leaving: number;
  /** Seconds since it last moved under its own power. */
  idle: number;
  /** The siren's light bar (flashes alternate). */
  phase: number;
  /** Knocked about by a crash or a blast: drifts on this. */
  push: { vx: number; vz: number; spin: number };
  /** Seconds without a clear view of you (one lost behind the buildings is sent round again). */
  blind: number;
  /** When the officer at the wheel may use the megaphone again (ms, performance.now). */
  talkAt: number;
};

/** What the police see of you each frame. */
export type Suspect = { x: number; z: number; vx: number; vz: number; onFoot: boolean; inCar: boolean; down: boolean };

/** What happened to whom, for street.ts to answer (damage, crimes, effects). */
export type PoliceEvent =
  | { kind: "shot"; at: Officer; hit: boolean; x: number; z: number; tx: number; ty: number; tz: number; onCar: boolean }
  | { kind: "fire"; x: number; z: number }
  | { kind: "boom"; x: number; z: number; yaw: number }
  | { kind: "ram"; unit: Unit; into: number; x: number; z: number; nx: number; nz: number }
  /** An officer shouting (the megaphone in a chase, orders when they get out): `where` follows them. */
  | { kind: "talk"; say: "copStop" | "copHands"; where: () => { x: number; y: number; z: number } | null };

let nextId = 1;

export class Police {
  units: Unit[] = [];
  events: PoliceEvent[] = [];
  private bars: THREE.InstancedMesh;
  private soldier: Awaited<ReturnType<typeof loadSoldier>> | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sv = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();
  private rand = Math.random;
  /** Your car this frame (police cars can't drive through it — they ram it), or null on foot. */
  myCar: { x: number; z: number; r: number; vx: number; vz: number } | null = null;

  constructor(private scene: THREE.Scene, private world: CollisionWorld, private obstacles: CollisionWorld, private lite: boolean, private shadows: boolean) {
    // The light bars: three pieces per car (lens, housing, lens), the lenses bright enough
    // for the HDR pipeline to bloom them when lit.
    const geo = new THREE.BoxGeometry(1, BAR.hgt, BAR.dep);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    this.bars = new THREE.InstancedMesh(geo, mat, 36);
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bars.setColorAt(0, this.c.set("#000"));
    scene.add(this.bars);
    // The officer model (green uniform, cap; on the soldier's skeleton), else the soldier.
    loadPolice()
      .then((t) => (this.soldier = t))
      .catch(() => {});
  }

  /** A new patrol car at a street spot, facing `yaw`. */
  spawn(x: number, z: number, yaw: number) {
    const body: Body = { x, z, alt: 0, cruise: 0, yaw, vx: 0, vz: 0, vy: 0, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0 };
    this.units.push({ id: nextId++, body, health: freshCar(), stuck: 0, reverse: 0, officers: [], leaving: 0, idle: 0, phase: this.rand() * 10, push: { vx: 0, vz: 0, spin: 0 }, blind: 0, talkAt: 0 });
  }

  /** Units still in the chase (not leaving, not wrecked). */
  get chasing() {
    return this.units.filter((u) => !u.leaving && u.health.hp > 0);
  }

  /** Every unit drives off; they vanish once out of sight. */
  standDown() {
    for (const u of this.units) if (!u.leaving) u.leaving = 0.01;
  }

  /** Footprints for the collision world (police cars are solid). */
  footprints(): Footprint[] {
    const def = FLEET[KEY];
    return this.units.map((u) => {
      const f = box(u.body.x, u.body.z, def.wid / 2 + 0.05, def.len / 2, u.body.yaw, def.hgt);
      f.ref = u;
      return f;
    });
  }

  /** Is this footprint's ref a police car? */
  isUnit(ref: object | undefined): ref is Unit {
    return !!ref && (this.units as object[]).includes(ref);
  }

  /** Draw the cars with the traffic (traffic.extra). */
  draw(put: FleetInstances["put"]) {
    const blink = Math.floor(Date.now() / 450) % 2 === 0;
    for (const u of this.units) {
      const burnt = u.health.exploded;
      // An officer at the wheel until they get out (or the car's gone up).
      put(KEY, u.body.x, u.body.z, u.body.yaw, burnt ? BURNT : WHITE, !burnt && blink && u.health.hp < 30, u.body.wheelSpin, 0, { pose: burnt ? { y: 0, roll: 0, pitch: 0 } : undefined, livery: "police", health: u.health, driver: u.health.hp > 0 && !u.officers.length ? u.id * 2 : undefined, uniform: UNIFORM });
    }
  }

  // ---------------------------------------------------------------- the chase

  /**
   * Drive every unit and move every officer. `me` is the suspect; `resp` how hard to come
   * for them (null: nobody wanted — everyone stands down).
   */
  tick(dt: number, me: Suspect, resp: Response | null) {
    const now = performance.now();
    let bars = 0;
    for (const u of [...this.units]) {
      if (burnCar(u.health, dt)) this.events.push({ kind: "boom", x: u.body.x, z: u.body.z, yaw: u.body.yaw });
      const d = Math.hypot(u.body.x - me.x, u.body.z - me.z);
      if (u.leaving) u.leaving += dt;
      // Can it see you? One that's been lost behind the buildings for a while is recalled
      // (street.ts sends another down a better street).
      if (!u.leaving && u.health.hp > 0) {
        const ray: Ray = { ox: u.body.x, oy: 1.4, oz: u.body.z, dx: (me.x - u.body.x) / (d || 1), dy: 0, dz: (me.z - u.body.z) / (d || 1) };
        u.blind = d < 6 || this.world.raycast(ray, d) >= d - 1.5 ? 0 : u.blind + dt;
      }
      // Gone once well out of sight (or after a while driving off).
      if ((u.leaving && (d > 110 || u.leaving > 30)) || d > 400 || (u.blind > 14 && d > 50 && !u.officers.length)) {
        this.remove(u);
        continue;
      }
      if (u.health.hp > 0) this.drive(u, dt, me, resp, d);
      // The megaphone, now and then, while it's after you and close.
      if (resp && !u.leaving && u.health.hp > 0 && !u.officers.length && d < 45 && performance.now() > u.talkAt) {
        u.talkAt = performance.now() + 9000 + this.rand() * 6000;
        this.events.push({ kind: "talk", say: "copStop", where: () => (this.units.includes(u) ? { x: u.body.x, y: FLEET[KEY].hgt + 0.5, z: u.body.z } : null) });
      }
      else this.coast(u, dt);
      // Officers get out when the car pulls up near you.
      const alive = u.officers.filter((o) => !o.dead).length;
      if (resp && !u.leaving && u.health.hp > 0 && d < 22 && Math.hypot(u.body.vx, u.body.vz) < 2.5 && alive === 0 && !u.officers.length) this.deploy(u, me);
      for (const o of [...u.officers]) this.officer(o, dt, now, me, resp);
      // Officers who've been dead a while, or left behind, go.
      u.officers = u.officers.filter((o) => {
        const gone = (o.dead && o.since > 30) || (!o.dead && (u.leaving || Math.hypot(o.x - me.x, o.z - me.z) > 70));
        if (gone) o.avatar?.dispose();
        return !gone;
      });
      // The light bar across the roof: the two red lenses take turns, the housing between them stays pale.
      if (!u.health.exploded && bars + 3 <= this.bars.instanceMatrix.count) {
        u.phase += dt * 6;
        const on = Math.sin(u.phase) > 0, chasing = !!resp && !u.leaving && u.health.hp > 0;
        const f = forward(u.body.yaw), rx = -f.fz, rz = f.fx, top = FLEET[KEY].hgt + BAR.hgt / 2 + 0.015;
        this.q.setFromAxisAngle(Y, u.body.yaw);
        for (const side of [-1, 0, 1]) {
          const off = side * (BAR.mid + BAR.lens) / 2;
          this.m.compose(this.p.set(u.body.x + rx * off - f.fx * 0.12, top, u.body.z + rz * off - f.fz * 0.12), this.q, this.sv.set(side ? BAR.lens : BAR.mid, side ? 1 : 0.8, side ? 1 : 0.9));
          this.bars.setMatrixAt(bars, this.m);
          const lit = chasing && (side < 0 ? on : !on);
          if (side) this.bars.setColorAt(bars, this.c.setRGB(lit ? 7 : 0.75, lit ? 0.5 : 0.05, lit ? 0.4 : 0.04));
          else this.bars.setColorAt(bars, this.c.setRGB(0.8, 0.82, 0.85));
          bars++;
        }
      }
    }
    this.bars.count = bars;
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
  }

  /** One patrol car: at you (rammed from two stars), round walls, out of dead ends. */
  private drive(u: Unit, dt: number, me: Suspect, resp: Response | null, d: number) {
    const b = u.body;
    const c = { gas: 0, brake: 0, steer: 0, hand: false, lift: 0 };
    // Where to go: at you (aiming a little ahead), or away when leaving.
    const lead = u.leaving ? 0 : Math.min(1.2, d / 25);
    const tx = me.x + me.vx * lead, tz = me.z + me.vz * lead;
    let want = Math.atan2(-(tx - b.x), -(tz - b.z));
    // Standing down: away from you.
    if (u.leaving) want = Math.atan2(-(b.x - me.x), -(b.z - me.z));
    const f = forward(b.yaw);
    // Whiskers: a wall ahead turns it toward the open side.
    const look = 5 + Math.abs(b.speed) * 0.6;
    const blocked = (a: number) => {
      const g = forward(b.yaw + a);
      return !!this.world.collide(b.x + g.fx * look, b.z + g.fz * look, 1.1, 0, 1.5).hit;
    };
    if (!u.leaving && blocked(0)) want = blocked(0.55) ? (blocked(-0.55) ? want : b.yaw - 0.9) : b.yaw + 0.9;
    let err = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
    // They ram a car, never a person on foot (they pull up short and get out instead).
    const ram = !!resp?.ram && !me.down && me.inCar;
    if (u.reverse > 0) {
      u.reverse -= dt;
      c.brake = 1;
      c.steer = -Math.sign(err || 1);
    } else {
      c.steer = Math.max(-1, Math.min(1, err * 2));
      // Pull up short of you: braking in time from the speed it's doing.
      const stop = 7 + (b.speed * b.speed) / 24;
      if (u.leaving) c.gas = 0.6;
      else if (ram) c.gas = d > 3 ? 1 : 0.3;
      else if (d > stop + 8) c.gas = 1;
      else if (d > stop) c.gas = 0.4;
      else c.brake = b.speed > 0.5 ? 1 : 0;
      // Behind it and close: a three-point turn beats circling.
      if (!u.leaving && Math.abs(err) > 2.2 && d < 18) (c.gas = 0), (c.brake = 1), (c.steer = -Math.sign(err));
      // Stuck: back out a little the other way.
      const fwd = b.vx * f.fx + b.vz * f.fz;
      if (c.gas > 0 && Math.abs(fwd) < 0.8) u.stuck += dt;
      else u.stuck = Math.max(0, u.stuck - dt * 2);
      if (u.stuck > 1.3) (u.stuck = 0), (u.reverse = 1.1);
    }
    const maxV = 24 * (resp ? 1 : 0.6) * (u.health.hp < 40 ? 0.7 : 1);
    stepGround(b, DEF, c, dt, maxV);
    // Shoves from crashes fade out.
    b.vx += u.push.vx;
    b.vz += u.push.vz;
    b.yaw += u.push.spin * dt;
    const k = Math.exp(-dt * 4);
    u.push.vx *= k;
    u.push.vz *= k;
    u.push.spin *= k;
    this.move(u, dt);
    err = 0;
  }

  /** A wrecked or burning car rolls to a stop. */
  private coast(u: Unit, dt: number) {
    const b = u.body;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.01) {
      const k = Math.max(0, sp - 6 * dt) / sp;
      b.vx *= k;
      b.vz *= k;
    }
    this.move(u, dt);
  }

  /** Move with the walls, the traffic, the other patrol cars and your car in the way (and the wheels turning). */
  private move(u: Unit, dt: number) {
    const b = u.body;
    let nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
    const f = forward(b.yaw);
    const bounce = (hx: number, hz: number) => {
      const into = b.vx * hx + b.vz * hz;
      if (into >= 0) return;
      b.vx -= into * hx * 1.2;
      b.vz -= into * hz * 1.2;
    };
    for (const off of [1.3, -1.3])
      for (const w of [this.world, this.obstacles]) {
        const r = w.collide(nx + f.fx * off, nz + f.fz * off, DEF.radius, 0, 1.5);
        if (!r.hit) continue;
        nx = r.x - f.fx * off;
        nz = r.z - f.fz * off;
        bounce(r.hit.nx, r.hit.nz);
      }
    // Circles against the other patrol cars and against yours (that's a ram).
    const circles = [...this.units.filter((o) => o !== u).map((o) => ({ x: o.body.x, z: o.body.z, r: DEF.radius, me: false })), ...(this.myCar ? [{ ...this.myCar, me: true }] : [])];
    for (const o of circles) {
      const dx = nx - o.x, dz = nz - o.z, dd = Math.hypot(dx, dz), min = DEF.radius + o.r + 0.4;
      if (dd >= min || dd < 1e-3) continue;
      nx = o.x + (dx / dd) * min;
      nz = o.z + (dz / dd) * min;
      if (o.me) {
        const rel = (b.vx - this.myCar!.vx) * (-dx / dd) + (b.vz - this.myCar!.vz) * (-dz / dd);
        if (rel > 1.5) this.events.push({ kind: "ram", unit: u, into: rel, x: o.x, z: o.z, nx: -dx / dd, nz: -dz / dd });
      }
      bounce(dx / dd, dz / dd);
    }
    b.x = nx;
    b.z = nz;
    b.speed = Math.hypot(b.vx, b.vz);
    b.wheelSpin += ((b.vx * f.fx + b.vz * f.fz) / 0.32) * dt;
    u.idle = b.speed < 0.3 ? u.idle + dt : 0;
  }

  /** Fold a patrol car's bodywork in where (`at`) it was hit. */
  private dent(u: Unit, at: { x: number; z: number; depth: number }) {
    dentCar(u.health, localHit(u.body.x, u.body.z, u.body.yaw, at.x, at.z, FLEET[KEY].len, FLEET[KEY].wid), at.depth);
  }

  /** A car-to-car hit (traffic.ts crashes): its change of speed (m/s) and spin, the damage, and where it struck (the dent). */
  shove(u: Unit, dvx: number, dvz: number, spin: number, dmg: number, at?: { x: number; z: number; depth: number }) {
    // Added to the body every frame while it fades (×4/s), so a tenth of it adds up to about the hit.
    u.push.vx += dvx * 0.1;
    u.push.vz += dvz * 0.1;
    u.push.spin += spin;
    if (hurtCar(u.health, dmg)) this.events.push({ kind: "fire", x: u.body.x, z: u.body.z });
    if (at) this.dent(u, at);
  }

  /** A car hit this unit: pushed, spun, hurt; `at`: where (else on the side the push came from). */
  bump(u: Unit, vx: number, vz: number, dmg: number, at?: { x: number; z: number; depth?: number }) {
    u.push.vx += vx * 0.08;
    u.push.vz += vz * 0.08;
    u.push.spin += (this.rand() - 0.5) * Math.hypot(vx, vz) * 0.2;
    if (hurtCar(u.health, dmg)) this.events.push({ kind: "fire", x: u.body.x, z: u.body.z });
    const sp = Math.hypot(vx, vz) || 1;
    this.dent(u, { x: at?.x ?? u.body.x - (vx / sp) * 3, z: at?.z ?? u.body.z - (vz / sp) * 3, depth: at?.depth ?? dentDepth(sp) });
  }

  /** A bullet in a patrol car. */
  shootCar(u: Unit, dmg: number, at?: { x: number; y: number; z: number }) {
    if (at) holeCar(u.health, localShot(u.body.x, u.body.z, u.body.yaw, at.x, at.y, at.z, FLEET[KEY].len, FLEET[KEY].wid, FLEET[KEY].hgt));
    if (hurtCar(u.health, dmg)) this.events.push({ kind: "fire", x: u.body.x, z: u.body.z });
  }

  /** A blast: cars thrown and hurt, officers too. `hit(d)` gives damage and push for a distance. */
  blast(x: number, z: number, hit: (d: number) => { damage: number; push: number }, hurt: (d: number) => { damage: number; push: number }) {
    for (const u of this.units) {
      const d = Math.hypot(u.body.x - x, u.body.z - z), h = hit(d);
      if (h.damage <= 0) continue;
      const ax = (u.body.x - x) / (d || 1), az = (u.body.z - z) / (d || 1);
      this.bump(u, ax * h.push * 10, az * h.push * 10, h.damage, { x, z, depth: Math.min(0.36, h.damage * 0.004) });
      for (const o of u.officers) {
        const od = Math.hypot(o.x - x, o.z - z), oh = hurt(od);
        if (oh.damage > 0) this.hurtOfficer(o, oh.damage);
      }
    }
  }

  /** Damaged patrol cars, to smoke and burn like the rest. */
  damaged() {
    return this.units.flatMap((u) => {
      const look = carLook(u.health.hp, u.health.exploded);
      if (look === "ok" || look === "dented") return [];
      const f = forward(u.body.yaw), front = u.health.exploded ? 0 : FLEET[KEY].len * 0.32;
      return [{ x: u.body.x + f.fx * front, y: FLEET[KEY].hgt * 0.75, z: u.body.z + f.fz * front, look, burnT: u.health.burn }];
    });
  }

  // ---------------------------------------------------------------- officers

  private deploy(u: Unit, me: Suspect) {
    // Nobody gets out until the officers' model is in (an invisible officer can't shoot you).
    if (!this.soldier) return;
    const total = this.units.reduce((n, x) => n + x.officers.filter((o) => !o.dead).length, 0);
    const max = this.lite ? 3 : OFFICERS_MAX;
    const f = forward(u.body.yaw), rx = -f.fz, rz = f.fx;
    for (const side of [-1, 1]) {
      if (total + u.officers.length >= max) break;
      const x = u.body.x + rx * side * 1.6, z = u.body.z + rz * side * 1.6;
      const c = this.world.collide(x, z, 0.4, 0, 1.7);
      // (A moment to get out and draw before the first shot.)
      const o: Officer = { id: nextId++, unit: u, avatar: null, x: c.x, z: c.z, yaw: Math.atan2(-(me.x - c.x), -(me.z - c.z)), vx: 0, vz: 0, hp: 100, dead: false, since: 0, next: performance.now() + 1500 + this.rand() * 1000, flash: 0 };
      if (this.soldier) {
        o.avatar = new Avatar(this.soldier, UNIFORM, ACCENT, this.shadows);
        o.avatar.setWeapon("pistol");
        this.scene.add(o.avatar.group);
      }
      u.officers.push(o);
    }
    // The first one out shouts the orders.
    const first = u.officers.find((o) => !o.dead);
    if (first) this.events.push({ kind: "talk", say: "copHands", where: () => (first.dead ? null : { x: first.x, y: 1.8, z: first.z }) });
  }

  private officer(o: Officer, dt: number, now: number, me: Suspect, resp: Response | null) {
    if (o.dead) {
      o.since += dt;
      o.vx = o.vz = 0;
    } else {
      const dx = me.x - o.x, dz = me.z - o.z, d = Math.hypot(dx, dz);
      const shootMe = !!resp && !me.down && ((me.onFoot && resp.shoot) || (me.inCar && resp.shootCars));
      // On foot: close in to arrest, or to a pistol's comfortable range to shoot. A car they
      // shoot from where they stand; otherwise they wait by their own.
      const stopAt = shootMe ? (me.onFoot ? 9 : 16) : me.onFoot ? 1.4 : 5;
      const run = !!resp && d > stopAt;
      const sp = run ? (d > 12 ? 4.6 : 2.4) : 0;
      o.vx = run ? (dx / d) * sp : 0;
      o.vz = run ? (dz / d) * sp : 0;
      if (run) {
        const c = this.world.collide(o.x + o.vx * dt, o.z + o.vz * dt, 0.35, 0, 1.7);
        o.x = c.x;
        o.z = c.z;
      }
      const yaw = Math.atan2(-dx, -dz);
      o.yaw += Math.atan2(Math.sin(yaw - o.yaw), Math.cos(yaw - o.yaw)) * Math.min(1, dt * 8);
      // Fire when in range and they can see you (a wall in the way, they hold).
      if (shootMe && d < 38 && now >= o.next) {
        o.next = now + 650 + this.rand() * 500;
        const ty = me.onFoot ? 1.2 : 0.9;
        const ray: Ray = { ox: o.x, oy: 1.45, oz: o.z, dx: dx / d, dy: (ty - 1.45) / d, dz: dz / d };
        if (this.world.raycast(ray, d) >= d - 0.5) {
          const speed = Math.hypot(me.vx, me.vz);
          const p = Math.max(0.1, Math.min(0.55, 0.6 - d / 45 - speed / 30));
          const hit = this.rand() < p;
          // A miss goes a little wide.
          const off = hit ? 0 : 0.8 + this.rand() * 1.5, side = this.rand() < 0.5 ? -1 : 1;
          this.events.push({ kind: "shot", at: o, hit, x: o.x, z: o.z, tx: me.x + (-dz / d) * off * side, ty: ty + (hit ? 0 : this.rand() - 0.3), tz: me.z + (dx / d) * off * side, onCar: me.inCar });
          o.flash = 0.06;
        }
      }
    }
    o.flash = Math.max(0, o.flash - dt);
    if (o.avatar) {
      o.avatar.group.position.set(o.x, 0, o.z);
      o.avatar.update(dt, { vx: o.vx, vz: o.vz, yaw: o.yaw, pitch: 0, crouch: false, air: false, dead: o.dead }, Math.hypot(o.x - me.x, o.z - me.z));
    } else if (this.soldier && !o.dead) {
      o.avatar = new Avatar(this.soldier, UNIFORM, ACCENT, this.shadows);
      o.avatar.setWeapon("pistol");
      this.scene.add(o.avatar.group);
    }
  }

  /** Where an officer's gun is (for the flash and the tracer). */
  muzzle(o: Officer, out: THREE.Vector3) {
    if (o.avatar) return o.avatar.muzzle(out);
    return out.set(o.x, 1.4, o.z);
  }

  /** The nearest standing officer a bullet meets within `maxT` m. */
  rayOfficer(r: Ray, maxT: number): { o: Officer; t: number; zone: "head" | "body" | "legs" } | null {
    let best: { o: Officer; t: number; zone: "head" | "body" | "legs" } | null = null;
    for (const u of this.units)
      for (const o of u.officers) {
        if (o.dead) continue;
        const hit = rayPlayer(r, o.x, 0, o.z, false);
        if (hit && hit.t < (best?.t ?? maxT)) best = { o, t: hit.t, zone: hit.zone };
      }
    return best;
  }

  /** An officer hit for `dmg`: true if it killed them. */
  hurtOfficer(o: Officer, dmg: number) {
    if (o.dead) return false;
    o.hp -= dmg;
    if (o.hp > 0) return false;
    o.dead = true;
    o.since = 0;
    return true;
  }

  /** Any officer or patrol car with a clear view of (x, z) within reach. */
  sees(x: number, z: number) {
    for (const u of this.units) {
      if (u.leaving || u.health.hp <= 0) continue;
      const eyes = [{ x: u.body.x, z: u.body.z, reach: 75 }, ...u.officers.filter((o) => !o.dead).map((o) => ({ x: o.x, z: o.z, reach: 60 }))];
      for (const e of eyes) {
        const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
        if (d > e.reach) continue;
        if (d < 4) return true;
        const ray: Ray = { ox: e.x, oy: 1.5, oz: e.z, dx: dx / d, dy: 0, dz: dz / d };
        if (this.world.raycast(ray, d) >= d - 1) return true;
      }
    }
    return false;
  }

  /** An officer (on foot) within `r` m of x, z, or a patrol car within `car` m. */
  beside(x: number, z: number, r: number, car: number) {
    for (const u of this.units) {
      if (u.leaving) continue;
      if (u.health.hp > 0 && Math.hypot(u.body.x - x, u.body.z - z) < car) return true;
      for (const o of u.officers) if (!o.dead && Math.hypot(o.x - x, o.z - z) < r) return true;
    }
    return false;
  }

  /** The nearest patrol car's distance (for the siren), Infinity without one. */
  nearest(x: number, z: number) {
    let best = Infinity;
    for (const u of this.units) if (!u.leaving && u.health.hp > 0) best = Math.min(best, Math.hypot(u.body.x - x, u.body.z - z));
    return best;
  }

  /** Where the nearest patrol car is (the siren is heard from there), null without one. */
  nearestAt(x: number, z: number): { x: number; y: number; z: number } | null {
    let best = Infinity, at: Unit | null = null;
    for (const u of this.units) {
      const d = Math.hypot(u.body.x - x, u.body.z - z);
      if (!u.leaving && u.health.hp > 0 && d < best) (best = d), (at = u);
    }
    return at ? { x: at.body.x, y: 1.6, z: at.body.z } : null;
  }

  private remove(u: Unit) {
    for (const o of u.officers) o.avatar?.dispose();
    this.units.splice(this.units.indexOf(u), 1);
  }

  /** Everyone gone at once (a match starting, drive mode closing). */
  clear() {
    for (const u of [...this.units]) this.remove(u);
    this.bars.count = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.bars);
    this.bars.geometry.dispose();
    (this.bars.material as THREE.Material).dispose();
  }
}

const Y = new THREE.Vector3(0, 1, 0);
