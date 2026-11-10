"use client";
// Live traffic in the 3D city (lib/traffic.ts, server/traffic.ts):
//  - TrafficFeed: speeds on the streets around us from /api/traffic, every 30 s;
//  - the minimap's street colours (green flowing … dark red standstill);
//  - TrafficCars: the cars of Iran's streets (Prides, Peugeots, Samands, Peykans, yellow
//    taxis, blue Zamyad pickups, delivery bikes, city buses on the main roads — lib/
//    fleet.ts) driving the real streets, on the right, at the live speed of the street
//    they're on (the usual city speed where there's no reading), more of them where it's
//    jammed. They follow each other bumper to bumper, stop at red lights, brake for you
//    and are solid; bikes ride by the kerb and lean into the corners. Rows of parked cars
//    line the kerbs (lib/parking.ts) and the traffic keeps to what they leave free.
//    Crashes are real (lib/street/damage.ts): a car you ram (or a blast throws) leaves its
//    lane and slides to a stop with its hazards flashing, dented, smoking, maybe burning
//    and then exploding; bullets hurt it too; the traffic behind honks and pulls round
//    the wreck; drivers near trouble floor it through the lights. Drawn
//    instanced, per model (fleet3d.ts).
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import type { LatLng } from "@/lib/geo";
import { congestion, CONGESTION_COLORS, dirOf, FREE_KMH, signalPhase, trafficCell, type TrafficCellOut } from "@/lib/traffic";
import { FLEET, heavy, pickFleet, pickPaint, roomBetween, type FleetKey } from "@/lib/fleet";
import { contact, felt, massOf, resolve, type Contact, type Rigid } from "@/lib/street/carPhysics";
import { carToTake } from "@/lib/vehicles";
import { hashStr, rng } from "@/lib/geo";
import { Junctions, laneOffset, parkedRow, parkingSides, type Parked, type Sides, type Street } from "@/lib/parking";
import { burnCar, carLook, crashDamage, dentCar, dentDepth, freshCar, holeCar, hurtCar, localHit, localShot, type CarHealth, type CarLook } from "@/lib/street/damage";
import { rayFootprint, type Ray } from "@/lib/arena/geom";
import { api } from "../game/client";
import { FleetInstances } from "./fleet3d";
import type { CollisionWorld } from "./physics";
import { box, type Footprint } from "./tileMesh";
import type { TileMeshes, Style } from "./world3d";

const POLL_MS = 30_000;

export class TrafficFeed {
  /** Bumps whenever new readings arrive (colours are recomputed then). */
  version = 0;
  neshan = "off";
  private grid = new Map<string, TrafficCellOut[]>();
  private at = 0;
  private from: LatLng | null = null;
  private busy = false;

  /** Poll around `p` every 30 s, or sooner after moving ~700 m. */
  update(p: LatLng) {
    const now = Date.now();
    const moved = this.from ? Math.hypot((p.lat - this.from.lat) * 110_540, (p.lng - this.from.lng) * 90_000) : Infinity;
    if (this.busy || (now - this.at < POLL_MS && moved < 700)) return;
    this.busy = true;
    this.at = now;
    this.from = p;
    api<{ cells: TrafficCellOut[]; neshan: string }>(`/api/traffic?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}`)
      .then((r) => {
        this.grid.clear();
        for (const c of r.cells) {
          const { ty, tx } = trafficCell({ lat: c[0], lng: c[1] }), k = `${ty}_${tx}`;
          const l = this.grid.get(k);
          if (l) l.push(c);
          else this.grid.set(k, [c]);
        }
        this.neshan = r.neshan;
        this.version++;
      })
      .catch(() => {})
      .finally(() => (this.busy = false));
  }

  get empty() {
    return this.grid.size === 0;
  }

  /** Live km/h for travel at bearing `deg` near a point (`both`: either way, the slower), or null. */
  speedAt(p: LatLng, deg: number, both = false): number | null {
    if (!this.grid.size) return null;
    const { ty, tx } = trafficCell(p), d = dirOf(deg);
    let best: number | null = null;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const c of this.grid.get(`${ty + i}_${tx + j}`) ?? []) {
          const diff = Math.min((c[2] - d + 8) % 8, (d - c[2] + 8) % 8);
          if (diff > 1 && !(both && diff >= 3)) continue;
          if (Math.hypot((c[0] - p.lat) * 110_540, (c[1] - p.lng) * 90_000) > 45) continue;
          best = best == null ? c[3] : Math.min(best, c[3]);
        }
    return best;
  }
}

/** Bearing (degrees from north) of travel from (x0, z0) to (x1, z1) in the local frame. */
const degOf = (x0: number, z0: number, x1: number, z1: number) => ((Math.atan2(x1 - x0, -(z1 - z0)) * 180) / Math.PI + 360) % 360;

/**
 * The minimap colour of each segment of a street line (null: no reading there), cached
 * per line until new readings come in.
 */
export function lineColors(feed: TrafficFeed, frame: Frame, line: Float32Array, kind: string, cache: WeakMap<Float32Array, { v: number; c: (string | null)[] }>) {
  const hit = cache.get(line);
  if (hit && hit.v === feed.version) return hit.c;
  const c: (string | null)[] = [];
  const free = FREE_KMH[kind as keyof typeof FREE_KMH] ?? FREE_KMH.minor;
  for (let i = 0; i + 3 < line.length; i += 2) {
    if (feed.empty) {
      c.push(null);
      continue;
    }
    const mid = frame.toLatLng((line[i] + line[i + 2]) / 2, (line[i + 1] + line[i + 3]) / 2);
    const kmh = feed.speedAt(mid, degOf(line[i], line[i + 1], line[i + 2], line[i + 3]), true);
    c.push(kmh == null ? null : CONGESTION_COLORS[congestion(kmh, free)]);
  }
  cache.set(line, { v: feed.version, c });
  return c;
}

// ---------------------------------------------------------------- the cars
type Road = { line: Float32Array; w: number; kind: "major" | "minor"; park: Sides };
/** Knocked off its lane (a crash, a blast): it slides, spins and maybe flies, then stays put. */
type Loose = { vx: number; vz: number; spin: number; y: number; vy: number; roll: number; pitch: number; rollV: number; pitchV: number };
type Car = {
  id: number;
  /** Which of Iran's street models (lib/fleet.ts), in what paint. */
  kind: FleetKey;
  paint: string;
  color: THREE.Color;
  road: Road;
  /** Segment index and metres along it; `dir` +1 runs with the line's points, −1 against. */
  seg: number;
  along: number;
  dir: 1 | -1;
  v: number;
  want: number;
  x: number;
  z: number;
  yaw: number;
  spin: number;
  lean: number;
  mood: number;
  health: CarHealth;
  loose: Loose | null;
  /** Seconds left with the hazard lamps flashing (and the horn going). */
  upset: number;
  /** Seconds left driving scared: fast, through red lights. */
  panic: number;
  /** Seconds it has waited behind something that won't move; then it pulls out round it. */
  stuck: number;
  swerve: number;
  /** Seconds since it last drove (a wreck is cleared after a while, out of sight). */
  idle: number;
  /** Knocked loose from the kerb (not one that was driving). */
  parked: boolean;
};

/**
 * Something the street life layer draws or plays: a car catching fire, blowing up, a horn,
 * two cars meeting (`into`: how hard, m/s).
 */
export type TrafficEvent = { kind: "fire" | "boom" | "honk" | "crash" | "alarm"; x: number; z: number; key: FleetKey; ref: CarRef; into?: number };

/** What a car-to-car hit did to something that isn't traffic (a patrol car, your car). */
export type SolidHit = { dvx: number; dvz: number; spin: number; felt: number; x: number; z: number; nx: number; nz: number };
/**
 * Something solid on the street that isn't traffic but takes part in the crashes: a
 * patrol car, your car. `moving`: it can set one off (a patrol car at speed); it isn't
 * moved here — it's told what it took (`hit`) and its own physics carries on from there.
 */
export type Solid = { x: number; z: number; yaw: number; vx: number; vz: number; len: number; wid: number; mass: number; moving: boolean; hit: (h: SolidHit) => void };

/** One body in this frame's crashes: a traffic car, a parked one, or a solid; `mover` can set one off. */
type Crasher = { r: Rigid; car?: Car; parked?: Parked & { color: THREE.Color; box: Footprint }; solid?: Solid; mover: boolean };

/** A driving or parked car comes off its lane / the kerb when a hit changes its speed by more than this (m/s). */
const DISLODGE_MS = 1.2;
/** Car-to-car hits at least this hard (m/s) are heard and seen (sparks). */
const CRASH_FX_MS = 2.5;
/** A loose car this high (m) flies over the cars below it. */
const FLY_OVER_M = 1;
/** A car hit by something (the footprint's `ref`): a driving one, or a parked one. */
export type CarRef = object;

const SPAWN_MIN = 70, SPAWN_MAX = 240, DROP = 320;
/** The gap a driver keeps to what's ahead, bumper to bumper (m). */
const KEEP_M = 2.5;
/** You, as the cars around see you: about a car's length. */
const YOU_LEN = 4.4;
/** Parked cars are drawn this close to you, the nearest first (and as many at most). */
const PARKED_M = 190, PARKED_MAX = 96, PARKED_LITE_M = 110, PARKED_LITE_MAX = 32;
/**
 * What's ahead of the camera counts as this much nearer when the parked cars to draw are
 * picked: the row down the street you're looking along is there long before you reach it
 * (nothing appears in front of you), paid for with the ones behind your back. Everything
 * within PARKED_NEAR_M is drawn (and solid) whichever way you look.
 */
const PARKED_AHEAD = 0.5, PARKED_NEAR_M = 45;
/**
 * Traffic never joins where you'd see it happen: a spot in front of the camera and nearer
 * than this (m) is only used when buildings hide it. Behind you, or further off, a car
 * that appears is one that drove up.
 */
const SPAWN_SEEN_M = 170;
/** How wide "in front of the camera" is: the cosine of the angle off its line of sight. */
const VIEW_COS = 0.35;

/** Where the camera is and which way it looks along the ground (a unit vector). */
export type TrafficView = { x: number; z: number; dx: number; dz: number };
/** How much of the kerb parked cars take: an avenue's slow lane is mostly kept moving. */
const PARK_FILL = { major: 0.3, minor: 0.55 };
/** Cars you got out of and left at the kerb (the oldest drive off after this many). */
const LEFT_MAX = 12;
/** A wreck out of sight this long (s) is towed away. */
const WRECK_S = 75;
/** Burnt-out paint. */
const BURNT = new THREE.Color("#17140f");
/** A parked car's spot, to know it again when the streets are re-read (to 0.5 m). */
const spotOf = (x: number, z: number) => `${Math.round(x * 2)}_${Math.round(z * 2)}`;
let nextId = 1;

export class TrafficCars {
  private cars: Car[] = [];
  private roads: Road[] = [];
  /** Line ends, for turning onto the next street: grid cell → [road, which end]. */
  private ends = new Map<string, { road: Road; end: 0 | 1 }[]>();
  /** Traffic lights by 16 m grid cell. */
  private lights = new Map<string, { x: number; z: number; ns: boolean }[]>();
  private known = new WeakSet<TileMeshes>();
  private meshCount = -1;
  private rand = Math.random;
  /** Every car is drawn by model, instanced: a handful of draw calls for the whole street. */
  private fleet: FleetInstances;
  /** Every parked car on the streets loaded, and the ones near you that are drawn. */
  private parked: (Parked & { color: THREE.Color })[] = [];
  private shown: (Parked & { color: THREE.Color; box: Footprint })[] = [];
  private shownAt = { x: Infinity, z: Infinity, dx: 0, dz: 0 };
  /** The camera this frame (null: unknown — everything counts as in sight). */
  private view: TrafficView | null = null;
  /** Parked cars you drove off in (they stay gone when the streets are re-read), and the ones you left. */
  private taken = new Set<string>();
  private left: (Parked & { color: THREE.Color })[] = [];
  /**
   * Parked cars knocked off the kerb, by the handle (footprint ref) each had while parked:
   * whoever still holds that handle — this frame's footprints, a crash already under way —
   * gets the one loose car it became, never a second one.
   */
  private offKerb = new WeakMap<object, Car>();
  /** This frame's outlines, with what each one is (for bullets). */
  private boxes: { f: Footprint; ref: CarRef }[] = [];
  enabled = true;
  /** The buildings, for cars knocked loose to slide into. */
  world: CollisionWorld | null = null;
  /** Patrol cars and yours, this frame: loose cars crash into them too (street.ts). */
  solids: (() => Solid[]) | null = null;
  /** Other things on the road the traffic queues behind and steers round (police cars). */
  blockers: { x: number; z: number }[] = [];
  /** Drawn with the traffic, in the same instanced meshes (the police cars). */
  extra: ((put: FleetInstances["put"]) => void) | null = null;
  /** Fires, explosions and horns since the last time they were read. */
  events: TrafficEvent[] = [];

  constructor(private scene: THREE.Scene, private frame: Frame, private feed: TrafficFeed, style: Style, private lite: boolean, look: { clearcoat?: boolean } = {}) {
    this.fleet = new FleetInstances(scene, style, lite, look);
  }

  /** The streets cars can use: re-read when tiles come and go. */
  sync(meshes: TileMeshes[]) {
    if (meshes.length === this.meshCount && meshes.every((m) => this.known.has(m))) return;
    this.meshCount = meshes.length;
    this.known = new WeakSet(meshes);
    this.roads = [];
    this.ends.clear();
    this.lights.clear();
    for (const m of meshes)
      for (const l of m.signals) {
        const key = `${Math.floor(l.x / 16)}_${Math.floor(l.z / 16)}`;
        const list = this.lights.get(key);
        if (list) list.push(l);
        else this.lights.set(key, [l]);
      }
    // Junctions, for the gaps in the rows of parked cars: every street's segments.
    const streets: Street[] = [];
    for (const m of meshes)
      m.roads.forEach((line, i) => {
        const k = m.roadKinds[i];
        if ((k === "major" || k === "minor" || k === "path") && m.roadDrawn[i]) streets.push({ line, w: m.roadWidths[i] });
      });
    const junctions = new Junctions(streets);
    this.parked = [];
    for (const m of meshes)
      m.roads.forEach((line, i) => {
        const k = m.roadKinds[i];
        if ((k !== "major" && k !== "minor") || !m.roadDrawn[i] || line.length < 4) return;
        const at = this.frame.toLatLng(line[0], line[1]), seed = hashStr(`park|${at.lat.toFixed(5)}|${at.lng.toFixed(5)}|${line.length}`);
        const r: Road = { line, w: m.roadWidths[i], kind: k, park: parkingSides(m.roadWidths[i], seed) };
        // Not on a junction (clear of every other street) nor by a traffic light.
        const free = (x: number, z: number) => {
          if (!junctions.clear(x, z, line)) return false;
          for (let a = -1; a <= 1; a++)
            for (let b = -1; b <= 1; b++)
              if (this.lights.get(`${Math.floor(x / 16) + a}_${Math.floor(z / 16) + b}`)?.some((l) => Math.hypot(l.x - x, l.z - z) < 12)) return false;
          return true;
        };
        const rand = rng(seed);
        r.park.forEach((on, s) => {
          if (!on) return;
          for (const p of parkedRow(line, r.w, s ? -1 : 1, rand, free, k === "major" ? PARK_FILL.major : PARK_FILL.minor))
            if (!this.taken.has(spotOf(p.x, p.z))) this.parked.push({ ...p, color: new THREE.Color(p.paint) });
        });
        this.roads.push(r);
        for (const end of [0, 1] as const) {
          const x = line[end ? line.length - 2 : 0], z = line[end ? line.length - 1 : 1];
          const key = `${Math.floor(x / 8)}_${Math.floor(z / 8)}`;
          const l = this.ends.get(key);
          if (l) l.push({ road: r, end });
          else this.ends.set(key, [{ road: r, end }]);
        }
      });
    this.parked.push(...this.left);
    // Cars on streets that were dropped go too (loose ones aren't on a street any more).
    const alive = new Set(this.roads.map((r) => r.line));
    this.cars = this.cars.filter((c) => c.loose || alive.has(c.road.line));
    this.shownAt.x = Infinity;
  }

  /** The parked cars near you (the nearest, up to a cap), picked again every few metres. */
  private nearParked(px: number, pz: number) {
    const v = this.view, at = this.shownAt;
    // Picked again every few metres, and when the camera has turned a good way round.
    if (Math.hypot(px - at.x, pz - at.z) < 8 && (!v || v.dx * at.dx + v.dz * at.dz > 0.9)) return this.shown;
    this.shownAt = { x: px, z: pz, dx: v?.dx ?? 0, dz: v?.dz ?? 0 };
    const reach = this.lite ? PARKED_LITE_M : PARKED_M, max = this.lite ? PARKED_LITE_MAX : PARKED_MAX;
    // The cars already drawn keep their handle (footprints and crashes under way point at it).
    const had = new Map(this.shown.map((s) => [spotOf(s.x, s.z), s]));
    this.shown = this.parked
      .map((p) => {
        const d = Math.hypot(p.x - px, p.z - pz);
        const ahead = !!v && d > PARKED_NEAR_M && ((p.x - v.x) * v.dx + (p.z - v.z) * v.dz) / (Math.hypot(p.x - v.x, p.z - v.z) || 1) > VIEW_COS;
        return { p, d, rank: ahead ? d * PARKED_AHEAD : d };
      })
      .filter((o) => o.d < reach)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, max)
      .map(({ p }) => {
        const old = had.get(spotOf(p.x, p.z));
        if (old && old.key === p.key) return old;
        const s = { ...p, box: box(p.x, p.z, FLEET[p.key].wid / 2 + 0.05, FLEET[p.key].len / 2, p.yaw, FLEET[p.key].hgt) };
        s.box.ref = s;
        return s;
      });
    return this.shown;
  }

  /** Would a car appearing at (x, z) be seen to? In front of the camera, near, and no building in the way. */
  private inSight(x: number, z: number) {
    const v = this.view;
    if (!v) return false;
    const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz) || 1;
    if (d > SPAWN_SEEN_M || (dx * v.dx + dz * v.dz) / d < VIEW_COS) return false;
    // A head-high line from the camera to the spot: walls in the way hide it.
    return !this.world || this.world.raycast({ ox: v.x, oy: 1.6, oz: v.z, dx: dx / d, dy: 0, dz: dz / d }, d) >= d - 3;
  }

  /** How many cars around here: more where the readings say it's jammed. */
  private target(px: number, pz: number) {
    let base = this.lite ? 8 : 18;
    if (!this.feed.empty) {
      let slow = 0, n = 0;
      for (const c of this.cars) {
        if (c.loose) continue;
        const kmh = this.feed.speedAt(this.frame.toLatLng(c.x, c.z), (-c.yaw * 180) / Math.PI);
        if (kmh != null) (n++, (slow += congestion(kmh, FREE_KMH[c.road.kind])));
      }
      if (n) base = Math.round(base * (1 + (slow / n) * 0.5));
    }
    const near = this.roads.filter((r) => Math.hypot(r.line[0] - px, r.line[1] - pz) < SPAWN_MAX).length;
    return Math.min(base, near * 2);
  }

  private make(kind: FleetKey, paint: string, road: Road, x: number, z: number, yaw: number): Car {
    // Bikes ride quicker than the cars round them (and buses and trucks slower).
    const mood = (FLEET[kind].bike ? 1.05 : heavy(kind) ? 0.8 : 0.85) + this.rand() * 0.25;
    return { id: nextId++, kind, paint, color: new THREE.Color(paint), road, seg: 0, along: 0, dir: 1, v: 0, want: 0, x, z, yaw, spin: 0, lean: 0, mood, health: freshCar(), loose: null, upset: 0, panic: 0, stuck: 0, swerve: 0, idle: 0, parked: false };
  }

  private spawn(px: number, pz: number) {
    for (let tries = 0; tries < 12; tries++) {
      const road = this.roads[Math.floor(this.rand() * this.roads.length)];
      if (!road) return;
      const n = road.line.length / 2 - 1, seg = Math.floor(this.rand() * n);
      const x = road.line[seg * 2], z = road.line[seg * 2 + 1], d = Math.hypot(x - px, z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX || this.inSight(x, z)) continue;
      const kind = pickFleet(this.rand, road.kind === "major");
      const c = this.make(kind, pickPaint(kind, this.rand), road, x, z, 0);
      c.seg = seg;
      c.dir = road.w < 7 && this.rand() < 0.5 ? -1 : this.rand() < 0.5 ? 1 : -1;
      this.cars.push(c);
      return;
    }
  }

  /** The next street from this end (not straight back down the same one), or null. */
  private next(c: Car, x: number, z: number) {
    const opts: { road: Road; end: 0 | 1 }[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const e of this.ends.get(`${Math.floor(x / 8) + i}_${Math.floor(z / 8) + j}`) ?? []) {
          if (e.road === c.road) continue;
          // A bus or minibus keeps to the main roads.
          if (FLEET[c.kind].majorOnly && e.road.kind !== "major") continue;
          const l = e.road.line, ex = l[e.end ? l.length - 2 : 0], ez = l[e.end ? l.length - 1 : 1];
          if (Math.hypot(ex - x, ez - z) < 4) opts.push(e);
        }
    return opts.length ? opts[Math.floor(this.rand() * opts.length)] : null;
  }

  /**
   * Move everyone; returns their footprints (solid while you drive). `view`: the camera,
   * so nothing joins the street or the kerb in front of it.
   */
  tick(dt: number, px: number, pz: number, view: TrafficView | null = null): Footprint[] {
    this.boxes = [];
    this.view = view;
    if (!this.enabled) {
      this.cars = [];
      this.fleet.begin();
      this.fleet.end();
      return [];
    }
    this.cars = this.cars.filter((c) => {
      const d = Math.hypot(c.x - px, c.z - pz);
      // A wreck nobody's looking at is towed away after a while.
      return d <= DROP && !(c.loose && c.idle > WRECK_S && d > 90);
    });
    if (this.cars.reduce((n, c) => n + (c.loose ? 0 : 1), 0) < this.target(px, pz) && this.roads.length) this.spawn(px, pz);
    this.crashes();
    const out: Footprint[] = [];
    const blink = Math.floor(Date.now() / 450) % 2 === 0;
    this.fleet.begin(px, pz);
    for (const c of [...this.cars]) {
      const def = FLEET[c.kind];
      // Burning down: a few seconds, then the blast (street/index.ts draws and hears it).
      if (burnCar(c.health, dt)) {
        this.events.push({ kind: "boom", x: c.x, z: c.z, key: c.kind, ref: c });
        if (!c.loose) this.loosen(c);
        c.loose!.vy = 5 + this.rand() * 2;
        c.loose!.y = Math.max(c.loose!.y, 0.05);
        c.loose!.rollV = (this.rand() - 0.5) * 6;
        c.loose!.pitchV = (this.rand() - 0.5) * 3;
      }
      c.upset = Math.max(0, c.upset - dt);
      c.panic = Math.max(0, c.panic - dt);
      // On fire, the driver stops and runs: it rolls to a halt where it is.
      if (c.health.hp <= 0 && !c.loose) this.loosen(c);
      if (c.upset > 0 && this.rand() < dt * 0.6 && !c.health.exploded && c.health.hp > 0) this.events.push({ kind: "honk", x: c.x, z: c.z, key: c.kind, ref: c });
      if (c.loose) {
        this.slide(c, dt);
        const burnt = c.health.exploded;
        // Still at the wheel while it slides (a parked car knocked loose has nobody in it).
        this.fleet.put(c.kind, c.x, c.z, c.yaw, burnt ? BURNT : c.color, !burnt && c.health.hp > 0 && blink, c.spin, 0, { pose: c.loose, health: c.health, driver: !c.parked && c.health.hp > 0 ? c.id : undefined });
        const f = box(c.x, c.z, def.wid / 2 + 0.05, def.len / 2, c.yaw, def.hgt + c.loose.y);
        f.ref = c;
        out.push(f);
        this.boxes.push({ f, ref: c });
        continue;
      }
      if (!this.drive(c, dt, px, pz)) {
        this.cars.splice(this.cars.indexOf(c), 1);
        continue;
      }
      const braking = c.v > c.want + 0.3 || c.v < 0.5;
      this.fleet.put(c.kind, c.x, c.z, c.yaw, c.color, c.upset > 0 ? blink : braking, c.spin, c.lean, { health: c.health, driver: c.id });
      const f = box(c.x, c.z, def.wid / 2 + 0.05, def.len / 2, c.yaw, def.hgt);
      f.ref = c;
      out.push(f);
      this.boxes.push({ f, ref: c });
    }
    for (const p of this.nearParked(px, pz)) {
      this.fleet.put(p.key, p.x, p.z, p.yaw, p.color, false, 0);
      out.push(p.box);
      this.boxes.push({ f: p.box, ref: p });
    }
    this.extra?.(this.fleet.put.bind(this.fleet));
    this.fleet.end();
    return out;
  }

  /** One car along its lane: live speed, queueing, lights, panic; false when it has driven off the map. */
  private drive(c: Car, dt: number, px: number, pz: number) {
    const def = FLEET[c.kind];
    const L = c.road.line;
    const i0 = c.dir > 0 ? c.seg : c.seg + 1, i1 = c.dir > 0 ? c.seg + 1 : c.seg;
    const ax = L[i0 * 2], az = L[i0 * 2 + 1], bx = L[i1 * 2], bz = L[i1 * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az) || 0.01, fx = (bx - ax) / len, fz = (bz - az) / len;
    // The live speed here, else the usual one for the street (faster when scared); then room
    // ahead (bumper to bumper: a bus needs more of it than a Pride).
    const at = this.frame.toLatLng(c.x, c.z);
    const live = this.feed.speedAt(at, degOf(ax, az, bx, bz));
    let want = ((live ?? FREE_KMH[c.road.kind]) / 3.6) * c.mood * (c.panic > 0 ? 1.6 : 1);
    let room = Infinity;
    /** Room up to something that isn't going anywhere (a wreck, a stopped police car). */
    let still = Infinity;
    for (const o of this.cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx - c.swerve);
      // A bike only queues behind what's in its own strip of road.
      if (ahead > 0 && ahead < 32 && side < (def.bike ? 1.1 : 2.2)) {
        const r = roomBetween(ahead, c.kind, o.kind);
        room = Math.min(room, r);
        if (o.loose) still = Math.min(still, r);
      }
    }
    for (const b of [{ x: px, z: pz }, ...this.blockers]) {
      const dx = b.x - c.x, dz = b.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx - c.swerve);
      if (ahead > 0 && ahead < 32 && side < 2.6) room = Math.min(room, roomBetween(ahead, c.kind, YOU_LEN));
    }
    // A red (or amber, unless already at the line) light on this street, just ahead — a scared driver runs it.
    const ns = Math.abs(fz) > Math.abs(fx), sec = Date.now() / 1000;
    if (c.panic <= 0)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const l of this.lights.get(`${Math.floor((c.x + fx * 12) / 16) + i}_${Math.floor((c.z + fz * 12) / 16) + j}`) ?? []) {
            if (l.ns !== ns) continue;
            const dx = l.x - c.x, dz = l.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
            const ph = signalPhase(sec, ns);
            // Stop with the nose a metre short of the light.
            if (ahead > 2 && ahead < 26 && side < c.road.w / 2 + 6 && (ph === 2 || (ph === 1 && ahead > 6))) room = Math.min(room, ahead - def.len / 2 + 1.5);
          }
    // Stuck behind a wreck: honk, then pull out round it.
    if (still < 9 && c.v < 0.5) {
      c.stuck += dt;
      if (c.stuck > 1.5 && c.stuck - dt <= 1.5) this.events.push({ kind: "honk", x: c.x, z: c.z, key: c.kind, ref: c });
    } else if (still > 14) c.stuck = Math.max(0, c.stuck - dt);
    const out = c.stuck > 2.5 ? -Math.min(3, c.road.w / 2) : 0;
    c.swerve += (out - c.swerve) * Math.min(1, dt * 1.5);
    if (c.swerve < -0.8 && still < 14) room = Math.max(room, Math.min(28, still + 12));
    if (room < 28) want = Math.min(want, Math.max(0, (room - KEEP_M) * 0.8));
    c.want = want;
    c.v += Math.max(-9 * dt, Math.min((heavy(c.kind) ? 1.8 : def.bike ? 3.6 : 3) * (c.panic > 0 ? 1.6 : 1) * dt, want - c.v));
    c.along += c.v * dt;
    // On to the next segment, or the next street at the end of this one.
    while (c.along > len) {
      const last = c.dir > 0 ? c.seg + 1 >= L.length / 2 - 1 : c.seg <= 0;
      if (!last) {
        c.along -= len;
        c.seg += c.dir;
        break;
      }
      const nx = this.next(c, bx, bz);
      if (!nx) return false;
      c.along = 0;
      c.road = nx.road;
      c.dir = nx.end === 0 ? 1 : -1;
      c.seg = nx.end === 0 ? 0 : nx.road.line.length / 2 - 2;
      break;
    }
    // Pose: on the right-hand half of what parked cars leave of the street (all of it on
    // narrow lanes), bikes out by the kerb; out round a wreck while passing it.
    const R = c.road.line, j0 = c.dir > 0 ? c.seg : c.seg + 1, j1 = c.dir > 0 ? c.seg + 1 : c.seg;
    const sx = R[j0 * 2], sz = R[j0 * 2 + 1], ex = R[j1 * 2], ez = R[j1 * 2 + 1];
    const sl = Math.hypot(ex - sx, ez - sz) || 0.01, ux = (ex - sx) / sl, uz = (ez - sz) / sl;
    const k = Math.min(1, c.along / sl);
    const lane = laneOffset(c.road.w, c.road.park, c.dir, def.bike) + c.swerve;
    const tx = sx + (ex - sx) * k + -uz * lane, tz = sz + (ez - sz) * k + ux * lane;
    const yaw = Math.atan2(-ux, -uz);
    // Ease the turn so corners don't snap; a bike leans into it.
    const turn = Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw));
    c.yaw += turn * Math.min(1, dt * (def.bike ? 7 : heavy(c.kind) ? 3.5 : 6));
    if (def.bike) c.lean += (Math.max(-0.4, Math.min(0.4, turn * 1.6)) - c.lean) * Math.min(1, dt * 5);
    c.x = tx;
    c.z = tz;
    c.spin += (c.v / (def.bike ? 0.3 : 0.32)) * dt;
    c.idle = 0;
    return true;
  }

  /** Off its lane: carrying on the way it was going, under its own momentum. */
  private loosen(c: Car) {
    const f = { x: -Math.sin(c.yaw), z: -Math.cos(c.yaw) };
    c.loose = { vx: f.x * c.v, vz: f.z * c.v, spin: 0, y: 0, vy: 0, roll: 0, pitch: 0, rollV: 0, pitchV: 0 };
    c.v = 0;
    c.lean = 0;
    return c.loose;
  }

  /** A loose car: flying (a blast), then sliding to a stop against the tyres' grip and the walls. */
  private slide(c: Car, dt: number) {
    const L = c.loose!;
    if (L.y > 0 || L.vy > 0) {
      L.vy -= 9.8 * dt;
      L.y += L.vy * dt;
      L.roll += L.rollV * dt;
      L.pitch += L.pitchV * dt;
      if (L.y <= 0) {
        // Lands on its wheels or on its roof, whichever is nearer.
        L.y = L.vy = L.rollV = L.pitchV = 0;
        L.roll = Math.cos(L.roll) < 0 ? Math.PI : 0;
        L.pitch = 0;
      }
    }
    const sp = Math.hypot(L.vx, L.vz);
    if (sp > 0.01) {
      const k = Math.max(0, sp - (L.y > 0 ? 0.4 : 7) * dt) / sp;
      L.vx *= k;
      L.vz *= k;
    }
    c.yaw += L.spin * dt;
    L.spin *= Math.exp(-dt * 2.2);
    let nx = c.x + L.vx * dt, nz = c.z + L.vz * dt;
    if (this.world) {
      const def = FLEET[c.kind];
      const hit = this.world.collide(nx, nz, Math.min(def.wid, def.len) / 2 + 0.2, L.y, def.hgt);
      if (hit.hit) {
        const into = L.vx * hit.hit.nx + L.vz * hit.hit.nz;
        if (into < 0) {
          L.vx -= into * hit.hit.nx * 1.4;
          L.vz -= into * hit.hit.nz * 1.4;
          L.spin += into * 0.15 * (this.rand() < 0.5 ? 1 : -1);
          if (hurtCar(c.health, crashDamage(-into, heavy(c.kind) ? 0.4 : 1))) this.events.push({ kind: "fire", x: c.x, z: c.z, key: c.kind, ref: c });
          this.dent(c, c.x - hit.hit.nx * 3, c.z - hit.hit.nz * 3, dentDepth(-into));
        }
        (nx = hit.x), (nz = hit.z);
      }
    }
    c.x = nx;
    c.z = nz;
    c.spin += (sp / 0.32) * dt * 0.3;
    c.idle = sp < 0.2 && L.y <= 0 ? c.idle + dt : 0;
  }

  /**
   * Cars against cars: every loose car (sliding, spinning) and every patrol car at speed is
   * checked against every other car — driving, parked, loose, the police, yours — and the
   * two exchange momentum (lib/street/carPhysics.ts). A driving or parked car hit hard enough
   * comes loose and slides on into the next one: a pile-up runs down the street by itself.
   */
  private crashes() {
    const ps: Crasher[] = [];
    const moving = (r: Rigid) => Math.hypot(r.vx, r.vz) > 0.4 || Math.abs(r.spin) > 0.3;
    for (const c of this.cars) {
      if (c.loose && c.loose.y > FLY_OVER_M) continue;
      const def = FLEET[c.kind];
      const r: Rigid = { x: c.x, z: c.z, yaw: c.yaw, vx: c.loose ? c.loose.vx : -Math.sin(c.yaw) * c.v, vz: c.loose ? c.loose.vz : -Math.cos(c.yaw) * c.v, spin: c.loose?.spin ?? 0, mass: massOf(def), len: def.len, wid: def.wid };
      ps.push({ r, car: c, mover: !!c.loose && moving(r) });
    }
    if (!ps.some((p) => p.mover) && !this.solids) return;
    const solids = this.solids?.() ?? [];
    for (const s of solids) ps.push({ r: { x: s.x, z: s.z, yaw: s.yaw, vx: s.vx, vz: s.vz, spin: 0, mass: s.mass, len: s.len, wid: s.wid }, solid: s, mover: s.moving });
    if (!ps.some((p) => p.mover)) return;
    for (const p of this.shown) {
      const def = FLEET[p.key];
      ps.push({ r: { x: p.x, z: p.z, yaw: p.yaw, vx: 0, vz: 0, spin: 0, mass: massOf(def), len: def.len, wid: def.wid }, parked: p, mover: false });
    }
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (!a.mover) continue;
      for (let j = 0; j < ps.length; j++) {
        const b = ps[j];
        // Each pair once; patrol cars against each other and yours are police.ts's business.
        if (i === j || (b.mover && j < i) || (a.solid && b.solid)) continue;
        const c = contact(a.r, b.r);
        if (c) this.meet(a, b, c);
      }
    }
  }

  /** Two cars touching: the impulse, then what each one does with it. */
  private meet(a: Crasher, b: Crasher, c: Contact) {
    const before = [a, b].map((p) => ({ x: p.r.x, z: p.r.z, vx: p.r.vx, vz: p.r.vz, spin: p.r.spin }));
    const h = resolve(a.r, b.r, c);
    [a, b].forEach((p, k) => {
      const o = before[k], other = k ? a : b;
      const dvx = p.r.vx - o.vx, dvz = p.r.vz - o.vz, dv = Math.hypot(dvx, dvz);
      const hard = felt(dv);
      // Stays put (a solid moves itself; a car only comes loose when it's hit hard enough):
      // the other one takes all of the push out of the overlap.
      const stays = !!p.solid || (!p.car?.loose && dv < DISLODGE_MS);
      if (stays) {
        other.r.x -= p.r.x - o.x;
        other.r.z -= p.r.z - o.z;
        (p.r.x = o.x), (p.r.z = o.z);
      }
      if (p.solid) {
        if (dv > 0.05) p.solid.hit({ dvx, dvz, spin: p.r.spin - o.spin, felt: hard, x: c.px, z: c.pz, nx: k ? c.nx : -c.nx, nz: k ? c.nz : -c.nz });
        return;
      }
      let car = p.car ?? null;
      if (stays) {
        // A jolt: the driver brakes hard and leans on the horn.
        if (car && dv > 0.2) (car.v = Math.max(0, car.v - dv * 2)), (car.upset = Math.max(car.upset, 5));
        return;
      }
      if (!car && p.parked) car = this.car(p.parked);
      if (!car) return;
      const L = car.loose ?? this.loosen(car);
      (car.x = p.r.x), (car.z = p.r.z);
      (L.vx = p.r.vx), (L.vz = p.r.vz), (L.spin = p.r.spin);
      car.upset = 8;
      p.car = car;
      p.parked = undefined;
      if (hurtCar(car.health, crashDamage(hard, heavy(car.kind) ? 0.4 : 1))) this.events.push({ kind: "fire", x: car.x, z: car.z, key: car.kind, ref: car });
      this.dent(car, c.px, c.pz, dentDepth(hard));
    });
    if (h.closing > CRASH_FX_MS) {
      const key = a.car?.kind ?? b.car?.kind ?? a.parked?.key ?? b.parked?.key ?? "samand";
      this.events.push({ kind: "crash", x: c.px, z: c.pz, key, ref: a.car ?? b.car ?? {}, into: h.closing });
    }
  }

  /** A parked car knocked off its spot becomes a loose car (it won't be parked there again). */
  private unpark(p: Parked & { color: THREE.Color }): Car {
    const spot = spotOf(p.x, p.z);
    // Hit or shot where it stood: its alarm goes off.
    this.events.push({ kind: "alarm", x: p.x, z: p.z, key: p.key, ref: p });
    this.parked = this.parked.filter((q) => spotOf(q.x, q.z) !== spot);
    this.left = this.left.filter((q) => spotOf(q.x, q.z) !== spot);
    this.taken.add(spot);
    // Off the kerb now, not at the next re-pick: a parked copy left standing would be hit by
    // the very car it became, and come loose a second time.
    this.shown = this.shown.filter((s) => s !== p);
    this.shownAt.x = Infinity;
    const c = this.make(p.key, p.paint, this.roads[0] ?? { line: new Float32Array(4), w: 6, kind: "minor", park: [false, false] }, p.x, p.z, p.yaw);
    c.parked = true;
    this.loosen(c);
    this.cars.push(c);
    this.offKerb.set(p, c);
    return c;
  }

  /** The driving or loose car a handle stands for (a parked car's old handle: the loose car it became). */
  private live(ref: CarRef): Car | null {
    const c = (this.cars as object[]).includes(ref) ? (ref as Car) : this.offKerb.get(ref);
    return c && this.cars.includes(c) ? c : null;
  }

  /** The car a footprint stands for, made loose (a parked one comes off the kerb). */
  private car(ref: CarRef): Car | null {
    const c = this.live(ref);
    if (c) return c;
    const p = this.shown.find((s) => s === ref);
    return p ? this.unpark(p) : null;
  }

  /** A footprint's car's mass (kg), if it's one of these. */
  massOfRef(ref: CarRef): number | null {
    const k = this.kindOf(ref);
    return k ? massOf(FLEET[k]) : null;
  }

  /** What kind of car a footprint is, if it's one of these. */
  kindOf(ref: CarRef): FleetKey | null {
    return this.live(ref)?.kind ?? this.shown.find((s) => s === ref)?.key ?? null;
  }

  /** Fold a car's bodywork in where (hx, hz) hit it, `depth` m. */
  private dent(c: Car, hx: number, hz: number, depth: number) {
    const d = FLEET[c.kind];
    dentCar(c.health, localHit(c.x, c.z, c.yaw, hx, hz, d.len, d.wid), depth);
  }

  /**
   * Something hit this car: a push (m/s, added to how it's moving) and damage. It leaves its
   * lane and slides; its driver puts the hazards on and leans on the horn. `at`: where it was
   * struck (the dent; else on the side the push came from).
   */
  bump(ref: CarRef, vx: number, vz: number, dmg: number, at?: { x: number; z: number }) {
    const c = this.car(ref);
    if (!c) return;
    const L = c.loose ?? this.loosen(c);
    // The push is already its change of speed (by mass, carPhysics); spin from how hard.
    const heavyK = 1;
    L.vx += vx * heavyK;
    L.vz += vz * heavyK;
    L.spin += (this.rand() - 0.5) * Math.hypot(vx, vz) * 0.25 * heavyK;
    c.upset = 8;
    if (hurtCar(c.health, dmg * (heavy(c.kind) ? 0.4 : 1))) this.events.push({ kind: "fire", x: c.x, z: c.z, key: c.kind, ref: c });
    const sp = Math.hypot(vx, vz) || 1;
    this.dent(c, at?.x ?? c.x - (vx / sp) * 3, at?.z ?? c.z - (vz / sp) * 3, dentDepth(sp));
  }

  /** The nearest car a bullet meets within `maxT` m (its footprint's ref and where along the ray). */
  ray(r: Ray, maxT: number): { ref: CarRef; t: number } | null {
    let best: { ref: CarRef; t: number } | null = null;
    for (const b of this.boxes) {
      const t = rayFootprint(r, b.f, best?.t ?? maxT);
      if (t < (best?.t ?? maxT)) best = { ref: b.ref, t };
    }
    return best;
  }

  /** A bullet in the bodywork (`at`: where it hit — it leaves a hole there). */
  shoot(ref: CarRef, dmg: number, at?: { x: number; y: number; z: number }) {
    const hole = (c: Car) => {
      if (!at) return;
      const d = FLEET[c.kind];
      holeCar(c.health, localShot(c.x, c.z, c.yaw, at.x, at.y - (c.loose?.y ?? 0), at.z, d.len, d.wid, d.hgt));
    };
    const c = this.live(ref);
    if (!c) {
      // A parked car takes it standing (it only comes loose when it's hit hard).
      const p = this.shown.find((s) => s === ref);
      if (!p) return;
      const loose = this.unpark(p);
      hole(loose);
      if (hurtCar(loose.health, dmg)) this.events.push({ kind: "fire", x: loose.x, z: loose.z, key: loose.kind, ref: loose });
      return;
    }
    hole(c);
    c.upset = Math.max(c.upset, 4);
    c.panic = Math.max(c.panic, 6);
    if (hurtCar(c.health, dmg)) this.events.push({ kind: "fire", x: c.x, z: c.z, key: c.kind, ref: c });
  }

  /** A blast at x, z: every car in reach is hurt and thrown (`hit(d)`: damage and push for a distance). */
  blast(x: number, z: number, hit: (d: number) => { damage: number; push: number }) {
    const near = [...this.cars, ...this.shown].filter((c) => Math.hypot(c.x - x, c.z - z) < 12);
    for (const o of near) {
      const d = Math.hypot(o.x - x, o.z - z), h = hit(d);
      if (h.damage <= 0 && h.push <= 0) continue;
      const c = this.car(o);
      if (!c || c.health.exploded) continue;
      const L = c.loose ?? this.loosen(c);
      const ax = (c.x - x) / (d || 1), az = (c.z - z) / (d || 1), k = heavy(c.kind) ? 0.3 : 1;
      L.vx += ax * h.push * k;
      L.vz += az * h.push * k;
      if (h.push > 6) {
        L.vy += h.push * 0.35 * k;
        L.y = Math.max(L.y, 0.02);
        L.rollV += (this.rand() - 0.5) * h.push * 0.6;
      }
      L.spin += (this.rand() - 0.5) * h.push * 0.3;
      c.upset = 8;
      if (hurtCar(c.health, h.damage)) this.events.push({ kind: "fire", x: c.x, z: c.z, key: c.kind, ref: c });
      // Caved in on the side that faced it.
      this.dent(c, x, z, Math.min(0.36, h.damage * 0.004));
    }
  }

  /** Trouble here (shots, a crash): drivers within `r` m floor it and run the lights for a while. */
  alarm(x: number, z: number, r: number) {
    for (const c of this.cars) if (!c.loose && Math.hypot(c.x - x, c.z - z) < r) (c.panic = Math.max(c.panic, 7 + this.rand() * 5)), (c.upset = Math.max(c.upset, 1.5));
  }

  /** Cars moving fast enough to knock someone down: where, how big, how fast. */
  movers(): { x: number; z: number; r: number; vx: number; vz: number }[] {
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    for (const c of this.cars) {
      const def = FLEET[c.kind];
      const vx = c.loose ? c.loose.vx : -Math.sin(c.yaw) * c.v, vz = c.loose ? c.loose.vz : -Math.cos(c.yaw) * c.v;
      if (Math.hypot(vx, vz) < 2) continue;
      // The front half of the car (where people get hit).
      out.push({ x: c.x - Math.sin(c.yaw) * def.len * 0.25, z: c.z - Math.cos(c.yaw) * def.len * 0.25, r: Math.max(def.wid, def.len * 0.5) / 2, vx, vz });
    }
    return out;
  }

  /** Damaged cars to smoke and burn: where the bonnet is, and how bad it is. */
  damaged(): { x: number; y: number; z: number; look: CarLook; burnT: number }[] {
    const out: { x: number; y: number; z: number; look: CarLook; burnT: number }[] = [];
    for (const c of this.cars) {
      const look = carLook(c.health.hp, c.health.exploded);
      if (look === "ok" || look === "dented") continue;
      const def = FLEET[c.kind], y = c.loose?.y ?? 0;
      const front = c.health.exploded ? 0 : def.len * 0.32;
      out.push({ x: c.x - Math.sin(c.yaw) * front, y: y + def.hgt * (c.loose?.roll ? 0.4 : 0.75), z: c.z - Math.cos(c.yaw) * front, look, burnT: c.health.burn });
    }
    return out;
  }

  /** The street cars you could get into from here, on foot: parked, or traffic that's (nearly) stopped and still runs. */
  private takeable() {
    if (!this.enabled) return [];
    const dims = (key: FleetKey) => ({ len: FLEET[key].len, wid: FLEET[key].wid });
    return [
      ...this.cars.filter((c) => c.health.hp > 0 && !(c.loose && c.loose.roll)).map((c) => ({ x: c.x, z: c.z, yaw: c.yaw, v: c.loose ? Math.hypot(c.loose.vx, c.loose.vz) : c.v, key: c.kind, paint: c.paint, ...dims(c.kind), car: c as Car | null })),
      ...this.shown.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, v: 0, key: p.key, paint: p.paint, ...dims(p.key), car: null })),
    ];
  }

  /** How far (m) the body of the nearest car you could get into is, or null. */
  nearestToTake(x: number, z: number) {
    return carToTake(this.takeable(), x, z)?.d ?? null;
  }

  /**
   * Get into the nearest street car: it leaves the street (it's yours now). Where it was,
   * what it is, how hurt, and whether somebody was driving it (that's a carjacking).
   */
  take(x: number, z: number): (Parked & { hp: number; driven: boolean }) | null {
    const hit = carToTake(this.takeable(), x, z)?.car;
    if (!hit) return null;
    let hp = 100, driven = false;
    if (hit.car) {
      this.cars.splice(this.cars.indexOf(hit.car), 1);
      hp = hit.car.health.hp;
      // Somebody was at the wheel of every car but one knocked off the kerb.
      driven = !hit.car.parked;
    } else {
      const spot = spotOf(hit.x, hit.z);
      this.parked = this.parked.filter((p) => spotOf(p.x, p.z) !== spot);
      const before = this.left.length;
      this.left = this.left.filter((p) => spotOf(p.x, p.z) !== spot);
      if (this.left.length === before) this.taken.add(spot);
      this.shown = this.shown.filter((p) => spotOf(p.x, p.z) !== spot);
      this.shownAt.x = Infinity;
    }
    return { key: hit.key, paint: hit.paint, x: hit.x, z: hit.z, yaw: hit.yaw, hp, driven };
  }

  /** The car you got out of for another one stays at the kerb, a parked car like the rest. */
  leave(p: Parked) {
    const car = { ...p, color: new THREE.Color(p.paint) };
    this.left.push(car);
    this.parked.push(car);
    if (this.left.length > LEFT_MAX) {
      const gone = this.left.shift();
      this.parked = this.parked.filter((q) => q !== gone);
    }
    this.shownAt.x = Infinity;
  }

  /** Head and tail lamps glow at night (0 day … 1 night). */
  setNight(n: number) {
    this.fleet.setNight(n);
  }

  dispose() {
    this.cars = [];
    this.parked = this.shown = [];
    this.fleet.dispose();
  }
}
