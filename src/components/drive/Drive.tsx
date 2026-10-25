"use client";
// The 3D city: drive a cartoon car through the real streets around you — real
// buildings, roads, parks and water from OpenStreetMap, real shops and restaurants
// with their names on signs, and the jobs at them as beacons of light you can see
// across town. From home (or in test mode) the car *is* your commander: where you
// drive is where you are in the game. Walking with GPS, the car follows you instead.
//
// Tiles stream in around the car (server/city.ts); until a cell's map data arrives
// it's drawn as a storybook village so there's never a hole in the world.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { bearingTo, distanceM, formatDistance, type LatLng } from "@/lib/geo";
import { makeFrame, tileKey, tileOf, villageTile, type CityTile } from "@/lib/city";
import { CUSTOMER_DOOR, PLACE_CATS, type Place, type PlaceCat } from "@/lib/places";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { BIZ_CHECKIN_M } from "@/lib/business";
import { S } from "@/lib/settings";
import { fmtNum, t } from "@/lib/i18n";
import { Button } from "@/components/Button";
import { api, type World } from "../game/client";
import { useGame } from "../game/ui";
import { audioOut, isMuted, sfx } from "../game/sfx";
import { celebrate } from "../game/Play";
import { isLite, isTouch } from "../perf";
import { buildTile, makeBeacon, makeCar, makeClouds, makeLoot, makeMaterials, makeSign, makeSky, setNight, SKY, type Footprint, type Phase, type TileBuild } from "./world3d";

type Props = {
  start: LatLng;
  /** Head here first ("Drive there" on a map card). */
  goal?: LatLng | null;
  /** The car moves the commander (play from home / test mode). Otherwise it follows `follow`. */
  canDrive: boolean;
  follow: LatLng | null;
  onMove: ((p: LatLng) => void) | null;
  onClaim: (spawnId: string) => Promise<void> | void;
  onExit: () => void;
};

type Job = {
  id: string;
  kind: "pickup" | "visit" | "biz" | "deliver";
  lat: number;
  lng: number;
  emoji: string;
  color: string;
  label: string;
  /** What the action button says when you're there. */
  action: string;
  reach: number;
  run: () => Promise<boolean>;
};

type Hud = {
  speed: number;
  near: Job | null;
  nav: { label: string; dist: number; rel: number } | null;
  loading: number;
  village: boolean;
  cam: CamMode;
  jobs: { id: string; emoji: string; label: string; dist: number; lat: number; lng: number }[];
  night: boolean;
};
type CamMode = "chase" | "far" | "top";

const CAR_COLORS = ["#ff5d73", "#ffb703", "#3dd6d0", "#8b5cf6", "#22c55e", "#3b82f6", "#f8fafc"];
const COLOR_KEY = "sq_car_color";
const LOAD_M = 560; // load tiles whose box is this close
const DROP_M = 1100; // and drop them past this
const CAR_R = 1.25;
const LOOT_PICKUP_M = 16;

export default function Drive({ start, goal, canDrive, follow, onMove, onClaim, onExit }: Props) {
  const { me, world, act, refresh, toast } = useGame();
  const mount = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touch] = useState(isTouch);
  const input = useRef({ gas: 0, brake: 0, steer: 0, hand: false, keys: new Set<string>() });
  const wheelRef = useRef<HTMLDivElement>(null);
  // Latest props/context for the render loop (it lives as long as the component).
  const live = useRef({ world, me, follow, canDrive, onMove, onClaim, goal: goal ?? null, act, refresh });
  live.current = { ...live.current, world, me, follow, canDrive, onMove, onClaim, act, refresh };
  const api3d = useRef<{ setGoal: (p: LatLng | null) => void; cycleCam: () => void; recolor: () => void; horn: () => void } | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let disposed = false;
    const lite = isLite();
    const frame = makeFrame(start);

    // ---- renderer & scene
    const renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !lite;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, el.clientWidth / el.clientHeight, 0.5, 2000);
    const sky = makeSky();
    scene.add(sky.mesh);
    const hemi = new THREE.HemisphereLight("#ffffff", "#88aa77", 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.castShadow = !lite;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: "#9bd27f" }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = !lite;
    scene.add(ground);
    const clouds = makeClouds(lite ? 8 : 18);
    scene.add(clouds.group);
    const mats = makeMaterials();

    // Fireflies / magic dust around the car — the city is a fairy tale after all.
    const dustN = lite ? 90 : 220;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) dustPos.set([(Math.random() - 0.5) * 160, 1 + Math.random() * 14, (Math.random() - 0.5) * 160], i * 3);
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ color: "#fff3b0", size: 0.35, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ---- the car
    let color = CAR_COLORS[0];
    try {
      color = localStorage.getItem(COLOR_KEY) ?? color;
    } catch {}
    let car = makeCar(color);
    scene.add(car.group);
    // placed: "" (not yet), "village" (on a generated street), "real" (on a real street) — and where.
    const st = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0, bumpAt: 0, placed: "" as "" | "village" | "real", placedAt: { x: 0, z: 0 }, lastReport: 0, reported: { x: 0, z: 0 } };
    let camMode: CamMode = "chase";
    const camPos = new THREE.Vector3(0, 6, 12);
    const camLook = new THREE.Vector3();

    // Navigation arrow over the car.
    const arrowMat = new THREE.MeshBasicMaterial({ color: "#ffd23f" });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 4), arrowMat);
    arrow.geometry.rotateX(-Math.PI / 2);
    arrow.visible = false;
    scene.add(arrow);

    // ---- tiles
    type Slot = { cx: number; cy: number; build: TileBuild | null; data: CityTile | null; real: boolean; tries: number; retryAt: number; inflight: boolean; hash: Map<string, Footprint[]> };
    const tiles = new Map<string, Slot>();
    const queue: { key: string; data: CityTile }[] = [];
    const HASH = 30;
    const hashKey = (x: number, z: number) => `${Math.floor(x / HASH)}_${Math.floor(z / HASH)}`;
    const tileBox = (cx: number, cy: number) => {
      const a = frame.toXZ(cy * 0.004, cx * 0.004), b = frame.toXZ((cy + 1) * 0.004, (cx + 1) * 0.004);
      return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
    };
    const boxDist = (b: ReturnType<typeof tileBox>, x: number, z: number) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

    const fetchTile = async (slot: Slot) => {
      if (slot.inflight || disposed) return;
      slot.inflight = true;
      try {
        const r = await api<{ tile: CityTile | null; pending: boolean }>(`/api/city?cx=${slot.cx}&cy=${slot.cy}${slot.tries ? "" : "&wait=0"}`);
        if (disposed) return;
        slot.tries++;
        if (r.tile) {
          slot.real = true;
          // Real data with no streets or buildings (fields, the sea): keep the village scenery, but the real places.
          const scenery = r.tile.b.length + r.tile.r.length ? r.tile : { ...villageTile(slot.cx, slot.cy), real: true, p: r.tile.p };
          queue.push({ key: tileKey(slot.cx, slot.cy), data: scenery });
        } else if (r.pending && slot.tries < 12) slot.retryAt = performance.now() + 6000;
      } catch {
        slot.tries++;
        if (slot.tries < 6) slot.retryAt = performance.now() + 8000;
      } finally {
        slot.inflight = false;
      }
    };

    const ensureTiles = () => {
      const here = frame.toLatLng(st.x, st.z);
      const { cx, cy } = tileOf(here);
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++) {
          const k = tileKey(cx + dx, cy + dy);
          if (tiles.has(k)) continue;
          if (boxDist(tileBox(cx + dx, cy + dy), st.x, st.z) > LOAD_M) continue;
          const slot: Slot = { cx: cx + dx, cy: cy + dy, build: null, data: null, real: false, tries: 0, retryAt: 0, inflight: false, hash: new Map() };
          tiles.set(k, slot);
          // The village right away; the real city replaces it when it arrives.
          queue.push({ key: k, data: villageTile(slot.cx, slot.cy) });
          void fetchTile(slot);
        }
      const now = performance.now();
      for (const [k, s] of tiles) {
        if (boxDist(tileBox(s.cx, s.cy), st.x, st.z) > DROP_M) {
          if (s.build) (scene.remove(s.build.group), s.build.dispose());
          tiles.delete(k);
          continue;
        }
        if (!s.real && !s.inflight && s.retryAt && now > s.retryAt) (s.retryAt = 0), void fetchTile(s);
      }
    };

    /** Build at most one tile per frame so loading never freezes the drive. */
    const buildNext = () => {
      const job = queue.shift();
      if (!job) return;
      const slot = tiles.get(job.key);
      if (!slot) return;
      // A village that arrives after the real tile is stale.
      if (!job.data.real && slot.real && slot.build) return;
      const build = buildTile(job.data, frame, mats, { lite });
      if (slot.build) (scene.remove(slot.build.group), slot.build.dispose());
      slot.build = build;
      slot.data = job.data;
      slot.hash = new Map();
      for (const f of build.footprints) {
        for (let hx = Math.floor(f.minX / HASH); hx <= Math.floor(f.maxX / HASH); hx++)
          for (let hz = Math.floor(f.minZ / HASH); hz <= Math.floor(f.maxZ / HASH); hz++) {
            const k = `${hx}_${hz}`;
            let list = slot.hash.get(k);
            if (!list) slot.hash.set(k, (list = []));
            list.push(f);
          }
      }
      scene.add(build.group);
      signsDirty = true;
      // Snap onto a street once the car's own cell is drawn — and again when its real map
      // arrives, unless the player has already driven off. GPS fixes are often indoors.
      const mine = tileOf(frame.toLatLng(st.x, st.z));
      const still = Math.hypot(st.x - st.placedAt.x, st.z - st.placedAt.z) < 3;
      if (slot.cx === mine.cx && slot.cy === mine.cy && (!st.placed || (st.placed === "village" && job.data.real && still))) placeCar(job.data.real ? "real" : "village");
    };

    /** Start on the nearest proper street (car-wide, not touching a building), facing along it. */
    const placeCar = (kind: "village" | "real") => {
      let best = Infinity, bx = st.x, bz = st.z, yaw = st.yaw;
      for (const s of tiles.values()) {
        const b = s.build;
        if (!b) continue;
        b.roads.forEach((line, li) => {
          // Lanes and service roads count, but a real street wins over an alley 20 m closer.
          const penalty = (b.roadWidths[li] ?? 8) < 6 ? 25 : 0;
          for (let i = 0; i + 3 < line.length; i += 2) {
            const ax = line[i], az = line[i + 1], ex = line[i + 2], ez = line[i + 3];
            const dx = ex - ax, dz = ez - az, l2 = dx * dx + dz * dz || 1;
            const k = Math.max(0, Math.min(1, ((st.x - ax) * dx + (st.z - az) * dz) / l2));
            const px = ax + dx * k, pz = az + dz * k, d = Math.hypot(px - st.x, pz - st.z) + penalty;
            if (d >= best) continue;
            const y = Math.atan2(-dx, -dz), fx = -Math.sin(y), fz = -Math.cos(y);
            if (collide(px + fx * 1.15, pz + fz * 1.15, CAR_R + 0.4).hit || collide(px - fx * 1.15, pz - fz * 1.15, CAR_R + 0.4).hit) continue;
            (best = d), (bx = px), (bz = pz), (yaw = y);
          }
        });
      }
      if (best < 180) {
        st.x = bx;
        st.z = bz;
        st.yaw = yaw;
        st.vx = st.vz = 0;
      }
      st.placed = kind;
      st.placedAt = { x: st.x, z: st.z };
      camPos.set(st.x + Math.sin(st.yaw) * 10, 5, st.z + Math.cos(st.yaw) * 10);
    };

    const nearFootprints = (x: number, z: number) => {
      const out = new Set<Footprint>();
      for (const s of tiles.values()) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) for (const f of s.hash.get(hashKey(x + dx * HASH, z + dz * HASH)) ?? []) out.add(f);
      return out;
    };

    /** Push a circle out of building footprints; returns the wall normal hit (or null). */
    const collide = (x: number, z: number, r: number) => {
      let hit: { nx: number; nz: number } | null = null;
      for (const f of nearFootprints(x, z)) {
        if (x < f.minX - r || x > f.maxX + r || z < f.minZ - r || z > f.maxZ + r) continue;
        const p = f.pts;
        let best = Infinity, qx = 0, qz = 0, inside = false;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
          const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
          if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const cx = ax + dx * k, cz = az + dz * k, d2 = (x - cx) ** 2 + (z - cz) ** 2;
          if (d2 < best) (best = d2), (qx = cx), (qz = cz);
        }
        const d = Math.sqrt(best);
        if (!inside && d >= r) continue;
        let nx = inside ? qx - x : x - qx, nz = inside ? qz - z : z - qz;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l;
        nz /= l;
        const depth = inside ? d + r : r - d;
        x += nx * depth;
        z += nz * depth;
        hit = { nx, nz };
      }
      return { x, z, hit };
    };

    // ---- jobs, loot and signs
    type Beacon = ReturnType<typeof makeBeacon> & { job: Job };
    const beacons = new Map<string, Beacon>();
    type Loot = ReturnType<typeof makeLoot> & { id: string; taken: boolean };
    const loot = new Map<string, Loot>();
    const signs = new Map<string, ReturnType<typeof makeSign>>();
    let signsDirty = true;
    let jobs: Job[] = [];
    let navGoal: LatLng | null = live.current.goal;

    const jobsFrom = (w: World | null): Job[] => {
      const out: Job[] = [];
      const m = live.current.me;
      const run = m?.activeRun;
      if (run)
        out.push({
          id: `run:${run.id}`, kind: "deliver", lat: run.targetLat, lng: run.targetLng, emoji: "🎯", color: "#ff2e88", label: t(run.title), action: t("🏁 Deliver"), reach: INTERACT_RADIUS_M,
          run: () => live.current.act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } })).then((ok) => (ok && celebrate({ title: t("DELIVERED!"), art: "box", body: t(run.title) }), ok)),
        });
      for (const p of w?.places ?? []) {
        if (p.done || (run && p.kind === "deliver")) continue;
        const cat = PLACE_CATS[p.place.cat] ?? PLACE_CATS.shop;
        out.push({
          id: p.id, kind: p.kind === "deliver" ? "pickup" : "visit", lat: p.place.lat, lng: p.place.lng, emoji: p.emoji, color: p.kind === "deliver" ? "#ffd23f" : "#3dff8f",
          label: `${t(p.title)} · ${p.place.name}`, action: p.kind === "deliver" ? t("📦 Pick up · {place}", { place: p.place.name }) : t("✅ Check in · {place}", { place: p.place.name }), reach: INTERACT_RADIUS_M,
          run: () => live.current.act(() => api("/api/places", { body: { id: p.id } })).then((ok) => {
            if (ok) celebrate({ title: p.kind === "deliver" ? t("ORDER PICKED UP!") : t("CHECKED IN!"), body: p.kind === "deliver" ? t("Deliver to {dest}", { dest: p.dest?.name ?? t(CUSTOMER_DOOR) }) : p.place.name, emoji: cat.emoji });
            return ok;
          }),
        });
      }
      for (const b of w?.businesses ?? [])
        for (const c of b.campaigns) {
          if (c.visited || b.mine) continue;
          out.push({
            id: `biz:${c.id}`, kind: "biz", lat: b.lat, lng: b.lng, emoji: b.emoji, color: b.featured ? "#ff7ad9" : "#22e3ff", label: `${c.title} · ${b.name}`, action: t("✅ Check in · {place}", { place: b.name }), reach: BIZ_CHECKIN_M,
            run: () => live.current.act(() => api<{ message: string; code: string | null }>("/api/business", { body: { action: "checkin", campaignId: c.id } }).then((r) => {
              celebrate({ title: t("CHECKED IN!"), body: r.code ? t("Coupon code: {code}", { code: r.code }) : b.name, emoji: b.emoji });
              return r;
            })),
          });
          break;
        }
      return out;
    };

    const syncWorld = () => {
      const w = live.current.world;
      jobs = jobsFrom(w);
      const here = { x: st.x, z: st.z };
      const want = jobs
        .map((j) => ({ j, p: frame.toXZ(j.lat, j.lng) }))
        .map((x) => ({ ...x, d: Math.hypot(x.p.x - here.x, x.p.z - here.z) }))
        .filter((x) => x.d < 900)
        .sort((a, b) => a.d - b.d)
        .slice(0, lite ? 12 : 24);
      const keep = new Set(want.map((x) => x.j.id));
      for (const [id, b] of beacons) if (!keep.has(id)) (scene.remove(b.group), b.dispose(), beacons.delete(id));
      for (const { j, p } of want) {
        const have = beacons.get(j.id);
        if (have) {
          have.job = j;
          continue;
        }
        const b = Object.assign(makeBeacon(j.emoji, j.color, j.label), { job: j });
        b.group.position.set(p.x, 0, p.z);
        scene.add(b.group);
        beacons.set(j.id, b);
      }
      // Loot on the street: items, chests and power cells you drive through.
      const wantLoot = (w?.spawns ?? []).filter((s) => !s.claimed && (s.kind === "item" || s.kind === "chest" || s.kind === "arcade"));
      const lootKeep = new Set(wantLoot.map((s) => s.id));
      for (const [id, l] of loot) if (!lootKeep.has(id)) (scene.remove(l.group), l.dispose(), loot.delete(id));
      for (const s of wantLoot) {
        if (loot.has(s.id)) continue;
        const p = frame.toXZ(s.lat, s.lng);
        const emoji = s.kind === "chest" ? "🧰" : s.kind === "arcade" ? "🔋" : s.item?.emoji ?? "🪙";
        const l = Object.assign(makeLoot(emoji, s.kind === "chest" ? "#ffd23f" : "#22e3ff"), { id: s.id, taken: false });
        l.group.position.set(p.x, 0, p.z);
        scene.add(l.group);
        loot.set(s.id, l);
      }
      signsDirty = true;
    };

    /** Store-front signs for real places close to the car (beacons carry their own). */
    const syncSigns = () => {
      signsDirty = false;
      const places: Place[] = [];
      for (const s of tiles.values()) if (s.real && s.data) places.push(...s.data.p);
      const busy = new Set([...beacons.values()].map((b) => `${b.job.lat.toFixed(5)},${b.job.lng.toFixed(5)}`));
      const near = places
        .map((p) => ({ p, q: frame.toXZ(p.lat, p.lng) }))
        .map((x) => ({ ...x, d: Math.hypot(x.q.x - st.x, x.q.z - st.z) }))
        .filter((x) => x.d < 230 && !busy.has(`${x.p.lat.toFixed(5)},${x.p.lng.toFixed(5)}`))
        .sort((a, b) => a.d - b.d)
        .slice(0, lite ? 14 : 32);
      const keep = new Set(near.map((x) => x.p.id));
      for (const [id, s] of signs) if (!keep.has(id)) (scene.remove(s.sprite), s.dispose(), signs.delete(id));
      for (const { p, q } of near) {
        if (signs.has(p.id)) continue;
        const cat = PLACE_CATS[p.cat as PlaceCat] ?? PLACE_CATS.shop;
        const s = makeSign(cat.emoji, p.name, cat.color);
        s.sprite.position.set(q.x, 6.5, q.z);
        scene.add(s.sprite);
        signs.set(p.id, s);
      }
    };

    // ---- sound: a little engine that revs with speed
    let engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
    const startEngine = () => {
      if (engine) return;
      const out = audioOut();
      if (!out) return;
      const { ctx } = out;
      const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc2.type = "square";
      osc2.detune.value = 9;
      filter.type = "lowpass";
      filter.frequency.value = 420;
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(out.out);
      osc.start();
      osc2.start();
      engine = { osc, osc2, gain, filter };
    };
    const horn = () => {
      const out = audioOut();
      if (!out || isMuted()) return;
      const { ctx } = out;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      g.connect(out.out);
      for (const f of [392, 494]) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        o.connect(g);
        o.start();
        o.stop(ctx.currentTime + 0.5);
      }
    };

    // ---- input
    const keyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      input.current.keys.add(k);
      if (k === "h") horn();
      if (k === "c") cycleCam();
      startEngine();
    };
    const keyUp = (e: KeyboardEvent) => input.current.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    const firstTouch = () => startEngine();
    el.addEventListener("pointerdown", firstTouch);

    const cycleCam = () => {
      camMode = camMode === "chase" ? "far" : camMode === "far" ? "top" : "chase";
    };
    api3d.current = {
      setGoal: (p) => (navGoal = p),
      cycleCam,
      horn,
      recolor: () => {
        color = CAR_COLORS[(CAR_COLORS.indexOf(color) + 1) % CAR_COLORS.length];
        try {
          localStorage.setItem(COLOR_KEY, color);
        } catch {}
        const old = car;
        car = makeCar(color);
        scene.remove(old.group);
        old.dispose();
        scene.add(car.group);
      },
    };

    // ---- the loop
    const startXZ = frame.toXZ(start.lat, start.lng);
    st.x = startXZ.x;
    st.z = startXZ.z;
    st.reported = { x: st.x, z: st.z };
    let last = performance.now();
    let lastSlow = 0, lastHud = 0, lastMini = 0, lastWorld: World | null = null;
    let phase: Phase = "day";
    const maxV = () => (Math.max(10, S.driveSpeedKmh) / 3.6) * 0.95;

    const applyPhase = (p: Phase) => {
      phase = p;
      const c = SKY[p];
      sky.mat.uniforms.top.value.set(c.top);
      sky.mat.uniforms.horizon.value.set(c.horizon);
      sky.mat.uniforms.sunCol.value.set(c.sun);
      sky.mat.uniforms.stars.value = p === "night" ? 1 : 0;
      scene.fog = new THREE.Fog(c.fog, 160, lite ? 520 : 720);
      renderer.setClearColor(c.fog);
      hemi.intensity = c.hemi;
      hemi.color.set(p === "night" ? "#8a9cff" : "#ffffff");
      hemi.groundColor.set(c.ground);
      sun.intensity = c.sunI;
      sun.color.set(c.sun);
      (ground.material as THREE.MeshLambertMaterial).color.set(c.ground);
      const night = p === "night" ? 1 : p === "dusk" || p === "dawn" ? 0.45 : 0;
      setNight(mats, night);
      dustMat.opacity = p === "night" ? 0.95 : 0.35;
      dustMat.color.set(p === "night" ? "#b8ff7a" : "#fff3b0");
    };
    applyPhase((live.current.world?.phase as Phase) ?? "day");

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = now / 1000;
      const L = live.current;
      if (L.world !== lastWorld) {
        lastWorld = L.world;
        if (L.world && L.world.phase !== phase) applyPhase(L.world.phase as Phase);
        syncWorld();
      }

      // -- driving
      const keys = input.current.keys;
      const kGas = keys.has("w") || keys.has("arrowup") ? 1 : 0;
      const kBrake = keys.has("s") || keys.has("arrowdown") ? 1 : 0;
      const kSteer = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
      const gas = Math.max(kGas, input.current.gas), brake = Math.max(kBrake, input.current.brake);
      const steerIn = kSteer || input.current.steer;
      const hand = keys.has(" ") || input.current.hand;
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw); // forward
      const rx = -fz, rz = fx; // right
      let vF = st.vx * fx + st.vz * fz, vR = st.vx * rx + st.vz * rz;

      if (L.canDrive) {
        const V = maxV();
        if (gas) vF += (vF < 0 ? 16 : 8.5 * (1 - Math.max(0, vF) / V)) * gas * dt;
        if (brake) vF -= (vF > 0.5 ? 18 : 6 * (1 + vF / 7)) * brake * dt; // brake, then reverse
        if (!gas && !brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (1.4 + Math.abs(vF) * 0.12) * dt);
        vF = Math.max(-7, Math.min(V, vF));
        // Grip: sideways speed bleeds off fast — unless the handbrake is on (drift!).
        vR *= Math.exp(-(hand ? 1.6 : 9) * dt);
        st.steer += (steerIn * (0.62 - 0.4 * Math.min(1, Math.abs(vF) / V)) - st.steer) * Math.min(1, dt * 8);
        st.yaw += (vF / 2.7) * Math.tan(st.steer) * dt * (hand ? 1.35 : 1);
      }
      const nfx = -Math.sin(st.yaw), nfz = -Math.cos(st.yaw);
      if (L.canDrive) {
        st.vx = nfx * vF + -nfz * vR;
        st.vz = nfz * vF + nfx * vR;
      } else if (L.follow) {
        // Walking with GPS: glide to where the phone says you are, nose first.
        const p = frame.toXZ(L.follow.lat, L.follow.lng);
        const dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
        if (d > 250) {
          st.x = p.x;
          st.z = p.z;
          st.vx = st.vz = 0;
        } else {
          const k = Math.min(1, dt * 2.5) / Math.max(dt, 1e-3);
          st.vx = dx * k;
          st.vz = dz * k;
          if (d > 0.8) {
            const want = Math.atan2(-dx, -dz);
            st.yaw += Math.atan2(Math.sin(want - st.yaw), Math.cos(want - st.yaw)) * Math.min(1, dt * 4);
          }
        }
        vF = Math.hypot(st.vx, st.vz);
        st.steer = 0;
      } else {
        st.vx = st.vz = 0;
        vF = 0;
      }
      let nx = st.x + st.vx * dt, nz = st.z + st.vz * dt;
      if (L.canDrive) {
        // Two circles (front and back) so the nose and tail both bump into walls.
        let hit = null as { nx: number; nz: number } | null;
        for (const off of [1.15, -1.15]) {
          const c = collide(nx + nfx * off, nz + nfz * off, CAR_R);
          if (c.hit) {
            nx = c.x - nfx * off;
            nz = c.z - nfz * off;
            hit = c.hit;
          }
        }
        if (hit) {
          const into = st.vx * hit.nx + st.vz * hit.nz;
          if (into < 0) {
            st.vx -= into * hit.nx * 1.3;
            st.vz -= into * hit.nz * 1.3;
            st.vx *= 0.7;
            st.vz *= 0.7;
            if (-into > 6 && now - st.bumpAt > 400) {
              st.bumpAt = now;
              sfx("hit");
              navigator.vibrate?.(30);
            }
          }
        }
      }
      st.x = nx;
      st.z = nz;
      st.speed = Math.hypot(st.vx, st.vz);

      // -- car pose: body roll in turns, squat under throttle, spinning wheels
      car.group.position.set(st.x, 0, st.z);
      car.group.rotation.y = st.yaw;
      st.roll += (-st.steer * Math.min(1, st.speed / 12) * 0.12 - st.roll) * Math.min(1, dt * 6);
      st.pitch += ((gas - brake) * 0.035 * Math.min(1, st.speed / 4 + 0.3) - st.pitch) * Math.min(1, dt * 5);
      car.body.rotation.z = st.roll;
      car.body.rotation.x = st.pitch;
      st.wheelSpin += (vF / 0.44) * dt;
      for (const w of car.wheels) w.rotation.x = -st.wheelSpin;
      for (const s of car.steer) s.rotation.y = st.steer;
      car.brake.color.set(brake && vF > 0.3 ? "#ff2a3d" : "#7a1020");
      car.beams.visible = phase === "night" || phase === "dusk";
      car.cargo.visible = !!L.me?.activeRun;

      // -- camera
      const speedK = Math.min(1, st.speed / maxV());
      const dist = camMode === "chase" ? 9 + speedK * 4 : camMode === "far" ? 22 : 4;
      const height = camMode === "chase" ? 3.8 + speedK * 1.2 : camMode === "far" ? 14 : 60;
      const want = camMode === "top" ? new THREE.Vector3(st.x + nfx * 6, height, st.z + nfz * 6 + 0.01) : new THREE.Vector3(st.x - nfx * dist, height, st.z - nfz * dist);
      camPos.lerp(want, 1 - Math.exp(-dt * (camMode === "top" ? 6 : 4.5)));
      // Don't let the camera end up inside a building: pull it in toward the car.
      if (camMode !== "top") {
        const c = collide(camPos.x, camPos.z, 1);
        if (c.hit) camPos.set(c.x, camPos.y, c.z);
      }
      camera.position.copy(camPos);
      // Looking straight down, "up" on screen is the way the car faces (lookAt needs an up that isn't the view axis).
      if (camMode === "top") camera.up.set(nfx, 0, nfz);
      else camera.up.set(0, 1, 0);
      camLook.set(st.x + nfx * 4, 1.2, st.z + nfz * 4);
      camera.lookAt(camLook);
      const fov = 62 + speedK * 10;
      if (Math.abs(camera.fov - fov) > 0.1) (camera.fov = fov), camera.updateProjectionMatrix();

      // -- lights & sky follow the car
      sky.mesh.position.copy(camera.position);
      ground.position.set(Math.round(st.x / 50) * 50, 0, Math.round(st.z / 50) * 50);
      sun.position.set(st.x + 80, 160, st.z - 60);
      sun.target.position.set(st.x, 0, st.z);
      for (const c of clouds.group.children) {
        c.position.x += (c.userData.speed as number) * dt;
        if (c.position.x - st.x > 700) c.position.x -= 1400;
        if (c.position.z - st.z > 700) c.position.z -= 1400;
        if (st.z - c.position.z > 700) c.position.z += 1400;
        if (st.x - c.position.x > 700) c.position.x += 1400;
      }
      dust.position.set(st.x, 0, st.z);
      dust.rotation.y = time * 0.03;
      for (const b of beacons.values()) b.tick(time);
      for (const l of loot.values()) l.tick(time);

      // -- nav arrow toward the goal (or the delivery target)
      const goalLL = navGoal ?? (L.me?.activeRun ? { lat: L.me.activeRun.targetLat, lng: L.me.activeRun.targetLng } : null);
      if (goalLL) {
        const g = frame.toXZ(goalLL.lat, goalLL.lng);
        const d = Math.hypot(g.x - st.x, g.z - st.z);
        arrow.visible = d > 25;
        arrow.position.set(st.x, 3.6 + Math.sin(time * 3) * 0.15, st.z);
        arrow.rotation.y = Math.atan2(-(g.x - st.x), -(g.z - st.z));
        if (navGoal && d < 30) navGoal = null; // arrived
      } else arrow.visible = false;

      // -- engine note
      if (engine) {
        const out = audioOut();
        if (out) {
          const tt = out.ctx.currentTime;
          const rpm = 0.25 + speedK * 0.75 + gas * 0.12;
          engine.osc.frequency.setTargetAtTime(38 + rpm * 70, tt, 0.08);
          engine.osc2.frequency.setTargetAtTime(19 + rpm * 35, tt, 0.08);
          engine.filter.frequency.setTargetAtTime(300 + rpm * 900, tt, 0.1);
          engine.gain.gain.setTargetAtTime(isMuted() || !L.canDrive ? 0 : 0.035 + rpm * 0.03, tt, 0.15);
        }
      }

      // -- slower work: tiles, loot pick-ups, position reports
      if (now - lastSlow > 250) {
        lastSlow = now;
        ensureTiles();
        if (signsDirty || Math.random() < 0.25) syncSigns();
        for (const l of loot.values()) {
          if (l.taken) continue;
          if (Math.hypot(l.group.position.x - st.x, l.group.position.z - st.z) < LOOT_PICKUP_M) {
            l.taken = true;
            l.group.visible = false;
            void Promise.resolve(L.onClaim(l.id));
          }
        }
        if (L.canDrive && L.onMove && now - st.lastReport > 1000 && Math.hypot(st.x - st.reported.x, st.z - st.reported.z) > 2) {
          st.lastReport = now;
          st.reported = { x: st.x, z: st.z };
          L.onMove(frame.toLatLng(st.x, st.z));
        }
      }
      buildNext();

      // -- HUD (React, ~6 Hz)
      if (now - lastHud > 160) {
        lastHud = now;
        const here = frame.toLatLng(st.x, st.z);
        let near: Job | null = null, nearD = Infinity;
        for (const j of jobs) {
          const d = distanceM(here, j);
          if (d <= j.reach && d < nearD) (near = j), (nearD = d);
        }
        const navInfo = goalLL ? { label: navGoal ? t("Destination") : t(L.me?.activeRun?.title ?? ""), dist: distanceM(here, goalLL), rel: ((bearingTo(here, goalLL) - (((-st.yaw * 180) / Math.PI) % 360) + 540) % 360) - 180 } : null;
        let loading = 0, village = false;
        for (const s of tiles.values()) {
          if (!s.real && (s.inflight || s.retryAt)) loading++;
          if (!s.real && boxDist(tileBox(s.cx, s.cy), st.x, st.z) < 1) village = true;
        }
        setHud({
          speed: Math.round(st.speed * 3.6),
          near,
          nav: navInfo,
          loading,
          village,
          cam: camMode,
          night: phase === "night",
          jobs: jobs.map((j) => ({ id: j.id, emoji: j.emoji, label: j.label, dist: distanceM(here, j), lat: j.lat, lng: j.lng })).sort((a, b) => a.dist - b.dist).slice(0, 30),
        });
        if (wheelRef.current) wheelRef.current.style.transform = `rotate(${-st.steer * 160}deg)`;
      }

      // -- minimap (~8 Hz): roads around the car, heading up
      const mc = mini.current;
      if (mc && now - lastMini > 120) {
        lastMini = now;
        const g = mc.getContext("2d");
        if (g) {
          const W = mc.width, R = W / 2, scale = R / 220; // 220 m to the edge
          g.save();
          g.clearRect(0, 0, W, W);
          g.beginPath();
          g.arc(R, R, R - 2, 0, Math.PI * 2);
          g.clip();
          g.fillStyle = phase === "night" ? "rgba(20,22,52,.88)" : "rgba(222,244,210,.9)";
          g.fillRect(0, 0, W, W);
          g.translate(R, R);
          g.rotate(st.yaw);
          g.strokeStyle = phase === "night" ? "#8f93c9" : "#8b8fae";
          g.lineCap = "round";
          for (const s of tiles.values()) {
            for (const line of s.build?.roads ?? []) {
              g.lineWidth = 3;
              g.beginPath();
              for (let i = 0; i < line.length; i += 2) {
                const x = (line[i] - st.x) * scale, y = (line[i + 1] - st.z) * scale;
                if (i === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
              }
              g.stroke();
            }
          }
          for (const b of beacons.values()) {
            const x = (b.group.position.x - st.x) * scale, y = (b.group.position.z - st.z) * scale;
            g.fillStyle = b.job.color;
            g.beginPath();
            g.arc(x, y, 4.5, 0, Math.PI * 2);
            g.fill();
          }
          if (goalLL) {
            const p = frame.toXZ(goalLL.lat, goalLL.lng);
            const len = Math.hypot(p.x - st.x, p.z - st.z) * scale;
            const ang = Math.atan2(p.z - st.z, p.x - st.x);
            const r = Math.min(len, R - 8);
            g.fillStyle = "#ff2e88";
            g.beginPath();
            g.arc(Math.cos(ang) * r, Math.sin(ang) * r, 6, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          // The car: always in the middle, pointing up.
          g.fillStyle = "#ff5d73";
          g.strokeStyle = "#fff";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(R, R - 9);
          g.lineTo(R + 6, R + 7);
          g.lineTo(R, R + 3);
          g.lineTo(R - 6, R + 7);
          g.closePath();
          g.fill();
          g.stroke();
        }
      }

      renderer.render(scene, camera);
    };
    let raf = requestAnimationFrame(tick);
    ensureTiles();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __drive?: unknown }).__drive = { st, scene, camera, tiles, beacons, renderer, mats, live, input, applyPhase: (p: Phase) => applyPhase(p) };

    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", firstTouch);
      ro.disconnect();
      if (engine) {
        try {
          engine.osc.stop();
          engine.osc2.stop();
          engine.gain.disconnect();
        } catch {}
      }
      for (const s of tiles.values()) s.build?.dispose();
      for (const b of beacons.values()) b.dispose();
      for (const l of loot.values()) l.dispose();
      for (const s of signs.values()) s.dispose();
      car.dispose();
      mats.dispose();
      clouds.geo.dispose();
      clouds.mat.dispose();
      sky.mat.dispose();
      sky.mesh.geometry.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      arrow.geometry.dispose();
      arrowMat.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api3d.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- touch controls
  const hold = (k: "gas" | "brake", v: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      input.current[k] = v;
    },
    onPointerUp: () => (input.current[k] = 0),
    onPointerCancel: () => (input.current[k] = 0),
    onLostPointerCapture: () => (input.current[k] = 0),
  });
  const steerPad = useRef<{ id: number; x: number } | null>(null);
  const padHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      steerPad.current = { id: e.pointerId, x: e.clientX };
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (steerPad.current?.id !== e.pointerId) return;
      // Drag left/right like turning a wheel: 70 px is full lock.
      input.current.steer = Math.max(-1, Math.min(1, -(e.clientX - steerPad.current.x) / 70));
    },
    onPointerUp: () => ((steerPad.current = null), (input.current.steer = 0)),
    onPointerCancel: () => ((steerPad.current = null), (input.current.steer = 0)),
  };

  const runNear = async () => {
    if (!hud?.near || busy) return;
    setBusy(true);
    try {
      await hud.near.run();
      refresh();
    } finally {
      setBusy(false);
    }
  };
  // ➤ points right; 0° relative bearing is straight ahead (up).
  const arrowStyle = hud?.nav ? { transform: `rotate(${hud.nav.rel - 90}deg)` } : undefined;

  return (
    <div className="drive" role="application" aria-label={t("3D city")}>
      <div className="drive-canvas" ref={mount} />

      <div className="drive-top">
        <Button className="fab drive-exit" onClick={onExit} aria-label={t("Back to the map")} title={t("Back to the map")}>🗺️</Button>
        <div className="drive-speed">
          <b>{fmtNum(hud?.speed ?? 0)}</b>
          <span>{t("km/h")}</span>
        </div>
        {hud?.nav && (
          <div className="drive-nav">
            <span className="drive-nav-arrow" style={arrowStyle}>➤</span>
            <div>
              <b>{hud.nav.label}</b>
              <span className="small">{formatDistance(hud.nav.dist)}</span>
            </div>
          </div>
        )}
        <canvas className="drive-mini" ref={mini} width={256} height={256} />
      </div>

      <a className="drive-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      {!canDrive && <div className="drive-banner">🚶 {t("Following your real GPS — switch to Play from home to drive anywhere")}</div>}
      {hud && hud.loading > 0 && <div className="drive-loading">🗺️ {hud.village ? t("Drawing this neighbourhood from the real map…") : t("Loading the city…")}</div>}

      <div className="drive-side">
        <Button className="fab" onClick={() => setJobsOpen(!jobsOpen)} aria-label={t("Jobs nearby")} title={t("Jobs nearby")}>📋{hud?.jobs.length ? <span className="badge">{fmtNum(hud.jobs.length)}</span> : null}</Button>
        <Button className="fab" onClick={() => api3d.current?.cycleCam()} aria-label={t("Camera")} title={t("Camera")}>🎥</Button>
        <Button className="fab" onClick={() => api3d.current?.recolor()} aria-label={t("Paint the car")} title={t("Paint the car")}>🎨</Button>
        <Button className="fab" onClick={() => api3d.current?.horn()} aria-label={t("Horn")} title={t("Horn")}>📯</Button>
      </div>

      {jobsOpen && hud && (
        <div className="drive-jobs">
          <div className="row">
            <b className="grow">📋 {t("Jobs nearby")}</b>
            <button className="close" onClick={() => setJobsOpen(false)} aria-label={t("Close")}>✕</button>
          </div>
          {hud.jobs.length === 0 && <p className="small muted">{t("No jobs around here yet — drive on, or check back in a few minutes.")}</p>}
          {hud.jobs.map((j) => (
            <button key={j.id} className="drive-job" onClick={() => (api3d.current?.setGoal({ lat: j.lat, lng: j.lng }), setJobsOpen(false), toast({ title: t("🧭 Heading to {place}", { place: j.label }) }))}>
              <span className="ic">{j.emoji}</span>
              <span className="grow">{j.label}</span>
              <span className="small muted">{formatDistance(j.dist)}</span>
            </button>
          ))}
        </div>
      )}

      {hud?.near && (
        <Button className="btn yellow big-btn drive-action" disabled={busy} onClick={runNear}>{hud.near.action}</Button>
      )}

      {canDrive && touch && (
        <div className="drive-pad">
          <div className="drive-wheel-zone" {...padHandlers}>
            <div className="drive-wheel" ref={wheelRef}>☸️</div>
            <span className="small">{t("drag to steer")}</span>
          </div>
          <div className="drive-pedals">
            <button className="pedal brake" aria-label={t("Brake / reverse")} {...hold("brake", 1)}>◼</button>
            <button className="pedal gas" aria-label={t("Gas")} {...hold("gas", 1)}>▲</button>
          </div>
        </div>
      )}
      {canDrive && !touch && <div className="drive-keys small">{t("W/↑ gas · S/↓ brake · A D/← → steer · Space drift · H horn · C camera")}</div>}
      <button className="drive-drift" hidden={!canDrive || !touch} onPointerDown={() => (input.current.hand = true)} onPointerUp={() => (input.current.hand = false)} onPointerCancel={() => (input.current.hand = false)}>
        {t("DRIFT")}
      </button>
    </div>
  );
}
