"use client";
// The 3D city: drive (or fly) through the real streets around you — real buildings,
// roads with their names (painted on the asphalt and on signs at the corners, in the
// language the player picks), parks, water and street furniture from OpenStreetMap; every
// real shop with its sign, a pin over its roof and a line in the Places list; every job, base, boss, flag and player from the game standing
// where it is on the map; friends driving alongside, and party games with them.
// From home (or in test mode) the vehicle *is* your commander: where you drive is where
// you are in the game. Walking with GPS, the vehicle follows you instead.
//
// Loading is built to never stall the drive: tiles come from memory/IndexedDB first and
// from the server in batches (tiles.ts), geometry is built on Web Workers (tileMesh.ts),
// at most one finished tile is added per frame (nearest first), far tiles drop their
// street furniture, and the render resolution adapts to keep the frame rate up.
// Solid things are solid: walls, trees, posts, shelters and other players' cars.
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { bearingTo, distanceM, formatDistance, type LatLng } from "@/lib/geo";
import { makeFrame, tileKey, tileOf, villageTile, withDetail, type CityTile } from "@/lib/city";
import { CUSTOMER_DOOR, PLACE_CATS } from "@/lib/places";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import { BIZ_CHECKIN_M } from "@/lib/business";
import { S } from "@/lib/settings";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import { allowedVehicle, isPaint, LAND_ALT_M, lowEnough, PAINTS, VEHICLES, type VehicleKey } from "@/lib/vehicles";
import { CHECKPOINT_M, type PartyGame, type PartyView } from "@/lib/party";
import { Button } from "@/components/Button";
import { Art } from "@/components/art/Art";
import { api, type Selected, type World, type WorldPlayer } from "../game/client";
import { useGame } from "../game/ui";
import { audioOut, isMuted, keepAwake, sfx } from "../game/sfx";
import { celebrate } from "../game/Play";
import { isLite, isTouch } from "../perf";
import { layCourse } from "./course";
import { DriveGarage } from "./DriveGarage";
import { DrivePad, STEER_MODES, type SteerMode } from "./DrivePad";
import { Icon, type IconName } from "./icons";
import { DriveParty, PartyHud } from "./DriveParty";
import { Markers, markersOf } from "./markers";
import { DriveNet, type NetState } from "./net";
import { Landmarks } from "./landmarks";
import { Others } from "./others";
import { StorePins, type Pin } from "./pins";
import { CollisionWorld, forward, stepAir, stepGround, type Body } from "./physics";
import { BuildPool, DetailSource, TileSource, VectorSource } from "./tiles";
import { lineColors, TrafficCars, TrafficFeed } from "./traffic";
import { Crowd } from "./people";
import { signalPhase } from "@/lib/traffic";
import { Skyline } from "./skyline";
import type { Label, Style } from "./tileMesh";
import { oneLine, tradeOf } from "./trades";
import { NAME_MODES, type NameMode } from "./vectorTile";
import { Combat } from "../arena/combat";
import { CombatHud, useCombat } from "../arena/CombatHud";
import { CombatPad } from "../arena/CombatPad";
import { ArenaMenu } from "../arena/ArenaMenu";
import { RT_DELAY_MS } from "../arena/remotes";
import { F_FOOT, type ArenaGeo } from "@/lib/arena/protocol";
import { makeCockpit, makeVehicle, type Cockpit, type VehicleModel } from "./vehicles3d";
import {
  makeBeacon, makeClouds, makeCoin, makeCornerSign, makeGate, makeLoot, makeMaterials, makePlaque, makeShopSign, makeSign, makeSkySystem, makeStreetLabel, makeTemplates, paintSignals, setNight, tileMeshes,
  type Board, type Phase, type TileMeshes,
} from "./world3d";

type Props = {
  start: LatLng;
  /** Head here first ("Drive there" on a map card). */
  goal?: LatLng | null;
  /** The vehicle moves the commander (play from home / test mode). Otherwise it follows `follow`. */
  canDrive: boolean;
  /** Test mode (simulated GPS) rather than play from home. */
  sim?: boolean;
  follow: LatLng | null;
  onMove: ((p: LatLng) => void) | null;
  /** Pick up money (driving through it). */
  onCollect: (id: string) => Promise<void> | void;
  /** Open something's card in the game (leaves the 3D city). */
  onSelect: (s: Selected) => void;
  /** Open my profile (leaves the 3D city). */
  onProfile: () => void;
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
  /** The action button when you're there: what you do, where, and its icon. */
  verb: string;
  where: string;
  icon: IconName;
  reach: number;
  sel: Selected | null;
  run: () => Promise<boolean>;
};

type CamMode = "cockpit" | "chase" | "far" | "top";
type MenuTab = "jobs" | "places" | "garage" | "party" | "arena";
/** A line in the Places list: a real shop from the map, a player's shop or a business. */
type PlaceRow = { id: string; emoji: string; name: string; sub: string; dist: number; lat: number; lng: number; sel: Selected | null };
const CAM_LABEL: Record<CamMode, string> = { cockpit: "1P", chase: "3P", far: "FAR", top: "TOP" };
type Picked = { emoji: string; title: string; sub: string; lat: number; lng: number; sel: Selected | null };
type Hud = {
  flying: boolean;
  low: boolean;
  near: Job | null;
  nav: { label: string; dist: number; rel: number } | null;
  loading: number;
  village: boolean;
  cam: CamMode;
  jobs: { id: string; emoji: string; label: string; dist: number; lat: number; lng: number }[];
  night: boolean;
  street: string | null;
  fps: number;
  serverNow: number;
};

const VEHICLE_KEY = "sq_vehicle";
const COLOR_KEY = "sq_car_color";
const STYLE_KEY = "sq_drive_style";
const LOAD_M = 600; // load tiles whose box is this close
const DROP_M = 1150; // and drop them past this
const DETAIL_M = 320; // street furniture only this close
const LOOT_PICKUP_M = 16;
const CAMS: CamMode[] = ["cockpit", "chase", "far", "top"];
const CAM_KEY = "sq_drive_cam";
const CTL_KEY = "sq_drive_ctl";
const NAMES_KEY = "sq_drive_names";
const FLY_HINT_KEY = "sq_fly_hint_off";
const PIN_M = 650; // shop pins this far
const CORNER_M = 170; // street-name signs at corners this close

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

export default function Drive({ start, goal, canDrive, sim, follow, onMove, onCollect, onSelect, onProfile, onExit }: Props) {
  const { me, world, act, refresh, toast } = useGame();
  const mount = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [menu, setMenu] = useState<MenuTab | null>(null);
  const [showKeys, setShowKeys] = useState(true);
  useEffect(() => {
    const k = setTimeout(() => setShowKeys(false), 9000);
    return () => clearTimeout(k);
  }, []);
  const [busy, setBusy] = useState(false);
  const [combat, setCombat] = useState<Combat | null>(null);
  const fight = useCombat(combat);
  const onFoot = !!fight?.onFoot;
  const [footKeys, setFootKeys] = useState(false);
  useEffect(() => {
    setFootKeys(onFoot);
    if (!onFoot) return;
    const k = setTimeout(() => setFootKeys(false), 12_000);
    return () => clearTimeout(k);
  }, [onFoot]);
  const [touch, setTouch] = useState(isTouch);
  // Some Android browsers claim a mouse; the first finger on the screen settles it.
  useEffect(() => {
    if (touch) return;
    const on = (e: PointerEvent) => e.pointerType === "touch" && setTouch(true);
    window.addEventListener("pointerdown", on);
    return () => window.removeEventListener("pointerdown", on);
  }, [touch]);
  const [style, setStyle] = useState<Style>(() => (store.get(STYLE_KEY) === "toon" ? "toon" : "real"));
  const [vehicle, setVehicle] = useState<VehicleKey>(() => allowedVehicle(store.get(VEHICLE_KEY), me?.level ?? 1));
  const [paint, setPaint] = useState(() => {
    const c = store.get(COLOR_KEY);
    return isPaint(c) ? c : PAINTS[0];
  });
  const [names, setNames] = useState<NameMode>(() => {
    const n = store.get(NAMES_KEY) as NameMode | null;
    return n && NAME_MODES.includes(n) ? n : "mine";
  });
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [query, setQuery] = useState("");
  const placeQuery = useRef("");
  const [party, setParty] = useState<PartyView | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [banner, setBanner] = useState<{ text: string; at: number } | null>(null);
  // "Fly low to pick things up": once waved away, gone for good on this device.
  const [flyHintOff, setFlyHintOff] = useState(() => store.get(FLY_HINT_KEY) === "1");
  const input = useRef({ gas: 0, brake: 0, steer: 0, lift: 0, hand: false, keys: new Set<string>() });
  const [ctl, setCtl] = useState<SteerMode>(() => {
    const c = store.get(CTL_KEY) as SteerMode | null;
    return c && STEER_MODES.includes(c) ? c : "wheel";
  });
  const gauge = useRef<HTMLDivElement>(null);
  const menuOpen = useRef(false);
  menuOpen.current = !!menu;
  const menuTab = useRef<MenuTab | null>(null);
  menuTab.current = menu;
  /** Jobs waved away with ✕. The loop skips them, so the next job at the same spot shows,
   * and forgets each one once you're out of its reach, so it's back when you return. */
  const dismissed = useRef(new Set<string>());
  /** The job the player chose to drive to. Only that one (and the active delivery) gets the
   * action button; pickups and check-ins you merely drive past don't pop one up. */
  const wanted = useRef<string | null>(null);
  // Latest props/context for the render loop (it lives as long as the component).
  const live = useRef({ world, me, follow, canDrive, onMove, onCollect, onSelect, goal: goal ?? null, act, refresh, vehicle, paint, sim: !!sim, toast, touch });
  live.current = { ...live.current, world, me, follow, canDrive, onMove, onCollect, onSelect, act, refresh, vehicle, paint, sim: !!sim, toast, touch };
  const api3d = useRef<{
    setGoal: (p: LatLng | null) => void;
    cycleCam: () => void;
    horn: () => void;
    land: () => void;
    course: (g: PartyGame) => { start: LatLng & { yaw: number }; points: LatLng[] } | null;
    kick: () => void;
  } | null>(null);
  // Survives a graphics-style switch (which rebuilds the scene).
  const persist = useRef<{ frame: ReturnType<typeof makeFrame>; body: Body; placed: "" | "village" | "real"; placedAt: { x: number; z: number }; cam: CamMode; warpRound: number } | null>(null);

  // A vehicle you haven't unlocked (level dropped, other device) falls back to the hatchback.
  useEffect(() => {
    if (me && allowedVehicle(vehicle, me.level) !== vehicle) setVehicle("car");
  }, [me?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let disposed = false;
    const lite = isLite();
    if (!persist.current) {
      const frame = makeFrame(start);
      const p = frame.toXZ(start.lat, start.lng);
      const savedCam = store.get(CAM_KEY);
      persist.current = { frame, body: { x: p.x, z: p.z, alt: 0, cruise: 0, yaw: 0, vx: 0, vz: 0, vy: 0, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0 }, placed: "", placedAt: p, cam: CAMS.includes(savedCam as CamMode) ? (savedCam as CamMode) : "cockpit", warpRound: 0 };
    }
    const P = persist.current;
    const frame = P.frame;
    const st = P.body;
    const st0 = { lastReport: 0, reported: { x: st.x, z: st.z }, bumpAt: 0 };

    // ---- renderer & scene
    const renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: "high-performance" });
    const maxDpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75);
    let dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    let shadows = !lite;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, el.clientWidth / el.clientHeight, 0.5, 2400);
    const sky = makeSkySystem(renderer, scene, style);
    // The real mountains on the horizon, from elevation data.
    const skyline = new Skyline(frame, () => (scene.fog as THREE.Fog | null)?.color ?? new THREE.Color("#c3d2df"), lite);
    scene.add(skyline.group);
    const hemi = new THREE.HemisphereLight("#ffffff", "#88aa77", 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 500 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);
    const groundMat = style === "real" ? new THREE.MeshStandardMaterial({ color: "#7a8262", roughness: 1 }) : new THREE.MeshLambertMaterial({ color: "#9bd27f" });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = shadows;
    scene.add(ground);
    const clouds = style === "toon" ? makeClouds(lite ? 8 : 18) : null;
    if (clouds) scene.add(clouds.group);
    const mats = makeMaterials(style);
    const tpl = makeTemplates(style);
    const collision = new CollisionWorld();
    // Street furniture apart from the buildings: it stops the vehicle, but never the
    // camera, a landing flyer or the search for a street to start on.
    const obstacles = new CollisionWorld();

    // Fireflies around the car in the storybook city.
    const dustN = style === "toon" ? (lite ? 90 : 220) : 0;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) dustPos.set([(Math.random() - 0.5) * 160, 1 + Math.random() * 14, (Math.random() - 0.5) * 160], i * 3);
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ color: "#fff3b0", size: 0.35, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const dust = new THREE.Points(dustGeo, dustMat);
    if (dustN) scene.add(dust);

    // ---- my vehicle
    let model: VehicleModel = makeVehicle(live.current.vehicle, live.current.paint, style, { lights: true, shadows });
    scene.add(model.group);
    // First person: the view from the driver's seat replaces the body.
    let cockpit: Cockpit = makeCockpit(live.current.vehicle, live.current.paint, style);
    model.group.add(cockpit.group);
    let modelKey = `${live.current.vehicle}|${live.current.paint}`;
    /** What the server lets me drive right now (party rounds can force wheels). */
    let serverVehicle: VehicleKey | null = null;
    const currentKey = (): VehicleKey => serverVehicle ?? live.current.vehicle;
    const def = () => VEHICLES[currentKey()];
    const rebuildModel = () => {
      const want = `${currentKey()}|${live.current.paint}`;
      if (want === modelKey) return;
      scene.remove(model.group);
      model.dispose();
      model = makeVehicle(currentKey(), live.current.paint, style, { lights: true, shadows });
      scene.add(model.group);
      cockpit.dispose();
      cockpit = makeCockpit(currentKey(), live.current.paint, style);
      model.group.add(cockpit.group);
      modelKey = want;
      if (!VEHICLES[currentKey()].flies) st.alt = st.cruise = st.vy = 0;
    };
    let camMode: CamMode = P.cam;
    const camPos = new THREE.Vector3(st.x, 6, st.z + 12);
    const camLook = new THREE.Vector3();
    const eyeW = new THREE.Vector3();
    let headYaw = st.yaw, sway = 0;

    // Navigation arrow over the vehicle.
    const arrowMat = new THREE.MeshBasicMaterial({ color: "#f0c05a" });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 4), arrowMat);
    arrow.geometry.rotateX(-Math.PI / 2);
    arrow.visible = false;
    scene.add(arrow);

    // ---- tiles: load → build on a worker → add to the scene, nearest first
    type Slot = { key: string; cx: number; cy: number; mesh: TileMeshes | null; real: boolean; data: CityTile | null; want: CityTile | null; villageAt: number; building: boolean; dist: number };
    const tiles = new Map<string, Slot>();
    const ready: { key: string; mesh: TileMeshes; data: CityTile }[] = [];
    const pool = new BuildPool(Math.max(1, Math.min(2, (navigator.hardwareConcurrency ?? 2) - 1)));
    // A city pack's street detail (trees, crossings, pitches…) is laid over each map tile;
    // a tile whose detail turns up after it was built is built again.
    const base = new Map<string, CityTile>();
    const details = new DetailSource((key) => {
      const b = base.get(key);
      if (b) take(b);
    });
    const take = (tile: CityTile) => {
      const slot = tiles.get(tile.key);
      if (!slot) return;
      base.set(tile.key, tile);
      const d = details.get(tile.key);
      slot.want = d ? withDetail(tile, d) : tile;
      slot.real = true;
    };
    // Street-map vector tiles first (exact and fast); the server's Overpass tiles for any
    // cell those can't reach; a placeholder village only if a cell has no map at all.
    const vtPool = new BuildPool(1);
    const fallback = new Set<string>();
    const vsource = new VectorSource(vtPool, getLocale(), true, names, take, (key) => {
      fallback.add(key);
      const slot = tiles.get(key);
      if (slot) slot.villageAt = performance.now() + 20_000;
    });
    const source = new TileSource(take);
    const tileBox = (cx: number, cy: number) => {
      const a = frame.toXZ(cy * 0.004, cx * 0.004), b = frame.toXZ((cy + 1) * 0.004, (cx + 1) * 0.004);
      return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
    };
    // Stores' own 3D buildings: when their outlines arrive or change, the tiles under them
    // are built again without the map's building there.
    const landmarks = new Landmarks(scene, frame, renderer, camera, collision, shadows, (boxes) => {
      for (const s of tiles.values()) {
        const b = tileBox(s.cx, s.cy);
        if (s.data?.real && boxes.some((o) => o.maxX > b.minX - 5 && o.minX < b.maxX + 5 && o.maxZ > b.minZ - 5 && o.minZ < b.maxZ + 5)) s.want ??= s.data;
      }
    });
    const boxDist = (b: ReturnType<typeof tileBox>, x: number, z: number) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

    const ensureTiles = () => {
      // Look ahead: load around where the vehicle will be in a few seconds.
      const ax = st.x + st.vx * 3, az = st.z + st.vz * 3;
      const { cx, cy } = tileOf(frame.toLatLng(st.x, st.z));
      const now = performance.now();
      const order: Slot[] = [];
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++) {
          const k = tileKey(cx + dx, cy + dy);
          const box = tileBox(cx + dx, cy + dy);
          const d = Math.min(boxDist(box, st.x, st.z), boxDist(box, ax, az));
          let slot = tiles.get(k);
          if (!slot) {
            if (d > LOAD_M) continue;
            // No placeholder unless the map really can't be had (see the sources above).
            slot = { key: k, cx: cx + dx, cy: cy + dy, mesh: null, real: false, data: null, want: null, villageAt: Infinity, building: false, dist: d };
            tiles.set(k, slot);
          }
          slot.dist = d;
          order.push(slot);
        }
      order.sort((a, b) => a.dist - b.dist);
      details.want(order.map((s) => s.key));
      vsource.want(order.map((s) => s.key));
      source.want(order.filter((s) => fallback.has(s.key)).map((s) => s.key));
      for (const [k, s] of tiles) {
        s.dist = boxDist(tileBox(s.cx, s.cy), st.x, st.z);
        if (s.dist > DROP_M) {
          if (s.mesh) (scene.remove(s.mesh.group), s.mesh.dispose());
          collision.remove(k);
          obstacles.remove(k);
          source.forget(k);
          vsource.forget(k);
          details.forget(k);
          base.delete(k);
          tiles.delete(k);
          labelsDirty = true;
          continue;
        }
        if (s.mesh) s.mesh.detail.visible = s.dist < (lite ? DETAIL_M * 0.6 : DETAIL_M);
      }
    };

    /** Hand the nearest tile that needs geometry to a free worker. */
    const scheduleBuilds = () => {
      const now = performance.now();
      while (pool.free) {
        let best: Slot | null = null;
        for (const s of tiles.values()) {
          if (s.building) continue;
          const job = s.want ?? (!s.mesh && !s.real && now > s.villageAt ? villageTile(s.cx, s.cy) : null);
          if (job && (!best || s.dist < best.dist)) best = s;
        }
        if (!best) return;
        const slot = best;
        const data = slot.want ?? villageTile(slot.cx, slot.cy);
        slot.want = null;
        slot.building = true;
        pool
          .build(data, frame.origin, style, lite, landmarks.cutsFor(tileBox(slot.cx, slot.cy)))
          .then((arrays) => {
            if (disposed || tiles.get(slot.key) !== slot) return;
            ready.push({ key: slot.key, mesh: tileMeshes(arrays, mats, tpl, { shadows }), data });
            ready.sort((a, b) => (tiles.get(a.key)?.dist ?? 0) - (tiles.get(b.key)?.dist ?? 0));
          })
          .catch(() => {
            if (!slot.want && data.real) slot.want = data; // try again
          })
          .finally(() => (slot.building = false));
      }
    };

    /** Add one finished tile per frame (uploading geometry to the GPU takes a moment). */
    const addReady = () => {
      const job = ready.shift();
      if (!job) return;
      const slot = tiles.get(job.key);
      if (!slot) return job.mesh.dispose();
      // A village finishing after the real tile is stale.
      if (!job.data.real && slot.mesh?.real) return job.mesh.dispose();
      if (slot.mesh) (scene.remove(slot.mesh.group), slot.mesh.dispose());
      slot.mesh = job.mesh;
      slot.data = job.data;
      job.mesh.detail.visible = slot.dist < DETAIL_M;
      scene.add(job.mesh.group);
      collision.add(job.key, job.mesh.footprints);
      obstacles.add(job.key, job.mesh.obstacles);
      labelsDirty = true;
      cityDrawn++;
      // Snap onto a street once our own cell is drawn — and again when its real map
      // arrives, unless the player has already driven off. GPS fixes are often indoors.
      const mine = tileOf(frame.toLatLng(st.x, st.z));
      const still = Math.hypot(st.x - P.placedAt.x, st.z - P.placedAt.z) < 3;
      if (slot.cx === mine.cx && slot.cy === mine.cy && (!P.placed || (P.placed === "village" && job.data.real && still))) placeCar(job.data.real ? "real" : "village");
    };

    /** Nearest proper street (vehicle-wide, not touching a building), facing along it. */
    const nearestStreet = (x: number, z: number, maxD = 180) => {
      let best = Infinity, bx = x, bz = z, yaw = st.yaw;
      for (const s of tiles.values()) {
        const b = s.mesh;
        if (!b) continue;
        b.roads.forEach((line, li) => {
          const k = b.roadKinds[li];
          if (k === "foot" || k === "rail") return;
          // Lanes and service roads count, but a real street wins over an alley 20 m closer.
          const penalty = (b.roadWidths[li] ?? 8) < 6 ? 25 : 0;
          for (let i = 0; i + 3 < line.length; i += 2) {
            const ax = line[i], az = line[i + 1], ex = line[i + 2], ez = line[i + 3];
            const dx = ex - ax, dz = ez - az, l2 = dx * dx + dz * dz || 1;
            const k2 = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
            const px = ax + dx * k2, pz = az + dz * k2, d = Math.hypot(px - x, pz - z) + penalty;
            if (d >= best) continue;
            const y = Math.atan2(-dx, -dz), f = forward(y);
            if (collision.collide(px + f.fx * 1.15, pz + f.fz * 1.15, 1.6).hit || collision.collide(px - f.fx * 1.15, pz - f.fz * 1.15, 1.6).hit) continue;
            (best = d), (bx = px), (bz = pz), (yaw = y);
          }
        });
      }
      return best < maxD ? { x: bx, z: bz, yaw } : null;
    };
    /**
     * Game items stand where the map puts them, but a café's pin is inside its building and
     * money can land in a courtyard: there the walls hide them and loot is out of the car's
     * reach. Such an item moves to the nearest street — and is checked again whenever more
     * of the city is drawn around it (a building can arrive after the item).
     */
    let cityDrawn = 0;
    const settle = (item: { group: THREE.Object3D } & Placed) => {
      item.settledAt = cityDrawn;
      const { raw } = item;
      const s = collision.collide(raw.x, raw.z, 1.6).hit ? nearestStreet(raw.x, raw.z, 90) : null;
      item.group.position.set(s?.x ?? raw.x, 0, s?.z ?? raw.z);
    };
    const placeCar = (kind: "village" | "real") => {
      const s = nearestStreet(st.x, st.z);
      if (s) Object.assign(st, { x: s.x, z: s.z, yaw: s.yaw, vx: 0, vz: 0 });
      P.placed = kind;
      P.placedAt = { x: st.x, z: st.z };
      camPos.set(st.x + Math.sin(st.yaw) * 10, 5, st.z + Math.cos(st.yaw) * 10);
    };

    // ---- jobs, loot, markers, signs, labels, other players
    /** Where the map puts an item, and the city drawn when it was last settled (see settle). */
    type Placed = { raw: { x: number; z: number }; settledAt: number };
    type Beacon = ReturnType<typeof makeBeacon> & { job: Job } & Placed;
    const beacons = new Map<string, Beacon>();
    type Loot = ReturnType<typeof makeLoot> & { id: string; taken: boolean } & Placed;
    const loot = new Map<string, Loot>();
    const labels = new Map<string, ReturnType<typeof makeStreetLabel> & { x: number; z: number; angle: number }>();
    const boards = new Map<string, Board>();
    const corners = new Map<string, Board>();
    let boardNight = 0.15;
    const titles = new Map<string, ReturnType<typeof makeSign>>();
    const pins = new StorePins(scene);
    let labelsDirty = true;
    let jobs: Job[] = [];
    let navGoal: LatLng | null = live.current.goal;
    const others = new Others(scene, frame, style, lite);
    // Live traffic: street speeds for the minimap and the cars on the streets.
    const feed = new TrafficFeed();
    const traffic = new TrafficCars(scene, frame, feed, style, lite);
    // People on the pavements (solid, like the traffic).
    const crowd = new Crowd(scene, style, lite);
    const trafficColors = new WeakMap<Float32Array, { v: number; c: (string | null)[] }>();
    let trafficSync = 0, lightsAt = 0;
    const markers = new Markers(scene, frame, lite ? 30 : 60);

    const jobsFrom = (w: World | null): Job[] => {
      const out: Job[] = [];
      const m = live.current.me;
      const run = m?.activeRun;
      if (run)
        out.push({
          id: `run:${run.id}`, kind: "deliver", lat: run.targetLat, lng: run.targetLng, emoji: "🎯", color: "#ee7fae", label: t(run.title), verb: t("Deliver"), where: t(run.title), icon: "flag", reach: INTERACT_RADIUS_M, sel: null,
          run: () => live.current.act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } })).then((ok) => (ok && celebrate({ title: t("DELIVERED!"), art: "box", body: t(run.title) }), ok)),
        });
      for (const p of w?.places ?? []) {
        if (p.done || (run && p.kind === "deliver")) continue;
        const cat = PLACE_CATS[p.place.cat] ?? PLACE_CATS.shop;
        out.push({
          id: p.id, kind: p.kind === "deliver" ? "pickup" : "visit", lat: p.place.lat, lng: p.place.lng, emoji: p.emoji, color: p.kind === "deliver" ? "#f0c05a" : "#5bd38c",
          label: `${t(p.title)} · ${p.place.name}`, verb: p.kind === "deliver" ? t("Pick up") : t("Check in"), where: p.place.name, icon: p.kind === "deliver" ? "box" : "check", reach: INTERACT_RADIUS_M,
          sel: { type: "place", data: p },
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
            id: `biz:${c.id}`, kind: "biz", lat: b.lat, lng: b.lng, emoji: b.emoji, color: b.featured ? "#ff7ad9" : "#63b3f2", label: `${c.title} · ${b.name}`, verb: t("Check in"), where: b.name, icon: "check", reach: BIZ_CHECKIN_M,
            sel: { type: "biz", data: b },
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
      const want = jobs
        .map((j) => ({ j, p: frame.toXZ(j.lat, j.lng) }))
        .map((x) => ({ ...x, d: Math.hypot(x.p.x - st.x, x.p.z - st.z) }))
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
        const b = Object.assign(makeBeacon(j.emoji, j.color, j.label), { job: j, raw: p, settledAt: -1 });
        b.icon.userData = { pick: { kind: "job", id: j.id } };
        settle(b);
        scene.add(b.group);
        beacons.set(j.id, b);
      }
      // Money on the street: drive through it to pick it up (admin drops are gold).
      const wantLoot = w?.money ?? [];
      const lootKeep = new Set(wantLoot.map((s) => s.id));
      for (const [id, l] of loot) if (!lootKeep.has(id)) (scene.remove(l.group), l.dispose(), loot.delete(id));
      for (const s of wantLoot) {
        if (loot.has(s.id)) continue;
        const p = frame.toXZ(s.lat, s.lng);
        const l = Object.assign(makeLoot("💵", s.drop ? "#f0c05a" : "#5bd38c"), { id: s.id, taken: false, raw: p, settledAt: -1 });
        l.icon.userData = { pick: { kind: "loot", id: s.id } };
        settle(l);
        scene.add(l.group);
        loot.set(s.id, l);
      }
      markers.set(markersOf(w));
      others.setWalkers(w?.players ?? []);
    };

    /** A shop label by its id (`tile key:index`), from the tile it's on. */
    const shopById = (id: string): Label | null => {
      const cut = id.lastIndexOf(":");
      const l = tiles.get(id.slice(0, cut))?.mesh?.labels[Number(id.slice(cut + 1))];
      return l?.kind === "shop" ? l : null;
    };

    /** Storefront boards and house numbers on the walls close by (placed by the worker). */
    const syncBoards = () => {
      const want: { id: string; l: TileMeshes["labels"][number]; d: number }[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > 160) continue;
        s.mesh.labels.forEach((l, i) => {
          if ((l.kind !== "shop" || l.noBoard) && l.kind !== "num") return;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          if (d < (l.kind === "num" ? 55 : 150)) want.push({ id: `${s.key}:${i}`, l, d });
        });
      }
      want.sort((a, b) => a.d - b.d);
      const pick = [...want.filter((w) => w.l.kind === "shop").slice(0, lite ? 18 : 44), ...want.filter((w) => w.l.kind === "num").slice(0, lite ? 8 : 24)];
      const keep = new Set(pick.map((w) => w.id));
      for (const [id, b] of boards) if (!keep.has(id)) (scene.remove(b.group), b.dispose(), boards.delete(id));
      for (const { id, l } of pick) {
        if (boards.has(id)) continue;
        const b = l.kind === "num" ? makePlaque(l.text, getLocale() === "fa") : makeShopSign(l.text, l.cls, l.w, style, { pole: l.pole });
        b.group.position.set(l.x, l.y, l.z);
        b.group.rotation.y = l.angle;
        if ("emissiveIntensity" in b.mat) b.mat.emissiveIntensity = boardNight;
        if (l.kind === "shop") b.group.traverse((o) => (o.userData = { pick: { kind: "store", id } }));
        scene.add(b.group);
        boards.set(id, b);
      }
    };

    /** Street-name signs on their poles at the corners close by. */
    const syncCorners = () => {
      const want: { id: string; l: Label; d: number }[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > CORNER_M) continue;
        s.mesh.labels.forEach((l, i) => {
          if (l.kind !== "corner") return;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          if (d < CORNER_M) want.push({ id: `${s.key}:${i}`, l, d });
        });
      }
      want.sort((a, b) => a.d - b.d);
      const pick = want.slice(0, lite ? 6 : 16);
      const keep = new Set(pick.map((w) => w.id));
      for (const [id, b] of corners) if (!keep.has(id)) (scene.remove(b.group), b.dispose(), corners.delete(id));
      for (const { id, l } of pick) {
        if (corners.has(id)) continue;
        const b = makeCornerSign(l.plates ?? [], style);
        b.group.position.set(l.x, l.y, l.z);
        scene.add(b.group);
        corners.set(id, b);
      }
    };

    /** A pin over every shop around (the nearest few hundred), boards or not. */
    const syncPins = () => {
      const want: (Pin & { d: number })[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > PIN_M) continue;
        s.mesh.labels.forEach((l, i) => {
          if (l.kind !== "shop") return;
          const id = `${s.key}:${i}`;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          // Right next to its board the pin adds nothing.
          if (d > PIN_M || (d < 22 && boards.has(id))) return;
          want.push({ id, x: l.x, y: Math.min(60, l.top ?? 4) + 3.4, z: l.z, cls: l.cls, d });
        });
      }
      want.sort((a, b) => a.d - b.d);
      const pxPerUnit = renderer.domElement.height / 2 / Math.tan((camera.fov * Math.PI) / 360);
      pins.set(want.slice(0, lite ? 90 : 240), pxPerUnit, dpr);
    };

    /** The Places list (only while it's open): shops on the map, players' shops, businesses. */
    let placesSig = "";
    const syncPlaces = () => {
      const q = placeQuery.current.trim().toLowerCase();
      const match = (...texts: string[]) => !q || texts.some((x) => x.toLowerCase().includes(q));
      const here = frame.toLatLng(st.x, st.z);
      const rows: PlaceRow[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh) continue;
        s.mesh.labels.forEach((l, i) => {
          if (l.kind !== "shop") return;
          const tr = tradeOf(l.cls), name = oneLine(l.text), sub = t(tr.label);
          if (!match(name, sub)) return;
          const at = frame.toLatLng(l.x, l.z);
          rows.push({ id: `${s.key}:${i}`, emoji: tr.emoji, name, sub, dist: Math.hypot(l.x - st.x, l.z - st.z), lat: at.lat, lng: at.lng, sel: null });
        });
      }
      const w = live.current.world;
      for (const sh of w?.shops ?? [])
        if ((sh.live || sh.mine) && match(sh.name, t("Player shop"))) rows.push({ id: `sh:${sh.id}`, emoji: sh.emoji, name: sh.name, sub: sh.deal ? `${t("Player shop")} · −${fmtNum(sh.deal)}%` : t("Player shop"), dist: distanceM(here, sh), lat: sh.lat, lng: sh.lng, sel: { type: "shop", data: sh } });
      for (const b of w?.businesses ?? [])
        if (match(b.name, t("Business"))) rows.push({ id: `bz:${b.id}`, emoji: b.emoji, name: b.name, sub: t("Business"), dist: distanceM(here, b), lat: b.lat, lng: b.lng, sel: { type: "biz", data: b } });
      rows.sort((a, b) => a.dist - b.dist);
      const top = rows.slice(0, 80);
      const sig = `${q}|${rows.length}|${top.map((r) => `${r.id}:${Math.round(r.dist / 10)}`).join(",")}`;
      if (sig === placesSig) return;
      placesSig = sig;
      setPlaces(top);
    };

    /** Street names painted on the road near us, and names over landmark buildings. */
    const syncLabels = () => {
      labelsDirty = false;
      const want: { id: string; text: string; x: number; z: number; angle: number; w: number; y: number; d: number; building: boolean }[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > 320) continue;
        s.mesh.labels.forEach((l, i) => {
          if (l.kind !== "street" && l.kind !== "building") return;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          if (d < (l.kind === "building" ? 320 : 240)) want.push({ id: `${s.key}:${i}`, text: l.text, x: l.x, z: l.z, angle: l.angle, w: l.w, y: l.y, d, building: l.kind === "building" });
        });
      }
      want.sort((a, b) => a.d - b.d);
      const streets = want.filter((w) => !w.building).slice(0, lite ? 8 : 20), blds = want.filter((w) => w.building).slice(0, lite ? 4 : 10);
      const keepS = new Set(streets.map((w) => w.id)), keepB = new Set(blds.map((w) => w.id));
      for (const [id, l] of labels) if (!keepS.has(id)) (scene.remove(l.mesh), l.dispose(), labels.delete(id));
      for (const [id, n] of titles) if (!keepB.has(id)) (scene.remove(n.sprite), n.dispose(), titles.delete(id));
      for (const w of streets) {
        if (labels.has(w.id)) continue;
        const l = Object.assign(makeStreetLabel(w.text, w.w, style), { x: w.x, z: w.z, angle: w.angle });
        l.mesh.position.set(w.x, w.y, w.z);
        scene.add(l.mesh);
        labels.set(w.id, l);
      }
      for (const w of blds) {
        if (titles.has(w.id)) continue;
        const n = makeSign("🏛️", w.text, "#ffffff");
        n.sprite.position.set(w.x, w.y, w.z);
        scene.add(n.sprite);
        titles.set(w.id, n);
      }
    };

    /** Turn each painted street name so it reads upright from where the camera looks. */
    const orientLabels = (fx: number, fz: number) => {
      for (const l of labels.values()) {
        // Text runs along the road; flip it when it would read upside down.
        let th = Math.atan2(-Math.cos(l.angle), Math.sin(l.angle));
        if (-Math.sin(th) * fx + -Math.cos(th) * fz < 0) th += Math.PI;
        l.mesh.rotation.set(-Math.PI / 2, th, 0);
      }
    };

    /** The named street we're on (closest named road within its own width + a bit). */
    const streetHere = () => {
      let best = Infinity, name: string | null = null;
      for (const s of tiles.values()) {
        const m = s.mesh;
        if (!m || s.dist > 60) continue;
        m.roads.forEach((line, li) => {
          const n = m.roadNames[li];
          if (!n) return;
          const lim = m.roadWidths[li] / 2 + 7;
          for (let i = 0; i + 3 < line.length; i += 2) {
            const ax = line[i], az = line[i + 1], dx = line[i + 2] - ax, dz = line[i + 3] - az, l2 = dx * dx + dz * dz || 1;
            const k = Math.max(0, Math.min(1, ((st.x - ax) * dx + (st.z - az) * dz) / l2));
            const d = Math.hypot(ax + dx * k - st.x, az + dz * k - st.z);
            if (d < lim && d < best) (best = d), (name = n);
          }
        });
      }
      return name;
    };

    // ---- party round pieces: checkpoint gates and coins
    const gates: ReturnType<typeof makeGate>[] = [];
    const coins: ReturnType<typeof makeCoin>[] = [];
    let roundKey = "";
    let partyNow: PartyView | null = null;
    /** What I had at the last sync this round, so each gain gets its sound once. */
    let heard = { key: "", done: 0, it: false };
    const syncRound = (p: PartyView | null) => {
      partyNow = p;
      const s = p?.state;
      const key = p && s && p.status === "LIVE" ? `${p.id}|${s.round}` : "";
      if (key && s) {
        const me = live.current.me?.id ?? "";
        const mine = { key, done: s.progress[me] ?? 0, it: s.game === "tag" && s.it === me };
        if (heard.key === key) {
          // Race: a checkpoint. Coins: a coin. Tag: I'm it, or I passed it on.
          if (mine.done > heard.done) sfx(s.game === "race" ? "capture" : "coin");
          if (mine.it && !heard.it) sfx("alarm");
          else if (!mine.it && heard.it) sfx("hit");
        }
        heard = mine;
      }
      if (key !== roundKey) {
        roundKey = key;
        for (const g of gates) (scene.remove(g.group), g.dispose());
        for (const c of coins) (scene.remove(c.mesh), c.dispose());
        gates.length = coins.length = 0;
        if (key && s?.cps)
          s.cps.forEach((c, i) => {
            const g = makeGate(i + 1);
            const q = frame.toXZ(c.lat, c.lng);
            const road = nearestStreet(q.x, q.z, 40);
            g.group.position.set(q.x, 0, q.z);
            g.group.rotation.y = road ? road.yaw : 0;
            scene.add(g.group);
            gates.push(g);
          });
        if (key && s?.coins)
          s.coins.forEach((c) => {
            const m = makeCoin();
            const q = frame.toXZ(c.lat, c.lng);
            m.mesh.position.set(q.x, 1.8, q.z);
            scene.add(m.mesh);
            coins.push(m);
          });
      }
      const myId = live.current.me?.id ?? "";
      const done = s?.progress[myId] ?? 0;
      gates.forEach((g, i) => g.set(i < done ? "done" : i === done ? "next" : "later"));
      coins.forEach((c, i) => (c.mesh.visible = !s?.taken?.[i]));
      others.setIt(p?.status === "LIVE" && s?.game === "tag" ? (s.it ?? null) : null);
      // The round's start grid: line up there once per round.
      if (p?.warp && p.warp.round !== P.warpRound && live.current.canDrive) {
        P.warpRound = p.warp.round;
        const q = frame.toXZ(p.warp.lat, p.warp.lng);
        Object.assign(st, { x: q.x, z: q.z, yaw: p.warp.yaw, vx: 0, vz: 0, vy: 0, alt: 0, cruise: 0, speed: 0 });
        camPos.set(st.x + Math.sin(st.yaw) * 10, 5, st.z + Math.cos(st.yaw) * 10);
        live.current.onMove?.({ lat: p.warp.lat, lng: p.warp.lng });
        st0.lastReport = performance.now();
        st0.reported = { x: st.x, z: st.z };
      }
    };
    /** The party round's current target for the nav arrow. */
    const roundGoal = (): { at: LatLng; label: string } | null => {
      const p = partyNow, s = p?.state;
      if (!p || !s || p.status !== "LIVE") return null;
      const myId = live.current.me?.id ?? "";
      if (s.game === "race" && s.cps) {
        const i = s.progress[myId] ?? 0;
        return i < s.cps.length ? { at: s.cps[i], label: t("Checkpoint {n}/{total}", { n: i + 1, total: s.cps.length }) } : null;
      }
      if (s.game === "coins" && s.coins) {
        let best: { at: LatLng; label: string } | null = null, bd = Infinity;
        s.coins.forEach((c, i) => {
          if (s.taken?.[i]) return;
          const q = frame.toXZ(c.lat, c.lng), d = Math.hypot(q.x - st.x, q.z - st.z);
          if (d < bd) (bd = d), (best = { at: c, label: t("Nearest coin") });
        });
        return best;
      }
      if (s.game === "tag" && s.it === myId) {
        let best: { at: LatLng; label: string } | null = null, bd = Infinity;
        for (const o of others.positions()) {
          if (!s.ids.includes(o.id)) continue;
          const d = Math.hypot(o.x - st.x, o.z - st.z);
          if (d < bd) (bd = d), (best = { at: frame.toLatLng(o.x, o.z), label: t("Tag someone!") });
        }
        return best;
      }
      return null;
    };

    // ---- the network: my position out, everyone else in
    let serverOffset = 0;
    const net = new DriveNet(
      () => {
        const L = live.current;
        // In a match the arena is my world; the city sees me again when I'm back.
        if (combat.inMatch) return null;
        const here = frame.toLatLng(st.x, st.z);
        if (!L.canDrive) return { here: L.follow ?? here, alt: 0, yaw: st.yaw, speed: 0, vehicle: L.vehicle, color: L.paint };
        // On foot, others see my soldier (and, without a realtime server, fight me) through this.
        return { lat: here.lat, lng: here.lng, alt: st.alt, yaw: st.yaw, speed: st.speed, vehicle: L.vehicle, color: L.paint, sim: L.sim, ...combat.footReport() };
      },
      (s: NetState) => {
        if (disposed) return;
        serverOffset = s.offset;
        // The realtime link (when up) draws everyone at 20 Hz; this is the fallback: cars
        // here, players on foot as soldiers (combat), with my health and the hits I took.
        if (!combat.live) others.setDrivers(s.others.filter((o) => !(o.flags & F_FOOT)));
        combat.fromHttp(s.others, s.me, s.offset);
        const forced = s.vehicle !== live.current.vehicle ? s.vehicle : null;
        if (forced !== serverVehicle) {
          serverVehicle = forced;
          rebuildModel();
        }
        syncRound(s.party);
        setParty(s.party);
      },
      undefined,
      () => combat.onFoot,
    );
    net.start();

    // ---- on foot and live (Street Arena): the soldier, guns, the realtime link
    /** Where the car waits while I'm on foot. */
    let parked: { x: number; z: number; yaw: number; alt: number } | null = null;
    const combat = new Combat({
      scene, camera, renderer, el, frame, collision, obstacles, others, shadows, sim: !!live.current.sim,
      get touch() {
        return live.current.touch;
      },
      canDrive: () => live.current.canDrive,
      vehicle: () => ({ x: st.x, z: st.z, alt: st.alt, yaw: st.yaw, vx: st.vx, vz: st.vz, key: currentKey(), paint: live.current.paint, flies: def().flies }),
      parked: () => parked,
      street: (x, z) => nearestStreet(x, z, 120),
      arenaGeo: (r) => arenaGeo(r),
      setFoot: (on, at) => {
        if (on && !parked) {
          parked = { x: st.x, z: st.z, yaw: st.yaw, alt: st.alt };
          Object.assign(st, { vx: 0, vz: 0, vy: 0, speed: 0, cruise: 0 });
          if (at) Object.assign(st, { x: at.x, z: at.z, yaw: at.yaw });
        } else if (!on && parked) {
          Object.assign(st, { x: parked.x, z: parked.z, yaw: parked.yaw, alt: parked.alt, vx: 0, vz: 0, vy: 0, speed: 0 });
          parked = null;
          camPos.set(st.x + Math.sin(st.yaw) * 10, 5, st.z + Math.cos(st.yaw) * 10);
        }
      },
      toast: (text) => live.current.toast({ title: text }),
      me: () => live.current.me,
    });
    setCombat(combat);
    /** Streets and buildings within r m of me, rounded to 10 cm: the map a new arena is played on. */
    const arenaGeo = (r: number): ArenaGeo => {
      const roads: number[][] = [], buildings: ArenaGeo["buildings"] = [];
      const R = r + 40, q = (v: number) => Math.round(v * 10) / 10;
      for (const s of tiles.values()) {
        const m = s.mesh;
        if (!m || s.dist > R) continue;
        m.roads.forEach((line, i) => {
          if (m.roadKinds[i] === "rail") return;
          let near = false;
          for (let k = 0; k < line.length && !near; k += 2) near = Math.hypot(line[k] - st.x, line[k + 1] - st.z) < R;
          if (near) roads.push(Array.from(line, q));
        });
        for (const f of m.footprints) {
          if (Math.hypot((f.minX + f.maxX) / 2 - st.x, (f.minZ + f.maxZ) / 2 - st.z) > R + 30) continue;
          buildings.push({ p: Array.from(f.pts, q), h: Math.round(f.h * 10) / 10, mh: Math.round(f.mh * 10) / 10 });
        }
      }
      return { roads, buildings };
    };

    // ---- sound: an engine that revs with speed (rotors chop)
    let engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null;
    const startEngine = () => {
      if (engine) return;
      const out = audioOut();
      if (!out) return;
      const { ctx } = out;
      const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      osc.type = "sawtooth";
      osc2.type = "square";
      osc2.detune.value = 9;
      filter.type = "lowpass";
      filter.frequency.value = 420;
      gain.gain.value = 0;
      lfo.frequency.value = 0;
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(out.out);
      osc.start();
      osc2.start();
      lfo.start();
      engine = { osc, osc2, gain, filter, lfo, lfoGain };
      keepAwake("drive", true);
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
      if (combat.onFoot) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      input.current.keys.add(k);
      if (k === "h") horn();
      if (k === "c") cycleCam();
      if (k === "l") land();
      startEngine();
    };
    const keyUp = (e: KeyboardEvent) => {
      input.current.keys.delete(e.key.toLowerCase());
      // A Mac sends no keyup for keys let go while ⌘ is held: start over when it goes.
      if (e.key === "Meta") input.current.keys.clear();
    };
    // Switching away (alt-tab, another window) swallows the keyups: let go of every key.
    const keysOff = () => input.current.keys.clear();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", keysOff);

    // Tap something in the city: what is it?
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; at: number } | null = null;
    const pDown = (e: PointerEvent) => {
      startEngine();
      down = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const pUp = (e: PointerEvent) => {
      if (combat.onFoot) return (down = null);
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.at > 450) return (down = null);
      down = null;
      pickAt(e.clientX, e.clientY);
    };
    const pickAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const targets = [...[...beacons.values()].map((b) => b.icon), ...[...loot.values()].map((l) => l.icon), ...markers.pickables(), ...others.pickables(), ...[...boards.values()].flatMap((b) => b.group.children)];
      const small = ray.intersectObjects(targets, false)[0];
      // A store's own building (nested meshes); whatever is nearer the camera wins.
      const big = ray.intersectObjects(landmarks.pickables(), true)[0];
      const lm = big && (!small || big.distance < small.distance) ? landmarks.of(big.object) : null;
      if (lm) {
        const here = frame.toLatLng(st.x, st.z);
        const biz = live.current.world?.businesses.find((b) => b.id === lm.businessId);
        return setPicked({ emoji: lm.emoji, title: lm.name, sub: formatDistance(distanceM(here, lm)), lat: lm.lat, lng: lm.lng, sel: biz ? { type: "biz", data: biz } : null });
      }
      const hit = small;
      // Nothing solid under the finger: a shop's pin, maybe.
      const pinId = hit ? null : pins.pick(camera, r, cx, cy);
      const pick = (hit?.object.userData.pick as { kind: string; id: string } | undefined) ?? (pinId ? { kind: "store", id: pinId } : undefined);
      if (!pick) return setPicked(null);
      const here = frame.toLatLng(st.x, st.z);
      const L = live.current;
      if (pick.kind === "store") {
        const l = shopById(pick.id);
        if (!l) return setPicked(null);
        const tr = tradeOf(l.cls), at = frame.toLatLng(l.x, l.z);
        setPicked({ emoji: tr.emoji, title: oneLine(l.text), sub: `${t(tr.label)} · ${formatDistance(distanceM(here, at))}`, lat: at.lat, lng: at.lng, sel: null });
      } else if (pick.kind === "job") {
        const j = beacons.get(pick.id)?.job;
        if (j) setPicked({ emoji: j.emoji, title: j.label, sub: formatDistance(distanceM(here, j)), lat: j.lat, lng: j.lng, sel: j.sel });
      } else if (pick.kind === "loot") {
        const s = L.world?.money.find((x) => x.id === pick.id);
        if (s) setPicked({ emoji: "💵", title: s.drop?.label ?? t("{n} toman", { n: s.amount }), sub: t("Drive through it to pick it up"), lat: s.lat, lng: s.lng, sel: { type: "money", data: s } });
      } else if (pick.kind === "marker") {
        const m = markers.get(pick.id);
        if (m) setPicked({ emoji: m.emoji, title: m.label, sub: formatDistance(distanceM(here, m)), lat: m.lat, lng: m.lng, sel: m.sel });
      } else if (pick.kind === "player") {
        const o = others.driver(pick.id);
        const w = L.world?.players.find((x) => x.id === pick.id);
        const data: WorldPlayer | null = w ?? (o ? { id: o.id, username: o.name, avatar: o.avatar, level: o.level, friend: o.friend, home: true, lat: o.lat, lng: o.lng } : null);
        if (data) setPicked({ emoji: data.avatar, title: `${data.username} · ${data.level}`, sub: o ? `${VEHICLES[o.vehicle].emoji} ${t(VEHICLES[o.vehicle].name)} · ${formatDistance(distanceM(here, o))}` : formatDistance(distanceM(here, data)), lat: data.lat, lng: data.lng, sel: { type: "player", data } });
      }
    };
    el.addEventListener("pointerdown", pDown);
    el.addEventListener("pointerup", pUp);

    const cycleCam = () => {
      if (combat.onFoot) return combat.toggleCam();
      camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length];
      P.cam = camMode;
      store.set(CAM_KEY, camMode);
    };
    const land = () => {
      st.cruise = 0;
    };
    api3d.current = {
      setGoal: (p) => ((navGoal = p), (wanted.current = null)),
      cycleCam,
      horn,
      land,
      kick: () => net.kick(),
      course: (g) => {
        const near = [...tiles.values()].filter((s) => s.mesh && s.dist < 700).map((s) => s.mesh!);
        const pts = layCourse(g, near, { x: st.x, z: st.z, yaw: st.yaw });
        if (!pts) return null;
        const here = frame.toLatLng(st.x, st.z);
        return { start: { ...here, yaw: st.yaw }, points: pts.map((p) => frame.toLatLng(p.x, p.z)) };
      },
    };

    // ---- the loop
    let last = performance.now();
    let wasLow = true;
    let lastSlow = 0, lastHud = 0, lastGauge = 0, hudSig = "", lastMini = 0, lastQuality = performance.now(), frames = 0, fps = 60, goodFor = 0, lastWorld: World | null = null;
    let phase: Phase = "day";
    let streetName: string | null = null;
    const maxV = () => (Math.max(10, S.driveSpeedKmh) / 3.6) * 0.95 * def().speed;

    const sunDir = new THREE.Vector3(0.3, 0.8, 0.5);
    const applyPhase = (p: Phase) => {
      phase = p;
      const { L, sunDir: dir } = sky.apply(p);
      // Keep shadows readable when the sun is near the horizon.
      sunDir.copy(dir).setY(Math.max(dir.y, 0.35)).normalize();
      scene.fog = new THREE.Fog(L.fog, L.fogNear, lite ? Math.min(L.fogFar, 650) : L.fogFar);
      renderer.setClearColor(L.fog);
      hemi.intensity = L.hemi;
      hemi.color.set(L.hemiSky);
      hemi.groundColor.set(L.ground);
      sun.intensity = L.sunI;
      sun.color.set(L.sun);
      groundMat.color.set(L.ground);
      const night = p === "night" ? 1 : p === "dusk" || p === "dawn" ? 0.45 : 0;
      setNight(mats, style, night);
      landmarks.setNight(night);
      boardNight = 0.15 + night * 0.85;
      for (const b of boards.values()) if ("emissiveIntensity" in b.mat) b.mat.emissiveIntensity = boardNight;
      dustMat.opacity = p === "night" ? 0.95 : 0.35;
      dustMat.color.set(p === "night" ? "#b8ff7a" : "#fff3b0");
    };
    // Always daylight in the 3D city: night scenes were too dark to see the streets, and
    // the headlight and lit windows cost frames on phones.
    applyPhase("day");

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = now / 1000;
      const serverNow = Date.now() + serverOffset;
      const L = live.current;
      if (L.world !== lastWorld) {
        lastWorld = L.world;
        syncWorld();
      }
      if (`${currentKey()}|${L.paint}` !== modelKey) rebuildModel();
      const D = def();

      // -- on foot: the soldier moves (and owns the camera); "me" follows the soldier
      others.delayMs = combat.live ? RT_DELAY_MS : 450;
      const onFoot = combat.tick(dt, now);
      const soldier = combat.me;
      if (onFoot && soldier) Object.assign(st, { x: soldier.x, z: soldier.z, vx: soldier.vx, vz: soldier.vz, yaw: soldier.yaw, speed: Math.hypot(soldier.vx, soldier.vz), steer: 0 });

      // -- driving / flying
      const keys = input.current.keys;
      // Frozen on the start grid until the countdown ends.
      const frozen = onFoot || (!!partyNow?.startsAt && partyNow.status === "LIVE" && serverNow < partyNow.startsAt);
      const c = {
        gas: frozen ? 0 : Math.max(keys.has("w") || keys.has("arrowup") ? 1 : 0, input.current.gas),
        brake: Math.max(keys.has("s") || keys.has("arrowdown") ? 1 : 0, input.current.brake),
        steer: (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0) || input.current.steer,
        hand: keys.has(" ") || input.current.hand,
        lift: (keys.has("r") || keys.has("e") || keys.has("pageup") ? 1 : 0) - (keys.has("f") || keys.has("q") || keys.has("pagedown") ? 1 : 0) || input.current.lift,
      };
      let vF = 0;
      if (onFoot) {
        // The car waits where it was parked.
      } else if (L.canDrive) {
        if (D.flies) vF = stepAir(st, D, c, dt, maxV(), collision.floor(st.x, st.z, st.alt));
        else vF = stepGround(st, D, c, dt, maxV());
      } else if (L.follow) {
        // Walking with GPS: glide to where the phone says you are, nose first.
        const p = frame.toXZ(L.follow.lat, L.follow.lng);
        const dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
        if (d > 250) Object.assign(st, { x: p.x, z: p.z, vx: 0, vz: 0 });
        else {
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
        st.alt = 0;
      } else {
        st.vx = st.vz = 0;
      }
      const { fx: nfx, fz: nfz } = forward(st.yaw);
      let nx = st.x + st.vx * dt, nz = st.z + st.vz * dt;
      if (onFoot) (nx = st.x), (nz = st.z);
      else if (L.canDrive) {
        // Circles along the body on wheels (nose and tail; more down a bus); one around a flyer or a bike.
        let hit = null as { nx: number; nz: number } | null;
        const offs = D.flies || D.bike ? [0] : D.probes ?? [1.15, -1.15];
        for (const off of offs)
          for (const world of [collision, obstacles]) {
            const r = world.collide(nx + nfx * off, nz + nfz * off, D.radius, st.alt, model.height);
            if (r.hit) {
              nx = r.x - nfx * off;
              nz = r.z - nfz * off;
              hit = r.hit;
            }
          }
        // Other players' cars are solid too (flyers pass over each other).
        for (const o of others.positions()) {
          if (Math.abs(o.y - st.alt) > 2) continue;
          const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = D.radius + o.radius;
          if (d >= min || d < 1e-3) continue;
          nx = o.x + (dx / d) * min;
          nz = o.z + (dz / d) * min;
          hit = { nx: dx / d, nz: dz / d };
        }
        if (hit) {
          const into = st.vx * hit.nx + st.vz * hit.nz;
          if (into < 0) {
            st.vx -= into * hit.nx * 1.3;
            st.vz -= into * hit.nz * 1.3;
            st.vx *= 0.7;
            st.vz *= 0.7;
            if (-into > 6 && now - st0.bumpAt > 400) {
              st0.bumpAt = now;
              sfx("hit");
              navigator.vibrate?.(30);
            }
          }
        }
      }
      st.x = nx;
      st.z = nz;
      st.speed = Math.hypot(st.vx, st.vz);

      // -- pose: body roll / lean, squat under throttle, wheels and rotors
      model.group.position.set(parked?.x ?? st.x, parked?.alt ?? st.alt, parked?.z ?? st.z);
      model.group.rotation.y = parked?.yaw ?? st.yaw;
      const speedK = Math.min(1, st.speed / maxV());
      const lean = D.bike ? 0.45 : D.flies ? 0.28 : 0.12;
      st.roll += ((D.bike || D.flies ? 1 : -1) * st.steer * Math.min(1, st.speed / 10) * lean - st.roll) * Math.min(1, dt * 6);
      st.pitch += ((D.flies ? -(c.gas - c.brake) * 0.12 : (c.gas - c.brake) * 0.035) * Math.min(1, st.speed / 4 + 0.3) - st.pitch) * Math.min(1, dt * 5);
      model.body.rotation.z = st.roll;
      model.body.rotation.x = st.pitch;
      st.wheelSpin += (vF / 0.36) * dt;
      for (const w of model.wheels) w.rotation.x = -st.wheelSpin;
      for (const s of model.steer) s.rotation.y = st.steer;
      const spinning = L.canDrive && (st.alt > 0.2 || c.gas > 0);
      for (const r of model.rotors) {
        r.obj.rotation[r.axis] += r.speed * (spinning ? 1 : 0.15) * dt;
        if (r.blur) r.blur.visible = spinning;
      }
      const blob = model.group.getObjectByName("blob");
      if (blob) {
        blob.position.y = -st.alt + 0.12;
        blob.scale.setScalar(Math.max(0.3, 1 - st.alt / 80));
      }
      model.brake.color.set(c.brake && vF > 0.3 ? "#ff2a3d" : "#5a0d16");
      const dark = phase === "night" || phase === "dusk";
      if (model.beams) model.beams.visible = dark;
      if (model.light) model.light.visible = phase === "night";
      model.cargo.visible = !!L.me?.activeRun;

      // -- camera (the soldier placed it already when on foot)
      const flying = D.flies && st.alt > 1;
      const fp = !onFoot && camMode === "cockpit";
      model.body.visible = !fp;
      for (const w of model.wheels) w.visible = !fp;
      cockpit.group.visible = fp;
      cockpit.group.rotation.z = st.roll * 0.4;
      if (cockpit.wheel) cockpit.wheel.rotation[D.bike ? "y" : "z"] = D.bike ? st.steer : st.steer * 2.6;
      if (onFoot) {
        // see combat.tick
      } else if (fp) {
        // The driver's eyes: the head lags a touch behind the car and leans with the g-force.
        headYaw += Math.atan2(Math.sin(st.yaw - headYaw), Math.cos(st.yaw - headYaw)) * Math.min(1, dt * 9);
        sway += (-st.steer * Math.min(1, st.speed / 12) * 0.07 - sway) * Math.min(1, dt * 4);
        model.group.updateMatrixWorld();
        eyeW.copy(cockpit.eye);
        eyeW.x += sway;
        eyeW.y += -st.pitch * 0.6;
        model.group.localToWorld(eyeW);
        camPos.copy(eyeW);
        camera.position.copy(eyeW);
        camera.up.set(0, 1, 0);
        const hf = forward(headYaw);
        const down = D.key === "drone" ? 0.18 : D.flies ? 0.12 : 0.05;
        camLook.set(eyeW.x + hf.fx * 10, eyeW.y - 10 * down, eyeW.z + hf.fz * 10);
        camera.lookAt(camLook);
        camera.rotateZ(-st.roll * 0.35);
      } else {
        const dist = camMode === "chase" ? (flying ? 15 : 9 + speedK * 4) * (D.cam ?? 1) : camMode === "far" ? 24 : 4;
        const height = camMode === "chase" ? (flying ? 6 : 3.8 + speedK * 1.2) : camMode === "far" ? 15 : 60;
        const want = camMode === "top" ? new THREE.Vector3(st.x + nfx * 6, st.alt + height, st.z + nfz * 6 + 0.01) : new THREE.Vector3(st.x - nfx * dist, st.alt + height, st.z - nfz * dist);
        camPos.lerp(want, 1 - Math.exp(-dt * (camMode === "top" ? 6 : 4.5)));
        // Don't let the camera end up inside a building: pull it in toward the vehicle.
        // (Pushing it out sideways can strand it behind the building: walk out from the
        // vehicle instead and stop at the last clear spot on the way.)
        if (camMode !== "top" && collision.collide(camPos.x, camPos.z, 1, camPos.y - 1, 2).hit) {
          let k = 0;
          for (let s = 1; s <= 12; s++) {
            const f = s / 12;
            if (collision.collide(st.x + (camPos.x - st.x) * f, st.z + (camPos.z - st.z) * f, 1, camPos.y - 1, 2).hit) break;
            k = f;
          }
          camPos.set(st.x + (camPos.x - st.x) * k, camPos.y, st.z + (camPos.z - st.z) * k);
        }
        camera.position.copy(camPos);
        if (camMode === "top") camera.up.set(nfx, 0, nfz);
        else camera.up.set(0, 1, 0);
        camLook.set(st.x + nfx * 4, st.alt + 1.2, st.z + nfz * 4);
        camera.lookAt(camLook);
      }
      const fov = (fp ? 70 : 62) + speedK * (fp ? 12 : 10), near = fp ? 0.06 : 0.5;
      if (!onFoot && (Math.abs(camera.fov - fov) > 0.1 || camera.near !== near)) (camera.fov = fov), (camera.near = near), camera.updateProjectionMatrix();

      // -- lights & sky follow the vehicle
      sky.follow(camera.position);
      ground.position.set(Math.round(st.x / 50) * 50, 0, Math.round(st.z / 50) * 50);
      sun.position.set(st.x + sunDir.x * 220, sunDir.y * 220, st.z + sunDir.z * 220);
      sun.target.position.set(st.x, 0, st.z);
      if (clouds)
        for (const cl of clouds.group.children) {
          cl.position.x += (cl.userData.speed as number) * dt;
          if (cl.position.x - st.x > 700) cl.position.x -= 1400;
          if (cl.position.z - st.z > 700) cl.position.z -= 1400;
          if (st.z - cl.position.z > 700) cl.position.z += 1400;
          if (st.x - cl.position.x > 700) cl.position.x += 1400;
        }
      dust.position.set(st.x, 0, st.z);
      dust.rotation.y = time * 0.03;
      // A match is on: the city's jobs, money and shop pins step aside.
      const matchOn = combat.inMatch;
      markers.hidden = pins.hidden = matchOn;
      for (const b of beacons.values()) (b.group.visible = !matchOn), b.tick(time);
      for (const l of loot.values()) if (matchOn) l.group.visible = false;
      for (const l of loot.values()) l.tick(time);
      for (const g of gates) g.tick(time);
      for (const cn of coins) cn.tick(time);
      markers.tick(time);
      others.tick(dt, serverNow, st.x, st.z);
      feed.update(frame.toLatLng(st.x, st.z));
      traffic.enabled = crowd.enabled = !matchOn;
      if (now - trafficSync > 1000) {
        trafficSync = now;
        const real = [...tiles.values()].flatMap((s) => (s.mesh?.real ? [s.mesh] : []));
        traffic.sync(real);
        crowd.sync(real);
      }
      obstacles.add("traffic", traffic.tick(dt, st.x, st.z));
      obstacles.add("people", crowd.tick(dt, st.x, st.z));
      if (now - lightsAt > 500) {
        lightsAt = now;
        const sec = Date.now() / 1000;
        for (const s of tiles.values()) if (s.mesh && s.dist < 400) paintSignals(s.mesh, (ns) => signalPhase(sec, ns));
      }

      // -- nav arrow: the party round, then a chosen destination, then the delivery
      const rg = roundGoal();
      const goalLL = rg?.at ?? navGoal ?? (L.me?.activeRun ? { lat: L.me.activeRun.targetLat, lng: L.me.activeRun.targetLng } : null);
      if (goalLL) {
        const g = frame.toXZ(goalLL.lat, goalLL.lng);
        const d = Math.hypot(g.x - st.x, g.z - st.z);
        arrow.visible = d > (rg ? CHECKPOINT_M : 25) && !fp;
        arrow.position.set(st.x, st.alt + model.height + 2 + Math.sin(time * 3) * 0.15, st.z);
        arrow.rotation.y = Math.atan2(-(g.x - st.x), -(g.z - st.z));
        if (!rg && navGoal && d < 30) navGoal = null; // arrived
      } else arrow.visible = false;

      // -- gearbox (sound and dial): five gears, revs climb and drop at each shift
      const gearStep = maxV() / 5;
      const gearN = vF < -0.3 ? 0 : Math.min(5, 1 + Math.floor(st.speed / gearStep));
      const gearbox = { gear: gearN, rpm: D.flies ? speedK : gearN === 0 ? 0.3 : Math.min(1, (st.speed - (gearN - 1) * gearStep) / gearStep) };

      // -- engine note
      if (engine) {
        const out = audioOut();
        if (out) {
          const tt = out.ctx.currentTime;
          const rpm = 0.2 + gearbox.rpm * 0.8 + c.gas * 0.08;
          const air = D.flies;
          engine.osc.frequency.setTargetAtTime((air ? 30 : 38) + rpm * (air ? 30 : 70), tt, 0.08);
          engine.osc2.frequency.setTargetAtTime((air ? 15 : 19) + rpm * (air ? 15 : 35), tt, 0.08);
          engine.filter.frequency.setTargetAtTime(300 + rpm * 900, tt, 0.1);
          const vol = isMuted() || !L.canDrive || onFoot ? 0 : 0.035 + rpm * 0.03;
          engine.gain.gain.setTargetAtTime(vol, tt, 0.15);
          // Rotor chop.
          engine.lfo.frequency.setTargetAtTime(air && spinning ? (D.key === "heli" ? 11 : 38) : 0, tt, 0.2);
          engine.lfoGain.gain.setTargetAtTime(air && spinning ? vol * 0.8 : 0, tt, 0.2);
        }
      }

      // -- slower work: tiles, signs, labels, loot pick-ups, position reports
      const low = (wasLow = lowEnough(D.flies, st.alt, wasLow));
      if (now - lastSlow > 250) {
        lastSlow = now;
        // The engine starts the moment audio is allowed (the first tap anywhere, the gas
        // pedal included), not only on a tap on the 3D view.
        if (!engine) startEngine();
        ensureTiles();
        landmarks.update(st.x, st.z);
        if (labelsDirty || Math.random() < 0.3) (syncLabels(), syncBoards(), syncCorners(), syncPins());
        if (menuTab.current === "places") syncPlaces();
        markers.sync(st.x, st.z);
        // More of the city was drawn: items near us may now stand inside a building.
        for (const it of [...beacons.values(), ...loot.values()]) if (it.settledAt !== cityDrawn && Math.hypot(it.raw.x - st.x, it.raw.z - st.z) < 600) settle(it);
        // Signs right next to the camera would fill the screen: hide them up close.
        for (const b of beacons.values()) b.sign.visible = Math.hypot(b.group.position.x - st.x, b.group.position.z - st.z) > 30;
        for (const l of loot.values()) {
          if (l.taken || !low) continue;
          if (Math.hypot(l.group.position.x - st.x, l.group.position.z - st.z) < LOOT_PICKUP_M) {
            l.taken = true;
            l.group.visible = false;
            void Promise.resolve(L.onCollect(l.id));
          }
        }
        if (L.canDrive && L.onMove && !combat.inMatch && now - st0.lastReport > 1000 && Math.hypot(st.x - st0.reported.x, st.z - st0.reported.z) > 2) {
          st0.lastReport = now;
          st0.reported = { x: st.x, z: st.z };
          L.onMove(frame.toLatLng(st.x, st.z));
        }
        const found = streetHere();
        const name = found && oneLine(found);
        if (name && name !== streetName) setBanner({ text: name, at: now });
        streetName = name;
      }
      orientLabels(nfx, nfz);
      scheduleBuilds();
      addReady();

      // -- adaptive quality: hold ~50+ fps by trading resolution (and shadows) for speed
      frames++;
      if (now - lastQuality > 2000) {
        fps = (frames * 1000) / (now - lastQuality);
        frames = 0;
        lastQuality = now;
        if (fps < 42 && dpr > 0.6) {
          dpr = Math.max(0.6, dpr - 0.25);
          renderer.setPixelRatio(dpr);
          goodFor = 0;
          if (dpr <= 0.85 && shadows) {
            shadows = false;
            sun.castShadow = false;
          }
        } else if (fps > 57 && dpr < maxDpr) {
          if (++goodFor >= 3) {
            dpr = Math.min(maxDpr, dpr + 0.25);
            renderer.setPixelRatio(dpr);
            goodFor = 0;
          }
        } else goodFor = 0;
      }

      // -- instruments (~20 Hz, straight into the DOM: a moving needle never re-renders React)
      if (now - lastGauge > 50) {
        lastGauge = now;
        paintGauge(gauge.current, {
          speed: Math.round(st.speed * 3.6),
          dial: Math.min(1, st.speed / Math.max(1, maxV() / 0.95)),
          rpm: gearbox.rpm,
          gear: D.flies ? null : gearbox.gear === 0 ? "R" : st.speed < 0.5 ? "N" : fmtNum(gearbox.gear),
          flying: D.flies,
          alt: Math.round(st.alt),
        });
      }

      // -- HUD (React, ~6 Hz — and only when something on it actually changed)
      if (now - lastHud > 160) {
        lastHud = now;
        const here = frame.toLatLng(st.x, st.z);
        let near: Job | null = null, nearD = Infinity;
        const inReach = new Set<string>();
        // The job at the destination becomes the wanted one, and stays so after arriving clears the goal.
        if (navGoal) for (const j of jobs) if (distanceM(navGoal, j) <= j.reach) wanted.current = j.id;
        if (low)
          for (const j of jobs) {
            const d = distanceM(here, j);
            if (d > j.reach) continue;
            inReach.add(j.id);
            const chosen = j.id === wanted.current || j.kind === "deliver";
            if (chosen && d < nearD && !dismissed.current.has(j.id)) (near = j), (nearD = d);
          }
        for (const id of dismissed.current) if (!inReach.has(id)) dismissed.current.delete(id);
        const navInfo = goalLL
          ? { label: rg?.label ?? (navGoal ? t("Destination") : t(L.me?.activeRun?.title ?? "")), dist: distanceM(here, goalLL), rel: ((bearingTo(here, goalLL) - (((-st.yaw * 180) / Math.PI) % 360) + 540) % 360) - 180 }
          : null;
        let village = false;
        for (const s of tiles.values()) if (!s.real && s.dist < 1) village = true;
        const loading = vsource.loading + [...fallback].filter((k) => tiles.has(k)).length * (source.loading ? 1 : 0);
        const list = jobs.map((j) => ({ id: j.id, emoji: j.emoji, label: j.label, dist: distanceM(here, j), lat: j.lat, lng: j.lng })).sort((a, b) => a.dist - b.dist).slice(0, 30);
        const sig = [
          near?.id, near?.verb, navInfo && `${navInfo.label}|${Math.round(navInfo.dist / 5)}|${Math.round(navInfo.rel / 4)}`, loading, village, camMode, phase, streetName, D.flies, low,
          menuOpen.current ? list.map((j) => `${j.id}:${Math.round(j.dist / 10)}`).join(",") : list.length,
          menuOpen.current ? Math.round(fps) : 0,
          partyNow ? Math.floor(serverNow / 250) : 0,
        ].join("~");
        if (sig !== hudSig) {
          hudSig = sig;
          setHud({ flying: D.flies, low, near, nav: navInfo, loading, village, cam: camMode, night: phase === "night", street: streetName, fps: Math.round(fps), serverNow, jobs: list });
        }
      }

      // -- minimap (~8 Hz): roads around us, heading up
      const mc = mini.current;
      if (mc && now - lastMini > 120) {
        lastMini = now;
        const g = mc.getContext("2d");
        if (g) {
          const W = mc.width, R = W / 2, scale = R / 240;
          g.save();
          g.clearRect(0, 0, W, W);
          g.beginPath();
          g.arc(R, R, R - 2, 0, Math.PI * 2);
          g.clip();
          g.fillStyle = phase === "night" ? "rgba(16,20,36,.9)" : style === "real" ? "rgba(232,234,226,.92)" : "rgba(222,244,210,.9)";
          g.fillRect(0, 0, W, W);
          g.translate(R, R);
          g.rotate(st.yaw);
          g.lineCap = "round";
          for (const s of tiles.values()) {
            const m = s.mesh;
            if (!m || s.dist > 260) continue;
            m.roads.forEach((line, li) => {
              const k = m.roadKinds[li];
              if (k === "foot" || k === "rail" || !m.roadDrawn[li]) return;
              g.strokeStyle = phase === "night" ? "#7f86b8" : k === "major" ? "#f2b94b" : "#9a9eb4";
              g.lineWidth = k === "major" ? 4 : 2.6;
              g.beginPath();
              for (let i = 0; i < line.length; i += 2) {
                const x = (line[i] - st.x) * scale, y = (line[i + 1] - st.z) * scale;
                if (i === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
              }
              g.stroke();
              // Live traffic over it, segment by segment where there's a reading.
              const cols = k === "major" || k === "minor" ? lineColors(feed, frame, line, k, trafficColors) : [];
              cols.forEach((col, si) => {
                if (!col) return;
                g.strokeStyle = col;
                g.lineWidth = k === "major" ? 4.6 : 3.2;
                g.beginPath();
                g.moveTo((line[si * 2] - st.x) * scale, (line[si * 2 + 1] - st.z) * scale);
                g.lineTo((line[si * 2 + 2] - st.x) * scale, (line[si * 2 + 3] - st.z) * scale);
                g.stroke();
              });
            });
          }
          const dot = (x: number, z: number, col: string, r = 4) => {
            g.fillStyle = col;
            g.beginPath();
            g.arc((x - st.x) * scale, (z - st.z) * scale, r, 0, Math.PI * 2);
            g.fill();
          };
          for (const p of pins.dots()) if (Math.abs(p.x - st.x) < 250 && Math.abs(p.z - st.z) < 250) dot(p.x, p.z, p.color, 2.2);
          for (const m of markers.dots()) dot(m.x, m.z, m.color, 3.2);
          for (const b of beacons.values()) dot(b.group.position.x, b.group.position.z, b.job.color, 4.5);
          for (const gt of gates) if (gt.group.visible) dot(gt.group.position.x, gt.group.position.z, "#f0c05a", 4);
          for (const cn of coins) if (cn.mesh.visible) dot(cn.mesh.position.x, cn.mesh.position.z, "#ffcf3a", 3);
          for (const o of [...others.positions(), ...combat.dots()]) {
            g.strokeStyle = "#111";
            g.lineWidth = 1.5;
            dot(o.x, o.z, o.color, 4.5);
            g.stroke();
          }
          if (goalLL) {
            const p = frame.toXZ(goalLL.lat, goalLL.lng);
            const len = Math.hypot(p.x - st.x, p.z - st.z) * scale;
            const ang = Math.atan2(p.z - st.z, p.x - st.x);
            const r = Math.min(len, R - 8);
            g.fillStyle = "#ee7fae";
            g.beginPath();
            g.arc(Math.cos(ang) * r, Math.sin(ang) * r, 6, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          // Me: always in the middle, pointing up.
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

      skyline.update(camera, st.x, st.z);
      renderer.render(scene, camera);
      combat.renderOverlay();
    };
    let raf = requestAnimationFrame(tick);
    ensureTiles();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __drive?: unknown }).__drive = { st, frame, scene, camera, tiles, corners, boards, pins, obstacles, renderer, mats, live, input, collision, others, markers, landmarks, combat, feed, traffic, crowd, skyline, applyPhase: (p: Phase) => applyPhase(p), fps: () => fps, dpr: () => dpr, pickAt };

    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      combat.resize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      net.stop();
      combat.dispose();
      setCombat(null);
      source.dispose();
      vsource.dispose();
      details.dispose();
      traffic.dispose();
      crowd.dispose();
      skyline.dispose();
      pool.dispose();
      vtPool.dispose();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", keysOff);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", pDown);
      el.removeEventListener("pointerup", pUp);
      ro.disconnect();
      keepAwake("drive", false);
      if (engine) {
        try {
          engine.osc.stop();
          engine.osc2.stop();
          engine.lfo.stop();
          engine.gain.disconnect();
        } catch {}
      }
      for (const s of tiles.values()) s.mesh?.dispose();
      for (const r of ready) r.mesh.dispose();
      for (const b of beacons.values()) b.dispose();
      for (const l of loot.values()) l.dispose();
      for (const l of labels.values()) l.dispose();
      for (const n of titles.values()) n.dispose();
      for (const b of boards.values()) b.dispose();
      for (const b of corners.values()) b.dispose();
      pins.dispose();
      for (const g of gates) g.dispose();
      for (const cn of coins) cn.dispose();
      others.dispose();
      landmarks.dispose();
      markers.dispose();
      model.dispose();
      cockpit.dispose();
      mats.dispose();
      tpl.dispose();
      sky.dispose();
      if (clouds) (clouds.geo.dispose(), clouds.mat.dispose());
      dustGeo.dispose();
      dustMat.dispose();
      arrow.geometry.dispose();
      arrowMat.dispose();
      ground.geometry.dispose();
      groundMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api3d.current = null;
    };
  }, [style, names]); // eslint-disable-line react-hooks/exhaustive-deps

  // The job button can be waved away (see `dismissed`); hide it now, the loop picks the next.
  const dismiss = (id: string) => {
    dismissed.current.add(id);
    if (wanted.current === id) wanted.current = null;
    setHud((h) => (h?.near?.id === id ? { ...h, near: null } : h));
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
  const pickVehicle = (k: VehicleKey) => {
    setVehicle(k);
    store.set(VEHICLE_KEY, k);
    api3d.current?.kick();
  };
  const pickPaint = (c: string) => {
    setPaint(c);
    store.set(COLOR_KEY, c);
  };
  const pickStyle = (s: Style) => {
    setStyle(s);
    store.set(STYLE_KEY, s);
  };
  const pickNames = (n: NameMode) => {
    setNames(n);
    store.set(NAMES_KEY, n);
  };
  const onQuery = (q: string) => {
    setQuery(q);
    placeQuery.current = q;
  };
  const goTo = (p: { lat: number; lng: number }, label: string) => {
    api3d.current?.setGoal({ lat: p.lat, lng: p.lng });
    setMenu(null);
    toast({ title: t("🧭 Heading to {place}", { place: label }) });
  };
  const pickCtl = (m: SteerMode) => {
    setCtl(m);
    store.set(CTL_KEY, m);
  };
  // Stable, so the memoised touch controls never re-render while driving.
  const onHorn = useCallback(() => api3d.current?.horn(), []);
  const onLand = useCallback(() => api3d.current?.land(), []);
  // The arrow points up; 0° relative bearing is straight ahead.
  const arrowStyle = hud?.nav ? { transform: `rotate(${hud.nav.rel}deg)` } : undefined;
  const v = VEHICLES[vehicle];
  const live2 = party?.status === "LIVE";
  const countdown = live2 && party?.startsAt && hud ? Math.ceil((party.startsAt - hud.serverNow) / 1000) : 0;
  // The start grid: a beep on 3, 2, 1 and "go!" when it lets go.
  const lastCount = useRef(0);
  useEffect(() => {
    const was = lastCount.current;
    lastCount.current = countdown;
    if (countdown > 0 && countdown <= 3 && countdown !== was) sfx("beep");
    else if (countdown <= 0 && was > 0 && was <= 3) sfx("go");
  }, [countdown]);

  const tabs: { key: MenuTab; icon: IconName; label: string; badge?: number }[] = [
    { key: "jobs", icon: "list", label: t("Jobs nearby"), badge: hud?.jobs.length },
    { key: "places", icon: "store", label: t("Places") },
    { key: "garage", icon: "garage", label: t("Garage") },
    { key: "party", icon: "people", label: t("Party games"), badge: party?.members.length },
    { key: "arena", icon: "target", label: t("Street Arena"), badge: fight?.lobbies.length || undefined },
  ];
  const cam = hud?.cam ?? "cockpit";

  return (
    <div className={`drive ${canDrive && touch ? "has-pad" : ""} ${onFoot ? "on-foot" : ""} ${fight?.inMatch ? "in-match" : ""}`} role="application" aria-label={t("3D city")}>
      <div className="drive-canvas" ref={mount} />

      {/* Top: me · the street I'm on · map, instruments and the two buttons */}
      <div className="drive-top">
        <div className="drive-start">
          <Button className="drive-round" onClick={onExit} aria-label={t("Back to the map")} title={t("Back to the map")}>
            <Icon name="back" />
          </Button>
          {me && (
            <button className="drive-me" onClick={onProfile} title={t("Profile")} aria-label={t("Profile")}>
              <span className="drive-me-av">
                {me.avatar}
                <i>{fmtNum(me.level)}</i>
              </span>
              <span className="drive-me-tx">
                <b>{me.username}</b>
                <span>💵 {fmtNum(me.toman)}</span>
              </span>
            </button>
          )}
        </div>
        <div className="drive-mid">
          {hud?.street && <div className="drive-street" key={banner?.at ?? 0}>{hud.street}</div>}
          {hud?.nav && (
            <div className="drive-nav">
              <span className="drive-nav-arrow" style={arrowStyle}><Icon name="nav" size={18} fill="currentColor" strokeWidth={1.5} /></span>
              <span className="drive-nav-tx">
                <b>{hud.nav.label}</b>
                <span>{formatDistance(hud.nav.dist)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="drive-end">
          <div className={`drive-mini-wrap ${hud && hud.loading > 0 ? "loading" : ""}`} title={hud && hud.loading > 0 ? t("Loading the city…") : undefined}>
            <canvas className="drive-mini" ref={mini} width={256} height={256} />
          </div>
          <div className="dgauge" ref={gauge} role="img" aria-label={t("Speedometer")}>
            <svg viewBox="0 0 80 80" aria-hidden>
              {GAUGE_TICKS}
              <circle cx="40" cy="40" r={G_R} className="dg-track" strokeDasharray={`${G_C * 0.75} ${G_C}`} />
              <circle cx="40" cy="40" r={G_R} className="dg-fill" strokeDasharray={`0 ${G_C}`} />
              <circle cx="40" cy="40" r={G_R2} className="dg-track thin" strokeDasharray={`${G_C2 * 0.75} ${G_C2}`} />
              <circle cx="40" cy="40" r={G_R2} className="dg-rpm" strokeDasharray={`0 ${G_C2}`} />
            </svg>
            <b className="dg-speed">0</b>
            <span className="dg-unit">{t("km/h")}</span>
            <i className="dg-gear" />
          </div>
          <div className="drive-side">
            <Button className="drive-round cam" onClick={() => api3d.current?.cycleCam()} aria-label={t("Camera")} title={t("Camera")}>
              <Icon name="camera" size={20} />
              <small>{onFoot ? (fight?.cam === "fps" ? "1P" : "3P") : CAM_LABEL[cam]}</small>
            </Button>
            {canDrive && combat && !fight?.inMatch && (onFoot ? (
              fight?.nearCar && (
                <Button className="drive-round on" onClick={() => combat.getIn()} aria-label={t("Get in the car")} title={t("Get in the car (F)")}>
                  <Icon name="car" size={20} />
                </Button>
              )
            ) : (
              <Button className="drive-round" onClick={() => combat.getOut()} aria-label={t("Get out and walk")} title={t("Get out and walk (F)")}>
                <Icon name="walk" size={20} />
              </Button>
            ))}
            <Button className={`drive-round ${menu ? "on" : ""}`} onClick={() => setMenu(menu ? null : "jobs")} aria-label={t("Menu")} title={t("Menu")} aria-expanded={!!menu}>
              <Icon name="menu" />
              {(hud?.jobs.length ?? 0) > 0 && <span className="badge">{fmtNum(hud?.jobs.length ?? 0)}</span>}
            </Button>
          </div>
        </div>
      </div>

      <a className="drive-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      {/* Stacked, so two never sit on top of each other. */}
      <div className="drive-notes">
        {!canDrive && <div className="drive-banner">🚶 {t("Following your real GPS — switch to Play from home to drive anywhere")}</div>}
        {hud?.village && hud.loading > 0 && (
          <div className="drive-loading">
            <i className="drive-spinner" aria-hidden />
            {t("Drawing this neighbourhood from the real map…")}
          </div>
        )}
      </div>
      {hud?.flying && !hud.low && hud.near === null && !flyHintOff && (
        <div className="drive-hint small closable">
          <span>{t("Fly low (under {m} m) to pick things up and check in", { m: LAND_ALT_M })}</span>
          <button className="dh-x" onClick={() => (setFlyHintOff(true), store.set(FLY_HINT_KEY, "1"))} aria-label={t("Dismiss")} title={t("Dismiss")}>✕</button>
        </div>
      )}

      {party && <PartyHud party={party} meId={me?.id ?? ""} serverNow={hud?.serverNow ?? Date.now()} />}
      {countdown > 0 && countdown <= 5 && <div className="drive-countdown" key={countdown}>{fmtNum(countdown)}</div>}

      {menu && (
        <div className="drive-sheet drive-menu" role="dialog" aria-label={t("Menu")}>
          <div className="drive-tabs" role="tablist">
            {tabs.map((tb) => (
              <button key={tb.key} role="tab" aria-selected={menu === tb.key} className={menu === tb.key ? "on" : ""} onClick={() => setMenu(tb.key)}>
                <Icon name={tb.icon} size={18} />
                <span className="lb">{tb.label}</span>
                {!!tb.badge && <span className="badge">{fmtNum(tb.badge)}</span>}
              </button>
            ))}
            <button className="close" onClick={() => setMenu(null)} aria-label={t("Close")}>✕</button>
          </div>
          {menu === "jobs" && hud && (
            <div className="drive-tab">
              {hud.jobs.length === 0 && <p className="small muted">{t("No jobs around here yet — drive on, or check back in a few minutes.")}</p>}
              {hud.jobs.map((j) => (
                <button key={j.id} className="drive-job" onClick={() => goTo(j, j.label)}>
                  <span className="ic">{j.emoji}</span>
                  <span className="grow">{j.label}</span>
                  <span className="small muted">{formatDistance(j.dist)}</span>
                </button>
              ))}
            </div>
          )}
          {menu === "places" && (
            <div className="drive-tab">
              <input className="drive-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t("Search shops, banks, cafés…")} aria-label={t("Search places")} />
              {places.length === 0 && <p className="small muted">{query.trim() ? t("Nothing called “{q}” around here.", { q: query.trim() }) : t("No places found around here yet — drive on and the map fills in.")}</p>}
              {places.map((p) => (
                <div key={p.id} className="drive-job drive-place">
                  <button className="drive-place-go" onClick={() => goTo(p, p.name)}>
                    <span className="ic">{p.emoji}</span>
                    <span className="grow">
                      <b>{p.name}</b>
                      <span className="small muted">{p.sub}</span>
                    </span>
                    <span className="small muted">{formatDistance(p.dist)}</span>
                  </button>
                  {p.sel && <Button className="btn small yellow" onClick={() => onSelect(p.sel!)}>{t("Open")}</Button>}
                </div>
              ))}
            </div>
          )}
          {menu === "garage" && (
            <DriveGarage
              embedded
              level={me?.level ?? 1}
              vehicle={vehicle}
              paint={paint}
              style={style}
              names={names}
              fps={hud?.fps ?? 0}
              locked={live2 ? party?.game ?? null : null}
              ctl={touch && canDrive ? ctl : null}
              onVehicle={pickVehicle}
              onPaint={pickPaint}
              onStyle={pickStyle}
              onNames={pickNames}
              onCtl={pickCtl}
              onClose={() => setMenu(null)}
            />
          )}
          {menu === "arena" && combat && <ArenaMenu combat={combat} canDrive={canDrive} onGo={goTo} onClose={() => setMenu(null)} />}
          {menu === "party" && (
            <DriveParty
              embedded
              party={party}
              meId={me?.id ?? ""}
              canDrive={canDrive}
              sim={!!sim}
              course={(g) => api3d.current?.course(g) ?? null}
              onChange={() => api3d.current?.kick()}
              onClose={() => setMenu(null)}
            />
          )}
        </div>
      )}

      {picked && (
        <div className="drive-pick">
          <span className="ic">{picked.emoji}</span>
          <div className="grow">
            <b>{picked.title}</b>
            <span className="small muted">{picked.sub}</span>
          </div>
          <Button className="btn small" onClick={() => (api3d.current?.setGoal({ lat: picked.lat, lng: picked.lng }), toast({ title: t("🧭 Heading to {place}", { place: picked.title }) }), setPicked(null))}>{t("Go")}</Button>
          {picked.sel && <Button className="btn small yellow" onClick={() => onSelect(picked.sel!)}>{t("Open")}</Button>}
          <button className="close" onClick={() => setPicked(null)} aria-label={t("Close")}>✕</button>
        </div>
      )}

      {/* The job you're standing at: a button to do it, and ✕ to wave it away */}
      {hud?.near && (
        <div key={hud.near.id} className={`drive-action ${busy ? "busy" : ""}`} style={{ "--job": hud.near.color } as React.CSSProperties}>
          <button className="da-main" disabled={busy} onClick={runNear} aria-busy={busy || undefined}>
            <span className="da-ic">{busy ? <i className="drive-spinner" aria-hidden /> : <Icon name={hud.near.icon} size={22} strokeWidth={2.2} />}</span>
            <span className="da-tx">
              <b>{busy ? t("Working…") : hud.near.verb}</b>
              <span>{hud.near.where}</span>
            </span>
          </button>
          <button className="da-x" onClick={() => dismiss(hud.near!.id)} aria-label={t("Dismiss")} title={t("Dismiss")} disabled={busy}>✕</button>
        </div>
      )}

      {combat && <CombatHud combat={combat} touch={touch} />}
      {canDrive && touch && combat && onFoot && <CombatPad input={combat.input} sens={combat.lookScale} onReload={() => combat.reload()} onSwap={() => combat.swap()} onJump={combat.jump} />}
      {canDrive && touch && !onFoot && <DrivePad input={input} kind={v.flies ? "air" : v.bike ? "moto" : "car"} mode={ctl} onHorn={onHorn} onLand={onLand} />}
      {canDrive && !touch && onFoot && footKeys && (
        <div className="drive-keys small">{t("Click to aim with the mouse · WASD move · Shift sprint · Space jump · C crouch · R reload · Q switch gun · V view · Tab scores · F car")}</div>
      )}
      {canDrive && !touch && showKeys && !onFoot && (
        <div className="drive-keys small">
          {v.flies ? t("W/↑ forward · S/↓ back · A D/← → turn · R/E climb · F/Q descend · L land · H horn · C camera") : t("W/↑ gas · S/↓ brake · A D/← → steer · Space drift · H horn · C camera")}
        </div>
      )}
    </div>
  );
}

// ---- the speedometer: speed on the outer arc, revs on the inner one, 270° each
const G_R = 33, G_R2 = 27;
const G_C = 2 * Math.PI * G_R, G_C2 = 2 * Math.PI * G_R2;
const GAUGE_TICKS = (
  <g className="dg-ticks">
    {Array.from({ length: 11 }, (_, i) => {
      const a = (i * 27 * Math.PI) / 180, r1 = i % 5 === 0 ? 35.5 : 36.5, r2 = 39;
      return <line key={i} x1={40 + Math.cos(a) * r1} y1={40 + Math.sin(a) * r1} x2={40 + Math.cos(a) * r2} y2={40 + Math.sin(a) * r2} className={i >= 9 ? "red" : undefined} />;
    })}
  </g>
);

/** Paint the speedometer straight into its DOM nodes. */
function paintGauge(el: HTMLDivElement | null, g: { speed: number; dial: number; rpm: number; gear: string | null; flying: boolean; alt: number }) {
  if (!el) return;
  const text = (sel: string, v: string) => {
    const n = el.querySelector(sel);
    if (n && n.textContent !== v) n.textContent = v;
  };
  el.querySelector(".dg-fill")?.setAttribute("stroke-dasharray", `${(G_C * 0.75 * g.dial).toFixed(1)} ${G_C}`);
  el.querySelector(".dg-rpm")?.setAttribute("stroke-dasharray", `${(G_C2 * 0.75 * g.rpm).toFixed(1)} ${G_C2}`);
  text(".dg-speed", fmtNum(g.speed));
  text(".dg-unit", g.flying ? `↥ ${fmtNum(g.alt)} m` : t("km/h"));
  text(".dg-gear", g.gear ?? "");
  el.classList.toggle("redline", !g.flying && g.rpm > 0.88);
}
