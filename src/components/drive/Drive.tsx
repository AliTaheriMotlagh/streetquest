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
import { allowedVehicle, drivableOf, drivenVehicle, isPaint, LAND_ALT_M, lowEnough, PAINTS, startVehicle, STARTER_CAR, VEHICLES, type VehicleKey } from "@/lib/vehicles";
import { CHECKPOINT_M, type PartyGame, type PartyView } from "@/lib/party";
import { Button } from "@/components/Button";
import { Art } from "@/components/art/Art";
import { api, type Selected, type World, type WorldPlayer } from "../game/client";
import { useGame } from "../game/ui";
import { audioOut, isMuted, keepAwake, sfx } from "../game/sfx";
import { setEars } from "../game/spatial";
import { holdSample } from "../game/samples";
import { fovFor } from "@/lib/view";
import { filmLook } from "@/lib/filmLook";
import { airFor } from "@/lib/atmosphere";
import { parseCube } from "@/lib/lut";
import { setFullscreen } from "./fullscreen";
import { NightLights } from "./nightLights";
import type { Candidate } from "@/lib/lightBudget";
import { celebrate } from "../game/Play";
import { isLite, isTouch } from "../perf";
import { layCourse } from "./course";
import { DriveGarage } from "./DriveGarage";
import { DrivePad, STEER_MODES, type SteerMode } from "./DrivePad";
import { PadPoller } from "./gamepad";
import { AbilityHud, paintAbilities } from "./AbilityHud";
import { focusDepth, newAbilities, stepAbilities } from "@/lib/abilities";
import { loadTouchPrefs, useTouchPrefs } from "./touchPrefs";
import { CarRadio, type RadioState } from "./radio";
import { Icon, type IconName } from "./icons";
import { MODES, type ModeKey } from "@/lib/arena/modes";
import { PartyHud } from "./PartyHud";
import { PlayTogether } from "./PlayTogether";
import { useVasatyab } from "../game/Vasatyab";
import { Markers, markersOf } from "./markers";
import { CinemaBoards } from "./cinemaBoards";
import { Storefronts, type StorePanel } from "./storefronts";
import { StoreChip, StoreSheet, type StoreTarget } from "./StoreCard";
import { DrivePlaces, type PlaceRow } from "./DrivePlaces";
import { ProductSearch } from "../game/ProductSearch";
import type { Cinema } from "@/lib/cinema";
import { DriveNet, type NetState } from "./net";
import { Landmarks } from "./landmarks";
import { Others } from "./others";
import { bootProgress, BOOT_NEAR_M, type BootOut } from "@/lib/bootGate";
import { DriveBoot } from "./DriveBoot";
import { nearStore, oncePerStore, onRoads, RoadGrid, signSpot, type StoreSpot } from "@/lib/storefront";
import { CHUTE_OPEN_S, CollisionWorld, forward, stepAir, stepChute, stepGround, type Body } from "./physics";
import { makeChute } from "./chute3d";
import { BuildPool, DetailSource, TileSource, VectorSource } from "./tiles";
import { lineColors, TrafficCars, TrafficFeed } from "./traffic";
import { Crowd } from "./people";
import { StreetLife } from "./street";
import { StreetHud } from "./StreetHud";
import { ScenarioHud } from "./ScenarioHud";
import { Scenarios } from "./scenarios";
import { signalPhase } from "@/lib/traffic";
import { Skyline } from "./skyline";
import { GraphicsEngine } from "./graphics/engine";
import { autoTier, forgetDemotion, qualityPick, setQualityPick, setTimePick, setWeatherPick, timePick, weatherPick } from "./graphics/caps";
import type { QualityPick } from "./graphics/quality";
import { surfaces } from "./graphics/surfaces";
import { Rain } from "./graphics/weather";
import { mixHex, mixRecord, phaseOf, skyFor, sunVector, WEATHER_LOOK, type TimePick, type Weather } from "@/lib/daylight";
import type { Label, Style } from "./tileMesh";
import { oneLine, tradeOf } from "./trades";
import { NAME_MODES, type NameMode } from "./vectorTile";
import { Combat } from "../arena/combat";
import { CombatHud, useCombat } from "../arena/CombatHud";
import { CombatPad } from "../arena/CombatPad";
import { RT_DELAY_MS } from "../arena/remotes";
import { F_FOOT, type ArenaGeo } from "@/lib/arena/protocol";
import { makeCockpit, makeVehicle, type Cockpit, type VehicleModel } from "./vehicles3d";
import { onCarModel, preloadCarModels } from "./carModels";
import { drawnParts } from "./fleet3d";
import { makeBeacon, makeLoot } from "./markerKit";
import { DriveMenu } from "./DriveMenu";
import { Waypoints } from "./waypoints";
import { makeDirectionSign, makeGantry } from "./streetKit3d";
import { iconForEmoji, MARKER_COLORS, rarityOf } from "@/lib/hudMarkers";
import {
  LIGHT, makeClouds, makeCoin, makeCornerSign, makeGate, makeMaterials, makePlaque, makeShopSign, makeSign, makeSkySystem, makeStreetLabel, makeTemplates, adoptModels, paintSignals, setNight, tileMeshes, WORLD,
  type Board, type Light, type Phase, type TileMeshes,
  POOLS,
} from "./world3d";
import { loadPropModels } from "./propModels";
import { PROP_MODELS } from "@/lib/propModels";

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
  /** Stores the sites know of (Snappfood, Torob, the directories) — each gets a sign where the map has none. */
  stores?: { id: string; name: string; lat: number; lng: number; cls?: string }[];
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
type MenuTab = "jobs" | "places" | "garage" | "settings" | "play";
/** A line in the Places list: a real shop from the map, a player's shop or a business. */
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
  /** The store you're passing (slow, or on foot): its card under the street name. */
  store: { kind: "store" | "marker"; id: string; emoji: string; name: string; sub: string; color: string; cls?: string; lat?: number; lng?: number } | null;
  fps: number;
  serverNow: number;
};

/** My vehicle's lamp colours (scaled past white when lit, for the HDR pipeline's bloom). */
const LAMP = { brake: new THREE.Color("#ff2a3d"), tail: new THREE.Color("#5a0d16"), tailNight: new THREE.Color("#9a1424"), head: new THREE.Color("#fff6d8") };
const VEHICLE_KEY = "sq_vehicle";
const COLOR_KEY = "sq_car_color";
const STYLE_KEY = "sq_drive_style";
const LOAD_M = 600; // load tiles whose box is this close
const DROP_M = 1150; // and drop them past this
const LOOT_PICKUP_M = 16;
const CAMS: CamMode[] = ["cockpit", "chase", "far", "top"];
const CAM_KEY = "sq_drive_cam";
const CTL_KEY = "sq_drive_ctl";
const NAMES_KEY = "sq_drive_names";
const FLY_HINT_KEY = "sq_fly_hint_off";
const SHOPS_M = 260; // shops on the minimap and for the store card this far
/** The party's meeting point (Vasatyab) in the 3D city: its beacon, minimap dot and waypoint. */
const VASA_COLOR = "#b18cff";
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

export default function Drive({ start, goal, canDrive, sim, follow, onMove, onCollect, onSelect, onProfile, onExit, stores }: Props) {
  const storesRef = useRef(stores);
  storesRef.current = stores;
  const { me, world, act, refresh, toast } = useGame();
  const mount = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  // The minimap opened up (tap it, or M): a wider area, bigger, over the game — the full 2D map is one more tap.
  const [bigMap, setBigMap] = useState(false);
  const bigMapRef = useRef(false);
  bigMapRef.current = bigMap;
  const wpRoot = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  // The loading screen (lib/bootGate.ts): up until the streets round you are drawn and the car stands on one.
  const [boot, setBoot] = useState<BootOut>({ pct: 0, stage: "map", done: false, canSkip: false });
  const skipBoot = useRef(false);
  const [menu, setMenu] = useState<MenuTab | null>(null);
  const [showKeys, setShowKeys] = useState(true);
  useEffect(() => {
    const k = setTimeout(() => setShowKeys(false), 9000);
    return () => clearTimeout(k);
  }, []);
  const [busy, setBusy] = useState(false);
  const [combat, setCombat] = useState<Combat | null>(null);
  const [street, setStreet] = useState<StreetLife | null>(null);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const fight = useCombat(combat);
  const onFoot = !!fight?.onFoot;
  // The car radio (radio.ts): plays in the car, waits on foot and in a match.
  const radioRef = useRef<CarRadio | null>(null);
  const [radio, setRadio] = useState<RadioState>({ station: null, status: "off" });
  const [radioOpen, setRadioOpen] = useState(false);
  useEffect(() => {
    const r = new CarRadio(setRadio);
    radioRef.current = r;
    return () => (r.dispose(), void (radioRef.current = null));
  }, []);
  useEffect(() => radioRef.current?.setInCar(!onFoot && !fight?.inMatch), [onFoot, fight?.inMatch]);
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
  // Graphics quality (rebuilds the scene), time of day and weather (live): graphics/caps.ts keeps them.
  const [quality, setQuality] = useState<QualityPick>(() => qualityPick());
  const [timeOfDay, setTimeOfDay] = useState<TimePick>(() => timePick());
  const [weather, setWeather] = useState<Weather>(() => weatherPick());
  const [vehicle, setVehicle] = useState<VehicleKey>(() => startVehicle(store.get(VEHICLE_KEY), me?.level ?? 1));
  const [drivenKey, setDrivenKey] = useState<VehicleKey | null>(null);
  const [paint, setPaint] = useState(() => {
    const c = store.get(COLOR_KEY);
    return isPaint(c) ? c : PAINTS[0];
  });
  const [names, setNames] = useState<NameMode>(() => {
    const n = store.get(NAMES_KEY) as NameMode | null;
    return n && NAME_MODES.includes(n) ? n : "mine";
  });
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const placeQuery = useRef("");
  const [party, setParty] = useState<PartyView | null>(null);
  // The party's host started a Street Arena match: everyone in the party is pulled in
  // (once per match — leaving it sticks; Play together has a button to go back in).
  const pulledInto = useRef<string | null>(null);
  const partyArena = party?.arena ?? null;
  // The realtime server shows party members to each other in the open city (like friends).
  const partyKey = party?.members.map((m) => m.userId).filter((id) => id !== me?.id).join() ?? "";
  useEffect(() => {
    combat?.setParty(partyKey ? partyKey.split(",") : []);
  }, [combat, partyKey]);
  const amHost = !!party && party.hostId === me?.id;
  const rtOn = fight?.rt === "on";
  const inMatch = !!fight?.inMatch;
  useEffect(() => {
    if (!partyArena || !combat || !canDrive || amHost || !rtOn || inMatch || pulledInto.current === partyArena.id) return;
    pulledInto.current = partyArena.id;
    toast({ kind: "social", title: t("{emoji} Joining the party's {mode}…", { emoji: MODES[partyArena.mode as ModeKey]?.emoji ?? "🔫", mode: t(MODES[partyArena.mode as ModeKey]?.name ?? "Street Arena") }) });
    combat.join(partyArena.id, partyArena.kind);
  }, [partyArena?.id, combat, canDrive, amHost, rtOn, inMatch]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<Picked | null>(null);
  /** A store tapped (its sign, or its chip): the full card with photos, deals and the menu. */
  const [storeSheet, setStoreSheet] = useState<StoreTarget | null>(null);
  /** Product search open, round where I was when I opened it. */
  const [productsAt, setProductsAt] = useState<LatLng | null>(null);
  const [banner, setBanner] = useState<{ text: string; at: number } | null>(null);
  // "Fly low to pick things up": once waved away, gone for good on this device.
  const [flyHintOff, setFlyHintOff] = useState(() => store.get(FLY_HINT_KEY) === "1");
  /** The "following your real GPS" note shrinks to a small chip after a few seconds (it covered the road on small phones). */
  const [gpsNoteSmall, setGpsNoteSmall] = useState(false);
  useEffect(() => {
    setGpsNoteSmall(false);
    if (canDrive) return;
    const id = setTimeout(() => setGpsNoteSmall(true), 7000);
    return () => clearTimeout(id);
  }, [canDrive]);
  const input = useRef({ gas: 0, brake: 0, steer: 0, lift: 0, hand: false, focus: false, nitro: false, keys: new Set<string>() });
  const abilityEl = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<SteerMode>(() => {
    const c = store.get(CTL_KEY) as SteerMode | null;
    return c && STEER_MODES.includes(c) ? c : "wheel";
  });
  const gauge = useRef<HTMLDivElement>(null);
  const menuOpen = useRef(false);
  menuOpen.current = !!menu;
  const menuTab = useRef<MenuTab | null>(null);
  menuTab.current = menu;
  // The pad's Start button (components/drive/gamepad.ts) opens and closes the menu.
  useEffect(() => {
    const f = () => setMenu((m) => (m ? null : "jobs"));
    window.addEventListener("sq:menu", f);
    return () => window.removeEventListener("sq:menu", f);
  }, []);
  /** Jobs waved away with ✕. The loop skips them, so the next job at the same spot shows,
   * and forgets each one once you're out of its reach, so it's back when you return. */
  const dismissed = useRef(new Set<string>());
  /** The job the player chose to drive to. Only that one (and the active delivery) gets the
   * action button; pickups and check-ins you merely drive past don't pop one up. */
  const wanted = useRef<string | null>(null);
  // Latest props/context for the render loop (it lives as long as the component).
  // Vasatyab: the party's meeting point (the one set, else the middle of everyone) as a beacon in the
  // city, a dot on the minimap and a waypoint — polled every 20 s while in a party.
  const vasa = useVasatyab(false, !!party);
  const meet: (LatLng & { name: string; set: boolean }) | null = vasa.view?.meet ? { ...vasa.view.meet, set: true } : vasa.view?.point ? { ...vasa.view.point, name: "", set: false } : null;
  const live = useRef({ world, me, follow, canDrive, onMove, onCollect, onSelect, goal: goal ?? null, act, refresh, vehicle, paint, sim: !!sim, toast, touch, timeOfDay, weather, meet });
  live.current = { ...live.current, world, me, follow, canDrive, onMove, onCollect, onSelect, act, refresh, vehicle, paint, sim: !!sim, toast, touch, timeOfDay, weather, meet };
  const api3d = useRef<{
    setGoal: (p: LatLng | null) => void;
    /** Where I am now. */
    here: () => LatLng;
    cycleCam: () => void;
    horn: (on: boolean) => void;
    land: () => void;
    course: (g: PartyGame) => { start: LatLng & { yaw: number }; points: LatLng[] } | null;
    kick: () => void;
    /** Back to my own car (a new pick in the garage): any car I took off the street is left behind. */
    ownCar: () => void;
    /** Put my car here (back in it first if I'm walking): going to the party's host. */
    teleport: (at: LatLng & { yaw: number }) => void;
    /** The card for a store (or anything else tapped in the city). */
    openPick: (pick: { kind: string; id: string }) => void;
    /** What a store's card read (logo, hours, menu, deal): its sign and the in-world panel use it. */
    storeInfo: (id: string, info: StorePanel) => void;
    /** The in-world panel by this store (null: away). */
    showPanel: (id: string | null) => void;
  } | null>(null);
  // Survives a graphics-style switch (which rebuilds the scene).
  const persist = useRef<{ frame: ReturnType<typeof makeFrame>; body: Body; placed: "" | "village" | "real"; placedAt: { x: number; z: number }; cam: CamMode; warpRound: number } | null>(null);

  // A vehicle you haven't unlocked (level dropped, other device) falls back to the hatchback.
  useEffect(() => {
    if (me && drivenVehicle(vehicle, me.level) !== vehicle) setVehicle(STARTER_CAR);
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
      persist.current = { frame, body: { x: p.x, z: p.z, alt: 0, cruise: 0, yaw: 0, vx: 0, vz: 0, vy: 0, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0 }, placed: "", placedAt: p, cam: CAMS.includes(savedCam as CamMode) ? (savedCam as CamMode) : "chase", warpRound: 0 };
    }
    const P = persist.current;
    const frame = P.frame;
    const st = P.body;
    const st0 = { lastReport: 0, reported: { x: st.x, z: st.z }, bumpAt: 0 };

    // ---- renderer & scene
    // graphics/engine.ts: the quality tier, dynamic resolution, the HDR pipeline (high/ultra).
    const gfx = new GraphicsEngine(el, { lite, direct: style === "toon" });
    const renderer = gfx.renderer;
    let prof = gfx.profile;
    let shadows = prof.shadows;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, el.clientWidth / el.clientHeight, 0.5, 2400);
    const earAt = new THREE.Vector3(), earFwd = new THREE.Vector3(), earUp = new THREE.Vector3();
    // Shared procedural detail (graphics/surfaces.ts) for the realistic sky's cloud layer.
    const skyNoise = style === "real" && prof.clouds ? surfaces(prof.anisotropy) : null;
    const sky = makeSkySystem(renderer, scene, style, { noise: skyNoise?.noise });
    /** The fog's colour as it should look on screen (the scene's fog may be the HDR equivalent). */
    const fogShown = new THREE.Color("#c3d2df");
    // The real mountains on the horizon, from elevation data.
    const skyline = new Skyline(frame, () => fogShown, lite);
    scene.add(skyline.group);
    const hemi = new THREE.HemisphereLight("#ffffff", "#88aa77", 1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    gfx.shadeSun(sun);
    scene.add(sun, sun.target);
    const groundMat = style === "real" ? new THREE.MeshStandardMaterial({ color: "#7a8262", roughness: 1 }) : new THREE.MeshLambertMaterial({ color: "#9bd27f" });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = shadows;
    scene.add(ground);
    const clouds = style === "toon" ? makeClouds(lite ? 8 : 18) : null;
    if (clouds) scene.add(clouds.group);
    const mats = makeMaterials(style, { surfaces: prof.surfaces, wind: prof.wind, lampPools: prof.lampPools, anisotropy: prof.anisotropy });
    // Rain streaks around the camera (shown in rainy weather).
    const rain = new Rain(prof.rainDrops);
    scene.add(rain.mesh);
    const tpl = makeTemplates(style);
    // Real street furniture once its models are in (the drawn ones meanwhile, and always in
    // the storybook city): new tiles use them, and tiles already up swap theirs over.
    if (style === "real")
      void loadPropModels().then((models) => {
        if (!models || disposed) return void (models && Object.values(models).forEach((g) => g.dispose()));
        const old = adoptModels(tpl, models, PROP_MODELS.kinds.lamp?.top ?? null);
        const byName = tpl as unknown as Record<string, THREE.BufferGeometry | undefined>;
        scene.traverse((o) => {
          const im = o as THREE.InstancedMesh;
          const k = im.isInstancedMesh ? (im.userData.prop as string | undefined) : undefined;
          const g = k ? byName[k] : undefined;
          if (g?.isBufferGeometry) im.geometry = g;
        });
        for (const g of old) g.dispose();
      });
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
    let model: VehicleModel = makeVehicle(live.current.vehicle, live.current.paint, style, { lights: true, shadows, clearcoat: prof.clearcoat });
    scene.add(model.group);
    // First person: the view from the driver's seat replaces the body.
    let cockpit: Cockpit = makeCockpit(live.current.vehicle, live.current.paint, style);
    model.group.add(cockpit.group);
    let modelKey = `${live.current.vehicle}|${live.current.paint}`;
    /** What the server lets me drive right now (party rounds can force wheels). */
    let serverVehicle: VehicleKey | null = null;
    /** A car I took off the street (on foot, F at it), driven in its own paint until I pick in the garage again. */
    let streetCar: { key: VehicleKey; paint: string } | null = null;
    /** What I'm driving by choice (the server may still force other wheels): a street car I took, else my pick. */
    const driving = (): VehicleKey => streetCar?.key ?? live.current.vehicle;
    const currentKey = (): VehicleKey => serverVehicle ?? driving();
    const paintNow = () => streetCar?.paint ?? live.current.paint;
    const def = () => VEHICLES[currentKey()];
    /**
     * The next car, built off screen until its shaders are ready (graphics/warmup.ts): the one
     * you're in stays drawn till then, so a new model or paint never blinks out or stalls a frame.
     */
    let nextModel: { key: string; model: typeof model; cockpit: typeof cockpit; ready: boolean } | null = null;
    /** The vehicle the car on screen is (modelKey is cleared to force a rebuild). */
    let shownVehicle: VehicleKey = live.current.vehicle;
    const rebuildModel = () => {
      const want = `${currentKey()}|${paintNow()}`;
      if (want === modelKey) {
        if (nextModel) (nextModel.model.dispose(), nextModel.cockpit.dispose(), (nextModel = null));
        return;
      }
      if (nextModel?.key !== want) {
        if (nextModel) nextModel.model.dispose(), nextModel.cockpit.dispose();
        const n = { key: want, model: makeVehicle(currentKey(), paintNow(), style, { lights: true, shadows, clearcoat: prof.clearcoat }), cockpit: makeCockpit(currentKey(), paintNow(), style), ready: false };
        n.model.group.add(n.cockpit.group);
        nextModel = n;
        void gfx.gate.whenReady(n.model.group).then(() => (n.ready = true));
      }
      // A different vehicle (not just its real model or a new paint): the old one isn't left
      // standing where the new one is for the frame or two this takes.
      if (!nextModel.ready) return void (model.group.visible = shownVehicle === currentKey());
      scene.remove(model.group);
      model.dispose();
      cockpit.dispose();
      ({ model, cockpit } = nextModel);
      nextModel = null;
      scene.add(model.group);
      street?.car.attach(model);
      modelKey = want;
      shownVehicle = currentKey();
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
        if (s.mesh) s.mesh.detail.visible = s.dist < prof.detailM;
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
      job.mesh.detail.visible = slot.dist < prof.detailM;
      scene.add(job.mesh.group);
      collision.add(job.key, job.mesh.footprints);
      cityDrawn++;
      // Its streets can put a neighbour's sign pole in the road too: every tile's poles checked again.
      for (const [k, t] of tiles) if (t.mesh) obstacles.add(k, clearPoles(t.mesh));
      labelsDirty = true;
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
    // The party's meeting point (Vasatyab): one beacon, rebuilt when its name changes.
    let vasaBeacon: ReturnType<typeof makeBeacon> | null = null, vasaKey = "", vasaLabel = "";
    const syncVasa = () => {
      const m = live.current.meet;
      const label = m ? (m.set ? m.name || t("Meeting point") : t("Vasatyab · the middle")) : "";
      const key = m ? `${m.set}|${label}` : "";
      if (key !== vasaKey) {
        if (vasaBeacon) (scene.remove(vasaBeacon.group), vasaBeacon.dispose(), (vasaBeacon = null));
        if (m) scene.add((vasaBeacon = makeBeacon("people", VASA_COLOR, label, { lite })).group);
        vasaKey = key;
        vasaLabel = label;
      }
      if (vasaBeacon && m) {
        const p = frame.toXZ(m.lat, m.lng);
        vasaBeacon.group.position.set(p.x, 0, p.z);
      }
    };
    const beacons = new Map<string, Beacon>();
    type Loot = ReturnType<typeof makeLoot> & { id: string; taken: boolean } & Placed;
    const loot = new Map<string, Loot>();
    // Waypoint chips (HUD): the destination and the nearest jobs, with distance or an edge arrow.
    const wp = new Waypoints(wpRoot.current ?? el, lite ? 3 : 4, (m) => formatDistance(m));
    const wpPick: Beacon[] = [];
    const labels = new Map<string, ReturnType<typeof makeStreetLabel> & { x: number; z: number; angle: number }>();
    const boards = new Map<string, Board>();
    const corners = new Map<string, { group: THREE.Group; dispose: () => void }>();
    let boardNight = 0.15;
    const titles = new Map<string, ReturnType<typeof makeSign>>();
    /** Shops near you (their boards, on the minimap, and for the store card). */
    let shops: (StoreSpot & { color: string })[] = [];
    let labelsDirty = true;
    let jobs: Job[] = [];
    let navGoal: LatLng | null = live.current.goal;
    let wpNav: { x: number; z: number; label: string } | null = null;
    const others = new Others(scene, frame, style, lite);
    // Live traffic: street speeds for the minimap and the cars on the streets.
    const feed = new TrafficFeed();
    // Clear-coated paint on every car in traffic only on ultra (instanced, but many pixels).
    const traffic = new TrafficCars(scene, frame, feed, style, lite, { clearcoat: prof.clearcoat && prof.tier === "ultra" });
    // The street cars' real 3D models download in the background (traffic shows drawn ones
    // until then); when my own car's lands, it's rebuilt with it.
    preloadCarModels(drawnParts);
    const offCarModel = onCarModel((k) => {
      if (VEHICLES[currentKey()].model !== k) return;
      modelKey = "";
      // A drawn stand-in still being readied is out of date now: build the real one instead.
      if (nextModel) (nextModel.model.dispose(), nextModel.cockpit.dispose(), (nextModel = null));
    });
    // People on the pavements: they run from trouble, and cars knock them down.
    const crowd = new Crowd(scene, style, lite);
    // People step round cars, never through them (the cars' and poles' colliders; the police and mine once street life is up).
    crowd.solid = (x, z) => !!obstacles.collide(x, z, 0.3).hit || !!street.solid.collide(x, z, 0.3).hit;
    // Street life outside matches: crashes and damage, crime and the police (street.ts).
    let shakeK = 0;
    const street: StreetLife = new StreetLife({
      scene, camera, collision, obstacles, crowd, traffic, lite, shadows,
      combat: (): Combat | null => combat,
      street: (x, z, d) => nearestStreet(x, z, d),
      push: (vx, vz) => {
        if (combat.onFoot) return;
        st.vx += vx;
        st.vz += vz;
      },
      shake: (k) => (shakeK = Math.max(shakeK, k)),
    });
    setStreet(street);
    // A street job done (a thief stopped, the police shaken off): the server pays it, within its limits.
    street.onJob = (job, stars) => {
      if (live.current.sim) return;
      api<{ reward: { xp: number; coins: number } }>("/api/drive/street", { body: { job, stars } })
        .then(({ reward }) => {
          live.current.toast({ kind: "reward", title: job === "thief" ? t("Thief stopped") : t("Clean getaway"), body: t("+{xp} XP · +{coins} coins", { xp: fmtNum(reward.xp), coins: fmtNum(reward.coins) }) });
          live.current.refresh();
        })
        .catch(() => {});
    };
    // Story scenarios (scenarios.ts): givers on the streets, the run's objectives, a chase car, the police.
    const scenarios = new Scenarios({
      scene, frame, street, traffic, lite, sim: !!live.current.sim,
      tiles: () => [...tiles.values()].flatMap((s) => (s.mesh ? [s.mesh] : [])),
      snap: (x, z, d) => nearestStreet(x, z, d),
      rewarded: (r, title) => {
        live.current.toast({ kind: "reward", title, body: t("+{xp} XP · +{coins} coins", { xp: fmtNum(r.xp), coins: fmtNum(r.coins) }) });
        live.current.refresh();
      },
      toast: (title) => live.current.toast({ title }),
    });
    scenarios.setDown(() => !!combat.streetDown);
    setScenarios(scenarios);
    const trafficColors = new WeakMap<Float32Array, { v: number; c: (string | null)[] }>();
    let trafficSync = 0, lightsAt = 0, syncCrowd = false;
    /** A store's pole sign: on the pavement in front of it, facing the nearest street (lib/storefront.ts). */
    const placeSign = (x: number, z: number) => {
      const lines: Float32Array[] = [], widths: number[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > 1) continue;
        s.mesh.roads.forEach((l, i) => {
          if (s.mesh!.roadKinds[i] === "foot" || s.mesh!.roadKinds[i] === "rail") return;
          lines.push(l);
          widths.push(s.mesh!.roadWidths[i] ?? 8);
        });
      }
      // No clear pavement near: its own spot if that's off the road, else no pole at all.
      return signSpot(lines, widths, x, z) ?? (onRoads(lines, widths, x, z, 0.5) ? null : { x, z, angle: 0 });
    };
    /**
     * Every street of every tile drawn (a sign the worker put up beside its own tile's streets
     * can stand in the next tile's): poles on any of them are left out, with their colliders.
     */
    let roadsAt = -1, roadGrid: RoadGrid | null = null;
    const streets = () => {
      if (roadsAt === cityDrawn && roadGrid) return roadGrid;
      const lines: Float32Array[] = [], widths: number[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh) continue;
        s.mesh.roads.forEach((l, i) => {
          if (!s.mesh!.roadDrawn[i] || s.mesh!.roadKinds[i] === "foot" || s.mesh!.roadKinds[i] === "rail") return;
          lines.push(l);
          widths.push(s.mesh!.roadWidths[i] ?? 8);
        });
      }
      roadsAt = cityDrawn;
      return (roadGrid = new RoadGrid(lines, widths));
    };
    const inStreet = new WeakMap<Label, { at: number; on: boolean }>();
    /** A pole sign (a corner's street names, a shop's board on a post) standing on a street. */
    const poleInStreet = (l: Label) => {
      if (!l.pole && l.kind !== "corner") return false;
      const g = streets(), c = inStreet.get(l);
      if (c && c.at === roadsAt) return c.on;
      const on = g.on(l.x, l.z, 0.25);
      inStreet.set(l, { at: roadsAt, on });
      return on;
    };
    /** A tile's colliders without the poles of its signs that stand in a street. */
    const clearPoles = (m: TileMeshes) => {
      const bad = m.labels.filter(poleInStreet);
      if (!bad.length) return m.obstacles;
      return m.obstacles.filter((f) => !(f.maxX - f.minX < 0.5 && bad.some((l) => Math.abs((f.minX + f.maxX) / 2 - l.x) < 0.3 && Math.abs((f.minZ + f.maxZ) / 2 - l.z) < 0.3)));
    };
    const markers = new Markers(scene, frame, lite ? 16 : 32, style, placeSign);
    // Cinemas' billboards (what's on, from cinematicket.org): the list is read again after 3 km.
    const cinemaBoards = new CinemaBoards(scene, frame, placeSign);
    // Every store: one lit sign each (an atlas), dressed fronts, and the panel by the one you pass (storefronts.ts).
    const storefronts = new Storefronts(scene, lite ? "lite" : prof.tier, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    storefronts.blocked = (x, z) => streets().on(x, z, 0.8);
    // The parachute (chute3d.ts): jumping from the helicopter high up. The helicopter flies itself
    // down to the ground under where you jumped and waits there as your parked vehicle.
    const chuteM = makeChute();
    scene.add(chuteM.group);
    let chute: { t: number; hx: number; hz: number; hyaw: number; halt: number } | null = null;
    let cinemasAt: { x: number; z: number } | null = null;
    const syncCinemas = () => {
      if (cinemasAt && Math.hypot(st.x - cinemasAt.x, st.z - cinemasAt.z) < 3000) return;
      cinemasAt = { x: st.x, z: st.z };
      const at = frame.toLatLng(st.x, st.z);
      void api<{ cinemas: Cinema[] }>(`/api/cinema?near=1&lat=${at.lat.toFixed(3)}&lng=${at.lng.toFixed(3)}`)
        .then((r) => cinemaBoards.set(r.cinemas))
        .catch(() => (cinemasAt = null));
    };

    const jobsFrom = (w: World | null): Job[] => {
      const out: Job[] = [];
      const m = live.current.me;
      const run = m?.activeRun;
      if (run)
        out.push({
          id: `run:${run.id}`, kind: "deliver", lat: run.targetLat, lng: run.targetLng, emoji: "🎯", color: MARKER_COLORS.deliver, label: t(run.title), verb: t("Deliver"), where: t(run.title), icon: "flag", reach: INTERACT_RADIUS_M, sel: null,
          run: () => live.current.act(() => api("/api/runs", { body: { runId: run.id, action: "complete" } })).then((ok) => (ok && celebrate({ title: t("DELIVERED!"), art: "box", body: t(run.title) }), ok)),
        });
      for (const p of w?.places ?? []) {
        if (p.done || (run && p.kind === "deliver")) continue;
        const cat = PLACE_CATS[p.place.cat] ?? PLACE_CATS.shop;
        out.push({
          id: p.id, kind: p.kind === "deliver" ? "pickup" : "visit", lat: p.place.lat, lng: p.place.lng, emoji: p.emoji, color: p.kind === "deliver" ? MARKER_COLORS.job : MARKER_COLORS.visit,
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
            id: `biz:${c.id}`, kind: "biz", lat: b.lat, lng: b.lng, emoji: b.emoji, color: MARKER_COLORS.biz, label: `${c.title} · ${b.name}`, verb: t("Check in"), where: b.name, icon: "check", reach: BIZ_CHECKIN_M,
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
        const b = Object.assign(makeBeacon(iconForEmoji(j.emoji), j.color, j.label, { lite }), { job: j, raw: p, settledAt: -1 });
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
        const l = Object.assign(makeLoot("coin", rarityOf(s)), { id: s.id, taken: false, raw: p, settledAt: -1 });
        l.icon.userData = { pick: { kind: "loot", id: s.id } };
        settle(l);
        scene.add(l.group);
        loot.set(s.id, l);
      }
      markers.set(markersOf(w));
      others.setWalkers(w?.players ?? []);
    };

    /**
     * Stores only the sites know of: a sign on a pole at the kerb nearest each, facing the street
     * (stepping out from the road until it's on the pavement, not in the road or a building).
     */
    const dataLabels = new Map<string, Label>();
    const kerbFor = (x: number, z: number) => {
      const s = nearestStreet(x, z, 60);
      if (!s) return null;
      const dx = x - s.x, dz = z - s.z, dd = Math.hypot(dx, dz) || 1;
      for (const off of [4.5, 6, 7.5, 3.5, 9]) {
        const px = s.x + (dx / dd) * off, pz = s.z + (dz / dd) * off;
        if (streets().on(px, pz, 0.7) || collision.collide(px, pz, 0.5).hit) continue;
        return { x: px, z: pz, yaw: Math.atan2(-dx, -dz) };
      }
      return null;
    };
    /** A shop label by its id (`tile key:index`, or `d:` for a site's store), from the tile it's on. */
    const shopById = (id: string): Label | null => {
      if (id.startsWith("d:")) return dataLabels.get(id) ?? null;
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
          if (poleInStreet(l)) return;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          if (d < (l.kind === "num" ? 55 : 150)) want.push({ id: `${s.key}:${i}`, l, d });
        });
      }
      // The sites' stores near enough (the map's own sign wins when it has the same store: oncePerStore).
      for (const sd of storesRef.current ?? []) {
        const p = frame.toXZ(sd.lat, sd.lng), d = Math.hypot(p.x - st.x, p.z - st.z);
        if (d > 150) continue;
        const id = `d:${sd.id}`;
        let l = dataLabels.get(id);
        if (!l) {
          const k = kerbFor(p.x, p.z);
          if (!k) continue;
          l = { text: sd.name, x: k.x, z: k.z, angle: k.yaw, w: Math.min(4, Math.max(2.6, sd.name.length * 0.36 + 1.6)), y: 2.6, kind: "shop", cls: sd.cls, pole: true, top: 3.2 };
          dataLabels.set(id, l);
        }
        want.push({ id, l, d: d + 8 });
      }
      want.sort((a, b) => a.d - b.d);
      // (One sign per store: the map has some twice — oncePerStore.)
      storefronts.sync(oncePerStore(want.filter((w) => w.l.kind === "shop").map((w) => ({ ...w, x: w.l.x, z: w.l.z, name: oneLine(w.l.text) }))).map((w) => ({ id: w.id, text: w.l.text, cls: w.l.cls, x: w.l.x, y: w.l.y, z: w.l.z, angle: w.l.angle, w: w.l.w, pole: w.l.pole, d: w.d })));
      const pick = want.filter((w) => w.l.kind === "num").slice(0, lite ? 8 : 24);
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

    /** Street-name signs on their poles at the corners close by, arrow signs and motorway gantries before the junctions. */
    const syncCorners = () => {
      const want: { id: string; l: Label; d: number }[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > CORNER_M) continue;
        s.mesh.labels.forEach((l, i) => {
          if ((l.kind !== "corner" && l.kind !== "direction" && l.kind !== "gantry") || poleInStreet(l)) return;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          if (d < CORNER_M) want.push({ id: `${s.key}:${i}`, l, d });
        });
      }
      want.sort((a, b) => a.d - b.d);
      const pick = want.slice(0, lite ? 8 : 22);
      const keep = new Set(pick.map((w) => w.id));
      for (const [id, b] of corners) if (!keep.has(id)) (scene.remove(b.group), b.dispose(), corners.delete(id));
      for (const { id, l } of pick) {
        if (corners.has(id)) continue;
        const b = l.kind === "gantry" ? makeGantry(l.plates ?? [], l.w) : l.kind === "direction" ? makeDirectionSign(l.plates ?? []) : makeCornerSign(l.plates ?? [], style, !!l.ir);
        if (l.kind === "corner") b.group.position.set(l.x, l.y, l.z);
        else (b.group.position.set(l.x, 0, l.z), (b.group.rotation.y = l.angle));
        scene.add(b.group);
        corners.set(id, b);
      }
    };

    /**
     * The shops around (the nearest couple of hundred): blips on the minimap and the store
     * card as you pass one. In the city itself a shop is only its sign — no floating pin
     * (glowing markers are for missions and money).
     */
    const syncShops = () => {
      const want: (StoreSpot & { color: string; d: number })[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh || s.dist > 1) continue;
        s.mesh.labels.forEach((l, i) => {
          if (l.kind !== "shop") return;
          const d = Math.hypot(l.x - st.x, l.z - st.z);
          if (d > SHOPS_M) return;
          const tr = tradeOf(l.cls);
          want.push({ id: `${s.key}:${i}`, x: l.x, z: l.z, name: oneLine(l.text), cls: l.cls, emoji: tr.emoji, color: tr.bg[0], d });
        });
      }
      want.sort((a, b) => a.d - b.d);
      shops = oncePerStore(want).slice(0, lite ? 90 : 220);
    };

    /** The Places list (only while it's open): shops on the map, players' shops, businesses. */
    let placesSig = "";
    const syncPlaces = () => {
      const q = placeQuery.current.trim().toLowerCase();
      const match = (...texts: string[]) => !q || texts.some((x) => x.toLowerCase().includes(q));
      const here = frame.toLatLng(st.x, st.z);
      const rows: PlaceRow[] = [];
      const mapRows: (PlaceRow & { x: number; z: number })[] = [];
      for (const s of tiles.values()) {
        if (!s.mesh) continue;
        s.mesh.labels.forEach((l, i) => {
          if (l.kind !== "shop") return;
          const tr = tradeOf(l.cls), name = oneLine(l.text), sub = t(tr.label);
          if (!match(name, sub)) return;
          const at = frame.toLatLng(l.x, l.z);
          mapRows.push({ id: `${s.key}:${i}`, emoji: tr.emoji, name, sub, dist: Math.hypot(l.x - st.x, l.z - st.z), lat: at.lat, lng: at.lng, sel: null, cls: l.cls, color: tr.bg[0], x: l.x, z: l.z });
        });
      }
      // The map has some shops twice (a point and its building, or one in each of two tiles): one row each.
      mapRows.sort((a, b) => a.dist - b.dist);
      for (const { x: _x, z: _z, ...row } of oncePerStore(mapRows)) rows.push(row);
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
      if (p?.warp && p.warp.round !== P.warpRound && live.current.canDrive && !combat.inMatch) {
        P.warpRound = p.warp.round;
        // Rounds are driven: back in the car (wherever it's parked) before lining up.
        combat.backInCar();
        const q = frame.toXZ(p.warp.lat, p.warp.lng);
        Object.assign(st, { x: q.x, z: q.z, yaw: p.warp.yaw, vx: 0, vz: 0, vy: 0, alt: 0, cruise: 0, speed: 0 });
        camPos.set(st.x + Math.sin(st.yaw) * 10, 5, st.z + Math.cos(st.yaw) * 10);
        live.current.onMove?.({ lat: p.warp.lat, lng: p.warp.lng });
        st0.lastReport = performance.now();
        st0.reported = { x: st.x, z: st.z };
        combat.warp(st.x, st.z, st.yaw);
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
    /** The vehicle my last report asked for: anything else in the answer is the server's say. */
    let asked: VehicleKey = driving();
    const net = new DriveNet(
      () => {
        const L = live.current;
        // In a match the arena is my world; the city sees me again when I'm back.
        if (combat.inMatch) return null;
        const here = frame.toLatLng(st.x, st.z);
        asked = driving();
        if (!L.canDrive) return { here: L.follow ?? here, alt: 0, yaw: st.yaw, speed: 0, vehicle: asked, color: paintNow() };
        // On foot, others see my soldier (and, without a realtime server, fight me) through this.
        return { lat: here.lat, lng: here.lng, alt: st.alt, yaw: st.yaw, speed: st.speed, vehicle: asked, color: paintNow(), sim: L.sim, ...combat.footReport() };
      },
      (s: NetState) => {
        if (disposed) return;
        serverOffset = s.offset;
        // The realtime link (when up) draws everyone at 20 Hz; this is the fallback: cars
        // here, players on foot as soldiers (combat), with my health and the hits I took.
        if (!combat.live) others.setDrivers(s.others.filter((o) => !(o.flags & F_FOOT)));
        combat.fromHttp(s.others, s.me, s.offset);
        const forced = s.vehicle !== asked ? s.vehicle : null;
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
    /** The driver asked to get out while rolling: the brakes are on until the car stops (combat.getOut). */
    let stopForExit = false;
    const combat: Combat = new Combat({
      scene, camera, renderer, el, frame, collision, obstacles, others, shadows, sim: !!live.current.sim,
      get touch() {
        return live.current.touch;
      },
      canDrive: () => live.current.canDrive,
      vehicle: () => ({ x: st.x, z: st.z, alt: st.alt, yaw: st.yaw, vx: st.vx, vz: st.vz, key: currentKey(), paint: paintNow(), flies: def().flies }),
      parked: () => parked,
      streetCar: (x, z) => traffic.nearestToTake(x, z),
      takeCar: (x, z) => {
        const c = traffic.take(x, z);
        if (!c) return null;
        // Its health is mine now — and pulling a driver out of it is a crime. (Built afresh:
        // the same model and paint as a wreck I left must not keep its charred shell.)
        street.tookCar(c, c.x, c.z);
        scenarios.tookCar(c.key);
        modelKey = "";
        // It isn't in my way any more: the street's cars as solid things, without it, before I'm placed in it.
        obstacles.add("traffic", traffic.tick(0, c.x, c.z));
        // The car I got out of stays at the kerb (when it's one of the street's own models).
        const was = def();
        if (parked && was.model && !was.flies) traffic.leave({ key: was.model, paint: paintNow(), x: parked.x, z: parked.z, yaw: parked.yaw });
        streetCar = { key: drivableOf(c.key), paint: c.paint };
        // It waits where it stood: getting in (setFoot) puts me in it there.
        parked = { x: c.x, z: c.z, yaw: c.yaw, alt: 0 };
        return t(VEHICLES[streetCar.key].name);
      },
      street: (x, z) => nearestStreet(x, z, 120),
      arenaGeo: (r) => arenaGeo(r),
      brake: (on) => void (stopForExit = on),
      bail: () => {
        if (def().key !== "heli" || st.alt < 12 || chute || combat.inMatch) return false;
        chute = { t: 0, hx: st.x, hz: st.z, hyaw: st.yaw, halt: st.alt };
        st.vy = 0;
        st.cruise = 0;
        chuteM.open(0);
        chuteM.group.visible = true;
        live.current.toast({ title: t("Jump! The parachute opens by itself — gas to dive, brake to slow down") });
        return true;
      },
      setFoot: (on, at) => {
        stopForExit = false;
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
      placeCar: (x, z, yaw) => {
        Object.assign(st, { x, z, yaw, vx: 0, vz: 0, vy: 0, speed: 0, cruise: 0 });
        st0.reported = { x, z };
      },
      toast: (text) => live.current.toast({ title: text }),
      me: () => live.current.me,
      npc: street.npc,
      carUsable: () => street.carUsable,
    });
    setCombat(combat);
    street.car.attach(model);
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
      const out = audioOut("vehicles");
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
    // The horn sounds as long as it's held (a tap is a short beep, a lean a long blast): the
    // recording's middle looped; without a file yet, two detuned reeds through a body filter
    // (the 420/500 Hz pair of a real car horn), never a bare square-wave beep.
    let hornOff: (() => void) | null = null;
    const hornVoice = Math.floor(Math.random() * 3);
    const horn = (on = true) => {
      if (!on) return void (hornOff?.(), (hornOff = null));
      if (hornOff) return;
      hornOff = holdSample("horn", 0.55, hornVoice);
      if (hornOff) return;
      const out = audioOut("vehicles");
      if (!out || isMuted()) return;
      const { ctx } = out;
      const g = ctx.createGain();
      const body = ctx.createBiquadFilter();
      body.type = "bandpass";
      body.frequency.value = 900;
      body.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.015);
      body.connect(g).connect(out.out);
      const oscs = [418, 502].map((f) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.connect(body);
        o.start();
        return o;
      });
      const t0 = ctx.currentTime;
      hornOff = () => {
        const at = Math.max(ctx.currentTime, t0 + 0.16);
        g.gain.setValueAtTime(0.16, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
        for (const o of oscs) o.stop(at + 0.08);
      };
    };

    // ---- input
    let zHeld = false;
    const keyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "z") zHeld = true; // focus / dead-eye (also on foot, where the soldier owns the other keys)
      if (combat.onFoot) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      input.current.keys.add(k);
      if (k === "h" && !e.repeat) horn(true);
      if (k === "c") cycleCam();
      if (k === "l") land();
      if (k === "m" && !e.repeat) setBigMap((b) => !b);
      if (k === "n" && !e.repeat) radioRef.current?.next();
      startEngine();
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "z") zHeld = false;
      input.current.keys.delete(e.key.toLowerCase());
      if (e.key.toLowerCase() === "h") horn(false);
      // A Mac sends no keyup for keys let go while ⌘ is held: start over when it goes.
      if (e.key === "Meta") input.current.keys.clear();
    };
    // Switching away (alt-tab, another window) swallows the keyups: let go of every key.
    const keysOff = () => (input.current.keys.clear(), (zHeld = false), horn(false));
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
      const targets = [...[...beacons.values()].map((b) => b.icon), ...[...loot.values()].map((l) => l.icon), ...markers.pickables(), ...cinemaBoards.pickables(), ...others.pickables(), ...[...boards.values()].flatMap((b) => b.group.children)];
      const small = ray.intersectObjects(targets, false)[0];
      // A store's sign (one instanced draw): the nearer of it and the rest wins.
      const sf = storefronts.pick(ray);
      if (sf && (!small || sf.distance < small.distance)) return openPick({ kind: "store", id: sf.id });
      // A store's own building (nested meshes); whatever is nearer the camera wins.
      const big = ray.intersectObjects(landmarks.pickables(), true)[0];
      const lm = big && (!small || big.distance < small.distance) ? landmarks.of(big.object) : null;
      if (lm) {
        const here = frame.toLatLng(st.x, st.z);
        const biz = live.current.world?.businesses.find((b) => b.id === lm.businessId);
        return setPicked({ emoji: lm.emoji, title: lm.name, sub: formatDistance(distanceM(here, lm)), lat: lm.lat, lng: lm.lng, sel: biz ? { type: "biz", data: biz } : null });
      }
      const pick = small?.object.userData.pick as { kind: string; id: string } | undefined;
      if (!pick) return setPicked(null);
      openPick(pick);
    };
    /** The card for something tapped in the city (or the store card under the street name). */
    const openPick = (pick: { kind: string; id: string }) => {
      const here = frame.toLatLng(st.x, st.z);
      const L = live.current;
      if (pick.kind === "store") {
        const l = shopById(pick.id);
        if (!l) return setPicked(null);
        const tr = tradeOf(l.cls), at = frame.toLatLng(l.x, l.z);
        setPicked(null);
        setStoreSheet({ id: pick.id, name: oneLine(l.text), cls: l.cls, lat: at.lat, lng: at.lng, emoji: tr.emoji, color: tr.bg[0], sub: `${t(tr.label)} · ${formatDistance(distanceM(here, at))}` });
      } else if (pick.kind === "job") {
        const j = beacons.get(pick.id)?.job;
        if (j) setPicked({ emoji: j.emoji, title: j.label, sub: formatDistance(distanceM(here, j)), lat: j.lat, lng: j.lng, sel: j.sel });
      } else if (pick.kind === "loot") {
        const s = L.world?.money.find((x) => x.id === pick.id);
        if (s) setPicked({ emoji: "💵", title: s.drop?.label ?? t("{n} toman", { n: s.amount }), sub: t("Drive through it to pick it up"), lat: s.lat, lng: s.lng, sel: { type: "money", data: s } });
      } else if (pick.kind === "cinema") {
        const c = cinemaBoards.get(pick.id);
        // Straight to the sessions and the ticket link.
        if (c) (setPicked(null), L.onSelect({ type: "cinema", data: c }));
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
      here: () => frame.toLatLng(st.x, st.z),
      openPick,
      storeInfo: (id, info) => storefronts.setInfo(id, info),
      showPanel: (id) => storefronts.showPanel(id),
      cycleCam,
      horn,
      land,
      kick: () => net.kick(),
      ownCar: () => {
        streetCar = null;
        street.freshCar();
        // Built again even if it's the same model and paint (a wreck's charred shell goes).
        modelKey = "";
        net.kick();
      },
      teleport: (at) => {
        if (combat.inMatch) return;
        combat.backInCar();
        const q = frame.toXZ(at.lat, at.lng);
        Object.assign(st, { x: q.x, z: q.z, yaw: at.yaw, vx: 0, vz: 0, vy: 0, alt: 0, cruise: 0, speed: 0 });
        camPos.set(st.x + Math.sin(st.yaw) * 10, 5, st.z + Math.cos(st.yaw) * 10);
        live.current.onMove?.({ lat: at.lat, lng: at.lng });
        st0.lastReport = performance.now();
        st0.reported = { x: st.x, z: st.z };
        combat.warp(st.x, st.z, st.yaw);
        net.kick();
      },
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
    /** The store whose card is up (kept while it's still about as near as the best: no flicker). */
    let lastStore: string | null = null;
    let shownKey: VehicleKey | null = null;
    let lastShopCall = 0;
    const shopCalled = new Map<string, number>();
    let lastSlow = 0, lastHud = 0, lastGauge = 0, hudSig = "", lastMini = 0, fps = 60, lastWorld: World | null = null;
    let phase: Phase = "day";
    /** 0 by day … 1 at night (blended through dusk and dawn). */
    let night = 0;
    let streetName: string | null = null;
    const maxV = () => (Math.max(10, S.driveSpeedKmh) / 3.6) * 0.95 * def().speed;

    // ---- time of day & weather (src/lib/daylight.ts): the sky, its light, fog, wet streets, rain
    const sunDir = new THREE.Vector3(0.3, 0.8, 0.5); // the light's direction (kept high enough for readable shadows)
    const skyDir = new THREE.Vector3(); // where the sun (or moon) really is in the sky
    const vec3 = [0, 0, 0];
    let skyKey = "", lastSky = 0, wet = -1, wetTarget = 0, rainAmount = 0;
    let skyPick = live.current.timeOfDay, skyWeather = live.current.weather;
    const rainTint = new THREE.Color();
    let skyOvercast = 0;
    const applySky = (force = false) => {
      const { timeOfDay: pick, weather: w } = live.current;
      const here = frame.toLatLng(st.x, st.z);
      const s = skyFor(pick, new Date(), here.lat, here.lng);
      const key = [pick, w, Math.round(s.elevation * 2), Math.round(s.azimuth / 2)].join();
      if (!force && key === skyKey) return;
      skyKey = key;
      const W = WEATHER_LOOK[w];
      let L: Light = mixRecord(LIGHT[style][s.a], LIGHT[style][s.b], s.t);
      if (W.overcast) {
        // Overcast: the sky and its light go grey (dark grey at night), the sun's light is diffused.
        const k = W.overcast, dark = s.night > 0.6;
        const grey = (c: string, day: string) => mixHex(c, dark ? "#1c212b" : day, k);
        L = { ...L, top: grey(L.top, "#8f99a3"), horizon: grey(L.horizon, "#b7bec5"), fog: grey(L.fog, "#a9b1b9"), hemiSky: grey(L.hemiSky, "#cfd5da"), sunI: L.sunI * W.sun, hemi: L.hemi * (1 + 0.3 * k), fogNear: L.fogNear * W.fogNear, fogFar: L.fogFar * W.fogFar, exposure: L.exposure * (1 + 0.12 * k) };
      }
      if (s.live) {
        // The real sun; below the horizon the moon stands opposite, high enough to light the streets.
        if (s.elevation > -4) sunVector(s.elevation, s.azimuth, vec3);
        else sunVector(35, (s.azimuth + 180) % 360, vec3);
        skyDir.set(vec3[0], vec3[1], vec3[2]);
      } else {
        const el = THREE.MathUtils.degToRad(L.elev), az = THREE.MathUtils.degToRad(s.azimuth);
        skyDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
      }
      sunDir.copy(skyDir).setY(Math.max(skyDir.y, 0.3)).normalize();
      // Realistic style: the sky's environment map already lights everything from all round, so
      // the hemisphere fill is weaker and the sun a bit stronger — shade with depth, not flat.
      // At night the fill stays (moonlit streets must stay readable).
      if (style === "real") L = { ...L, hemi: L.hemi * (0.45 + 0.6 * s.night), sunI: L.sunI * 1.15, exposure: L.exposure * (1.15 + 0.1 * s.night) };
      sky.apply({ L, sunDir: skyDir, night: s.night, overcast: W.overcast, cover: prof.clouds ? W.clouds : 0 });
      fogShown.set(L.fog);
      const fogColor = gfx.sceneColor(fogShown);
      scene.fog = new THREE.Fog(fogColor, L.fogNear, Math.min(L.fogFar, prof.fogFar));
      POOLS.far.value = Math.min(L.fogFar, prof.fogFar);
      renderer.setClearColor(fogColor);
      hemi.intensity = L.hemi;
      hemi.color.set(L.hemiSky);
      hemi.groundColor.set(L.ground);
      sun.intensity = L.sunI;
      sun.color.set(L.sun);
      groundMat.color.set(L.ground);
      phase = phaseOf(s);
      night = s.night;
      setNight(mats, style, night);
      landmarks.setNight(night);
      traffic.setNight(night);
      // Shop signs: past 1 under the HDR pipeline, so the bright ones bloom like neon.
      boardNight = 0.15 + night * (gfx.hdr && style === "real" ? 2.4 : 0.85);
      for (const b of boards.values()) if ("emissiveIntensity" in b.mat) b.mat.emissiveIntensity = boardNight;
      markers.setNight(boardNight);
      cinemaBoards.setNight(night);
      storefronts.setNight(night);
      dustMat.opacity = night > 0.6 ? 0.95 : 0.35;
      dustMat.color.set(night > 0.6 ? "#b8ff7a" : "#fff3b0");
      // Wet streets come and go over a few seconds; starting out in the rain they already are.
      wetTarget = style === "real" ? W.wet : 0;
      if (wet < 0) wet = wetTarget;
      rainAmount = W.rain;
      rainTint.set(night > 0.6 ? "#59626e" : W.overcast ? "#bcc6cf" : "#d4dde6");
      WORLD.wind.value = 1 + 1.3 * W.rain;
      // The final image (HDR pipeline): bloom mostly for lamps and windows at night, a warmer
      // grade at golden hour, a cooler one at night, flatter and greyer in bad weather.
      const G = gfx.grade, toonish = style === "toon";
      G.bloom = (toonish ? 0.05 : 0.06) + 0.14 * night;
      G.threshold = night > 0.5 ? 1.1 : 1.6;
      // Realistic: an open-world look — rich colour and contrast under a clear sky, a sun-warmed
      // day (teal shadows come from the film look's split toning), flatter and greyer when overcast.
      G.saturation = toonish ? 1.04 : 1.16 - 0.26 * W.overcast;
      G.contrast = toonish ? 1.02 : 1.12 - 0.07 * W.overcast;
      G.vignette = toonish ? 0.2 + 0.1 * night : 0.28 + 0.1 * night;
      G.ao = toonish ? 0.7 : 0.85;
      const warm = !toonish && night > 0.2 && night < 0.6 ? 1 - Math.abs(night - 0.45) / 0.25 : 0;
      const day = toonish ? 0 : Math.max(0, 1 - night * 2) * (1 - W.overcast);
      G.tint.setRGB(1 + 0.05 * warm + 0.025 * day - 0.05 * Math.max(0, night - 0.6), 1 + 0.005 * day, 1 - 0.06 * warm - 0.035 * day + 0.07 * Math.max(0, night - 0.6));
      // The film look's share of the sky (lib/filmLook.ts; speed and camera are added each frame).
      G.sunDir.copy(skyDir);
      const air = airFor({ night, overcast: W.overcast, rain: W.rain, sunHeight: skyDir.y });
      G.hazeDensity = air.density;
      G.hazeScatter = air.scatter;
      G.heat = style === "toon" ? 0 : air.heat;
      G.hazeColor.copy(fogColor);
      // Dust motes catch the low sun: more of them drifting in its light.
      if (night <= 0.6) dustMat.opacity = 0.35 + 0.4 * Math.min(1, air.scatter);
      G.sunColor.set(L.sun).multiplyScalar(0.8 + 0.5 * warm);
      skyOvercast = W.overcast;
    };
    applySky(true);
    gfx.onProfile((p) => {
      // The adaptive controller gave something back or took it away.
      prof = p;
      nightLights.setMax(style === "real" ? p.nightLights : 0);
      POOLS.near.value = style === "real" && p.nightLights > 0 ? 0.85 : 0;
      shadows = p.shadows;
      gfx.shadeSun(sun);
      sky.cloudsOn(p.clouds);
      applySky(true);
    });
    const camFwd = new THREE.Vector3();
    // Real lights at night (nightLights.ts): the pool the tier allows, the realistic city only.
    const nightLights = new NightLights(scene, style === "real" ? prof.nightLights : 0);
    // Near lamps light the ground for real: their painted glow gives way (world3d POOLS).
    POOLS.near.value = style === "real" && prof.nightLights > 0 ? 0.85 : 0;
    const lampCands: Candidate[] = [];
    const collectLights = (out: Candidate[]) => {
      const R = 90;
      for (const s of tiles.values()) {
        const lamps = s.mesh?.streetLamps;
        if (!lamps || s.dist > R) continue;
        for (let i = 0; i < lamps.length; i += 2) if (Math.abs(lamps[i] - st.x) < R && Math.abs(lamps[i + 1] - st.z) < R) out.push({ id: `l${s.key}:${i}`, kind: "lamp", x: lamps[i], z: lamps[i + 1] });
      }
      lampCands.length = 0;
      traffic.lampCandidates(lampCands as never, st, R);
      out.push(...lampCands);
    };
    let filmSpeed = 0, filmCam: CamMode = camMode, filmFoot = false;
    // An optional colour lookup table over the finished picture (a .cube file; README: 3D LUT).
    const lutUrl = process.env.NEXT_PUBLIC_DRIVE_LUT;
    if (lutUrl && gfx.hdr)
      void fetch(lutUrl)
        .then((r) => (r.ok ? r.text() : ""))
        .then((txt) => !disposed && gfx.setLut(parseCube(txt)))
        .catch(() => {});

    // ---- game controller (components/drive/gamepad.ts): writes the same inputs as the keyboard and the touch pad
    const pad = new PadPoller();
    const padCtx = {
      input: input.current,
      combat,
      get flies() {
        return def().flies;
      },
      menuOpen: () => menuOpen.current,
      onMenu: () => window.dispatchEvent(new Event("sq:menu")),
      cycleCam: () => cycleCam(),
      horn: (on: boolean) => horn(on),
      land: () => land(),
      toast: (text: string) => live.current.toast({ title: text }),
      sens: () => loadTouchPrefs().look,
    };
    pad.start();
    const abil = newAbilities();
    let bSat = 1, bVig = 0.2, aSat = -1, aVig = -1;
    const bootAt = performance.now();
    let booted = false, bootCheck = 0;
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      // -- loading screen: count what's drawn round the car a few times a second until it may start
      if (!booted && now - bootCheck > 200) {
        bootCheck = now;
        let near = 0, drawn = 0, real = 0;
        for (const s of tiles.values())
          if (s.dist < BOOT_NEAR_M) {
            near++;
            if (s.mesh) (drawn++, s.mesh.real && real++);
          }
        const b = bootProgress({ near, drawn, real, placed: !!P.placed, elapsedMs: now - bootAt });
        if (b.done || skipBoot.current) {
          booted = true;
          setBoot({ ...b, pct: 100, done: true, canSkip: false });
        } else setBoot((o) => (o.pct === b.pct && o.stage === b.stage && o.canSkip === b.canSkip ? o : b));
      }
      const rdt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // ---- game pad, then abilities: the world's clock (dt) is the real frame time scaled by slow motion
      // (never in a match or a party game: everyone's clock must agree; positions sent stay real, a slowed car only moves less).
      pad.poll(padCtx, rdt);
      const abOn = !combat.inMatch && !(partyNow && partyNow.status === "LIVE");
      const cin = input.current;
      const flyingNow = def().flies;
      stepAbilities(abil, {
        dt: rdt,
        enabled: abOn && live.current.canDrive,
        mode: combat.onFoot ? "foot" : flyingNow ? "air" : "car",
        focusHold: cin.focus || zHeld || (!flyingNow && cin.keys.has("q") && cin.keys.has("e")),
        nitroHold: cin.nitro || cin.keys.has("shift"),
        aiming: combat.input.aim,
        moving: st.speed > 1,
      });
      const dt = rdt * abil.scale;
      const time = now / 1000;
      const serverNow = Date.now() + serverOffset;
      const L = live.current;
      if (L.world !== lastWorld) {
        lastWorld = L.world;
        syncWorld();
      }
      if (`${currentKey()}|${paintNow()}` !== modelKey) rebuildModel();
      const D = def();

      // -- on foot: the soldier moves (and owns the camera); "me" follows the soldier
      others.delayMs = combat.live ? RT_DELAY_MS : 450;
      const onFoot = combat.tick(dt, now);
      const soldier = combat.me;
      if (onFoot && soldier) Object.assign(st, { x: soldier.x, z: soldier.z, vx: soldier.vx, vz: soldier.vz, yaw: soldier.yaw, speed: Math.hypot(soldier.vx, soldier.vz), steer: 0 });

      // -- driving / flying
      const keys = input.current.keys;
      // Frozen on the start grid until the countdown ends.
      const frozen = !booted || onFoot || (!!partyNow?.startsAt && partyNow.status === "LIVE" && serverNow < partyNow.startsAt);
      const c = {
        gas: frozen ? 0 : abil.nitroOn ? 1 : Math.max(keys.has("w") || keys.has("arrowup") ? 1 : 0, input.current.gas),
        brake: Math.max(keys.has("s") || keys.has("arrowdown") ? 1 : 0, input.current.brake),
        steer: (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0) || input.current.steer,
        hand: keys.has(" ") || input.current.hand,
        lift: (keys.has("r") || keys.has("e") || keys.has("pageup") ? 1 : 0) - (keys.has("f") || keys.has("q") || keys.has("pagedown") ? 1 : 0) || input.current.lift,
        timeScale: abil.scale,
        boost: abil.nitroOn,
      };
      let vF = 0;
      // A hurt engine pulls less; a burnt-out wreck doesn't go at all.
      const power = combat.inMatch || D.flies ? 1 : street.car.power;
      if (power < 1) (c.gas *= power), (c.lift *= power);
      // "Get out" pressed while rolling: on the brakes until the car has stopped (combat opens the door then).
      if (stopForExit) (c.gas = 0), (c.brake = 1), (c.hand = true);
      if (onFoot) {
        // The car waits where it was parked.
      } else if (L.canDrive) {
        if (chute) {
          chute.t += dt;
          vF = stepChute(st, c, dt, chute.t);
          // The helicopter, left behind, sinks to the ground (or a roof) under where you jumped.
          chute.halt = Math.max(collision.floor(chute.hx, chute.hz, chute.halt), chute.halt - 7 * dt);
        } else if (D.flies) vF = stepAir(st, D, c, dt, maxV(), collision.floor(st.x, st.z, st.alt));
        else vF = stepGround(st, D, c, dt, maxV() * Math.max(0.05, power));
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
        let hit = null as { nx: number; nz: number; ref?: object; x: number; z: number } | null;
        const offs = D.flies || D.bike ? [0] : D.probes ?? [1.15, -1.15];
        for (const off of offs)
          for (const world of [collision, obstacles, street.solid]) {
            const r = world.collide(nx + nfx * off, nz + nfz * off, D.radius, st.alt, model.height);
            if (r.hit) {
              nx = r.x - nfx * off;
              nz = r.z - nfz * off;
              // Where on the body it hit (for the dent), and what it was.
              hit = { nx: r.hit.nx, nz: r.hit.nz, ref: r.hit.f.ref, x: r.x - r.hit.nx * D.radius, z: r.z - r.hit.nz * D.radius };
            }
          }
        // Other players' cars are solid too (flyers pass over each other).
        for (const o of others.positions()) {
          if (Math.abs(o.y - st.alt) > 2) continue;
          const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = D.radius + o.radius;
          if (d >= min || d < 1e-3) continue;
          nx = o.x + (dx / d) * min;
          nz = o.z + (dz / d) * min;
          hit = { nx: dx / d, nz: dz / d, x: nx - (dx / d) * D.radius, z: nz - (dz / d) * D.radius };
        }
        if (hit) {
          const into = st.vx * hit.nx + st.vz * hit.nz;
          if (into < 0) {
            st.vx -= into * hit.nx * 1.3;
            st.vz -= into * hit.nz * 1.3;
            st.vx *= 0.7;
            st.vz *= 0.7;
            // Outside matches it's a real crash: dents, damage, the other car shoved (street.ts).
            if (!combat.inMatch && !D.flies && now - st0.bumpAt > 250 && -into > 2) {
              st0.bumpAt = now;
              street.crash({ ref: hit.ref, into: -into, nx: hit.nx, nz: hit.nz, x: hit.x, z: hit.z, heavy: model.height > 2.2 });
            } else if (-into > 6 && now - st0.bumpAt > 400) {
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
      model.group.position.set(chute?.hx ?? parked?.x ?? st.x, chute?.halt ?? parked?.alt ?? st.alt, chute?.hz ?? parked?.z ?? st.z);
      model.group.rotation.y = chute?.hyaw ?? parked?.yaw ?? st.yaw;
      if (chute) {
        chuteM.group.position.set(st.x, st.alt, st.z);
        chuteM.group.rotation.set(0, st.yaw, -st.steer * 0.25);
        chuteM.open(Math.min(1, Math.max(0, (chute.t - CHUTE_OPEN_S) / 0.6)));
        // Down: on foot where you landed, the helicopter parked where it set down.
        if (st.alt <= 0.02 && chute.t > CHUTE_OPEN_S) {
          const h = chute;
          chute = null;
          chuteM.group.visible = false;
          Object.assign(st, { vx: 0, vz: 0, vy: 0, speed: 0, steer: 0, alt: 0 });
          combat.getOut();
          if (parked) Object.assign(parked, { x: h.hx, z: h.hz, yaw: h.hyaw, alt: h.halt });
        }
      }
      const speedK = Math.min(1, st.speed / maxV());
      filmSpeed = speedK;
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
      // Brake lamps blaze (brighter than white: the HDR pipeline blooms them); tail and head lamps glow at night.
      if (c.brake && vF > 0.3) model.brake.color.copy(LAMP.brake).multiplyScalar(3.5);
      else if (night > 0.3) model.brake.color.copy(LAMP.tailNight).multiplyScalar(1.6);
      else model.brake.color.copy(LAMP.tail);
      model.head.color.copy(LAMP.head).multiplyScalar(1 + 2.5 * night);
      const dark = night > 0.3 || rainAmount > 0;
      if (model.beams) model.beams.visible = dark;
      if (model.light) {
        model.light.visible = night > 0.6 || (dark && rainAmount > 0);
        // Ultra: my headlights cast shadows (a lamp post throws its own across the road ahead).
        const cast = prof.headlightShadow && shadows && model.light.visible;
        if (model.light.castShadow !== cast) {
          model.light.castShadow = cast;
          if (cast) model.light.shadow.mapSize.set(1024, 1024), (model.light.shadow.bias = -0.0006), (model.light.shadow.camera.far = 70);
        }
      }
      camera.getWorldDirection(camFwd);
      const lfl = Math.hypot(camFwd.x, camFwd.z) || 1;
      nightLights.update(dt, style === "real" ? night : 0, st, { x: camFwd.x / lfl, z: camFwd.z / lfl }, collectLights, 1 + 1.4 * rainAmount + 0.5 * skyOvercast);
      model.cargo.visible = !!L.me?.activeRun;
      // Road dust builds up on the paint as you drive (filthy after ~40 km); rain washes it off.
      if (model.grime) {
        const g = model.grime.dirt;
        g.value = Math.min(0.85, Math.max(0.06, g.value + (Math.abs(vF) * dt) / 48_000 - dt * rainAmount * 0.006));
      }

      // -- camera (the soldier placed it already when on foot)
      const flying = D.flies && st.alt > 1;
      const fp = !onFoot && camMode === "cockpit";
      model.body.visible = !fp;
      // You're seen at the wheel — unless you got out (the car stays parked, empty).
      if (model.driver) model.driver.visible = !onFoot;
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
        // Under the parachute: behind and a little below the canopy, jumper and canopy both in the frame.
        const dist = chute && camMode !== "top" ? 11 : camMode === "chase" ? (flying ? 15 : 9 + speedK * 4) * (D.cam ?? 1) : camMode === "far" ? 24 : 4;
        const height = chute && camMode !== "top" ? 3.2 : camMode === "chase" ? (flying ? 6 : 3.8 + speedK * 1.2) : camMode === "far" ? 15 : 60;
        const want = camMode === "top" ? new THREE.Vector3(st.x + nfx * 6, st.alt + height, st.z + nfz * 6 + 0.01) : new THREE.Vector3(st.x - nfx * dist, st.alt + height, st.z - nfz * dist);
        camPos.lerp(want, 1 - Math.exp(-rdt * (camMode === "top" ? 6 : 4.5)));
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
        camLook.set(st.x + nfx * 4, st.alt + (chute ? 3.4 : 1.2), st.z + nfz * 4);
        camera.lookAt(camLook);
      }
      // A crash or a blast shakes the camera (on foot, the soldier's camera has its own).
      if (shakeK > 0.01 && !onFoot) {
        const a = shakeK * (fp ? 0.06 : 0.22);
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
        camera.position.z += (Math.random() - 0.5) * a;
      }
      shakeK *= Math.exp(-dt * 7);
      // Opened up on a phone held upright (lib/view.ts), so the next lane is on screen there too.
      const fov = fovFor((fp ? 70 : 62) + speedK * (fp ? 12 : 10), camera.aspect), near = fp ? 0.06 : 0.5;
      if (!onFoot && (Math.abs(camera.fov - fov) > 0.1 || camera.near !== near)) (camera.fov = fov), (camera.near = near), camera.updateProjectionMatrix();
      // -- ears (game/spatial.ts): distance is measured from me, direction from where the camera looks
      camera.getWorldDirection(earFwd);
      earUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      setEars(earAt.set(st.x, onFoot || fp ? camera.position.y : st.alt + 1.4, st.z), earFwd, earUp);

      // -- lights & sky follow the vehicle
      if (now - lastSky > 15_000 || live.current.timeOfDay !== skyPick || live.current.weather !== skyWeather) {
        lastSky = now;
        skyPick = live.current.timeOfDay;
        skyWeather = live.current.weather;
        applySky();
      }
      sky.follow(camera.position, time);
      ground.position.set(Math.round(st.x / 50) * 50, 0, Math.round(st.z / 50) * 50);
      camera.getWorldDirection(camFwd);
      const fl = Math.hypot(camFwd.x, camFwd.z) || 1;
      gfx.aimSun(sun, camera.position.x, camera.position.z, camFwd.x / fl, camFwd.z / fl, sunDir);
      wet += Math.sign(wetTarget - wet) * Math.min(Math.abs(wetTarget - wet), dt / 12);
      WORLD.wet.value = wet;
      WORLD.time.value = time;
      storefronts.update(time, dt, camera);
      cinemaBoards.update(time);
      rain.update(camera.position, time, rainAmount, rainTint);
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
      markers.hidden = cinemaBoards.hidden = storefronts.hidden = matchOn;
      for (const b of beacons.values()) (b.group.visible = !matchOn), b.tick(time, Math.hypot(b.group.position.x - st.x, b.group.position.z - st.z));
      const vasaD = vasaBeacon ? Math.hypot(vasaBeacon.group.position.x - st.x, vasaBeacon.group.position.z - st.z) : 0;
      if (vasaBeacon) (vasaBeacon.group.visible = !matchOn), vasaBeacon.tick(time, vasaD);
      for (const l of loot.values()) if (matchOn) l.group.visible = false;
      for (const l of loot.values()) l.tick(time, Math.hypot(l.group.position.x - st.x, l.group.position.z - st.z));
      for (const g of gates) g.tick(time);
      for (const cn of coins) cn.tick(time);
      others.tick(rdt, serverNow, st.x, st.z);
      feed.update(frame.toLatLng(st.x, st.z));
      traffic.enabled = crowd.enabled = !matchOn;
      // The streets traffic and people use, re-read when tiles came or went: not while a batch of
      // tiles is still arriving (every one would set it off again — the parked rows are the
      // costly part), and never both on the same frame.
      if (now - trafficSync > 1000) {
        const slots = [...tiles.values()];
        if (!slots.some((s) => s.building) || now - trafficSync > 4000) {
          trafficSync = now;
          syncCrowd = true;
          traffic.sync(slots.flatMap((s) => (s.mesh?.real ? [s.mesh] : [])));
        }
      } else if (syncCrowd && now - trafficSync > 250) {
        syncCrowd = false;
        crowd.sync([...tiles.values()].flatMap((s) => (s.mesh?.real ? [s.mesh] : [])));
      }
      // The camera, so no car appears in front of it (traffic joins out of sight).
      camera.getWorldDirection(camFwd);
      const flat = Math.hypot(camFwd.x, camFwd.z);
      obstacles.add("traffic", traffic.tick(dt, st.x, st.z, flat > 0.2 ? { x: camera.position.x, z: camera.position.z, dx: camFwd.x / flat, dz: camFwd.z / flat } : null));
      crowd.tick(dt, st.x, st.z);
      street.tick(dt, { x: st.x, z: st.z, vx: st.vx, vz: st.vz, yaw: st.yaw, onFoot, inCar: !onFoot && L.canDrive && !D.flies, flying: D.flies && st.alt > 0.5, matchOn, carX: parked?.x ?? st.x, carZ: parked?.z ?? st.z, carYaw: parked?.yaw ?? st.yaw, carR: D.radius });
      // Shopkeepers: walking or cruising past an open store, its keeper calls you in (once in two minutes per store).
      if (!matchOn && now - lastShopCall > 1500 && !(D.flies && st.alt > 0.5) && Math.hypot(st.vx, st.vz) < 14) {
        lastShopCall = now;
        const sc = storefronts.nearestOpen(st.x, st.z, onFoot ? 14 : 22, (id) => now - (shopCalled.get(id) ?? -1e9) < 120_000);
        if (sc && street.shopCall(sc.kind, sc.name, sc)) shopCalled.set(sc.id, now);
      }
      scenarios.tick(rdt, time, { x: st.x, z: st.z, vx: st.vx, vz: st.vz, yaw: st.yaw, onFoot, inCar: !onFoot && L.canDrive && !D.flies, carKey: streetCar?.key ?? currentKey(), matchOn, flying: D.flies && st.alt > 0.5 });
      if (now - lightsAt > 500) {
        lightsAt = now;
        const sec = Date.now() / 1000;
        for (const s of tiles.values()) if (s.mesh && s.dist < 400) paintSignals(s.mesh, (ns) => signalPhase(sec, ns));
      }

      // -- nav arrow: the party round, then a chosen destination, then the delivery
      const rg = roundGoal();
      const goalLL = rg?.at ?? scenarios.waypoint() ?? navGoal ?? (L.me?.activeRun ? { lat: L.me.activeRun.targetLat, lng: L.me.activeRun.targetLng } : null);
      if (goalLL) {
        const g = frame.toXZ(goalLL.lat, goalLL.lng);
        const d = Math.hypot(g.x - st.x, g.z - st.z);
        arrow.visible = d > (rg ? CHECKPOINT_M : 25) && !fp;
        wpNav = d > 25 ? { x: g.x, z: g.z, label: rg?.label ?? "" } : null;
        arrow.position.set(st.x, st.alt + model.height + 2 + Math.sin(time * 3) * 0.15, st.z);
        arrow.rotation.y = Math.atan2(-(g.x - st.x), -(g.z - st.z));
        if (!rg && navGoal && d < 30) navGoal = null; // arrived
      } else (arrow.visible = false), (wpNav = null);
      wp.hidden = matchOn;
      wp.begin();
      if (wpNav) wp.add(wpNav.x, st.alt + 6, wpNav.z, "flag", MARKER_COLORS.deliver, wpNav.label);
      if (vasaBeacon && vasaD > 30) wp.add(vasaBeacon.group.position.x, 8, vasaBeacon.group.position.z, "people", VASA_COLOR, vasaLabel);
      for (const b of wpPick) wp.add(b.group.position.x, b.group.position.y + 8, b.group.position.z, b.badgeIcon, b.job.color, b.job.label);
      wp.end();
      wp.frame(camera, el.clientWidth, el.clientHeight, st.x, st.z);

      // -- gearbox (sound and dial): five gears, revs climb and drop at each shift
      const gearStep = maxV() / 5;
      const gearN = vF < -0.3 ? 0 : Math.min(5, 1 + Math.floor(st.speed / gearStep));
      const gearbox = { gear: gearN, rpm: D.flies ? speedK : gearN === 0 ? 0.3 : Math.min(1, (st.speed - (gearN - 1) * gearStep) / gearStep) };

      // -- engine note
      if (engine) {
        const out = audioOut("vehicles");
        if (out) {
          const tt = out.ctx.currentTime;
          const rpm = (0.2 + gearbox.rpm * 0.8 + c.gas * 0.08) * (0.55 + 0.45 * abil.scale); // slow motion drops the pitch
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
        if (labelsDirty || Math.random() < 0.3) (syncLabels(), syncBoards(), syncCorners(), syncShops());
        syncVasa();
        if (menuTab.current === "places") syncPlaces();
        markers.sync(st.x, st.z);
        syncCinemas();
        cinemaBoards.sync(st.x, st.z);
        // More of the city was drawn: items near us may now stand inside a building.
        for (const it of [...beacons.values(), ...loot.values()]) if (it.settledAt !== cityDrawn && Math.hypot(it.raw.x - st.x, it.raw.z - st.z) < 600) settle(it);
        // Signs right next to the camera would fill the screen: hide them up close.
        // The three nearest jobs beyond the sign range get a HUD waypoint (the rest are the city's own beacons).
        wpPick.length = 0;
        for (const b of beacons.values()) {
          const d = Math.hypot(b.group.position.x - st.x, b.group.position.z - st.z);
          if (d < 30) continue;
          wpPick.push(b);
        }
        wpPick.sort((a, b) => Math.hypot(a.group.position.x - st.x, a.group.position.z - st.z) - Math.hypot(b.group.position.x - st.x, b.group.position.z - st.z)).length = Math.min(wpPick.length, lite ? 2 : 3);
        for (const b of beacons.values()) b.sign.visible = Math.hypot(b.group.position.x - st.x, b.group.position.z - st.z) > 30;
        for (const l of loot.values()) {
          if (l.taken || !low) continue;
          if (Math.hypot(l.group.position.x - st.x, l.group.position.z - st.z) < LOOT_PICKUP_M) {
            l.taken = true;
            l.collect();
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

      // -- adaptive quality (graphics/engine.ts): resolution first, then effects on "auto"
      gfx.frame(now);
      fps = gfx.fps;

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
      if (currentKey() !== shownKey) setDrivenKey((shownKey = currentKey()));
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
        // The store you're passing — slowing down (under 30 km/h) or on foot, never in a match.
        let store: Hud["store"] = null;
        if (low && !D.flies && !combat.inMatch && (combat.onFoot || st.speed < 8.3)) {
          camera.getWorldDirection(camFwd);
          const fl = Math.hypot(camFwd.x, camFwd.z) || 1;
          const ns = nearStore([...shops, ...markers.spots()], st.x, st.z, camFwd.x / fl, camFwd.z / fl, lastStore);
          if (ns) {
            const tr = tradeOf(ns.store.cls);
            const ll = frame.toLatLng(ns.store.x, ns.store.z);
            store = { kind: ns.store.id.startsWith("bz:") ? "marker" : "store", id: ns.store.id, emoji: ns.store.emoji ?? tr.emoji, name: ns.store.name, sub: `${t(tr.label)} · ${formatDistance(ns.d)}`, color: tr.bg[0], cls: ns.store.cls, lat: ll.lat, lng: ll.lng };
          }
        }
        lastStore = store?.id ?? null;
        const sig = [
          near?.id, near?.verb, navInfo && `${navInfo.label}|${Math.round(navInfo.dist / 5)}|${Math.round(navInfo.rel / 4)}`, loading, village, camMode, phase, streetName, D.flies, low,
          menuOpen.current ? list.map((j) => `${j.id}:${Math.round(j.dist / 10)}`).join(",") : list.length,
          menuOpen.current ? Math.round(fps) : 0,
          partyNow ? Math.floor(serverNow / 250) : 0,
          store && `${store.id}|${store.sub}`,
        ].join("~");
        if (sig !== hudSig) {
          hudSig = sig;
          setHud({ flying: D.flies, low, near, nav: navInfo, loading, village, cam: camMode, night: phase === "night", street: streetName, store, fps: Math.round(fps), serverNow, jobs: list });
        }
      }

      // -- minimap (~8 Hz): roads around us, heading up
      const mc = mini.current;
      if (mc && now - lastMini > (bigMapRef.current ? 90 : 120)) {
        lastMini = now;
        const g = mc.getContext("2d");
        if (g) {
          const big = bigMapRef.current;
          // Big: four times the area at twice the canvas, lines a touch finer than the small one's.
          const W = mc.width, R = W / 2, range = big ? 520 : 240, scale = R / range, lw = big ? 1.5 : 1;
          g.save();
          g.clearRect(0, 0, W, W);
          g.beginPath();
          if (big) g.roundRect(0, 0, W, W, 28);
          else g.arc(R, R, R - 2, 0, Math.PI * 2);
          g.clip();
          g.fillStyle = phase === "night" ? "rgba(16,20,36,.9)" : style === "real" ? "rgba(232,234,226,.92)" : "rgba(222,244,210,.9)";
          g.fillRect(0, 0, W, W);
          g.translate(R, R);
          g.rotate(st.yaw);
          g.lineCap = "round";
          for (const s of tiles.values()) {
            const m = s.mesh;
            if (!m || s.dist > range + 40) continue;
            m.roads.forEach((line, li) => {
              const k = m.roadKinds[li];
              if (k === "foot" || k === "rail" || !m.roadDrawn[li]) return;
              g.strokeStyle = phase === "night" ? "#7f86b8" : k === "major" ? "#f2b94b" : "#9a9eb4";
              g.lineWidth = (k === "major" ? 4 : 2.6) * lw;
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
                g.lineWidth = (k === "major" ? 4.6 : 3.2) * lw;
                g.beginPath();
                g.moveTo((line[si * 2] - st.x) * scale, (line[si * 2 + 1] - st.z) * scale);
                g.lineTo((line[si * 2 + 2] - st.x) * scale, (line[si * 2 + 3] - st.z) * scale);
                g.stroke();
              });
            });
          }
          // In a match: the arena's edge, so you know where the fight is (and which way back in).
          const mv = combat.getSnapshot().match;
          if (mv && mv.phase !== "lobby" && mv.phase !== "ended") {
            const c = frame.toXZ(mv.center.lat, mv.center.lng);
            g.strokeStyle = "rgba(255,90,90,.9)";
            g.lineWidth = 2.5 * lw;
            g.setLineDash([6 * lw, 5 * lw]);
            g.beginPath();
            g.arc((c.x - st.x) * scale, (c.z - st.z) * scale, mv.radius * scale, 0, Math.PI * 2);
            g.stroke();
            g.setLineDash([]);
          }
          const dot = (x: number, z: number, col: string, r = 4) => {
            g.fillStyle = col;
            g.beginPath();
            g.arc((x - st.x) * scale, (z - st.z) * scale, r * lw, 0, Math.PI * 2);
            g.fill();
          };
          // Shops are small square blips (missions and money are the round ones).
          const blip = (x: number, z: number, col: string, r: number) => {
            const bx = (x - st.x) * scale, bz = (z - st.z) * scale;
            g.fillStyle = "rgba(10,14,20,.75)";
            g.fillRect(bx - r - 1, bz - r - 1, r * 2 + 2, r * 2 + 2);
            g.fillStyle = col;
            g.fillRect(bx - r, bz - r, r * 2, r * 2);
          };
          for (const p of shops) if (Math.abs(p.x - st.x) < range && Math.abs(p.z - st.z) < range) blip(p.x, p.z, p.color, 1.8 * lw);
          for (const m of markers.spots()) blip(m.x, m.z, m.color, 2.6 * lw);
          for (const b of beacons.values()) dot(b.group.position.x, b.group.position.z, b.job.color, 4.5);
          for (const d of scenarios.dots()) dot(d.x, d.z, d.color, 5);
          for (const gt of gates) if (gt.group.visible) dot(gt.group.position.x, gt.group.position.z, "#f0c05a", 4);
          for (const cn of coins) if (cn.mesh.visible) dot(cn.mesh.position.x, cn.mesh.position.z, "#ffcf3a", 3);
          for (const o of [...others.positions(), ...combat.dots()]) {
            g.strokeStyle = "#111";
            g.lineWidth = 1.5;
            dot(o.x, o.z, o.color, 4.5);
            g.stroke();
          }
          // The party's meeting point: on the rim when it's further than the minimap reaches.
          if (vasaBeacon) {
            const v = vasaBeacon.group.position, len = Math.hypot(v.x - st.x, v.z - st.z) * scale, ang = Math.atan2(v.z - st.z, v.x - st.x), r = Math.min(len, R - 8);
            g.fillStyle = VASA_COLOR;
            g.strokeStyle = "#fff";
            g.lineWidth = 2;
            g.beginPath();
            g.arc(Math.cos(ang) * r, Math.sin(ang) * r, 5.5, 0, Math.PI * 2);
            g.fill();
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
          const ma = big ? 2.2 : 1;
          g.moveTo(R, R - 9 * ma);
          g.lineTo(R + 6 * ma, R + 7 * ma);
          g.lineTo(R, R + 3 * ma);
          g.lineTo(R - 6 * ma, R + 7 * ma);
          g.closePath();
          g.fill();
          g.stroke();
        }
      }

      skyline.update(camera, st.x, st.z);
      // -- the film look for this frame (lib/filmLook.ts): more blur and fringing the faster, less behind the wheel
      const film = filmLook({ speedK: filmSpeed, camera: onFoot ? "foot" : camMode, night, overcast: skyOvercast, sunHeight: skyDir.y, toon: style === "toon" });
      const G = gfx.grade;
      // Slow motion: colours drain a little and the edges darken (the grade's base values are set in the slower sky block).
      const fd = focusDepth(abil.scale);
      if (G.saturation !== aSat) bSat = G.saturation;
      if (G.vignette !== aVig) bVig = G.vignette;
      G.saturation = aSat = bSat * (1 - 0.4 * fd);
      G.vignette = aVig = bVig + 0.3 * fd;
      paintAbilities(abilityEl.current, abil, abOn && live.current.canDrive);
      (G.motionBlur = film.motionBlur), (G.rays = film.rays), (G.flare = film.flare), (G.aberration = film.aberration), (G.grain = film.grain), (G.split = film.split);
      // Nothing nearer than the car is smeared: from the chase camera that's the car itself, behind the wheel the dashboard.
      G.sharpNear = onFoot ? 3.5 : camMode === "cockpit" ? 2.4 : Math.hypot(camera.position.x - st.x, camera.position.y - st.alt, camera.position.z - st.z) + 3.2;
      if (camMode !== filmCam || onFoot !== filmFoot) (filmCam = camMode), (filmFoot = onFoot), gfx.cut();
      gfx.render(scene, camera);
      combat.renderOverlay();
    };
    let raf = requestAnimationFrame(tick);
    ensureTiles();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __drive?: unknown }).__drive = { st, frame, scene, camera, tiles, corners, boards, cinemaBoards, storefronts, shops: () => shops, obstacles, renderer, mats, live, input, collision, others, markers, landmarks, combat, feed, traffic, crowd, street, skyline, applyPhase: (p: Phase) => setTimeOfDay(p === "night" ? "night" : p === "day" ? "day" : "sunset"), setWeather, gfx, fps: () => fps, dpr: () => gfx.dpr, pickAt, model: () => model, signs: { makeDirectionSign, makeGantry, makeCornerSign } };

    const onResize = () => {
      gfx.resize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      combat.resize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      disposed = true;
      pad.stop();
      horn(false);
      cancelAnimationFrame(raf);
      net.stop();
      combat.dispose();
      setCombat(null);
      source.dispose();
      vsource.dispose();
      details.dispose();
      offCarModel();
      scenarios.dispose();
      setScenarios(null);
      street.dispose();
      setStreet(null);
      traffic.dispose();
      nightLights.dispose();
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
      vasaBeacon?.dispose();
      for (const l of loot.values()) l.dispose();
      wp.dispose();
      for (const l of labels.values()) l.dispose();
      for (const n of titles.values()) n.dispose();
      for (const b of boards.values()) b.dispose();
      for (const b of corners.values()) b.dispose();
      for (const g of gates) g.dispose();
      for (const cn of coins) cn.dispose();
      others.dispose();
      landmarks.dispose();
      markers.dispose();
      cinemaBoards.dispose();
      storefronts.dispose();
      scene.remove(chuteM.group);
      chuteM.dispose();
      if (nextModel) (nextModel.model.dispose(), nextModel.cockpit.dispose());
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
      rain.dispose();
      skyNoise?.release();
      gfx.dispose();
      api3d.current = null;
    };
  }, [style, names, quality]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Enter does what the prompt chip says (desktop; the menu and inputs keep their own Enter).
  const runRef = useRef(runNear);
  runRef.current = runNear;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || (e.target as HTMLElement | null)?.closest?.("input, textarea, button, [role=dialog]")) return;
      void runRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pickVehicle = (k: VehicleKey) => {
    setVehicle(k);
    store.set(VEHICLE_KEY, k);
    api3d.current?.ownCar();
  };
  const pickPaint = (c: string) => {
    setPaint(c);
    store.set(COLOR_KEY, c);
    api3d.current?.ownCar();
  };
  const pickStyle = (s: Style) => {
    setStyle(s);
    store.set(STYLE_KEY, s);
  };
  // Full screen (the garage's wide view) is the 3D city's: back on the map, the phone is upright again.
  useEffect(() => () => void setFullscreen(false), []);
  const pickQuality = (q: QualityPick) => {
    // Choosing "auto" again forgets what it learned on a bad day (it starts from the hardware).
    if (q === "auto") forgetDemotion();
    setQualityPick(q);
    setQuality(q);
  };
  const pickTime = (p: TimePick) => {
    setTimePick(p);
    setTimeOfDay(p);
  };
  const pickWeather = (w: Weather) => {
    setWeatherPick(w);
    setWeather(w);
  };
  const pickNames = (n: NameMode) => {
    setNames(n);
    store.set(NAMES_KEY, n);
  };
  const goTo = (p: { lat: number; lng: number }, label: string) => {
    api3d.current?.setGoal({ lat: p.lat, lng: p.lng });
    setMenu(null);
    toast({ title: t("🧭 Heading to {place}", { place: label }) });
  };
  // The Places tab (memoised: these stay the same from render to render).
  const onPlaceQuery = useCallback((q: string) => void (placeQuery.current = q), []);
  const placeHere = useCallback(() => api3d.current?.here() ?? null, []);
  const onPlaceOpen = useCallback((p: PlaceRow) => setStoreSheet({ id: p.id, name: p.name, cls: p.cls, cat: p.cat, lat: p.lat, lng: p.lng, emoji: p.emoji, color: p.color ?? "#63b3f2", sub: `${p.sub} · ${formatDistance(p.dist)}` }), []);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const onPlaceGo = useCallback((p: PlaceRow) => goToRef.current(p, p.name), []);
  const onProducts = useCallback(() => setProductsAt(api3d.current?.here() ?? null), []);
  const pickCtl = (m: SteerMode) => {
    setCtl(m);
    store.set(CTL_KEY, m);
  };
  // Stable, so the memoised touch controls never re-render while driving.
  const onHorn = useCallback((on: boolean) => api3d.current?.horn(on), []);
  const onLand = useCallback(() => api3d.current?.land(), []);
  const onFocus = useCallback((on: boolean) => void (input.current.focus = on), []);
  const touchPrefs = useTouchPrefs();
  // The arrow points up; 0° relative bearing is straight ahead.
  const arrowStyle = hud?.nav ? { transform: `rotate(${hud.nav.rel}deg)` } : undefined;
  // What I'm actually driving (a street car I got into, a server-set ride), not just the garage pick:
  // the pad, the key hints and the radio follow it.
  const v = VEHICLES[drivenKey ?? vehicle];
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

  const tabs: { key: MenuTab; icon: IconName; label: string; title?: string; badge?: number }[] = [
    { key: "places", icon: "map", label: t("Map"), title: t("Places") },
    { key: "jobs", icon: "list", label: t("Missions"), title: t("Jobs nearby"), badge: hud?.jobs.length },
    { key: "garage", icon: "garage", label: t("Garage") },
    { key: "play", icon: "people", label: t("Party"), title: t("Play together"), badge: party?.members.length || fight?.lobbies.length || undefined },
    { key: "settings", icon: "sliders", label: t("Settings") },
  ];
  const cam = hud?.cam ?? "chase";

  return (
    <div className={`drive ${canDrive && touch ? "has-pad" : ""} ${onFoot ? "on-foot" : ""} ${fight?.inMatch ? "in-match" : ""} ${touchPrefs.left ? "lefty" : ""}`} role="application" aria-label={t("3D city")}>
      <div className="drive-canvas" ref={mount} />
      <div className="drive-wp" ref={wpRoot} aria-hidden />

      {/* Top: me · the street I'm on · map, instruments and the two buttons */}
      <div className="drive-top">
        <div className="drive-start">
          <Button className="drive-round" onClick={onExit} aria-label={t("Back to the map")} title={t("Back to the map")}>
            <Icon name="back" />
          </Button>
          {me && (
            <button className="drive-me" onClick={onProfile} title={t("Profile")} aria-label={t("Profile")}>
              <span className="drive-me-av">
                {[...me.username][0]?.toUpperCase()}
                <i>{fmtNum(me.level)}</i>
              </span>
              <span className="drive-me-tx">
                <b>{me.username}</b>
                <span><Icon name="coin" size={13} />{fmtNum(me.toman)}</span>
              </span>
            </button>
          )}
        </div>
        <div className="drive-mid">
          {hud?.street && <div className="drive-street" key={banner?.at ?? 0}>{hud.street}</div>}
          {hud?.store?.kind === "store" && hud.store.lat != null && hud.store.lng != null && (
            <StoreChip
              key={hud.store.id}
              s={{ id: hud.store.id, name: hud.store.name, cls: hud.store.cls, lat: hud.store.lat, lng: hud.store.lng, emoji: hud.store.emoji, color: hud.store.color, sub: hud.store.sub }}
              onOpen={() => api3d.current?.openPick({ kind: "store", id: hud.store!.id })}
              onInfo={(id, info) => api3d.current?.storeInfo(id, info)}
              onShow={(id) => api3d.current?.showPanel(id)}
            />
          )}
          {hud?.store && hud.store.kind !== "store" && (
            <button type="button" className="drive-store" key={hud.store.id} style={{ "--trade": hud.store.color } as React.CSSProperties} onClick={() => api3d.current?.openPick({ kind: hud.store!.kind, id: hud.store!.id })}>
              <span className="ic"><Icon name={iconForEmoji(hud.store.emoji)} size={18} /></span>
              <span className="tx">
                <b>{hud.store.name}</b>
                <span>{hud.store.sub}</span>
              </span>
            </button>
          )}
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
        {bigMap && (
          <div className="drive-bigmap" role="dialog" aria-label={t("Map")} onClick={() => setBigMap(false)}>
            <div className="dbm-card" onClick={(e) => e.stopPropagation()}>
              <canvas className="drive-mini big" ref={mini} width={640} height={640} />
              <div className="dbm-bar">
                <button type="button" className="dbm-btn" onClick={onExit}>
                  <Icon name="map" size={18} /> {t("Open the full map")}
                </button>
                <button type="button" className="dbm-btn round" onClick={() => setBigMap(false)} aria-label={t("Close")}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="drive-end">
          {/* The minimap is the way back to the full map: tap it, like opening the map in any open-world game. */}
          {!bigMap && (
            <button type="button" className={`drive-mini-wrap ${hud && hud.loading > 0 ? "loading" : ""}`} onClick={() => setBigMap(true)} aria-label={t("Bigger map")} title={hud && hud.loading > 0 ? t("Loading the city…") : t("Bigger map (M)")}>
              <canvas className="drive-mini" ref={mini} width={256} height={256} />
              <span className="drive-mini-tag" aria-hidden>
                <Icon name="expand" size={12} />
              </span>
            </button>
          )}
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
          {radioOpen && !onFoot && (
            <div className="radio-pop" role="menu" aria-label={t("Car radio")}>
              <div className="radio-pop-head">
                <Icon name="radio" size={18} /> <b>{t("Car radio")}</b>
                <span className="grow" />
                <button type="button" className="radio-x" onClick={() => setRadioOpen(false)} aria-label={t("Close")}>
                  <Icon name="close" size={16} />
                </button>
              </div>
              {(["persian", "world"] as const).map((grp) => (
                <div key={grp} className="radio-grp">
                  <span className="radio-grp-t">{grp === "persian" ? t("Persian") : t("International")}</span>
                  {(radioRef.current?.stations() ?? []).filter((st) => st.group === grp).map((st) => {
                    const on = radio.station?.id === st.id && radio.status !== "off";
                    return (
                      <button key={st.id} type="button" role="menuitemradio" aria-checked={on} className={`radio-row ${on ? "on" : ""}`} onClick={() => radioRef.current?.pick(on ? null : st.id)}>
                        <span className="radio-name">{st.name}</span>
                        <span className="radio-genre">{t(st.genre)}</span>
                        {on && (radio.status === "on" ? <span className="radio-eq" aria-hidden><i /><i /><i /></span> : <span className="radio-genre">{radio.status === "tuning" ? t("Tuning…") : t("No signal")}</span>)}
                      </button>
                    );
                  })}
                </div>
              ))}
              {radio.status !== "off" && (
                <button type="button" className="radio-row off" onClick={() => radioRef.current?.pick(null)}>
                  <Icon name="mute" size={16} /> {t("Turn the radio off")}
                </button>
              )}
              {!(radioRef.current?.stations().length) && <p className="small muted">{t("Finding stations…")}</p>}
            </div>
          )}
          <div className="drive-side" role="toolbar" aria-label={t("Tools")}>
            <Button className="drive-round cam" onClick={() => api3d.current?.cycleCam()} aria-label={t("Camera")} data-tip={t("Camera")}>
              <Icon name="camera" size={22} />
              <small>{onFoot ? (fight?.cam === "fps" ? "1P" : "3P") : CAM_LABEL[cam]}</small>
            </Button>
            {!onFoot && !fight?.inMatch && (
              <Button
                className={`drive-round radio ${radio.status !== "off" ? "on" : ""}`}
                onClick={() => setRadioOpen((o) => !o)}
                aria-expanded={radioOpen}
                aria-label={radio.station ? t("Radio: {name} — tap for the next station", { name: radio.station.name }) : t("Car radio")}
                data-tip={radio.station ? `${radio.station.name} · ${t(radio.station.genre)}` : t("Car radio (N)")}
              >
                <Icon name="radio" size={22} />
                {radio.status === "on" ? <span className="radio-eq" aria-hidden><i /><i /><i /></span> : <small>{radio.status === "off" ? t("Off") : radio.status === "tuning" ? "…" : "!"}</small>}
              </Button>
            )}
            {canDrive && combat && !fight?.inMatch && (onFoot ? (
              <Button className={`drive-round ${fight?.nearCar ? "on" : ""}`} disabled={!fight?.nearCar} onClick={() => combat.getIn()} aria-label={t("Get in the car")} data-tip={fight?.nearCar ? t("Get in the car (F)") : t("No car close by")}>
                <Icon name="car" size={22} />
              </Button>
            ) : (
              <Button className="drive-round" onClick={() => combat.getOut()} aria-label={t("Get out and walk")} data-tip={t("Get out and walk (F)")}>
                <Icon name="walk" size={22} />
              </Button>
            ))}
            <Button className={`drive-round ${menu ? "on" : ""}`} onClick={() => setMenu(menu ? null : "jobs")} aria-label={t("Menu")} data-tip={t("Menu")} aria-expanded={!!menu}>
              <Icon name="menu" size={22} />
              {(hud?.jobs.length ?? 0) > 0 && <span className="badge">{fmtNum(hud?.jobs.length ?? 0)}</span>}
            </Button>
          </div>
        </div>
      </div>

      <a className="drive-credit" href="/credits" target="_blank" rel="noreferrer">© OpenStreetMap · {t("3D cars")}</a>
      {/* Stacked, so two never sit on top of each other. */}
      <div className="drive-notes">
        {!canDrive && <div className={`drive-banner ${gpsNoteSmall ? "small" : ""}`}><Icon name="walk" size={16} />{gpsNoteSmall ? t("Real GPS") : t("Following your real GPS — switch to Play from home to drive anywhere")}</div>}
        {!boot.done && <DriveBoot boot={boot} onSkip={() => (skipBoot.current = true)} onExit={onExit} />}
        {boot.done && hud?.village && hud.loading > 0 && (
          <div className="drive-loading">
            <i className="drive-spinner" aria-hidden />
            {t("Drawing this neighbourhood from the real map…")}
          </div>
        )}
      </div>
      {hud?.flying && !hud.low && hud.near === null && !flyHintOff && (
        <div className="drive-hint small closable">
          <span>{t("Fly low (under {m} m) to pick things up and check in", { m: LAND_ALT_M })}</span>
          <button className="dh-x" onClick={() => (setFlyHintOff(true), store.set(FLY_HINT_KEY, "1"))} aria-label={t("Dismiss")} title={t("Dismiss")}><Icon name="close" size={16} /></button>
        </div>
      )}

      {party && <PartyHud party={party} meId={me?.id ?? ""} serverNow={hud?.serverNow ?? Date.now()} />}
      {countdown > 0 && countdown <= 5 && <div className="drive-countdown" key={countdown}>{fmtNum(countdown)}</div>}

      {menu && (
        <DriveMenu tabs={tabs} active={menu} onTab={setMenu} onClose={() => setMenu(null)}>
        {menu === "jobs" && hud && (
          <div className="drive-tab">
            {hud.jobs.length === 0 && <p className="small muted">{t("No jobs around here yet — drive on, or check back in a few minutes.")}</p>}
            {hud.jobs.map((j) => (
              <button key={j.id} className="drive-job" onClick={() => goTo(j, j.label)}>
                <span className="ic"><Icon name={iconForEmoji(j.emoji)} size={20} /></span>
                <span className="grow">{j.label}</span>
                <span className="small muted">{formatDistance(j.dist)}</span>
              </button>
            ))}
          </div>
        )}
        {menu === "places" && (
          <DrivePlaces rows={places} here={placeHere} onQuery={onPlaceQuery} onOpen={onPlaceOpen} onGo={onPlaceGo} onSelect={onSelect} onMap={onExit} onProducts={onProducts} />
        )}
        {menu === "garage" && (
          <DriveGarage
            embedded
            section="garage"
            level={me?.level ?? 1}
            vehicle={vehicle}
            paint={paint}
            style={style}
            names={names}
            quality={quality}
            autoTier={autoTier()}
            timeOfDay={timeOfDay}
            weather={weather}
            fps={hud?.fps ?? 0}
            locked={live2 ? party?.game ?? null : null}
            ctl={touch && canDrive ? ctl : null}
            onVehicle={pickVehicle}
            onPaint={pickPaint}
            onStyle={pickStyle}
            onNames={pickNames}
            onQuality={pickQuality}
            onTime={pickTime}
            onWeather={pickWeather}
            onCtl={pickCtl}
            onClose={() => setMenu(null)}
          />
        )}
        {menu === "settings" && (
          <DriveGarage
            embedded
            section="settings"
            level={me?.level ?? 1}
            vehicle={vehicle}
            paint={paint}
            style={style}
            names={names}
            quality={quality}
            autoTier={autoTier()}
            timeOfDay={timeOfDay}
            weather={weather}
            fps={hud?.fps ?? 0}
            locked={live2 ? party?.game ?? null : null}
            ctl={touch && canDrive ? ctl : null}
            onVehicle={pickVehicle}
            onPaint={pickPaint}
            onStyle={pickStyle}
            onNames={pickNames}
            onQuality={pickQuality}
            onTime={pickTime}
            onWeather={pickWeather}
            onCtl={pickCtl}
            onClose={() => setMenu(null)}
          />
        )}
        {menu === "play" && (
          <PlayTogether
            party={party}
            meId={me?.id ?? ""}
            canDrive={canDrive}
            sim={!!sim}
            combat={combat}
            course={(g) => api3d.current?.course(g) ?? null}
            onChange={() => api3d.current?.kick()}
            onTeleport={(at) => api3d.current?.teleport(at)}
            onGo={goTo}
            onClose={() => setMenu(null)}
          />
        )}
        </DriveMenu>
      )}

      {productsAt && <ProductSearch at={productsAt} onClose={() => setProductsAt(null)} />}
      {storeSheet && <StoreSheet s={storeSheet} onClose={() => setStoreSheet(null)} onGo={() => (api3d.current?.setGoal({ lat: storeSheet.lat, lng: storeSheet.lng }), toast({ title: t("🧭 Heading to {place}", { place: storeSheet.name }) }), setStoreSheet(null))} />}

      {picked && (
        <div className="drive-pick">
          <span className="ic"><Icon name={iconForEmoji(picked.emoji)} size={26} /></span>
          <div className="grow">
            <b>{picked.title}</b>
            <span className="small muted">{picked.sub}</span>
          </div>
          <Button className="btn small" onClick={() => (api3d.current?.setGoal({ lat: picked.lat, lng: picked.lng }), toast({ title: t("🧭 Heading to {place}", { place: picked.title }) }), setPicked(null))}>{t("Go")}</Button>
          {picked.sel && <Button className="btn small yellow" onClick={() => onSelect(picked.sel!)}>{t("Open")}</Button>}
          <button className="close" onClick={() => setPicked(null)} aria-label={t("Close")}><Icon name="close" size={18} /></button>
        </div>
      )}

      {/* The job you're standing at: a button to do it, and ✕ to wave it away */}
      {hud?.near && (
        <div key={hud.near.id} className={`drive-action ${busy ? "busy" : ""}`} style={{ "--job": hud.near.color } as React.CSSProperties}>
          <button className="da-main" disabled={busy} onClick={runNear} aria-busy={busy || undefined}>
            <span className="da-key" aria-hidden>{busy ? <i className="drive-spinner" /> : touch ? <Icon name="touch" size={20} /> : <kbd>Enter</kbd>}</span>
            <span className="da-tx">
              <b>{busy ? t("Working…") : hud.near.verb}</b>
              <span>{hud.near.where}</span>
            </span>
          </button>
          <button className="da-x" onClick={() => dismiss(hud.near!.id)} aria-label={t("Dismiss")} title={t("Dismiss")} disabled={busy}><Icon name="close" size={18} /></button>
        </div>
      )}

      {street && !fight?.inMatch && <StreetHud street={street} />}
      {canDrive && !fight?.inMatch && <AbilityHud el={abilityEl} />}
      {scenarios && !fight?.inMatch && <ScenarioHud scenarios={scenarios} />}
      {combat && <CombatHud combat={combat} touch={touch} />}
      {canDrive && touch && combat && onFoot && <CombatPad input={combat.input} sens={combat.lookScale} onReload={() => combat.reload()} onSwap={() => combat.swap()} onJump={combat.jump} onCar={() => combat.getIn()} onFocus={onFocus} nearCar={!!fight?.nearCar} inMatch={inMatch} />}
      {canDrive && touch && !onFoot && <DrivePad input={input} kind={v.flies ? "air" : v.bike ? "moto" : "car"} mode={ctl} onHorn={onHorn} onLand={onLand} />}
      {canDrive && !touch && onFoot && footKeys && (
        <div className="drive-keys small">{t("Click to aim with the mouse · WASD move · Shift sprint · Space jump · C crouch · R reload · Q switch gun · V view · Z dead-eye · Tab scores · F car")}</div>
      )}
      {canDrive && !touch && showKeys && !onFoot && (
        <div className="drive-keys small">
          {v.flies ? t("W/↑ forward · S/↓ back · A D/← → turn · R/E climb · F/Q descend · L land · H horn · C camera") : t("W/↑ gas · S/↓ brake · A D/← → steer · Space drift · Z focus · Shift nitro · H horn · C camera")}
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
