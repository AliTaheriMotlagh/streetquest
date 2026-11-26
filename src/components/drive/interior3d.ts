"use client";
// Inside a store, in 3D: the room laid out by lib/interior.ts for the store's trade, built here from plain shapes —
// floor, tiled walls, the counter with the keeper (one of the street's real people models) behind it, the shelves,
// fridges, glass cases, tables, racks, a bakery's glowing tanoor — and on them the store's own things (its real menu
// or catalogue), each with a little price tag; the rest of every shelf stocked with plain goods. Food places get a lit
// menu board over the counter. You look round by dragging, walk with WASD / arrows or by tapping the floor, tap a
// thing to look at it (the HUD shows it and offers to put it in the basket), tap the keeper to talk, walk out of the
// door (or tap it) to leave. One scene with its own camera: Drive draws it instead of the city while you're in here.
// Cheap: ~150 draw calls for a full supermarket, no shadows, a few point lights, one room environment map (not on lite).
import { floorGrid, keeperSpot, startSpot, step as scanStep, type FloorGrid } from "@/lib/scanFloor";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { atDoor, footprint, hashText, layoutRoom, standFor, walk, wrap, yawTo, type Fixture, type Room, type RoomItem, type Shape, type Slot } from "@/lib/interior";
import type { StoreKind } from "@/lib/storeKinds";
import { loadPeople, PersonModel, TINT_COUNT } from "./peopleModels";
import { disposeModel, loadModel } from "./gltf";
import { ProductKit } from "./product3d";
import { classify, KINDS, isKind, type ProductKind } from "@/lib/product3d/kinds";
import { productKey } from "@/lib/product3d/pipeline";

const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, -apple-system, "Segoe UI", sans-serif`;
const EYE = 1.62;
const WALK_SPEED = 2.2;
/** Most price tags drawn (one atlas); the lite tier fewer. */
const TAGS_MAX = 128, TAGS_LITE = 48;

export type InteriorItem = RoomItem & { id: string; price: number; priceNow: number; about?: string; /** Its photo (the menu's thumbnail): mapped onto its 3D product. */ photo?: string };

/** How much room a thing has on each kind of fixture (m: width, height, depth) — products are fitted into it. */
const ROOM_ON: Partial<Record<string, [number, number, number]>> = {
  shelf: [0.32, 0.36, 0.3], gondola: [0.32, 0.36, 0.28], fridge: [0.2, 0.34, 0.3], case: [0.3, 0.2, 0.3], counter: [0.32, 0.36, 0.34],
  table: [0.34, 0.4, 0.34], island: [0.34, 0.42, 0.34], crates: [0.3, 0.22, 0.3], breadRack: [0.6, 0.12, 0.3], panel: [0.12, 0.2, 0.05],
};
export type InteriorSpec = {
  id: string;
  kind: StoreKind;
  name: string;
  /** The store's colour (its sign). */
  color: string;
  items: InteriorItem[];
  /** The owner's 3D scan of the store (a .glb) and its quarter turns. */
  scan?: { url: string; turn: number } | null;
  /** A thing's price in the player's words ("۱۲۰٬۰۰۰ تومان", "40 🪙"). */
  price: (it: InteriorItem) => string;
  lite: boolean;
};
export type InteriorHit = { kind: "item"; id: string } | { kind: "keeper" } | { kind: "door" } | { kind: "board" } | null;

const rtl = (s: string) => /[֐-ࣿ]/.test(s);

/** A canvas texture. */
function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Text cut down to fit `max` px at the current font. */
function fit(g: CanvasRenderingContext2D, s: string, max: number) {
  if (g.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (g.measureText(s.slice(0, m) + "…").width <= max) lo = m;
    else hi = m - 1;
  }
  return s.slice(0, lo) + "…";
}

function floorTex(kind: Room["floor"], color: string) {
  return canvasTex(512, 512, (g) => {
    const base = new THREE.Color(color);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, 512, 512);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    if (kind === "wood") {
      for (let y = 0; y < 512; y += 32) {
        const off = r() * 512;
        for (let x = -off; x < 512; x += 256) {
          const c = base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08);
          g.fillStyle = `#${c.getHexString()}`;
          g.fillRect(x, y, 254, 30);
        }
      }
    } else {
      const n = kind === "stone" ? 4 : 8, sz = 512 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const c = base.clone().offsetHSL(0, 0, (kind === "tiles" ? ((i + j) & 1 ? 0.12 : 0) : 0) + (r() - 0.5) * 0.05);
          g.fillStyle = `#${c.getHexString()}`;
          g.fillRect(i * sz + 2, j * sz + 2, sz - 4, sz - 4);
        }
    }
  }, true);
}

/** Iranian shop walls: a tiled dado (blue-and-white for food, plain white elsewhere) under painted plaster. */
function wallTex(kind: StoreKind, color: string) {
  const food = kind === "restaurant" || kind === "bakery" || kind === "cafe" || kind === "fastfood" || kind === "sweets";
  return canvasTex(256, 512, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 512);
    // The dado: the bottom 35 %.
    const y0 = 512 * 0.65;
    g.fillStyle = food ? "#e9eef5" : "#f1f1ee";
    g.fillRect(0, y0, 256, 512 - y0);
    g.strokeStyle = food ? "#2f5d9e" : "#c9c9c4";
    g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32)
      for (let y = y0; y < 512; y += 32) {
        g.strokeRect(x + 1, y + 1, 30, 30);
        if (food) {
          g.beginPath();
          g.arc(x + 16, y + 16, 7, 0, Math.PI * 2);
          g.stroke();
        }
      }
    g.fillStyle = food ? "#2f5d9e" : "#9a9a94";
    g.fillRect(0, y0 - 6, 256, 6);
  }, true);
}

/** Every vertex of a loaded model, in world space (x, y, z triples) — at most ~200k, evenly skipped beyond that. */
function scanPoints(g: THREE.Object3D): Float32Array {
  const meshes: THREE.Mesh[] = [];
  let total = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry?.attributes.position) (meshes.push(m), (total += m.geometry.attributes.position.count));
  });
  const every = Math.max(1, Math.ceil(total / 200_000));
  const out = new Float32Array(Math.ceil(total / every) * 3 + 3);
  const v = new THREE.Vector3();
  let n = 0;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += every) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      out[n++] = v.x, out[n++] = v.y, out[n++] = v.z;
    }
  }
  return out.subarray(0, n);
}

export class Interior {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(64, 1, 0.05, 80);
  readonly room: Room;
  /** The generated room (hidden once the store's own scan is in). */
  private root = new THREE.Group();
  /** The store's scan: its model, and the floor area you can walk on. */
  private scan: THREE.Group | null = null;
  private scanBox: { x0: number; x1: number; z0: number; z1: number; floor: number } | null = null;
  /** The scan's walkable floor (lib/scanFloor.ts): its shelves and walls block. */
  private scanFloor: FloorGrid | null = null;
  /** The keeper and their stand live here (not in `root`), so they stay when the scan replaces the room. */
  private keeperRoot = new THREE.Group();
  /** Walked out of the door. */
  onLeave: (() => void) | null = null;
  private x: number;
  private z: number;
  private yaw: number;
  private pitch = -0.12;
  /** Walking somewhere (a tapped floor spot, or to look at a thing), and the way to face there. */
  private goal: { x: number; z: number; yaw?: number } | null = null;
  private keys = new Set<string>();
  private pickables: THREE.Object3D[] = [];
  private itemObj = new Map<number, THREE.Object3D>();
  private selected: THREE.Object3D | null = null;
  private keeper: PersonModel | null = null;
  private keeperAt = new THREE.Vector3();
  private trash: { dispose(): void }[] = [];
  /** Store products in 3D (product3d.ts): templates with the real photos, reconstructed models when live. */
  private kit: ProductKit;
  /** Each listed slot's product object, to swap when the server knows better (a live model, the LLM's kind). */
  private productAt = new Map<Slot, THREE.Object3D>();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private geo: Record<string, THREE.BufferGeometry> = {};
  private env: THREE.WebGLRenderTarget | null = null;
  private ray = new THREE.Raycaster();
  private t = 0;
  private disposed = false;
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
    const k = e.key.toLowerCase();
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) return;
    if (e.type === "keydown") (this.keys.add(k), (this.goal = null));
    else this.keys.delete(k);
  };
  private onBlur = () => this.keys.clear();

  constructor(readonly spec: InteriorSpec, renderer: THREE.WebGLRenderer) {
    this.room = layoutRoom(spec.kind, spec.items, hashText(spec.id));
    this.kit = new ProductKit(spec.lite);
    this.x = this.room.spawn.x;
    this.z = this.room.spawn.z;
    this.yaw = this.room.spawn.yaw;
    const S = this.scene;
    S.background = new THREE.Color(this.room.wall).multiplyScalar(0.25);
    if (!spec.lite) {
      const pm = new THREE.PMREMGenerator(renderer);
      const re = new RoomEnvironment();
      this.env = pm.fromScene(re, 0.04);
      S.environment = this.env.texture;
      S.environmentIntensity = 0.45;
      re.dispose();
      pm.dispose();
    }
    S.add(this.root);
    this.buildGeometries();
    this.buildShell();
    for (const f of this.room.fixtures) this.buildFixture(f);
    this.buildGoods();
    this.buildLights();
    this.buildKeeper();
    if (spec.scan) this.loadScan(spec.scan.url, spec.scan.turn);
    this.lookupProducts();
    addEventListener("keydown", this.onKey);
    addEventListener("keyup", this.onKey);
    addEventListener("blur", this.onBlur);
  }

  /**
   * The owner's own scan of the store (a phone scan, optimised at upload — components/game/scan.ts): stood on the
   * floor, turned as the owner set it, centred; you start at its street side looking in. It replaces the generated
   * room once it's here (the generated one shows meanwhile, and stays if the scan can't be loaded).
   */
  private loadScan(url: string, turn: number) {
    loadModel(url)
      .then((g) => {
        if (this.disposed) return disposeModel(g);
        g.rotation.y = (turn * Math.PI) / 2;
        g.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(g);
        const c = b.getCenter(new THREE.Vector3());
        g.position.set(-c.x, -b.min.y, -c.z);
        // Scans come with their own light baked into the colours: shown unlit-looking (rough, no metal).
        g.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && "roughness" in m) (m.roughness = Math.max(m.roughness, 0.8)), (m.metalness = 0);
        });
        const sx = (b.max.x - b.min.x) / 2, sz = (b.max.z - b.min.z) / 2;
        this.scanBox = { x0: -sx + 0.3, x1: sx - 0.3, z0: -sz + 0.3, z1: sz - 0.3, floor: 0 };
        this.scene.add(g);
        g.updateMatrixWorld(true);
        this.scanFloor = floorGrid(scanPoints(g), { x0: -sx, x1: sx, z0: -sz, z1: sz });
        this.scan = g;
        this.root.visible = false;
        this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8070", 1.6));
        const start = startSpot(this.scanFloor);
        this.x = start?.x ?? 0;
        this.z = start?.z ?? Math.max(this.scanBox.z0, this.scanBox.z1 - 0.8);
        this.yaw = 0;
        this.goal = null;
        this.pickables.push(g);
        // The keeper moves to the back of the scanned room, facing the door.
        const kp = keeperSpot(this.scanFloor);
        if (kp) {
          this.keeperRoot.position.set(kp.x - this.keeperAt.x, 0, kp.z - this.keeperAt.z);
          this.keeperAt.set(kp.x, 0, kp.z);
        } else this.keeperRoot.visible = false;
      })
      .catch(() => {});
  }

  /** Is the owner's scan showing (else the generated room)? */
  get scanned() {
    return !!this.scan;
  }

  // ---------------------------------------------------------------- building

  private mat(color: string | number, o: { rough?: number; metal?: number; emissive?: string | number; ei?: number; opacity?: number; map?: THREE.Texture } = {}) {
    const key = `${color}|${o.rough ?? 0.7}|${o.metal ?? 0}|${o.emissive ?? ""}|${o.ei ?? 0}|${o.opacity ?? 1}|${o.map?.uuid ?? ""}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, map: o.map ?? null });
      if (o.emissive != null) (m.emissive = new THREE.Color(o.emissive)), (m.emissiveIntensity = o.ei ?? 1);
      if (o.opacity != null && o.opacity < 1) (m.transparent = true), (m.opacity = o.opacity), (m.depthWrite = false);
      this.mats.set(key, m);
    }
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** A box of w × h × d standing with its bottom at y. */
  private box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
    const m = this.mesh(this.geo.box, mat, x, y + h / 2, z, parent);
    m.scale.set(w, h, d);
    return m;
  }

  private buildGeometries() {
    const g = this.geo;
    g.box = new THREE.BoxGeometry(1, 1, 1);
    g.plane = new THREE.PlaneGeometry(1, 1);
    g.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    g.sphere = new THREE.SphereGeometry(0.5, 16, 12);
    g.loaf = new THREE.SphereGeometry(0.5, 14, 10);
    g.loaf.scale(0.3, 0.09, 0.13);
    g.loaf.translate(0, 0.045, 0);
    const cake = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24);
    cake.translate(0, 0.04, 0);
    const top = new THREE.SphereGeometry(0.02, 8, 6);
    top.translate(0, 0.095, 0);
    g.cake = mergeGeometries([cake, top])!;
    const balls: THREE.BufferGeometry[] = [];
    for (const [x, y, z] of [[-0.06, 0.05, -0.04], [0.06, 0.05, -0.04], [0, 0.05, 0.05], [-0.07, 0.05, 0.06], [0.07, 0.05, 0.06], [0, 0.11, 0], [-0.03, 0.1, 0.04]]) {
      const b = new THREE.SphereGeometry(0.048, 10, 8);
      b.translate(x, y, z);
      balls.push(b);
    }
    g.fruit = mergeGeometries(balls)!;
    g.pack = new THREE.BoxGeometry(0.15, 0.22, 0.08);
    g.pack.translate(0, 0.11, 0);
    g.pill = new THREE.BoxGeometry(0.12, 0.07, 0.05);
    g.pill.translate(0, 0.035, 0);
    const prof = [[0, 0], [0.034, 0], [0.036, 0.02], [0.036, 0.15], [0.03, 0.18], [0.014, 0.21], [0.014, 0.25], [0, 0.25]].map(([x, y]) => new THREE.Vector2(x, y));
    g.bottle = new THREE.LatheGeometry(prof, 14);
    g.can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16);
    g.can.translate(0, 0.06, 0);
    g.plate = new THREE.CylinderGeometry(0.15, 0.12, 0.02, 24);
    g.plate.translate(0, 0.01, 0);
    g.food = new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.food.scale(1, 0.55, 1);
    g.food.translate(0, 0.02, 0);
    g.cup = new THREE.CylinderGeometry(0.045, 0.035, 0.1, 16);
    g.cup.translate(0, 0.05, 0);
    g.phone = new THREE.BoxGeometry(0.08, 0.16, 0.01);
    g.phone.translate(0, 0.08, 0);
    g.screen = new THREE.PlaneGeometry(0.07, 0.145);
    g.screen.translate(0, 0.08, 0.0055);
    g.folded = new THREE.BoxGeometry(0.3, 0.07, 0.24);
    g.folded.translate(0, 0.035, 0);
    g.shirt = new THREE.BoxGeometry(0.04, 0.62, 0.44);
    g.shirt.translate(0, -0.33, 0);
    g.meat = new THREE.SphereGeometry(0.5, 12, 10);
    g.meat.scale(0.2, 0.34, 0.14);
    g.meat.translate(0, -0.2, 0);
    g.slab = new THREE.BoxGeometry(0.22, 0.045, 0.14);
    g.slab.translate(0, 0.0225, 0);
    this.trash.push(...Object.values(g));
  }

  /** Floor, walls, ceiling, the street wall with its door and windows. */
  private buildShell() {
    const { w, d, h, kind } = this.room;
    const ft = floorTex(this.room.floor, this.room.floorColor);
    ft.repeat.set(w / 2.5, d / 2.5);
    const floor = this.mesh(this.geo.plane, this.mat("#ffffff", { rough: this.room.floor === "dark" ? 0.25 : 0.55, map: ft }), 0, 0, d / 2);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(w, d, 1);
    floor.userData.floor = true;
    this.pickables.push(floor);
    const wt = wallTex(kind, this.room.wall);
    const wallMat = (len: number) => {
      const t = wt.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 1.4, 1);
      this.trash.push(t);
      return this.mat("#ffffff", { rough: 0.85, map: t });
    };
    const wall = (len: number, x: number, z: number, ry: number) => {
      const m = this.mesh(this.geo.plane, wallMat(len), x, h / 2, z);
      m.scale.set(len, h, 1);
      m.rotation.y = ry;
    };
    wall(w, 0, 0, 0); // back
    wall(d, -w / 2, d / 2, Math.PI / 2);
    wall(d, w / 2, d / 2, -Math.PI / 2);
    const ceil = this.mesh(this.geo.plane, this.mat("#f3f1ec", { rough: 0.95 }), 0, h, d / 2);
    ceil.rotation.x = Math.PI / 2;
    ceil.scale.set(w, d, 1);
    // The street wall: a shop front of glass, the door in the middle — bright daylight (or the street's glow) outside.
    const front = new THREE.Group();
    front.position.set(0, 0, d);
    front.rotation.y = Math.PI;
    this.root.add(front);
    const night = new Date().getHours() >= 19 || new Date().getHours() < 6;
    const outside = canvasTex(256, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      if (night) gr.addColorStop(0, "#0b1426"), gr.addColorStop(0.7, "#24314a"), gr.addColorStop(1, "#4a4036");
      else gr.addColorStop(0, "#cfe6ff"), gr.addColorStop(0.6, "#eef4f8"), gr.addColorStop(1, "#9a9a92");
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      // Passing shapes: the street outside, blurred by the glass.
      g.fillStyle = night ? "rgba(255,200,120,0.35)" : "rgba(60,70,80,0.25)";
      for (let i = 0; i < 6; i++) g.fillRect(20 + i * 40, 150 + (i % 2) * 20, 26, 90);
    });
    this.trash.push(outside);
    const glassOut = new THREE.MeshBasicMaterial({ map: outside });
    this.trash.push(glassOut);
    const frame = this.mat("#2b2d31", { rough: 0.4, metal: 0.6 });
    const pane = (x: number, width: number, y0: number, y1: number) => {
      const m = this.mesh(this.geo.plane, glassOut, x, (y0 + y1) / 2, 0.01, front);
      m.scale.set(width, y1 - y0, 1);
      return m;
    };
    const dw = this.room.door.w, side = (w - dw) / 2;
    // Windows either side over a low wall; the door's glass to the floor.
    for (const sgn of [-1, 1]) {
      const cx = sgn * (dw / 2 + side / 2);
      pane(cx, side - 0.2, 0.7, h - 0.5);
      this.box(front, side, 0.7, 0.12, cx, 0, 0, this.mat(this.room.wall, { rough: 0.8 }));
      this.box(front, side, 0.5, 0.12, cx, h - 0.5, 0, this.mat(this.room.wall, { rough: 0.8 }));
      for (const fx of [cx - side / 2 + 0.05, cx + side / 2 - 0.05]) this.box(front, 0.08, h - 1.2, 0.1, fx, 0.7, 0, frame);
    }
    const door = pane(0, dw - 0.1, 0, 2.2);
    door.userData.door = true;
    this.pickables.push(door);
    this.box(front, dw, h - 2.2, 0.12, 0, 2.2, 0, this.mat(this.room.wall, { rough: 0.8 }));
    for (const sx of [-dw / 2, dw / 2]) this.box(front, 0.08, 2.2, 0.12, sx, 0, 0, frame);
    this.box(front, 0.04, 0.4, 0.04, dw / 2 - 0.2, 0.9, -0.08, this.mat("#c9ccd1", { rough: 0.2, metal: 1 })); // handle
    // The store's name on the back wall (high up, in its colour) when no menu board hides the wall.
    if (!this.room.fixtures.some((f) => f.type === "board")) {
      const fa = rtl(this.spec.name);
      const tex = canvasTex(1024, 160, (g) => {
        g.fillStyle = this.spec.color;
        g.fillRect(0, 0, 1024, 160);
        g.fillStyle = "#fff";
        g.font = `900 92px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.direction = fa ? "rtl" : "ltr";
        g.fillText(fit(g, this.spec.name, 960), 512, 86);
      });
      this.trash.push(tex);
      const m = this.mesh(this.geo.plane, this.mat("#ffffff", { map: tex, emissive: "#ffffff", ei: 0.35, rough: 0.5 }), 0, h - 0.35, 0.02);
      m.material = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.5, roughness: 0.5 });
      this.trash.push(m.material as THREE.Material);
      m.scale.set(Math.min(w - 1, 4.2), Math.min(w - 1, 4.2) * (160 / 1024), 1);
    }
  }

  private buildFixture(f: Fixture) {
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.rot;
    this.root.add(g);
    const wood = this.mat("#7a5233", { rough: 0.65 });
    const lightWood = this.mat("#b88a5a", { rough: 0.6 });
    const white = this.mat("#eceae4", { rough: 0.5 });
    const steel = this.mat("#b9bec4", { rough: 0.3, metal: 0.85 });
    const dark = this.mat("#25262a", { rough: 0.5 });
    const glass = this.mat("#cfe8f0", { rough: 0.05, metal: 0, opacity: 0.18 });
    const { w, d, h } = f;
    switch (f.type) {
      case "counter": {
        this.box(g, w, h - 0.05, d, 0, 0, 0, this.mat(this.spec.color, { rough: 0.55 }));
        this.box(g, w + 0.08, 0.05, d + 0.06, 0, h - 0.05, 0, this.mat("#d8d2c4", { rough: 0.25, metal: 0.1 }));
        // The till: a box with a lit screen.
        this.box(g, 0.34, 0.12, 0.3, -w / 2 + 0.5, h, -0.1, dark);
        const sc = this.mesh(this.geo.plane, this.mat("#000", { emissive: "#7fd6ff", ei: 0.9 }), -w / 2 + 0.5, h + 0.28, -0.12, g);
        sc.scale.set(0.28, 0.18, 1);
        sc.rotation.x = -0.25;
        this.box(g, 0.04, 0.16, 0.04, -w / 2 + 0.5, h + 0.12, -0.14, dark);
        break;
      }
      case "case": {
        this.box(g, w, 0.55, d, 0, 0, 0, this.spec.kind === "tech" ? dark : this.mat(this.spec.color, { rough: 0.5 }));
        this.box(g, w, 0.02, d, 0, 0.55, 0, white);
        this.box(g, w, 0.5, d, 0, 0.57, 0, glass);
        this.box(g, w - 0.06, 0.02, d - 0.1, 0, 0.83, 0, glass);
        // A lit strip inside the glass, along the top.
        this.box(g, w - 0.1, 0.015, 0.03, 0, 1.04, -d / 2 + 0.06, this.mat("#fff", { emissive: "#fff6e0", ei: 2 }));
        this.box(g, w + 0.04, 0.03, d + 0.04, 0, 1.06, 0, steel);
        break;
      }
      case "shelf":
      case "gondola": {
        const both = f.type === "gondola";
        const m = this.spec.kind === "bakery" || this.spec.kind === "fashion" ? lightWood : white;
        this.box(g, w, h, 0.04, 0, 0, both ? 0 : -d / 2 + 0.02, m);
        for (const sx of [-w / 2, w / 2]) this.box(g, 0.04, h, d, sx, 0, 0, m);
        const levels = both ? [0.08, 0.36, 0.78, 1.2] : [0.08, 0.4, 0.84, 1.28, 1.72];
        for (const y of levels) this.box(g, w, 0.025, d, 0, y, 0, m);
        if (!both) this.box(g, w, 0.03, d, 0, h - 0.03, 0, m);
        break;
      }
      case "fridge": {
        this.box(g, w, h, d, 0, 0, 0, this.mat("#dfe3e6", { rough: 0.4, metal: 0.3 }));
        this.box(g, w - 0.08, h - 0.4, 0.02, 0, 0.2, d / 2 - 0.15, this.mat("#ffffff", { emissive: "#e6f6ff", ei: 0.35 }));
        for (const y of [0.48, 0.93, 1.38, 1.8]) this.box(g, w - 0.1, 0.015, d - 0.25, 0, y, 0.05, glass);
        // Its front: glass doors, bright inside.
        this.box(g, w - 0.04, h - 0.32, 0.02, 0, 0.16, d / 2 + 0.01, this.mat("#d8f0ff", { rough: 0.05, opacity: 0.12 }));
        for (let i = 1; i < Math.round(w / 0.6); i++) this.box(g, 0.03, h - 0.32, 0.03, -w / 2 + (i * w) / Math.round(w / 0.6), 0.16, d / 2 + 0.02, steel);
        // The header: a drinks brand's red, or blue.
        this.box(g, w, 0.16, d / 2, 0, h - 0.16, d / 4, this.mat(hashText(this.spec.id) & 1 ? "#d62828" : "#1d4ed8", { emissive: hashText(this.spec.id) & 1 ? "#ff3b3b" : "#3b82f6", ei: 0.6 }));
        break;
      }
      case "table": {
        const round = this.spec.kind === "cafe";
        const top = round ? this.mesh(this.geo.cyl, lightWood, 0, h - 0.02, 0, g) : this.box(g, w, 0.04, d, 0, h - 0.04, 0, this.mat("#efe8dc", { rough: 0.4 }));
        if (round) top.scale.set(w, 0.04, d);
        const leg = this.mesh(this.geo.cyl, steel, 0, (h - 0.04) / 2, 0, g);
        leg.scale.set(0.06, h - 0.04, 0.06);
        const chairs: [number, number, number][] = round
          ? [[0, -d / 2 - 0.3, 0], [0, d / 2 + 0.3, Math.PI]]
          : [[-w / 4, -d / 2 - 0.3, 0], [w / 4, -d / 2 - 0.3, 0], [-w / 4, d / 2 + 0.3, Math.PI], [w / 4, d / 2 + 0.3, Math.PI]];
        for (const [cx, cz, cr] of chairs) {
          const c = new THREE.Group();
          c.position.set(cx, 0, cz);
          c.rotation.y = cr;
          g.add(c);
          this.box(c, 0.42, 0.04, 0.42, 0, 0.44, 0, round ? wood : this.mat(this.spec.color, { rough: 0.6 }));
          this.box(c, 0.42, 0.45, 0.04, 0, 0.48, -0.2, round ? wood : this.mat(this.spec.color, { rough: 0.6 }));
          for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) this.box(c, 0.03, 0.44, 0.03, lx, 0, lz, steel);
        }
        // A napkin box and salt on every table; a vase on a café's.
        this.box(g, 0.1, 0.08, 0.06, 0.15, h, 0, white);
        break;
      }
      case "breadRack": {
        for (const sx of [-w / 2, w / 2]) this.box(g, 0.05, h, d, sx, 0, 0, wood);
        for (const y of [0.45, 0.9, 1.35]) {
          const b = this.box(g, w, 0.03, d, 0, y, 0, wood);
          b.rotation.x = 0.25;
        }
        break;
      }
      case "oven": {
        // A sangak tanoor: a dark arched mouth in a tiled wall, glowing deep inside.
        this.box(g, w + 0.6, h + 0.4, 0.08, 0, 0, 0, this.mat("#d9c7a6", { rough: 0.9 }));
        const mouth = this.mesh(this.geo.cyl, this.mat("#1a0d06", { emissive: "#ff6a1a", ei: 1.4 }), 0, 0.9, 0.05, g);
        mouth.rotation.x = Math.PI / 2;
        mouth.scale.set(w * 0.8, 0.04, 1.1);
        const glow = new THREE.PointLight("#ff7a2a", 1.6, 4, 2);
        glow.position.set(0, 0.9, 0.5);
        g.add(glow);
        break;
      }
      case "crates": {
        this.box(g, w, 0.5, d, 0, 0, 0, wood);
        const n = Math.max(1, Math.floor(w / 0.5));
        for (let i = 0; i < n; i++)
          for (const [y, z] of [[0.5, 0.1], [0.82, -0.2]] as const) {
            const c = this.box(g, 0.46, 0.14, 0.38, -w / 2 + 0.25 + i * (w / n), y, z, lightWood);
            c.rotation.x = 0.3;
          }
        break;
      }
      case "hooks": {
        const bar = this.mesh(this.geo.cyl, steel, 0, 1.95, 0, g);
        bar.rotation.z = Math.PI / 2;
        bar.scale.set(0.03, w, 0.03);
        this.box(g, w + 0.4, 2.2, 0.04, 0, 0, -0.15, white);
        break;
      }
      case "rail": {
        for (const sx of [-w / 2, w / 2]) this.box(g, 0.03, 1.5, 0.03, sx, 0, 0, steel);
        const bar = this.mesh(this.geo.cyl, steel, 0, 1.5, 0, g);
        bar.rotation.z = Math.PI / 2;
        bar.scale.set(0.025, w, 0.025);
        for (const sx of [-w / 2, w / 2]) this.box(g, 0.05, 0.03, 0.5, sx, 0, 0, steel);
        break;
      }
      case "panel": {
        this.box(g, w, h, d, 0, 0, 0, dark);
        const lit = this.mesh(this.geo.plane, this.mat("#000", { emissive: this.spec.kind === "tech" ? "#2a6df4" : this.spec.color, ei: 0.5 }), 0, h / 2 + 0.3, d / 2 + 0.005, g);
        lit.scale.set(w - 0.1, h - 0.8, 1);
        break;
      }
      case "island": {
        this.box(g, w, h, d, 0, 0, 0, this.spec.kind === "tech" ? dark : lightWood);
        this.box(g, w + 0.04, 0.03, d + 0.04, 0, h, 0, this.spec.kind === "tech" ? this.mat("#f5f5f5", { rough: 0.2 }) : wood);
        break;
      }
      case "mirror": {
        this.box(g, w + 0.08, h + 0.08, 0.03, 0, 0.3, 0, lightWood);
        const m = this.mesh(this.geo.plane, this.mat("#ffffff", { rough: 0.02, metal: 1 }), 0, 0.34 + h / 2, 0.02, g);
        m.scale.set(w, h, 1);
        break;
      }
      case "plant": {
        const pot = this.mesh(this.geo.cyl, this.mat("#b5562f", { rough: 0.8 }), 0, 0.2, 0, g);
        pot.scale.set(0.38, 0.4, 0.38);
        for (const [y, s] of [[0.75, 0.55], [1.05, 0.42]] as const) {
          const leaf = this.mesh(this.geo.sphere, this.mat("#2f7a3a", { rough: 0.9 }), 0, y, 0, g);
          leaf.scale.set(s, s * 1.1, s);
        }
        break;
      }
      case "board":
        this.buildBoard(g, f);
        break;
    }
  }

  /** A food place's menu board: its name and the first dozen dishes with their prices, lit. */
  private buildBoard(g: THREE.Group, f: Fixture) {
    const items = this.spec.items.slice(0, 12);
    const fa = rtl(this.spec.name) || items.some((x) => rtl(x.title));
    const W = 1024, H = Math.round((W * f.h) / f.w);
    const tex = canvasTex(W, H, (c) => {
      c.fillStyle = "#14110e";
      c.fillRect(0, 0, W, H);
      c.fillStyle = this.spec.color;
      c.fillRect(0, 0, W, 64);
      c.fillStyle = "#fff";
      c.font = `900 40px ${FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.direction = fa ? "rtl" : "ltr";
      c.fillText(fit(c, this.spec.name, W - 40), W / 2, 34);
      const cols = items.length > 6 ? 2 : 1, rows = Math.ceil(items.length / cols) || 1;
      const lh = Math.min(46, (H - 84) / rows), cw = W / cols;
      c.font = `700 ${Math.round(lh * 0.56)}px ${FONT}`;
      items.forEach((it, i) => {
        // Persian reads right to left: the first column is the right one.
        const col = fa ? cols - 1 - Math.floor(i / rows) : Math.floor(i / rows);
        const y = 84 + (i % rows) * lh + lh / 2;
        const x0 = col * cw + 24, x1 = (col + 1) * cw - 24;
        const price = this.spec.price(it);
        c.fillStyle = "#ffd166";
        c.textAlign = fa ? "left" : "right";
        c.fillText(price, fa ? x0 : x1, y);
        const pw = c.measureText(price).width + 18;
        c.fillStyle = "#f5efe6";
        c.textAlign = fa ? "right" : "left";
        c.fillText(fit(c, it.title, cw - 48 - pw), fa ? x1 : x0, y);
      });
    });
    this.trash.push(tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.7, roughness: 0.6 });
    this.trash.push(mat);
    const m = this.mesh(this.geo.plane, mat, 0, this.room.h - 0.25 - f.h / 2, 0.03, g);
    m.scale.set(f.w, f.h, 1);
    m.userData.board = true;
    this.pickables.push(m);
  }

  /** Everything on the shelves; each listed thing with its price tag. */
  private buildGoods() {
    const tagMax = this.spec.lite ? TAGS_LITE : TAGS_MAX;
    const tagged = this.room.slots.filter((s) => s.tag).slice(0, tagMax);
    const cols = 8, cw = 256, ch = 96, rows = Math.max(1, Math.ceil(tagged.length / cols));
    const atlas = tagged.length
      ? canvasTex(cols * cw, rows * ch, (g) => {
          tagged.forEach((s, i) => {
            const it = this.spec.items[s.item];
            const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
            const off = it.priceNow && it.priceNow < it.price;
            g.fillStyle = off ? "#fff1c2" : "#ffffff";
            g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
            g.fillStyle = off ? "#e63946" : this.spec.color;
            g.fillRect(x + 2, y + 2, cw - 4, 10);
            const fa = rtl(it.title);
            g.direction = fa ? "rtl" : "ltr";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillStyle = "#1b1b1b";
            g.font = `700 26px ${FONT}`;
            g.fillText(fit(g, it.title, cw - 20), x + cw / 2, y + 36);
            g.fillStyle = off ? "#c1121f" : "#0b6e4f";
            g.font = `900 30px ${FONT}`;
            g.fillText(this.spec.price(it), x + cw / 2, y + 72);
            if (off) {
              // The discount as a red corner badge, and the old price struck through above the new one.
              const pct = Math.round((1 - it.priceNow / it.price) * 100);
              g.fillStyle = "#e63946";
              g.beginPath();
              g.arc(fa ? x + 24 : x + cw - 24, y + 30, 20, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = "#fff";
              g.font = `900 17px ${FONT}`;
              g.fillText(fa ? `٪${pct.toLocaleString("fa-IR")}` : `-${pct}%`, fa ? x + 24 : x + cw - 24, y + 31);
              g.fillStyle = "#777";
              g.font = `600 15px ${FONT}`;
              const was = this.spec.price({ ...it, priceNow: it.price });
              const ww = g.measureText(was).width, wx = fa ? x + 50 + ww / 2 : x + cw - 50 - ww / 2;
              g.fillText(was, wx, y + 54);
              g.fillRect(wx - ww / 2, y + 54, ww, 2);
            }
          });
        })
      : null;
    if (atlas) this.trash.push(atlas);
    const tagGeo = (i: number) => {
      const geo = new THREE.PlaneGeometry(0.22, 0.0825);
      const u0 = (i % cols) / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      uv.setXY(0, u0, v1), uv.setXY(1, u1, v1), uv.setXY(2, u0, v0), uv.setXY(3, u1, v0);
      this.trash.push(geo);
      return geo;
    };
    const tagMat = atlas ? new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false }) : null;
    if (tagMat) this.trash.push(tagMat);
    const tagIdx = new Map(tagged.map((s, i) => [s, i]));

    // Plain stock is drawn in batches (one instanced mesh per shape and colour): a full supermarket in a few dozen
    // draw calls. Listed things are their own meshes (they're tapped, and the picked one breathes).
    const batches = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4[] }>();
    for (const s of this.room.slots) {
      const o = this.goodsFor(s);
      o.position.set(s.x, s.y, s.z);
      o.rotation.y = s.rot;
      if (s.item < 0) {
        o.updateMatrixWorld(true);
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (!m.isMesh) return;
          const key = `${m.geometry.uuid}|${(m.material as THREE.Material).uuid}`;
          let b = batches.get(key);
          if (!b) batches.set(key, (b = { geo: m.geometry, mat: m.material as THREE.Material, at: [] }));
          b.at.push(m.matrixWorld.clone());
        });
        continue;
      }
      this.root.add(o);
      this.productAt.set(s, o);
      o.userData.item = s.item;
      o.traverse((c) => (c.userData.item = s.item));
      this.pickables.push(o);
      this.itemObj.set(s.item, o);
      const ti = tagIdx.get(s);
      if (ti != null && tagMat) {
        const tag = new THREE.Mesh(tagGeo(ti), tagMat);
        tag.userData.item = s.item;
        const hang = s.fix === "rail" || s.fix === "hooks";
        // A shelf label on the front edge under the thing (on a glass case's or fridge's front; low on a hanging one).
        const out = hang ? 0.16 : s.edge + 0.006;
        tag.position.set(s.x + Math.sin(s.rot) * out, s.y + (hang ? -0.75 : -0.045), s.z + Math.cos(s.rot) * out);
        tag.rotation.y = s.rot;
        this.root.add(tag);
        this.pickables.push(tag);
      }
    }
    for (const b of batches.values()) {
      const im = new THREE.InstancedMesh(b.geo, b.mat, b.at.length);
      b.at.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.root.add(im);
      this.trash.push({ dispose: () => im.dispose() });
    }
  }

  /** Printed packaging in this colour: a darker top, a white label band with a round logo and lines, a barcode. */
  private packTex = new Map<string, THREE.Texture>();
  private pack(color: string) {
    let t = this.packTex.get(color);
    if (!t) {
      const base = new THREE.Color(color), h = hashText(color);
      t = canvasTex(128, 256, (g) => {
        g.fillStyle = base.getStyle();
        g.fillRect(0, 0, 128, 256);
        g.fillStyle = base.clone().multiplyScalar(0.6).getStyle();
        g.fillRect(0, 0, 128, 40);
        g.fillStyle = "#fbfaf6";
        g.fillRect(10, 92, 108, 86);
        g.fillStyle = base.clone().offsetHSL(0.5, 0, 0).getStyle();
        g.beginPath();
        g.arc(40, 120, 18, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#333";
        for (let i = 0; i < 3; i++) g.fillRect(66, 108 + i * 12, 40 - ((h >> i) & 7) * 3, 5);
        g.fillRect(20, 150, 88, 6);
        g.fillStyle = "#fff";
        g.fillRect(84, 206, 34, 26);
        g.fillStyle = "#111";
        for (let i = 0; i < 14; i++) if ((h >> (i % 24)) & 1 || i % 3 === 0) g.fillRect(86 + i * 2.2, 208, 1.2, 18);
      });
      this.packTex.set(color, t);
      this.trash.push(t);
    }
    return t;
  }

  /** One thing on a shelf, by its shape. */
  private goodsFor(s: Slot, look?: { kind?: ProductKind; model?: string }): THREE.Object3D {
    const prod = s.item >= 0 ? this.productFor(s, look) : null;
    if (prod) return prod;
    const g = this.geo, c = s.color;
    const grp = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, y = 0) => this.mesh(geo, m, 0, y, 0, grp);
    const shape: Shape = s.shape;
    switch (shape) {
      case "loaf":
        add(g.loaf, this.mat(c, { rough: 0.85 }));
        break;
      case "cake":
        add(g.cake, this.mat(c, { rough: 0.6 }));
        break;
      case "fruit":
        add(g.fruit, this.mat(c, { rough: 0.45 }));
        break;
      case "box":
        add(g.pack, this.mat("#ffffff", { rough: 0.55, map: this.pack(c) }));
        break;
      case "pill":
        add(g.pill, this.mat("#ffffff", { rough: 0.5, map: this.pack(new THREE.Color(c).lerp(new THREE.Color("#ffffff"), 0.45).getStyle()) }));
        break;
      case "bottle":
        add(g.bottle, this.mat(c, { rough: 0.15, opacity: 0.85 }));
        break;
      case "can":
        add(g.can, this.mat("#ffffff", { rough: 0.3, metal: 0.55, map: this.pack(c) }));
        break;
      case "plate":
        add(g.plate, this.mat("#f7f5ef", { rough: 0.3 }));
        add(g.food, this.mat(c === "#f5ebe0" ? "#c98a3a" : c, { rough: 0.7 }));
        break;
      case "cup":
        add(g.cup, this.mat("#f7f5ef", { rough: 0.3 }));
        break;
      case "phone": {
        add(g.phone, this.mat("#1c1d21", { rough: 0.25, metal: 0.4 }));
        add(g.screen, this.mat("#000", { emissive: c, ei: 0.9, rough: 0.1 }));
        grp.rotation.x = -0.15;
        break;
      }
      case "shirt":
        if (s.fix === "rail") add(g.shirt, this.mat(c, { rough: 0.95 }), 0.24);
        else add(g.folded, this.mat(c, { rough: 0.95 }));
        break;
      case "meat":
        if (s.fix === "hooks") add(g.meat, this.mat("#a8322b", { rough: 0.6 }), 0.35);
        else add(g.slab, this.mat("#b3393a", { rough: 0.55 }));
        break;
    }
    // Plain stock stands a little crooked; a few of a kind side by side when there's room.
    if (s.item < 0 && (shape === "box" || shape === "can" || shape === "bottle" || shape === "pill")) {
      const twin = grp.children[0].clone();
      twin.position.x = shape === "can" ? 0.075 : 0.09;
      grp.add(twin);
    }
    return grp;
  }

  /** A listed thing as its real product (lib/product3d kinds, its photo); null = keep the fixture's own look (clothes
   *  on a rail, meat on hooks). */
  private productFor(s: Slot, look?: { kind?: ProductKind; model?: string }): THREE.Object3D | null {
    if (s.fix === "rail" || s.fix === "hooks") return null;
    const it = this.spec.items[s.item];
    if (!it) return null;
    const kind = look?.kind ?? classify({ title: it.title, section: it.section, about: it.about }, this.spec.kind).kind;
    if (KINDS[kind].body === "shirt") return null;
    const [w, h, d] = ROOM_ON[s.fix] ?? [0.3, 0.3, 0.3];
    const o = this.kit.build({ kind, title: it.title, photo: it.photo || undefined, model: look?.model ?? null }, w, h, d);
    return o;
  }

  /** Ask the server which products have a live model or a better kind, and swap those in (never holds the room up). */
  private lookupProducts() {
    const keyOf = new Map<string, Slot[]>();
    for (const s of this.productAt.keys()) {
      const it = this.spec.items[s.item];
      const k = productKey({ title: it.title, photo: it.photo });
      keyOf.set(k, [...(keyOf.get(k) ?? []), s]);
    }
    if (!keyOf.size) return;
    fetch(`/api/product3d?keys=${[...keyOf.keys()].slice(0, 300).join(",")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { products?: Record<string, { kind?: string; model?: string }> } | null) => {
        if (this.disposed || !j?.products) return;
        for (const [k, v] of Object.entries(j.products))
          for (const s of keyOf.get(k) ?? []) {
            const old = this.productAt.get(s);
            if (!old?.parent) continue;
            const o = this.goodsFor(s, { kind: isKind(v.kind) ? v.kind : undefined, model: v.model });
            o.position.copy(old.position);
            o.rotation.copy(old.rotation);
            o.userData.item = s.item;
            o.traverse((c) => (c.userData.item = s.item));
            old.parent.add(o);
            old.removeFromParent();
            this.pickables = this.pickables.map((p) => (p === old ? o : p));
            this.itemObj.set(s.item, o);
            this.productAt.set(s, o);
          }
      })
      .catch(() => {});
  }

  private buildLights() {
    const { w, d, h, lamps } = this.room;
    this.root.add(new THREE.HemisphereLight("#fff6e6", "#5a4a3a", 0.9));
    this.root.add(new THREE.AmbientLight("#ffffff", 0.25));
    const warm = lamps === "pendant" ? "#ffcf8a" : lamps === "spot" ? "#fff0dd" : "#f4f8ff";
    const n = this.spec.lite ? 2 : Math.min(6, Math.max(3, Math.round((w * d) / 18)));
    for (let i = 0; i < n; i++) {
      const x = n <= 2 ? 0 : -w / 4 + (w / 2) * (i % 2);
      const z = 1.2 + ((d - 1.8) * (Math.floor(i / (n <= 2 ? 1 : 2)) + 0.5)) / Math.ceil(n / (n <= 2 ? 1 : 2));
      const l = new THREE.PointLight(warm, lamps === "strip" ? 5 : 6, 9, 1.6);
      l.position.set(x, h - 0.4, z);
      this.root.add(l);
    }
    // The lamps themselves.
    const lampMat = this.mat("#ffffff", { emissive: warm, ei: 2.2 });
    if (lamps === "strip")
      for (let z = 1.2; z < d - 0.5; z += 2) for (const x of [-w / 4, w / 4]) this.box(this.root, 1.2, 0.04, 0.16, x, h - 0.05, z, lampMat);
    else
      for (let z = 1.4; z < d - 0.5; z += 2.2)
        for (const x of lamps === "pendant" ? [-w / 4, w / 4] : [-w / 3, 0, w / 3]) {
          if (lamps === "pendant") {
            const cord = this.box(this.root, 0.01, 0.7, 0.01, x, h - 0.7, z, this.mat("#111"));
            cord.castShadow = false;
            const shade = this.mesh(this.geo.cyl, this.mat("#2b2b2b", { rough: 0.4, metal: 0.5 }), x, h - 0.82, z);
            shade.scale.set(0.34, 0.2, 0.34);
            const bulb = this.mesh(this.geo.sphere, lampMat, x, h - 0.94, z);
            bulb.scale.setScalar(0.1);
          } else {
            const spot = this.mesh(this.geo.cyl, lampMat, x, h - 0.02, z);
            spot.scale.set(0.12, 0.03, 0.12);
          }
        }
    // The counter gets its own light, so the keeper's face reads.
    const c = footprint(this.room.fixtures[0]);
    const cl = new THREE.PointLight(warm, 3, 5, 1.8);
    cl.position.set((c.x0 + c.x1) / 2, h - 0.5, c.z0 - 0.2);
    this.root.add(cl);
  }

  private buildKeeper() {
    const { x, z } = this.room.keeper;
    this.keeperAt.set(x, 0, z);
    // Until the model loads (or if none can): a plain figure, so the counter is never unattended.
    const stand = new THREE.Group();
    stand.position.set(x, 0, z);
    this.box(stand, 0.42, 0.8, 0.24, 0, 0.85, 0, this.mat("#efefef", { rough: 0.8 }));
    const head = this.mesh(this.geo.sphere, this.mat("#c99a7a", { rough: 0.7 }), 0, 1.78, 0, stand);
    head.scale.setScalar(0.22);
    stand.userData.keeper = true;
    stand.traverse((c) => (c.userData.keeper = true));
    if (!this.keeperRoot.parent) this.scene.add(this.keeperRoot);
    this.keeperRoot.add(stand);
    this.pickables.push(stand);
    loadPeople()
      .then((tpls) => {
        if (this.disposed || !tpls.length) return;
        const h = hashText(this.spec.id);
        const p = new PersonModel(tpls[h % tpls.length], (h >> 3) % TINT_COUNT);
        p.group.position.set(x, 0, z);
        p.group.traverse((c) => (c.userData.keeper = true));
        this.keeperRoot.add(p.group);
        this.pickables.push(p.group);
        this.keeper = p;
        stand.removeFromParent();
        this.pickables = this.pickables.filter((o) => o !== stand);
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------- playing

  /** Drag to look round (px moved). */
  look(dx: number, dy: number) {
    this.yaw = wrap(this.yaw + dx * 0.005);
    this.pitch = Math.max(-0.9, Math.min(0.7, this.pitch + dy * 0.004));
  }

  /** What's under a tap (normalised device coordinates); a floor tap walks there. */
  tap(nx: number, ny: number): InteriorHit {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = this.ray.intersectObjects(this.pickables, true);
    for (const h of hits) {
      const u = h.object.userData;
      if (u.item != null) return { kind: "item", id: this.spec.items[u.item as number].id };
      if (u.keeper) return { kind: "keeper" };
      if (u.door) return { kind: "door" };
      if (u.board) return { kind: "board" };
      if (this.scan && this.scanBox && h.face && h.face.normal.y > 0.5 && h.distance < 14) {
        const b = this.scanBox;
        this.goal = { x: Math.max(b.x0, Math.min(b.x1, h.point.x)), z: Math.max(b.z0, Math.min(b.z1, h.point.z)) };
        return null;
      }
      if (u.floor && h.distance < 14) {
        this.goal = walk(this.room, this.x, this.z, h.point.x, h.point.z);
        return null;
      }
    }
    return null;
  }

  /** Walk over to a listed thing and look at it (picked from the list). */
  focus(id: string) {
    const i = this.spec.items.findIndex((x) => x.id === id);
    const s = this.room.slots.find((x) => x.item === i);
    if (!s) return false;
    this.goal = standFor(this.room, s);
    return true;
  }

  /** Light up the thing being looked at (null: none). */
  highlight(id: string | null) {
    const i = id == null ? -1 : this.spec.items.findIndex((x) => x.id === id);
    const o = i >= 0 ? this.itemObj.get(i) ?? null : null;
    if (this.selected && this.selected !== o) this.selected.scale.setScalar(1);
    this.selected = o;
  }

  /** Is this listed thing on a shelf (else it's only in the list)? */
  has(id: string) {
    const i = this.spec.items.findIndex((x) => x.id === id);
    return i >= 0 && this.itemObj.has(i);
  }

  update(dt: number, aspect: number) {
    this.t += dt;
    // Keys: forward/back along the look, sideways.
    let f = 0, s = 0;
    const k = this.keys;
    if (k.has("w") || k.has("arrowup")) f += 1;
    if (k.has("s") || k.has("arrowdown")) f -= 1;
    if (k.has("a")) s -= 1;
    if (k.has("d")) s += 1;
    if (k.has("arrowleft")) this.yaw = wrap(this.yaw + dt * 1.8);
    if (k.has("arrowright")) this.yaw = wrap(this.yaw - dt * 1.8);
    let nx = this.x, nz = this.z;
    if (f || s) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const l = Math.hypot(f, s);
      nx += ((fx * f - fz * s) / l) * WALK_SPEED * dt;
      nz += ((fz * f + fx * s) / l) * WALK_SPEED * dt;
    } else if (this.goal) {
      const dx = this.goal.x - this.x, dz = this.goal.z - this.z, dist = Math.hypot(dx, dz);
      const step = Math.min(dist, WALK_SPEED * dt);
      if (dist > 0.02) (nx += (dx / dist) * step), (nz += (dz / dist) * step);
      // Turn to face where we're going, then (arrived) what we came to look at.
      const want = dist > 0.4 ? yawTo(this.x, this.z, this.goal.x, this.goal.z) : this.goal.yaw;
      if (want != null) this.yaw = wrap(this.yaw + wrap(want - this.yaw) * Math.min(1, dt * 5));
      if (dist > 0.4 || this.goal.yaw != null) this.pitch += (-0.18 - this.pitch) * Math.min(1, dt * 3);
      if (dist <= 0.02 && (this.goal.yaw == null || Math.abs(wrap(this.goal.yaw - this.yaw)) < 0.02)) this.goal = null;
    }
    if (this.scanBox && (nx !== this.x || nz !== this.z)) {
      const b = this.scanBox;
      // On the scan's own floor (shelves and walls block, sliding along them); a bare box while it isn't known.
      const p = this.scanFloor ? scanStep(this.scanFloor, this.x, this.z, nx, nz) : { x: Math.max(b.x0, Math.min(b.x1, nx)), z: Math.max(b.z0, Math.min(b.z1, nz)) };
      if (this.goal && p.x === this.x && p.z === this.z) this.goal = null; // stuck: stop
      this.x = p.x;
      this.z = p.z;
      if (this.goal && Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 0.03 && this.goal.yaw == null) this.goal = null;
    } else if (nx !== this.x || nz !== this.z) {
      // Out through the door.
      if (atDoor(this.room, nx, Math.min(nz, this.room.d))) {
        if (nz > this.z && this.onLeave) return this.onLeave();
      }
      const p = walk(this.room, this.x, this.z, nx, nz);
      if (this.goal && p.x === this.x && p.z === this.z) this.goal = null; // stuck: stop
      this.x = p.x;
      this.z = p.z;
    }
    // A gentle bob while walking.
    const moving = f || s || (this.goal && Math.hypot(this.goal.x - this.x, this.goal.z - this.z) > 0.05);
    const bob = moving ? Math.sin(this.t * 9) * 0.02 : 0;
    this.camera.position.set(this.x, EYE + bob, this.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) (this.camera.aspect = aspect), this.camera.updateProjectionMatrix();
    // The keeper looks at you.
    if (this.keeper) {
      const want = yawTo(this.keeperAt.x, this.keeperAt.z, this.x, this.z);
      const g = this.keeper.group;
      g.rotation.y = wrap(g.rotation.y + wrap(want - g.rotation.y) * Math.min(1, dt * 3));
      this.keeper.update(dt, 0, false, 3);
    }
    // The picked thing breathes a little, so it's easy to find.
    if (this.selected) this.selected.scale.setScalar(1 + 0.08 * (0.5 + 0.5 * Math.sin(this.t * 5)));
  }

  /** Where the keeper's voice comes from (their head). */
  keeperHead() {
    return { x: this.keeperAt.x, y: 1.7, z: this.keeperAt.z };
  }

  dispose() {
    this.disposed = true;
    removeEventListener("keydown", this.onKey);
    removeEventListener("keyup", this.onKey);
    removeEventListener("blur", this.onBlur);
    this.keeper?.dispose();
    this.kit.dispose();
    if (this.scan) disposeModel(this.scan);
    for (const m of this.mats.values()) (m.map && m.map.dispose(), m.dispose());
    for (const t of this.trash) t.dispose();
    this.env?.dispose();
    this.scene.clear();
  }
}
