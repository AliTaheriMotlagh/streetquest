"use client";
// People on the pavements of the 3D city: men in shirts and jackets, women in a manteau
// and headscarf or a black chador, each walking along the street near you at their own
// pace. They keep to the pavement beside the road (turning back at a wall or the end of
// the street, or carrying on round the corner) — and they react, like a city does:
//  - gunfire, a crash or an explosion nearby and they run, away from it, off the
//    pavement if need be, for a few seconds — then walk back to a pavement and calm down;
//  - a car that hits them throws them (hard enough, they don't get up); slowly, it just
//    pushes them aside and they run;
//  - a bullet can hit them (lib/arena/geom's player hitbox) — they fall where they stood;
//  - they're the witnesses the police hear crimes from (street/index.ts).
// The men nearest you are real rigged, animated models (peopleModels.ts: walk, run, idle,
// fall); everyone else is drawn instanced — one mesh per body part, coloured per person —
// so a busy street costs a few draw calls.
import * as THREE from "three";
import { insidePacked } from "@/lib/city";
import { rayPlayer, type Ray } from "@/lib/arena/geom";
import type { Zone } from "@/lib/arena/weapons";
import { KERB_H, type Footprint } from "./tileMesh";
import { toon, type Style, type TileMeshes } from "./world3d";
import { loadPeople, PersonModel, TINT_COUNT, type PersonTemplate } from "./peopleModels";

type Road = { line: Float32Array; w: number };
/** 0 a man · 1 a woman in a manteau and scarf · 2 a woman in a chador. */
type Look = 0 | 1 | 2;
/**
 * walk: along its pavement · flee: running from `from` · back: walking to a pavement to
 * walk on · flying: thrown by a car or a blast · down: on the ground (dead, or getting up
 * when `t` runs out).
 */
/** `stop`: standing still, turned toward (fromX, fromZ) — talking to someone (a street scene) — then walking on. */
type Mode = "walk" | "flee" | "back" | "flying" | "down" | "stop";
type Walker = {
  id: number;
  look: Look;
  top: THREE.Color;
  legs: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  road: Road;
  seg: number;
  along: number;
  dir: 1 | -1;
  /** Which pavement (+1 right of the line's direction, −1 left) and how far out from the middle of the road. */
  side: 1 | -1;
  off: number;
  speed: number;
  phase: number;
  x: number;
  z: number;
  yaw: number;
  /** Seconds until it looks ahead for a wall again. */
  scan: number;
  mode: Mode;
  /** Seconds left in this mode (flee, down). */
  t: number;
  /** Running from here. */
  fromX: number;
  fromZ: number;
  /** Free movement (fleeing, thrown) and height off the ground. */
  vx: number;
  vz: number;
  y: number;
  vy: number;
  /** Tumbling (rad) and which way it went down (+1 on its back, −1 on its face). */
  tilt: number;
  spin: number;
  fallDir: 1 | -1;
  hp: number;
  dead: boolean;
  /** Where "back" walks to, and the pavement it'll walk on from there. */
  to: { x: number; z: number; road: Road; seg: number; along: number; side: 1 | -1; off: number; dir: 1 | -1 } | null;
  /** Which model and shade it gets when it's near enough to draw as one (men only). */
  tpl: number;
  tint: number;
  body: PersonModel | null;
  /** Seconds since it died (bodies are cleared after a while). */
  since: number;
};

const pick = <T,>(r: () => number, l: T[]) => l[Math.floor(r() * l.length)];
const C = (l: string[]) => l.map((c) => new THREE.Color(c));
const SKIN = C(["#e2b896", "#d7a77f", "#c99569", "#b07a52", "#f0c9a8"]);
const SHIRTS = C(["#2f3a4f", "#5b6470", "#e8e6df", "#3b5f8a", "#7a5a43", "#1f2124", "#6b2f2f", "#4f6b4a", "#a7b0ba"]);
const TROUSERS = C(["#1f2433", "#2b2f36", "#3c3a35", "#28304a", "#4a4a4a", "#5a4a3a"]);
const HAIR = C(["#1a1410", "#2a2018", "#3a2c20", "#55504a"]);
const MANTEAU = C(["#1d1d22", "#2a3448", "#6e5a48", "#3f4a3a", "#7a2e3a", "#a59b8a", "#24262b", "#4b3a56"]);
const SCARF = C(["#1b1b1f", "#7a2e3a", "#c9b79c", "#2f5d73", "#8a7f74", "#a33b3b", "#3e5a3a", "#d8cfc4", "#5a3f6b"]);
const CHADOR = new THREE.Color("#121214");

const SPAWN_MIN = 30, SPAWN_MAX = 150, DROP = 190;
/** Footprints are looked up in squares this big. */
const GRID = 24;
/** Men this close get a real model (the nearest first, up to a cap). */
const MODEL_M = 60;
/** A body stays on the street this long. */
const BODY_S = 40;
/** A car faster than this (m/s) throws a person; slower, it pushes them aside. */
const THROW_MS = 3.5;
/** …and faster than this, they don't get up. */
const KILL_MS = 8.5;
const RUN_MS = 4.2;
let nextId = 1;

/** Each body part once, standing at the origin facing −z; legs and arms hang from their pivot (y = 0). */
function parts() {
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
  const shirt = new THREE.BoxGeometry(0.4, 0.56, 0.24);
  at(shirt, 0, 1.13, 0);
  // A manteau and a chador are turned silhouettes (smooth, no boxes).
  const manteau = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0.6), new THREE.Vector2(0.25, 0.62), new THREE.Vector2(0.23, 0.9), new THREE.Vector2(0.2, 1.25), new THREE.Vector2(0.22, 1.38), new THREE.Vector2(0.12, 1.44), new THREE.Vector2(0.001, 1.45)], 10);
  // (The head and the hood over it are the scarf piece, open at the face.)
  const chador = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0.02), new THREE.Vector2(0.34, 0.03), new THREE.Vector2(0.3, 0.5), new THREE.Vector2(0.24, 1.0), new THREE.Vector2(0.22, 1.32), new THREE.Vector2(0.17, 1.45), new THREE.Vector2(0.12, 1.55), new THREE.Vector2(0.001, 1.58)], 12);
  const head = new THREE.SphereGeometry(0.11, 10, 8);
  at(head, 0, 1.54, 0);
  const hair = new THREE.SphereGeometry(0.117, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  at(hair, 0, 1.56, 0.01);
  // A headscarf (or a chador's hood): round the head, open over the face (−z).
  const scarf = new THREE.SphereGeometry(0.128, 10, 8, Math.PI * 1.65, Math.PI * 1.7);
  at(scarf, 0, 1.54, 0.015);
  const leg = new THREE.CapsuleGeometry(0.065, 0.74, 3, 6);
  at(leg, 0, -0.43, 0);
  const arm = new THREE.CapsuleGeometry(0.05, 0.5, 3, 6);
  at(arm, 0, -0.3, 0);
  return { shirt, manteau, chador, head, hair, scarf, leg, arm };
}
type PartKey = keyof ReturnType<typeof parts>;

export type CrowdHit = { killed: number; hurt: number };

export class Crowd {
  private walkers: Walker[] = [];
  private roads: Road[] = [];
  private ends = new Map<string, Road[]>();
  /** Buildings by GRID square, for "is that a wall ahead?". */
  private walls = new Map<string, Footprint[]>();
  private known = new WeakSet<TileMeshes>();
  private meshCount = -1;
  private rand = Math.random;
  private geo = parts();
  private mat: THREE.Material;
  private meshes = {} as Record<PartKey, THREE.InstancedMesh>;
  private count = {} as Record<PartKey, number>;
  private m = new THREE.Matrix4();
  private j = new THREE.Matrix4();
  private s = new THREE.Matrix4();
  private t = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private Y = new THREE.Vector3(0, 1, 0);
  /** Up on the raised pavement (drawn in the real city's full detail). */
  private base: number;
  /** The real people models, once loaded, and the bodies not in use. */
  private tpls: PersonTemplate[] = [];
  private spare = new Map<PersonTemplate, PersonModel[]>();
  private bodies = 0;
  private assignAt = 0;
  private eye = { x: 0, z: 0 };
  enabled = true;

  constructor(private scene: THREE.Scene, style: Style, private lite: boolean) {
    this.base = style === "real" && !lite ? KERB_H : 0;
    this.mat = style === "toon" ? toon({ color: "#ffffff" }) : new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88 });
    const cap = lite ? 16 : 40;
    for (const k of Object.keys(this.geo) as PartKey[]) {
      const m = new THREE.InstancedMesh(this.geo[k], this.mat, k === "leg" || k === "arm" ? cap * 2 : cap);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, CHADOR);
      scene.add(m);
      this.meshes[k] = m;
    }
    // Real people in the real-looking city (the storybook city keeps its drawn ones).
    if (style === "real")
      loadPeople()
        .then((t) => (this.tpls = t))
        .catch(() => {});
  }

  /** How many people may be drawn as real models at once. */
  private get modelCap() {
    return this.lite ? 6 : 14;
  }

  /** Streets to walk beside, and the buildings beside them: re-read when tiles come and go. */
  sync(meshes: TileMeshes[]) {
    if (meshes.length === this.meshCount && meshes.every((m) => this.known.has(m))) return;
    this.meshCount = meshes.length;
    this.known = new WeakSet(meshes);
    this.roads = [];
    this.ends.clear();
    this.walls.clear();
    for (const m of meshes) {
      m.roads.forEach((line, i) => {
        const k = m.roadKinds[i];
        if ((k !== "major" && k !== "minor") || !m.roadDrawn[i] || line.length < 4) return;
        const r = { line, w: m.roadWidths[i] };
        this.roads.push(r);
        for (const end of [0, 1]) {
          const key = this.cell(line[end ? line.length - 2 : 0], line[end ? line.length - 1 : 1], 8);
          const l = this.ends.get(key);
          if (l) l.push(r);
          else this.ends.set(key, [r]);
        }
      });
      for (const f of m.footprints)
        for (let gx = Math.floor(f.minX / GRID); gx <= Math.floor(f.maxX / GRID); gx++)
          for (let gz = Math.floor(f.minZ / GRID); gz <= Math.floor(f.maxZ / GRID); gz++) {
            const key = `${gx}_${gz}`;
            const l = this.walls.get(key);
            if (l) l.push(f);
            else this.walls.set(key, [f]);
          }
    }
    // Walkers on a street that's gone go too (fleeing and fallen ones aren't on one).
    const alive = new Set(this.roads.map((r) => r.line));
    this.walkers = this.walkers.filter((w) => w.mode !== "walk" || alive.has(w.road.line) || this.release(w));
  }

  private cell(x: number, z: number, size: number) {
    return `${Math.floor(x / size)}_${Math.floor(z / size)}`;
  }

  /** Inside a building (or right against its wall)? */
  private walled(x: number, z: number) {
    for (const f of this.walls.get(this.cell(x, z, GRID)) ?? []) if (x >= f.minX - 0.3 && x <= f.maxX + 0.3 && z >= f.minZ - 0.3 && z <= f.maxZ + 0.3 && insidePacked(f.pts, x, z)) return true;
    return false;
  }

  /** Where a walker stands: along its road, out on its pavement. */
  private place(w: { road: Road; seg: number; along: number; side: 1 | -1; off: number; dir: 1 | -1 }) {
    const L = w.road.line, i = w.seg * 2;
    const ax = L[i], az = L[i + 1], bx = L[i + 2], bz = L[i + 3];
    const len = Math.hypot(bx - ax, bz - az) || 0.01, ux = (bx - ax) / len, uz = (bz - az) / len;
    const k = Math.max(0, Math.min(1, w.along / len));
    return { x: ax + (bx - ax) * k - uz * w.side * w.off, z: az + (bz - az) * k + ux * w.side * w.off, len, ux: ux * w.dir, uz: uz * w.dir };
  }

  private spawn(px: number, pz: number) {
    for (let tries = 0; tries < 10; tries++) {
      const road = this.roads[Math.floor(this.rand() * this.roads.length)];
      if (!road) return;
      const seg = Math.floor(this.rand() * (road.line.length / 2 - 1));
      const r = this.rand, roll = r();
      const look: Look = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
      const w: Walker = {
        id: nextId++,
        look,
        top: look === 0 ? pick(r, SHIRTS) : look === 1 ? pick(r, MANTEAU) : CHADOR,
        legs: look === 0 ? pick(r, TROUSERS) : pick(r, TROUSERS.slice(0, 3)),
        skin: pick(r, SKIN),
        hair: look === 0 ? pick(r, HAIR) : look === 1 ? pick(r, SCARF) : CHADOR,
        road,
        seg,
        along: 0,
        dir: r() < 0.5 ? 1 : -1,
        side: r() < 0.5 ? 1 : -1,
        off: road.w / 2 + 1.1 + r() * 0.8,
        speed: 1.05 + r() * 0.45,
        phase: r() * Math.PI * 2,
        x: 0,
        z: 0,
        yaw: 0,
        scan: 0,
        mode: "walk",
        t: 0,
        fromX: 0,
        fromZ: 0,
        vx: 0,
        vz: 0,
        y: 0,
        vy: 0,
        tilt: 0,
        spin: 0,
        fallDir: 1,
        hp: 100,
        dead: false,
        to: null,
        tpl: Math.floor(r() * 64),
        tint: Math.floor(r() * TINT_COUNT),
        body: null,
        since: 0,
      };
      const at = this.place(w);
      w.along = this.rand() * at.len;
      const p = this.place(w);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX || this.walled(p.x, p.z)) continue;
      w.x = p.x;
      w.z = p.z;
      w.yaw = Math.atan2(-p.ux, -p.uz);
      this.walkers.push(w);
      return;
    }
  }

  /** Off the end of its street: round the corner onto the next one, or back the way it came. */
  private corner(w: Walker) {
    const L = w.road.line, end = w.dir > 0 ? 1 : 0;
    const x = L[end ? L.length - 2 : 0], z = L[end ? L.length - 1 : 1];
    const opts: Road[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const r of this.ends.get(`${Math.floor(x / 8) + i}_${Math.floor(z / 8) + j}`) ?? []) if (r !== w.road) opts.push(r);
    const next = opts.length && this.rand() < 0.75 ? opts[Math.floor(this.rand() * opts.length)] : null;
    if (!next) return this.turn(w);
    const n = next.line, startsHere = Math.hypot(n[0] - x, n[1] - z) < Math.hypot(n[n.length - 2] - x, n[n.length - 1] - z);
    // Same side of the street as it walks (the pavement on its right stays on its right).
    const rel = w.side * w.dir;
    w.road = next;
    w.dir = startsHere ? 1 : -1;
    w.side = (rel * w.dir) as 1 | -1;
    w.seg = startsHere ? 0 : n.length / 2 - 2;
    w.off = next.w / 2 + 1.1 + this.rand() * 0.8;
    const at = this.place({ ...w, along: 0 });
    w.along = startsHere ? 0 : at.len;
  }

  private turn(w: Walker) {
    w.dir = w.dir > 0 ? -1 : 1;
  }

  /** The nearest pavement spot (within `reach` m) to walk on from here, or null. */
  private pavementNear(x: number, z: number, reach: number): Walker["to"] {
    let best: Walker["to"] = null, bd = reach;
    for (const road of this.roads) {
      const L = road.line;
      if (Math.abs(L[0] - x) > 400 || Math.abs(L[1] - z) > 400) continue;
      for (let i = 0; i + 3 < L.length; i += 2) {
        const ax = L[i], az = L[i + 1], bx = L[i + 2], bz = L[i + 3];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, len = Math.sqrt(l2);
        const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const cx = ax + dx * k, cz = az + dz * k;
        // Which side of the line, and the pavement's spot on that side.
        const side: 1 | -1 = (x - ax) * -dz + (z - az) * dx < 0 ? 1 : -1;
        const off = road.w / 2 + 1.3;
        const px = cx - (dz / len) * side * off, pz = cz + (dx / len) * side * off;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd && !this.walled(px, pz)) (bd = d), (best = { x: px, z: pz, road, seg: i / 2, along: k * len, side, off, dir: this.rand() < 0.5 ? 1 : -1 });
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- reacting

  /** Something frightening happened here (a shot, a crash, a blast): everyone within `r` m runs from it. */
  alarm(x: number, z: number, r: number) {
    for (const w of this.walkers) {
      if (w.mode === "down" || w.mode === "flying") continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d > r) continue;
      this.flee(w, x, z, 5 + this.rand() * 5 + (r - d) * 0.05);
    }
  }

  private flee(w: Walker, x: number, z: number, secs: number) {
    w.mode = "flee";
    w.t = Math.max(w.t, secs);
    w.fromX = x;
    w.fromZ = z;
    let ax = w.x - x, az = w.z - z;
    const l = Math.hypot(ax, az);
    if (l < 0.01) (ax = Math.cos(w.id)), (az = Math.sin(w.id)), (w.vx = 0);
    const sp = RUN_MS + this.rand() * 1.2;
    const turn = (this.rand() - 0.5) * 0.8, c = Math.cos(turn), s = Math.sin(turn), L = Math.hypot(ax, az) || 1;
    w.vx = ((ax * c - az * s) / L) * sp;
    w.vz = ((ax * s + az * c) / L) * sp;
  }

  /** People (conscious, not running) who could see something at x, z from within `r` m. */
  witnesses(x: number, z: number, r: number) {
    let n = 0;
    for (const w of this.walkers) if (!w.dead && w.mode !== "down" && Math.abs(w.x - x) < r && Math.abs(w.z - z) < r && Math.hypot(w.x - x, w.z - z) < r) n++;
    return n;
  }

  /**
   * A vehicle of radius `r` at (x, z) moving at (vx, vz): who it hits. Fast, it throws
   * them (killing the ones it hits hardest); slowly, it shoves them aside and they run.
   */
  hitBy(x: number, z: number, r: number, vx: number, vz: number): CrowdHit {
    const out: CrowdHit = { killed: 0, hurt: 0 };
    const sp = Math.hypot(vx, vz);
    for (const w of this.walkers) {
      if (w.mode === "flying" || (w.mode === "down" && w.dead)) continue;
      if (Math.abs(w.x - x) > r + 1 || Math.abs(w.z - z) > r + 1) continue;
      const dx = w.x - x, dz = w.z - z, d = Math.hypot(dx, dz);
      if (d > r + 0.3) continue;
      if (w.mode === "down") {
        // Run over where they lie.
        if (sp > THROW_MS) (w.hp = 0), (w.dead = true);
        continue;
      }
      if (sp <= THROW_MS) {
        // Pushed clear of the bumper, and off they run.
        const k = (r + 0.35 - d) / (d || 1);
        w.x += dx * k;
        w.z += dz * k;
        this.flee(w, x, z, 4);
        continue;
      }
      // Thrown: on with the car, up, tumbling.
      const side = (this.rand() - 0.5) * 0.6;
      w.mode = "flying";
      w.vx = vx * 0.75 + -vz * side;
      w.vz = vz * 0.75 + vx * side;
      w.vy = 1.5 + sp * 0.18;
      w.y = Math.max(w.y, 0.3);
      w.spin = (sp * 0.9 + 3) * (this.rand() < 0.5 ? 1 : -1);
      // Hit from behind, it goes over forwards; from the front, onto its back.
      w.fallDir = (vx * -Math.sin(w.yaw) + vz * -Math.cos(w.yaw) > 0 ? -1 : 1) as 1 | -1;
      w.hp -= sp * 11;
      if (sp > KILL_MS || w.hp <= 0) (w.dead = true), (w.hp = 0), out.killed++;
      else out.hurt++;
    }
    return out;
  }

  /** A blast at x, z: thrown and hurt by how close they were (`hurt(d)` → damage and push). */
  blast(x: number, z: number, hurt: (d: number) => { damage: number; push: number }): CrowdHit {
    const out: CrowdHit = { killed: 0, hurt: 0 };
    for (const w of this.walkers) {
      const d = Math.hypot(w.x - x, w.z - z);
      const h = hurt(d);
      if (h.damage <= 0) continue;
      if (w.dead) continue;
      w.hp -= h.damage;
      const ax = (w.x - x) / (d || 1), az = (w.z - z) / (d || 1);
      if (h.push > 2) {
        w.mode = "flying";
        w.vx = ax * h.push;
        w.vz = az * h.push;
        w.vy = 2 + h.push * 0.4;
        w.spin = (4 + h.push) * (this.rand() < 0.5 ? 1 : -1);
        w.fallDir = 1;
      }
      if (w.hp <= 0) (w.dead = true), (w.hp = 0), out.killed++, (w.mode = w.mode === "flying" ? "flying" : "down"), (w.t = BODY_S);
      else out.hurt++;
    }
    return out;
  }

  /** The nearest standing person a bullet meets within `maxT` m: its id, where along the ray, which part. */
  ray(r: Ray, maxT: number): { id: number; t: number; zone: Zone } | null {
    let best: { id: number; t: number; zone: Zone } | null = null;
    for (const w of this.walkers) {
      if (w.mode === "down" || w.mode === "flying") continue;
      // Cheap reject: the ray's closest approach in plan.
      const ox = w.x - r.ox, oz = w.z - r.oz, along = ox * r.dx + oz * r.dz;
      if (along < -1 || along > maxT + 1) continue;
      const hit = rayPlayer(r, w.x, this.base, w.z, false);
      if (hit && hit.t < (best?.t ?? maxT)) best = { id: w.id, t: hit.t, zone: hit.zone };
    }
    return best;
  }

  /** A bullet hit person `id` for `dmg`, travelling (dx, dz): true if it killed them. */
  shoot(id: number, dmg: number, dx: number, dz: number) {
    const w = this.walkers.find((x) => x.id === id);
    if (!w || w.dead) return false;
    w.hp -= dmg;
    if (w.hp > 0) {
      this.flee(w, w.x - dx * 5, w.z - dz * 5, 8);
      return false;
    }
    w.dead = true;
    w.hp = 0;
    w.mode = "down";
    w.t = BODY_S;
    w.since = 0;
    // Knocked the way the bullet went: on its back if shot from the front.
    w.fallDir = (dx * -Math.sin(w.yaw) + dz * -Math.cos(w.yaw) < 0 ? 1 : -1) as 1 | -1;
    return true;
  }

  /**
   * Someone within `r` m of (x, z) who can say something — the nearest one awake (`calm`:
   * only one strolling, not running or getting up): who, and whether it's a woman.
   */
  speaker(x: number, z: number, r: number, calm = false): { id: number; woman: boolean } | null {
    let best: Walker | null = null, bd = r;
    for (const w of this.walkers) {
      if (w.dead || w.mode === "down" || w.mode === "flying" || (calm && w.mode !== "walk" && w.mode !== "stop")) continue;
      if (Math.abs(w.x - x) > bd || Math.abs(w.z - z) > bd) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bd) (bd = d), (best = w);
    }
    return best && { id: best.id, woman: best.look !== 0 };
  }

  /** Over person `id`'s head (their speech bubble), or null once they're gone. */
  head(id: number) {
    const w = this.walkers.find((x) => x.id === id);
    return w && !w.dead ? { x: w.x, y: this.base + 1.75, z: w.z } : null;
  }

  /**
   * Two people for a street scene `near` (x, z): one strolling between `min` and `max` m away,
   * and (`two`) the nearest other stroller within 7 m of them. Null: nobody suitable.
   */
  cast(x: number, z: number, min: number, max: number, two: boolean): { a: number; b: number | null; woman: [boolean, boolean] } | null {
    const free = this.walkers.filter((w) => !w.dead && w.mode === "walk");
    const opts = free.filter((w) => {
      const d = Math.hypot(w.x - x, w.z - z);
      return d >= min && d <= max;
    });
    for (let tries = 0; tries < 6 && opts.length; tries++) {
      const a = opts[Math.floor(this.rand() * opts.length)];
      if (!two) return { a: a.id, b: null, woman: [a.look !== 0, false] };
      let b: Walker | null = null, bd = 7;
      for (const w of free) {
        if (w === a) continue;
        const d = Math.hypot(w.x - a.x, w.z - a.z);
        if (d < bd) (bd = d), (b = w);
      }
      if (b) return { a: a.id, b: b.id, woman: [a.look !== 0, b.look !== 0] };
    }
    return null;
  }

  /** Person `id` stops for `secs` s, turned toward (x, z) (someone they're talking to); then walks on. */
  stopFor(id: number, secs: number, x: number, z: number) {
    const w = this.walkers.find((v) => v.id === id);
    if (!w || w.dead || (w.mode !== "walk" && w.mode !== "stop")) return false;
    w.mode = "stop";
    w.t = secs;
    w.fromX = x;
    w.fromZ = z;
    return true;
  }

  /** Person `id` runs off (a thief making a getaway): away from (x, z) for `secs` s. */
  runFrom(id: number, x: number, z: number, secs: number) {
    const w = this.walkers.find((v) => v.id === id);
    if (w && !w.dead && w.mode !== "down" && w.mode !== "flying") this.flee(w, x, z, secs);
  }

  /** Where person `id` is (for the blood), or null. */
  where(id: number) {
    const w = this.walkers.find((x) => x.id === id);
    return w ? { x: w.x, y: this.base, z: w.z } : null;
  }

  // ---------------------------------------------------------------- moving

  /** Walk, run, fall and get up; draw everyone. */
  tick(dt: number, px: number, pz: number) {
    this.eye.x = px;
    this.eye.z = pz;
    for (const k of Object.keys(this.meshes) as PartKey[]) this.count[k] = 0;
    if (!this.enabled) {
      for (const w of this.walkers) this.release(w);
      this.walkers = [];
    } else {
      this.walkers = this.walkers.filter((w) => (Math.hypot(w.x - px, w.z - pz) <= DROP && !(w.dead && w.since > BODY_S)) || this.release(w));
      const up = this.walkers.reduce((n, w) => n + (w.dead ? 0 : 1), 0);
      if (up < (this.lite ? 10 : 26) && this.roads.length) this.spawn(px, pz);
    }
    for (const w of this.walkers) {
      if (w.mode === "walk") this.walk(w, dt);
      else if (w.mode === "flee") this.run(w, dt);
      else if (w.mode === "back") this.goBack(w, dt);
      else if (w.mode === "flying") this.fly(w, dt);
      else if (w.mode === "stop") this.hold(w, dt);
      else this.lie(w, dt);
    }
    this.assign();
    for (const w of this.walkers) this.draw(w, dt);
    for (const k of Object.keys(this.meshes) as PartKey[]) {
      const m = this.meshes[k];
      m.count = this.count[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Standing, talking: turned toward the other one; walking on when it's over. */
  private hold(w: Walker, dt: number) {
    this.face(w, Math.atan2(-(w.fromX - w.x), -(w.fromZ - w.z)), dt, 5);
    w.t -= dt;
    if (w.t <= 0) w.mode = "walk";
  }

  private walk(w: Walker, dt: number) {
    // Look ahead now and then: a wall (or a building sitting right on the kerb) turns it back.
    w.scan -= dt;
    if (w.scan <= 0) {
      w.scan = 0.4 + this.rand() * 0.3;
      const f = this.place(w);
      if (this.walled(f.x + f.ux * 0.9, f.z + f.uz * 0.9)) this.turn(w);
    }
    w.along += w.speed * dt * w.dir;
    let at = this.place(w);
    if (w.along > at.len) {
      if (w.seg + 1 < w.road.line.length / 2 - 1) (w.along -= at.len), w.seg++;
      else this.corner(w);
      at = this.place(w);
    } else if (w.along < 0) {
      if (w.seg > 0) {
        w.seg--;
        at = this.place({ ...w, along: 0 });
        w.along += at.len;
      } else this.corner(w);
      at = this.place(w);
    }
    w.x = at.x;
    w.z = at.z;
    this.face(w, Math.atan2(-at.ux, -at.uz), dt, 6);
    w.phase += w.speed * dt * 4.6;
  }

  private face(w: Walker, yaw: number, dt: number, rate: number) {
    w.yaw += Math.atan2(Math.sin(yaw - w.yaw), Math.cos(yaw - w.yaw)) * Math.min(1, dt * rate);
  }

  /** Free running: away from the danger, round walls, until the fright wears off. */
  private run(w: Walker, dt: number) {
    w.t -= dt;
    const sp = Math.hypot(w.vx, w.vz);
    if (w.t <= 0 || sp < 0.1) {
      w.to = this.pavementNear(w.x, w.z, 25);
      if (w.to) w.mode = "back";
      else w.t = 2; // nowhere to go yet: keep running
      return;
    }
    let nx = w.x + w.vx * dt, nz = w.z + w.vz * dt;
    if (this.walled(nx + (w.vx / sp) * 0.5, nz + (w.vz / sp) * 0.5)) {
      // A wall: try turning one way, then the other, a bit more each time.
      let found = false;
      for (const a of [0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
        const c = Math.cos(a), s = Math.sin(a), vx = w.vx * c - w.vz * s, vz = w.vx * s + w.vz * c;
        if (!this.walled(w.x + (vx / sp) * 1.2, w.z + (vz / sp) * 1.2)) {
          (w.vx = vx), (w.vz = vz), (found = true);
          break;
        }
      }
      if (!found) (w.vx = -w.vx), (w.vz = -w.vz);
      (nx = w.x), (nz = w.z);
    }
    w.x = nx;
    w.z = nz;
    this.face(w, Math.atan2(-w.vx, -w.vz), dt, 10);
    w.phase += sp * dt * 3.2;
  }

  /** Calmed down: walk to the nearest pavement, then along it. */
  private goBack(w: Walker, dt: number) {
    const to = w.to;
    if (!to) return void (w.mode = "walk");
    const dx = to.x - w.x, dz = to.z - w.z, d = Math.hypot(dx, dz);
    if (d < 0.3) {
      Object.assign(w, { road: to.road, seg: to.seg, along: to.along, side: to.side, off: to.off, dir: to.dir, mode: "walk", to: null, vx: 0, vz: 0 });
      return;
    }
    const step = Math.min(d, w.speed * 1.15 * dt);
    w.x += (dx / d) * step;
    w.z += (dz / d) * step;
    this.face(w, Math.atan2(-dx, -dz), dt, 8);
    w.phase += w.speed * dt * 4.6;
  }

  /** Thrown through the air until it lands. */
  private fly(w: Walker, dt: number) {
    w.vy -= 9.8 * dt;
    let nx = w.x + w.vx * dt, nz = w.z + w.vz * dt;
    if (this.walled(nx, nz)) (w.vx *= -0.3), (w.vz *= -0.3), (nx = w.x), (nz = w.z);
    w.x = nx;
    w.z = nz;
    w.y += w.vy * dt;
    w.tilt += w.spin * dt;
    if (w.y > 0) return;
    // Landed: slide a little, then lie there (or get up later, if it survived).
    w.y = 0;
    w.vx *= 0.3;
    w.vz *= 0.3;
    w.mode = "down";
    w.t = w.dead ? BODY_S : 3 + this.rand() * 2;
    w.tilt = (Math.PI / 2) * w.fallDir;
  }

  private lie(w: Walker, dt: number) {
    // A short slide after landing.
    w.x += w.vx * dt;
    w.z += w.vz * dt;
    w.vx *= Math.exp(-dt * 6);
    w.vz *= Math.exp(-dt * 6);
    if (Math.abs(w.tilt) < Math.PI / 2) w.tilt += Math.sign(w.fallDir) * dt * 4.5;
    if (Math.abs(w.tilt) > Math.PI / 2) w.tilt = (Math.PI / 2) * w.fallDir;
    if (w.dead) {
      w.since += dt;
      return;
    }
    w.t -= dt;
    if (w.t > 0) return;
    // Back on its feet, and off it runs.
    w.tilt = 0;
    w.body?.reset();
    this.flee(w, w.x - Math.sin(w.yaw), w.z - Math.cos(w.yaw), 6);
  }

  // ---------------------------------------------------------------- drawing

  /** The men nearest you get a real model (when they've loaded), the nearest first. */
  private assign() {
    const now = performance.now();
    if (now - this.assignAt < 300 || !this.tpls.length) return;
    this.assignAt = now;
    const ranked = this.walkers
      .filter((w) => w.look === 0)
      .map((w) => ({ w, d: Math.hypot(w.x - this.eye.x, w.z - this.eye.z) }))
      .sort((a, b) => a.d - b.d);
    const cap = this.modelCap;
    ranked.forEach(({ w, d }, i) => {
      // A little slack before taking one away, so bodies don't flicker at the edge.
      const want = d < MODEL_M && i < cap, keep = !!w.body && d < MODEL_M + 8 && i < cap + 2;
      if (want && !w.body) this.give(w);
      else if (!want && !keep && w.body) this.release(w);
    });
  }

  private give(w: Walker) {
    const tpl = this.tpls[w.tpl % this.tpls.length];
    let body = this.spare.get(tpl)?.pop() ?? null;
    if (!body) {
      if (this.bodies >= this.modelCap + 3) return;
      body = new PersonModel(tpl, w.tint);
      this.bodies++;
    }
    body.reset();
    this.scene.add(body.group);
    w.body = body;
  }

  /** Hand its model back (always false, to use inside filters). */
  private release(w: Walker) {
    if (w.body) {
      w.body.group.removeFromParent();
      const l = this.spare.get(w.body.tpl);
      if (l) l.push(w.body);
      else this.spare.set(w.body.tpl, [w.body]);
      w.body = null;
    }
    return false;
  }

  private put(k: PartKey, m: THREE.Matrix4, c: THREE.Color) {
    const mesh = this.meshes[k], i = this.count[k];
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c);
    this.count[k] = i + 1;
  }

  private draw(w: Walker, dt: number) {
    const moving = w.mode === "walk" || w.mode === "back" ? w.speed : w.mode === "flee" ? Math.hypot(w.vx, w.vz) : 0;
    const down = w.mode === "down" || w.mode === "flying";
    if (w.body) {
      const g = w.body.group;
      g.position.set(w.x, this.base + w.y, w.z);
      // Models with a fall clip fall by themselves once on the ground; the rest are tipped over.
      const tip = w.mode === "flying" || !w.body.hasFall ? w.tilt : 0;
      g.rotation.set(tip, w.yaw, 0, "YXZ");
      w.body.update(dt, moving, down, Math.hypot(w.x - this.eye.x, w.z - this.eye.z));
      return;
    }
    const fleeing = w.mode === "flee";
    const swing = down ? 0.15 : Math.sin(w.phase) * (w.look === 2 ? 0.25 : fleeing ? 0.75 : 0.42);
    const bob = down ? 0 : Math.abs(Math.cos(w.phase)) * (fleeing ? 0.05 : 0.025);
    this.m.compose(this.p.set(w.x, this.base + bob + w.y, w.z), this.q.setFromAxisAngle(this.Y, w.yaw), this.one);
    // Lying down or tumbling: turned about the feet (tilt > 0 is onto its back: the head goes +z, behind it).
    if (w.tilt) this.m.multiply(this.t.makeRotationX(w.tilt));
    const limb = (k: "leg" | "arm", x: number, y: number, a: number, c: THREE.Color) => {
      this.j.makeRotationX(a).setPosition(x, y, 0);
      this.put(k, this.s.multiplyMatrices(this.m, this.j), c);
    };
    this.put(w.look === 0 ? "shirt" : w.look === 1 ? "manteau" : "chador", this.m, w.top);
    this.put("head", this.m, w.skin);
    this.put(w.look === 0 ? "hair" : "scarf", this.m, w.hair);
    for (const s of [-1, 1]) {
      limb("leg", s * 0.1, 0.88, s * swing, w.legs);
      // Arms swing against the legs (a chador keeps them inside); running, they pump; down, they flop out.
      if (w.look !== 2) limb("arm", s * 0.25, 1.39, down ? s * 0.9 : -s * swing * (fleeing ? 1.2 : 0.75), w.top);
    }
  }

  dispose() {
    for (const w of this.walkers) this.release(w);
    this.walkers = [];
    for (const l of this.spare.values()) for (const b of l) b.dispose();
    this.spare.clear();
    for (const m of Object.values(this.meshes)) {
      this.scene.remove(m);
      m.dispose();
    }
    for (const g of Object.values(this.geo)) g.dispose();
    this.mat.dispose();
  }
}
