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
//    line the kerbs (lib/parking.ts) and the traffic keeps to what they leave free. Drawn
//    instanced, per model (fleet3d.ts).
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import type { LatLng } from "@/lib/geo";
import { congestion, CONGESTION_COLORS, dirOf, FREE_KMH, signalPhase, trafficCell, type TrafficCellOut } from "@/lib/traffic";
import { FLEET, heavy, pickFleet, pickPaint, roomBetween, type FleetKey } from "@/lib/fleet";
import { hashStr, rng } from "@/lib/geo";
import { Junctions, laneOffset, parkedRow, parkingSides, type Parked, type Sides, type Street } from "@/lib/parking";
import { api } from "../game/client";
import { FleetInstances } from "./fleet3d";
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
type Car = {
  /** Which of Iran's street models (lib/fleet.ts), in what paint. */
  kind: FleetKey;
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
};

const SPAWN_MIN = 70, SPAWN_MAX = 240, DROP = 320;
/** The gap a driver keeps to what's ahead, bumper to bumper (m). */
const KEEP_M = 2.5;
/** You, as the cars around see you: about a car's length. */
const YOU_LEN = 4.4;
/** Parked cars are drawn this close to you, the nearest first (and as many at most). */
const PARKED_M = 140, PARKED_MAX = 60, PARKED_LITE_M = 80, PARKED_LITE_MAX = 20;
/** How much of the kerb parked cars take: an avenue's slow lane is mostly kept moving. */
const PARK_FILL = { major: 0.3, minor: 0.55 };

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
  private shownAt = { x: Infinity, z: Infinity };
  enabled = true;

  constructor(private scene: THREE.Scene, private frame: Frame, private feed: TrafficFeed, style: Style, private lite: boolean) {
    this.fleet = new FleetInstances(scene, style);
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
          if (on) for (const p of parkedRow(line, r.w, s ? -1 : 1, rand, free, k === "major" ? PARK_FILL.major : PARK_FILL.minor)) this.parked.push({ ...p, color: new THREE.Color(p.paint) });
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
    // Cars on streets that were dropped go too.
    const alive = new Set(this.roads.map((r) => r.line));
    this.cars = this.cars.filter((c) => alive.has(c.road.line));
    this.shownAt = { x: Infinity, z: Infinity };
  }

  /** The parked cars near you (the nearest, up to a cap), picked again every few metres. */
  private nearParked(px: number, pz: number) {
    if (Math.hypot(px - this.shownAt.x, pz - this.shownAt.z) < 8) return this.shown;
    this.shownAt = { x: px, z: pz };
    const reach = this.lite ? PARKED_LITE_M : PARKED_M, max = this.lite ? PARKED_LITE_MAX : PARKED_MAX;
    this.shown = this.parked
      .map((p) => ({ p, d: Math.hypot(p.x - px, p.z - pz) }))
      .filter((o) => o.d < reach)
      .sort((a, b) => a.d - b.d)
      .slice(0, max)
      .map(({ p }) => ({ ...p, box: box(p.x, p.z, FLEET[p.key].wid / 2 + 0.05, FLEET[p.key].len / 2, p.yaw, FLEET[p.key].hgt) }));
    return this.shown;
  }

  /** How many cars around here: more where the readings say it's jammed. */
  private target(px: number, pz: number) {
    let base = this.lite ? 8 : 18;
    if (!this.feed.empty) {
      let slow = 0, n = 0;
      for (const c of this.cars) {
        const kmh = this.feed.speedAt(this.frame.toLatLng(c.x, c.z), (-c.yaw * 180) / Math.PI);
        if (kmh != null) (n++, (slow += congestion(kmh, FREE_KMH[c.road.kind])));
      }
      if (n) base = Math.round(base * (1 + (slow / n) * 0.5));
    }
    const near = this.roads.filter((r) => Math.hypot(r.line[0] - px, r.line[1] - pz) < SPAWN_MAX).length;
    return Math.min(base, near * 2);
  }

  private spawn(px: number, pz: number) {
    for (let tries = 0; tries < 12; tries++) {
      const road = this.roads[Math.floor(this.rand() * this.roads.length)];
      if (!road) return;
      const n = road.line.length / 2 - 1, seg = Math.floor(this.rand() * n);
      const x = road.line[seg * 2], z = road.line[seg * 2 + 1], d = Math.hypot(x - px, z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      const kind = pickFleet(this.rand, road.kind === "major");
      const dir = road.w < 7 && this.rand() < 0.5 ? -1 : this.rand() < 0.5 ? 1 : -1;
      // Bikes ride quicker than the cars round them (and buses and trucks slower).
      const mood = (FLEET[kind].bike ? 1.05 : heavy(kind) ? 0.8 : 0.85) + this.rand() * 0.25;
      this.cars.push({ kind, color: new THREE.Color(pickPaint(kind, this.rand)), road, seg, along: 0, dir, v: 0, want: 0, x, z, yaw: 0, spin: 0, lean: 0, mood });
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

  /** Move everyone; returns their footprints (solid while you drive). */
  tick(dt: number, px: number, pz: number): Footprint[] {
    if (!this.enabled) {
      this.cars = [];
      this.fleet.begin();
      this.fleet.end();
      return [];
    }
    this.cars = this.cars.filter((c) => Math.hypot(c.x - px, c.z - pz) <= DROP);
    if (this.cars.length < this.target(px, pz) && this.roads.length) this.spawn(px, pz);
    const out: Footprint[] = [];
    this.fleet.begin();
    for (const c of [...this.cars]) {
      const def = FLEET[c.kind];
      const L = c.road.line;
      const i0 = c.dir > 0 ? c.seg : c.seg + 1, i1 = c.dir > 0 ? c.seg + 1 : c.seg;
      const ax = L[i0 * 2], az = L[i0 * 2 + 1], bx = L[i1 * 2], bz = L[i1 * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az) || 0.01, fx = (bx - ax) / len, fz = (bz - az) / len;
      // The live speed here, else the usual one for the street; then room ahead (bumper to
      // bumper: a bus needs more of it than a Pride).
      const at = this.frame.toLatLng(c.x, c.z);
      const live = this.feed.speedAt(at, degOf(ax, az, bx, bz));
      let want = ((live ?? FREE_KMH[c.road.kind]) / 3.6) * c.mood;
      let room = Infinity;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
        // A bike only queues behind what's in its own strip of road.
        if (ahead > 0 && ahead < 32 && side < (def.bike ? 1.1 : 2.2)) room = Math.min(room, roomBetween(ahead, c.kind, o.kind));
      }
      {
        const dx = px - c.x, dz = pz - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
        if (ahead > 0 && ahead < 32 && side < 2.6) room = Math.min(room, roomBetween(ahead, c.kind, YOU_LEN));
      }
      // A red (or amber, unless already at the line) light on this street, just ahead.
      const ns = Math.abs(fz) > Math.abs(fx), sec = Date.now() / 1000;
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const l of this.lights.get(`${Math.floor((c.x + fx * 12) / 16) + i}_${Math.floor((c.z + fz * 12) / 16) + j}`) ?? []) {
            if (l.ns !== ns) continue;
            const dx = l.x - c.x, dz = l.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
            const ph = signalPhase(sec, ns);
            // Stop with the nose a metre short of the light.
            if (ahead > 2 && ahead < 26 && side < c.road.w / 2 + 6 && (ph === 2 || (ph === 1 && ahead > 6))) room = Math.min(room, ahead - def.len / 2 + 1.5);
          }
      if (room < 28) want = Math.min(want, Math.max(0, (room - KEEP_M) * 0.8));
      const braking = c.v > want + 0.3 || c.v < 0.5;
      c.v += Math.max(-9 * dt, Math.min((heavy(c.kind) ? 1.8 : def.bike ? 3.6 : 3) * dt, want - c.v));
      c.along += c.v * dt;
      // On to the next segment, or the next street at the end of this one.
      let gone = false;
      while (c.along > len && !gone) {
        const last = c.dir > 0 ? c.seg + 1 >= L.length / 2 - 1 : c.seg <= 0;
        if (!last) {
          c.along -= len;
          c.seg += c.dir;
          break;
        }
        const nx = this.next(c, bx, bz);
        if (!nx) {
          gone = true;
          break;
        }
        c.along = 0;
        c.road = nx.road;
        c.dir = nx.end === 0 ? 1 : -1;
        c.seg = nx.end === 0 ? 0 : nx.road.line.length / 2 - 2;
        break;
      }
      if (gone) {
        this.cars.splice(this.cars.indexOf(c), 1);
        continue;
      }
      // Pose: on the right-hand half of what parked cars leave of the street (all of it on
      // narrow lanes), bikes out by the kerb.
      const R = c.road.line, j0 = c.dir > 0 ? c.seg : c.seg + 1, j1 = c.dir > 0 ? c.seg + 1 : c.seg;
      const sx = R[j0 * 2], sz = R[j0 * 2 + 1], ex = R[j1 * 2], ez = R[j1 * 2 + 1];
      const sl = Math.hypot(ex - sx, ez - sz) || 0.01, ux = (ex - sx) / sl, uz = (ez - sz) / sl;
      const k = Math.min(1, c.along / sl);
      const lane = laneOffset(c.road.w, c.road.park, c.dir, def.bike);
      const tx = sx + (ex - sx) * k + -uz * lane, tz = sz + (ez - sz) * k + ux * lane;
      const yaw = Math.atan2(-ux, -uz);
      // Ease the turn so corners don't snap; a bike leans into it.
      const turn = Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw));
      c.yaw += turn * Math.min(1, dt * (def.bike ? 7 : heavy(c.kind) ? 3.5 : 6));
      if (def.bike) c.lean += (Math.max(-0.4, Math.min(0.4, turn * 1.6)) - c.lean) * Math.min(1, dt * 5);
      c.x = tx;
      c.z = tz;
      c.spin += (c.v / (def.bike ? 0.3 : 0.32)) * dt;
      this.fleet.put(c.kind, c.x, c.z, c.yaw, c.color, braking, c.spin, c.lean);
      out.push(box(c.x, c.z, def.wid / 2 + 0.05, def.len / 2, c.yaw, def.hgt));
    }
    for (const p of this.nearParked(px, pz)) {
      this.fleet.put(p.key, p.x, p.z, p.yaw, p.color, false, 0);
      out.push(p.box);
    }
    this.fleet.end();
    return out;
  }

  dispose() {
    this.cars = [];
    this.parked = this.shown = [];
    this.fleet.dispose();
  }
}
