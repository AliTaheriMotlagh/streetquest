"use client";
// Every store in the 3D city, dressed for what it sells (lib/storeKinds.ts):
//  - one lit sign each, all in ONE texture atlas and ONE instanced draw (a slot per sign; the
//    real name in the loaded Persian font — the canvas shapes right-to-left — the trade's
//    colours, the logo when its card has been read, a green/dim light for open/closed);
//    only signs within ~80 m carry text, farther ones are a coloured bar;
//  - the nearest few fronts are dressed: a striped awning, a display window that glows at night
//    (a rolled shutter when the store is shut), a few props (crates of produce, a menu board,
//    a neon cup, a clothes rail, a screen) and what moves: steam from food, neon that stutters,
//    the pharmacy's turning green cross;
//  - stores that joined the game (lib/business.ts, ids "bz:"): their own colours, logo and banner
//    line on the sign, an awning in their colour, dressed first and from farther; featured ones
//    (Pro, Chain) get a lit billboard over the store (bizBillboards.ts);
//  - one floating panel by the store you're passing (name, rating, open now, a deal, the first
//    menu lines) that pops in and out;
//  - the reveal (lib/storeReveal.ts): each dressed window shows what's inside — the store's own photo once
//    its card is read, else an interior drawn for its trade — from one window atlas; open stores spill
//    their light onto the pavement at night; a store you come up to for the first time "ignites" its sign
//    like neon switching on; a store with a discount hangs a turning gold medal with the % by its sign.
// Everything is instanced and pooled; counts are capped by the quality tier. No per-frame allocation.
import * as THREE from "three";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import type { MenuSection, Week } from "@/lib/localData";
import { favourite } from "@/lib/street/shopTalk";
import { isShop, KIND_LABEL, menuHighlights, neonFlicker, signDetail, STORE_LOOK, storeKind, storefrontCap, storeOpen, usuallyAt, type StoreKind } from "@/lib/storeKinds";
import { inkOn, shade, type BrandTier } from "@/lib/business";
import { patchShader, after } from "./graphics/shaders";
import { dealPercent, ignition, OFFICE_SCENE, REVEAL_M, REVEAL_S, WINDOW_SCENE, type WindowScene } from "@/lib/storeReveal";
import { KERB_H } from "./tileMesh";
import { BizBillboards } from "./bizBillboards";
import { nameLines } from "./trades";

const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, -apple-system, "Segoe UI", sans-serif`;
const RTL = /[֐-ࣿ]/;
/** Atlas slot, pixels (phones; high and ultra get a sharper 768×160). A sign is drawn 100 units per metre tall, whatever its width, so text is never stretched. */
const SW0 = 512, SH0 = 128;
/** Narrowest sign (m): shops packed side by side on one wall shrink to this before a second row. */
export const SIGN_MIN_W = 1.8;
const signW = (w: number) => Math.max(SIGN_MIN_W, Math.min(7.5, w));
/** A dressed front's size: its width along the wall, the awning's height, the window's height (m). */
function frontOf(l: { w: number; y: number }) {
  const wm = Math.max(2.6, Math.min(7.5, l.w)), yA = Math.max(2.3, l.y - 0.62);
  return { wm, yA, wh: Math.max(0.8, yA - 0.2 - 0.25) };
}
/** Window atlas slot (px): one per dressed front. */
const WW = 256, WH = 128;
/** An open window's light by day (× its trade's glow); 1.15 at night. */
const WIN_DAY = 0.6;
/** Deal medals at once (the nearest stores with a discount). */
const MEDALS = 3;
/** A stable number from a store's id (its window's interior varies with it). */
const idSeed = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** A store's sign spot, as the tile worker placed it (Label in tileMesh.ts). */
export type ShopLabel = { id: string; text: string; cls?: string; x: number; y: number; z: number; angle: number; w: number; pole?: boolean; d: number };

/** What a store's card has told us (from /api/local), for its sign and the panel. */
export type StorePanel = {
  name?: string;
  logo?: string;
  photo?: string;
  rating?: number;
  reviews?: number;
  week?: Week | null;
  /** Best discount, % (Takhfifan). */
  deal?: number;
  items?: { title: string; price: number }[];
  menuSections?: { items: { title: string; price: number; priceNow: number }[] }[];
  /** A business that joined: its plan's look (colour "" = the trade's own). */
  brand?: { tier: BrandTier; color: string; tagline: string };
};

/** A joined store that dresses up (Starter and up). */
const branded = (info: StorePanel | undefined) => !!info?.brand && info.brand.tier !== "basic";

type Slot = { id: string; col: number; row: number; sig: string; sw: number };
type Dressed = { l: ShopLabel; kind: StoreKind; open: boolean; fx: number; fz: number; seed: number };

const TMP_M = new THREE.Matrix4(), TMP_Q = new THREE.Quaternion(), TMP_E = new THREE.Euler(), TMP_P = new THREE.Vector3(), TMP_S = new THREE.Vector3(), TMP_C = new THREE.Color();

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

export class Storefronts {
  private cap: ReturnType<typeof storefrontCap>;
  private SW = SW0;
  private SH = SH0;
  private cols: number;
  private atlas: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private slots = new Map<string, Slot>();
  private free: number[] = [];
  private infos = new Map<string, StorePanel>();
  private openMemo = new Map<string, boolean>();
  private openMin = -1;
  private images = new Map<string, HTMLImageElement | null>();
  private night = 0;
  private fontReady = false;
  private dirty = false;
  private lastUpload = 0;
  private dressed: Dressed[] = [];
  private order: ShopLabel[] = [];
  /** Where the city is (its country picks the "usually here" list). */
  at: { lat: number; lng: number } | null = null;
  private idOf: string[] = [];
  private group = new THREE.Group();
  // Instanced pieces.
  private signs: THREE.InstancedMesh;
  private backs: THREE.InstancedMesh;
  private poles: THREE.InstancedMesh;
  private awnings: THREE.InstancedMesh;
  private lips: THREE.InstancedMesh;
  private glass: THREE.InstancedMesh;
  private shutters: THREE.InstancedMesh;
  private crates: THREE.InstancedMesh;
  private produce: THREE.InstancedMesh;
  private menus: THREE.InstancedMesh;
  private neons: THREE.InstancedMesh;
  private crosses: THREE.InstancedMesh;
  private garments: THREE.InstancedMesh;
  private screens: THREE.InstancedMesh;
  /** Iranian touches: a Persian rug hung by the door, a brass samovar on the sill. */
  private rugs: THREE.InstancedMesh;
  private samovars: THREE.InstancedMesh;
  private steam: THREE.InstancedMesh;
  private steamSrc: { x: number; y: number; z: number; seed: number }[] = [];
  private owned: { dispose: () => void }[] = [];
  private neonList: { i: number; seed: number; col: THREE.Color }[] = [];
  private crossList: { i: number; x: number; y: number; z: number; ang: number }[] = [];
  private screenList: { i: number; seed: number }[] = [];
  private litAttr: THREE.InstancedBufferAttribute;
  private billboards: BizBillboards;
  private signLit: number[] = [];
  // The reveal (lib/storeReveal.ts).
  private win: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; cols: number; rows: number };
  private winSlots = new Map<string, { n: number; sig: string }>();
  private winFree: number[] = [];
  private winAttr: THREE.InstancedBufferAttribute;
  private winDirty = false;
  /** Light from each open window on the pavement, at night. */
  private spill: THREE.InstancedMesh;
  /** When each store first lit up for you (ms), and the ones lighting up now. */
  private revealed = new Map<string, number>();
  private revealing: string[] = [];
  private medals: { mesh: THREE.Group; face: THREE.MeshStandardMaterial; id: string | null; pct: number; x: number; y: number; z: number; seed: number }[] = [];
  private medalTex = new Map<number, THREE.CanvasTexture>();
  /** Each dressed store's window instance (for the reveal). */
  private glassOf = new Map<string, number>();
  /** Where ground props may stand (not on a street); set by the city. */
  blocked: (x: number, z: number) => boolean = () => false;
  /** The clock (a test can hold it at night). */
  now: () => Date = () => new Date();
  /** Out of the way (a match is on). */
  set hidden(v: boolean) {
    this.group.visible = !v;
  }
  // The floating panel.
  private panel: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; c: HTMLCanvasElement; id: string | null; k: number; want: number; sig: string; label: ShopLabel | null };

  constructor(private scene: THREE.Scene, tier: "lite" | "low" | "medium" | "high" | "ultra", private reduceMotion = false) {
    this.cap = storefrontCap(tier);
    this.cols = tier === "lite" ? 2 : 4;
    const sharp = tier === "high" || tier === "ultra";
    this.SW = sharp ? 768 : SW0;
    this.SH = sharp ? 160 : SH0;
    const { SW, SH } = this;
    const rows = Math.ceil(this.cap.signs / this.cols);
    const a = canvas(SW * this.cols, SH * rows);
    const tex = new THREE.CanvasTexture(a.c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // No mip chain: slots would bleed into each other, and far signs are bars anyway.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    this.atlas = { ...a, tex };
    for (let i = this.cap.signs - 1; i >= 0; i--) this.free.push(i);

    const N = this.cap.signs, D = this.cap.dressed;
    const own = <T extends { dispose: () => void }>(o: T) => (this.owned.push(o), o);
    // Signs: a plane per sign (two on a pole), its atlas window and its lamp level per instance.
    const plane = own(new THREE.PlaneGeometry(1, 1));
    const slotAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2 * 4), 4);
    this.litAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2).fill(1), 1);
    plane.setAttribute("aSlot", slotAttr);
    plane.setAttribute("aLit", this.litAttr);
    const signMat = own(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.3, roughness: 0.5 }));
    patchShader(signMat, "storefront-sign", (sh) => {
      sh.vertexShader = `attribute vec4 aSlot;\nattribute float aLit;\nvarying float vLit;\n${sh.vertexShader}`;
      sh.vertexShader = after(sh.vertexShader, "uv_vertex", "vMapUv = vMapUv * aSlot.zw + aSlot.xy;\nvEmissiveMapUv = vEmissiveMapUv * aSlot.zw + aSlot.xy;\nvLit = aLit;");
      sh.fragmentShader = `varying float vLit;\n${sh.fragmentShader}`;
      sh.fragmentShader = after(sh.fragmentShader, "emissivemap_fragment", "totalEmissiveRadiance *= vLit;");
    });
    this.signs = this.mesh(plane, signMat, N * 2, false);
    const dark = own(new THREE.MeshStandardMaterial({ color: "#1d2126", roughness: 0.6, metalness: 0.4 }));
    this.backs = this.mesh(own(new THREE.BoxGeometry(1, 1, 1)), dark, N, false);
    this.poles = this.mesh(own(new THREE.CylinderGeometry(0.06, 0.08, 1, 8).translate(0, -0.5, 0)), dark, N, false);

    // Fronts.
    const stripes = own(this.stripeTexture());
    const awnMat = own(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85 }));
    this.awnings = this.mesh(own(new THREE.BoxGeometry(1, 0.05, 1).translate(0, 0, 0.5)), awnMat, D, true);
    this.lips = this.mesh(own(new THREE.BoxGeometry(1, 0.2, 0.04)), awnMat, D, true);
    // Windows: one atlas, a slot per dressed front (its photo, or its trade's interior), picked per instance.
    const wcols = 4, wrows = Math.max(1, Math.ceil(D / wcols));
    const wa = canvas(WW * wcols, WH * wrows);
    const wtex = own(new THREE.CanvasTexture(wa.c));
    wtex.colorSpace = THREE.SRGBColorSpace;
    wtex.generateMipmaps = false;
    wtex.minFilter = THREE.LinearFilter;
    this.win = { ...wa, tex: wtex, cols: wcols, rows: wrows };
    for (let i = D - 1; i >= 0; i--) this.winFree.push(i);
    const wplane = own(new THREE.PlaneGeometry(1, 1));
    this.winAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, D) * 4), 4);
    wplane.setAttribute("aWin", this.winAttr);
    const winMat = own(new THREE.MeshBasicMaterial({ map: wtex }));
    patchShader(winMat, "storefront-window", (sh) => {
      sh.vertexShader = `attribute vec4 aWin;\n${sh.vertexShader}`;
      sh.vertexShader = after(sh.vertexShader, "uv_vertex", "vMapUv = vMapUv * aWin.zw + aWin.xy;");
    });
    this.glass = this.mesh(wplane, winMat, D, true);
    // The windows' light on the pavement: a soft pool, added on top, only at night.
    const pool = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5));
    this.spill = this.mesh(pool, own(new THREE.MeshBasicMaterial({ map: own(this.poolTexture()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })), D, true);
    this.spill.renderOrder = 3;
    // Deal medals: a gold coin, the % on both faces.
    const coin = own(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 28, 1, true).rotateX(Math.PI / 2));
    const disc = own(new THREE.CircleGeometry(0.3, 28));
    const rim = own(new THREE.MeshStandardMaterial({ color: "#d9a92e", metalness: 0.9, roughness: 0.25, emissive: new THREE.Color("#5a3c00") }));
    for (let i = 0; i < (tier === "lite" ? 1 : MEDALS); i++) {
      const face = own(new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.6, roughness: 0.3, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.25 }));
      // The rim, and a face each side (a circle maps the % upright; the coin's own caps would turn it).
      const mesh = new THREE.Group();
      const front = new THREE.Mesh(disc, face), back = new THREE.Mesh(disc, face);
      front.position.z = 0.026;
      back.position.z = -0.026;
      back.rotation.y = Math.PI;
      mesh.add(new THREE.Mesh(coin, rim), front, back);
      mesh.visible = false;
      this.group.add(mesh);
      this.medals.push({ mesh, face, id: null, pct: 0, x: 0, y: 0, z: 0, seed: i });
    }
    this.shutters = this.mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshStandardMaterial({ map: own(this.windowTexture(true)), roughness: 0.5, metalness: 0.6 })), D, true);

    // Props.
    const wood = own(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }));
    this.crates = this.mesh(own(new THREE.BoxGeometry(0.7, 0.32, 0.5)), wood, D * 3, true);
    this.produce = this.mesh(own(new THREE.IcosahedronGeometry(0.2, 0).scale(1.6, 0.6, 1.1)), own(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 })), D * 3, true);
    this.menus = this.mesh(own(new THREE.BoxGeometry(0.55, 0.85, 0.05)), own(new THREE.MeshStandardMaterial({ map: own(this.chalkTexture()), roughness: 0.8 })), D, false);
    this.neons = this.mesh(own(new THREE.CylinderGeometry(0.13, 0.09, 0.28, 10)), own(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })), D, true);
    this.crosses = this.mesh(this.crossGeo(own), own(new THREE.MeshBasicMaterial({ color: "#3dff9a", toneMapped: false })), D, false);
    this.garments = this.mesh(own(new THREE.BoxGeometry(0.34, 0.75, 0.05)), own(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 })), D * 5, true);
    this.screens = this.mesh(own(new THREE.PlaneGeometry(0.9, 0.5)), own(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })), D, true);
    this.rugs = this.mesh(own(new THREE.PlaneGeometry(0.95, 1.4)), own(new THREE.MeshStandardMaterial({ map: own(this.rugTexture()), roughness: 0.95, side: THREE.DoubleSide })), D, false);
    // A samovar turned on a lathe: foot, belly, shoulder, the crown the teapot sits on, and the teapot.
    const sv = [[0, 0], [0.11, 0], [0.08, 0.05], [0.09, 0.1], [0.15, 0.2], [0.16, 0.36], [0.12, 0.46], [0.07, 0.5], [0.06, 0.55], [0.09, 0.6], [0.1, 0.7], [0.07, 0.76], [0.02, 0.8], [0, 0.81]].map(([x, y]) => new THREE.Vector2(x, y));
    this.samovars = this.mesh(own(new THREE.LatheGeometry(sv, 14)), own(new THREE.MeshStandardMaterial({ color: "#c9a24a", metalness: 0.85, roughness: 0.28 })), D, false);
    const puff = own(this.puffTexture());
    this.steam = this.mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: puff, color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), Math.max(1, this.cap.steam * 4), true);
    this.steam.renderOrder = 4;

    // The panel.
    const p = canvas(512, 640);
    const ptex = new THREE.CanvasTexture(p.c);
    ptex.colorSpace = THREE.SRGBColorSpace;
    ptex.anisotropy = 4;
    const pmat = new THREE.MeshBasicMaterial({ map: ptex, transparent: true, depthWrite: false, toneMapped: false });
    const pmesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), pmat);
    pmesh.visible = false;
    pmesh.renderOrder = 6;
    this.owned.push(pmesh.geometry, pmat, ptex);
    this.panel = { mesh: pmesh, mat: pmat, tex: ptex, g: p.g, c: p.c, id: null, k: 0, want: 0, sig: "", label: null };
    this.group.add(pmesh);
    this.billboards = new BizBillboards(this.group, tier === "lite" ? 1 : tier === "low" ? 2 : 3, reduceMotion, (u) => this.image(u));
    scene.add(this.group);
    // The Persian font may still be loading: the signs are drawn again once it is.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts?.load) void fonts.load(`800 40px Vazirmatn`, "آبپ").then(() => ((this.fontReady = true), this.slots.forEach((s) => (s.sig = ""))), () => (this.fontReady = true));
    else this.fontReady = true;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, tinted: boolean) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tinted) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3).fill(1), 3);
    this.group.add(m);
    return m;
  }

  // ---------------------------------------------------------------- textures
  private stripeTexture() {
    const { c, g } = canvas(64, 8);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#e9e2d6" : "#ffffff";
      g.fillRect(i * 8, 0, 8, 8);
    }
    // Stripes run down the slope: colour × white, colour × a darker cream.
    g.globalCompositeOperation = "multiply";
    for (let i = 0; i < 8; i += 2) {
      g.fillStyle = "#9b9b9b";
      g.fillRect(i * 8, 0, 8, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
  }
  private windowTexture(shutter: boolean) {
    const { c, g } = canvas(128, 128);
    if (shutter) {
      for (let y = 0; y < 128; y += 8) {
        const k = 150 + ((y / 8) % 2) * 28;
        g.fillStyle = `rgb(${k},${k + 4},${k + 8})`;
        g.fillRect(0, y, 128, 8);
        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect(0, y + 6, 128, 2);
      }
    } else {
      // Warm light fading toward the edges, with the mullions of a shop window.
      const grd = g.createRadialGradient(64, 70, 6, 64, 70, 96);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(1, "#8a8a8a");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#3a3a3a";
      for (const x of [0, 62, 124]) g.fillRect(x, 0, 4, 128);
      g.fillRect(0, 0, 128, 4);
      g.fillRect(0, 124, 128, 4);
      g.fillRect(0, 100, 128, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  /** A soft pool of light, brightest by the wall (the plane's near edge), fading out across the pavement. */
  private poolTexture() {
    // (An ellipse that reaches nothing at the sides and the far edge — no hard rectangle on the pavement.)
    const { c, g } = canvas(64, 64);
    g.save();
    g.scale(1, 2);
    const grd = g.createRadialGradient(32, 0, 1, 32, 0, 31);
    grd.addColorStop(0, "rgba(255,255,255,.9)");
    grd.addColorStop(0.4, "rgba(255,255,255,.4)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 32);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** A deal medal's face: a gold coin stamped with the % and «تخفیف» (made once per percentage). */
  private medalTexture(pct: number) {
    let tex = this.medalTex.get(pct);
    if (tex) return tex;
    const { c, g } = canvas(128, 128);
    const grd = g.createRadialGradient(48, 40, 6, 64, 64, 64);
    grd.addColorStop(0, "#fff3b0");
    grd.addColorStop(0.55, "#f0c040");
    grd.addColorStop(1, "#a8740f");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(90,60,0,.55)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.stroke();
    const fa = getLocale() === "fa";
    g.fillStyle = "#5a2d00";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 46px ${FONT}`;
    g.fillText(fa ? `٪${fmtNum(pct)}` : `${pct}%`, 64, 56);
    g.font = `800 19px ${FONT}`;
    g.fillText(fa ? "تخفیف" : t("off"), 64, 92);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.medalTex.set(pct, tex);
    return tex;
  }

  /**
   * One dressed front's window into its atlas slot: the store's own photo (cropped to the window's shape) or its
   * trade's interior (lib/storeReveal.ts WINDOW_SCENE), then the shop's light, a reflection across the glass and the
   * frame. `aspect`: the window's width ÷ height, so nothing looks stretched on it.
   */
  private drawWindow(n: number, kind: StoreKind | "office", aspect: number, seed: number, photo: HTMLImageElement | null) {
    const { g, cols } = this.win;
    const x0 = (n % cols) * WW, y0 = Math.floor(n / cols) * WH;
    const V = 100 * aspect, H = 100;
    g.save();
    g.beginPath();
    g.rect(x0, y0, WW, WH);
    g.clip();
    g.setTransform(WW / V, 0, 0, WH / H, x0, y0);
    const sc = kind === "office" ? OFFICE_SCENE : WINDOW_SCENE[kind];
    if (photo && photo.naturalWidth > 0) {
      // Cover: the photo's middle at the window's shape (the slot's stretch undoes itself on the glass).
      const pw = photo.naturalWidth, ph = photo.naturalHeight, want = V / H;
      const sw = pw / ph > want ? ph * want : pw, sh = pw / ph > want ? ph : pw / want;
      g.drawImage(photo, (pw - sw) / 2, (ph - sh) / 2, sw, sh, 0, 0, V, H);
      g.fillStyle = "rgba(255,190,120,.12)";
      g.fillRect(0, 0, V, H);
    } else this.interior(g, sc, V, H, seed);
    // The shop's light: bright in the middle, falling off at the sides.
    const light = g.createRadialGradient(V / 2, H * 0.35, 4, V / 2, H * 0.45, Math.max(V, H) * 0.75);
    light.addColorStop(0, "rgba(255,240,210,.22)");
    light.addColorStop(1, "rgba(0,0,0,.38)");
    g.fillStyle = light;
    g.fillRect(0, 0, V, H);
    // A reflection running across the glass.
    g.fillStyle = "rgba(255,255,255,.13)";
    g.beginPath();
    g.moveTo(V * 0.12, H);
    g.lineTo(V * 0.3, 0);
    g.lineTo(V * 0.38, 0);
    g.lineTo(V * 0.2, H);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.07)";
    g.beginPath();
    g.moveTo(V * 0.42, H);
    g.lineTo(V * 0.55, 0);
    g.lineTo(V * 0.58, 0);
    g.lineTo(V * 0.45, H);
    g.fill();
    // The frame and the mullions (a door on the right third).
    g.fillStyle = "#2a2c30";
    g.fillRect(0, 0, V, 3);
    g.fillRect(0, H - 4, V, 4);
    g.fillRect(0, 0, 3, H);
    g.fillRect(V - 3, 0, 3, H);
    g.fillRect(V * 0.66, 0, 2.5, H);
    g.fillRect(V * 0.66 + 10, H * 0.5, 1.5, 7);
    g.restore();
    this.winDirty = true;
  }

  /** A trade's interior seen through its window: back wall, the goods, the lamps (seeded: shops of a kind differ). */
  private interior(g: CanvasRenderingContext2D, sc: WindowScene, V: number, H: number, seed: number) {
    const R = (k: number) => Math.abs(Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453) % 1;
    const col = (k: number) => sc.colors[Math.floor(R(k) * sc.colors.length) % sc.colors.length];
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, shade(sc.wall, 0.12));
    wall.addColorStop(1, shade(sc.wall, -0.25));
    g.fillStyle = wall;
    g.fillRect(0, 0, V, H);
    g.fillStyle = sc.floor;
    g.fillRect(0, H * 0.84, V, H * 0.16);
    const shelves = (rows: number[], item: (x: number, y: number, i: number) => void, step = 9) => {
      for (const [r, y] of rows.entries()) {
        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect(4, y + 1, V - 8, 2.5);
        for (let x = 7, i = 0; x < V - 8; x += step + R(r * 31 + i) * 3, i++) item(x, y, r * 50 + i);
      }
    };
    switch (sc.goods) {
      case "loaves":
        shelves([30, 52, 74], (x, y, i) => {
          g.fillStyle = col(i);
          g.beginPath();
          g.ellipse(x + 4, y - 4, 5, 3.6, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "rgba(255,255,255,.25)";
          g.fillRect(x + 1, y - 6, 6, 1);
        }, 11);
        break;
      case "cakes":
        // A lit glass counter of cakes, and cakes on stands behind.
        g.fillStyle = "rgba(255,255,255,.5)";
        g.fillRect(4, 58, V - 8, 26);
        shelves([70, 82], (x, y, i) => {
          g.fillStyle = col(i);
          g.fillRect(x, y - 7, 7, 7);
          g.fillStyle = "#fff";
          g.fillRect(x, y - 7, 7, 1.5);
        }, 10);
        shelves([34], (x, y, i) => {
          g.fillStyle = col(i + 9);
          g.beginPath();
          g.arc(x + 5, y - 6, 6, Math.PI, 0);
          g.fill();
        }, 16);
        break;
      case "fruit":
        shelves([44, 66, 84], (x, y, i) => {
          g.fillStyle = col(i);
          for (let k = 0; k < 5; k++) (g.beginPath(), g.arc(x + (k % 3) * 3 + 2, y - 3 - Math.floor(k / 3) * 3, 2.2, 0, Math.PI * 2), g.fill());
        }, 12);
        break;
      case "packs":
      case "medicine":
        shelves([26, 46, 66, 84], (x, y, i) => {
          const h = sc.goods === "medicine" ? 5 : 6 + R(i) * 7, w = sc.goods === "medicine" ? 4 : 4 + R(i + 3) * 3;
          g.fillStyle = col(i);
          g.fillRect(x, y - h, w, h);
          g.fillStyle = "rgba(255,255,255,.35)";
          g.fillRect(x, y - h, w, 1);
        }, 6);
        if (sc.goods === "medicine") {
          g.fillStyle = "#1fbf6a";
          g.fillRect(V / 2 - 2.5, 4, 5, 14);
          g.fillRect(V / 2 - 7, 8.5, 14, 5);
        }
        break;
      case "meat":
        g.fillStyle = "rgba(255,255,255,.4)";
        for (let x = 0; x < V; x += 8) for (let y = 0; y < H * 0.6; y += 8) g.fillRect(x + 0.5, y + 0.5, 7, 7);
        g.fillStyle = "#777";
        g.fillRect(4, 10, V - 8, 1.5);
        for (let x = 10, i = 0; x < V - 10; x += 14, i++) {
          g.fillStyle = col(i);
          g.beginPath();
          g.ellipse(x, 26, 4.5, 12, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(255,255,255,.55)";
        g.fillRect(4, 62, V - 8, 22);
        break;
      case "clothes":
        g.fillStyle = "#999";
        g.fillRect(6, 18, V - 12, 1.5);
        for (let x = 10, i = 0; x < V - 12; x += 7 + R(i) * 2, i++) {
          g.fillStyle = col(i);
          g.beginPath();
          g.moveTo(x - 3, 20);
          g.lineTo(x + 3, 20);
          g.lineTo(x + 4.5, 48 + R(i + 5) * 14);
          g.lineTo(x - 4.5, 48 + R(i + 5) * 14);
          g.fill();
        }
        // A mannequin in the window.
        g.fillStyle = "#e9e4dc";
        g.beginPath();
        g.arc(V * 0.33, 34, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = col(99);
        g.fillRect(V * 0.33 - 6, 39, 12, 26);
        g.fillStyle = "#1c1c1c";
        g.fillRect(V * 0.33 - 5, 65, 4, 19);
        g.fillRect(V * 0.33 + 1, 65, 4, 19);
        break;
      case "phones":
        shelves([40, 64, 84], (x, y, i) => {
          g.fillStyle = "#0b0d10";
          g.fillRect(x, y - 13, 7, 12);
          g.fillStyle = col(i);
          g.fillRect(x + 0.8, y - 12, 5.4, 10);
        }, 11);
        break;
      case "desks":
        // A bank, an office, a clinic: a counter with its screens, a waiting bench, a plant.
        g.fillStyle = shade(sc.wall, -0.3);
        g.fillRect(V * 0.3, 58, V * 0.66, 26);
        for (let x = V * 0.36, i = 0; x < V * 0.9; x += 18, i++) {
          g.fillStyle = "#16191e";
          g.fillRect(x, 46, 11, 9);
          g.fillStyle = col(i);
          g.fillRect(x + 1, 47, 9, 7);
        }
        g.fillStyle = "rgba(0,0,0,.4)";
        g.fillRect(6, 70, V * 0.18, 4);
        g.fillStyle = "#3d8b3d";
        g.beginPath();
        g.arc(V * 0.24, 70, 6, 0, Math.PI * 2);
        g.fill();
        break;
      case "cafe":
      case "tables": {
        if (sc.goods === "cafe") {
          // The counter, the espresso machine, cups on a shelf, a plant.
          g.fillStyle = shade(sc.wall, -0.4);
          g.fillRect(V * 0.45, 56, V * 0.5, 28);
          g.fillStyle = "#c9ccd1";
          g.fillRect(V * 0.6, 44, 16, 12);
          shelves([30], (x, y, i) => {
            g.fillStyle = col(i);
            g.fillRect(x, y - 4, 4, 4);
          }, 7);
          g.fillStyle = "#3d8b3d";
          g.beginPath();
          g.arc(10, 66, 8, 0, Math.PI * 2);
          g.fill();
        }
        // Tables with their cloths, chairs either side.
        for (let x = sc.goods === "cafe" ? 22 : 12, i = 0; x < (sc.goods === "cafe" ? V * 0.42 : V - 12); x += 26, i++) {
          g.fillStyle = col(i);
          g.fillRect(x, 62, 16, 3);
          g.fillStyle = "rgba(0,0,0,.45)";
          g.fillRect(x + 7, 65, 2, 18);
          g.fillRect(x - 5, 66, 4, 17);
          g.fillRect(x + 17, 66, 4, 17);
        }
        break;
      }
    }
    // The lamps.
    g.fillStyle = "rgba(255,236,190,.95)";
    if (sc.lamps === "strip") g.fillRect(4, 2, V - 8, 2.5);
    else
      for (let x = 14; x < V - 8; x += 26) {
        if (sc.lamps === "pendant") {
          g.fillStyle = "rgba(0,0,0,.5)";
          g.fillRect(x, 0, 0.8, 9);
          g.fillStyle = "rgba(255,226,170,.95)";
          g.beginPath();
          g.arc(x + 0.4, 11, 3.2, Math.PI, 0);
          g.fill();
        } else {
          const sp = g.createRadialGradient(x, 2, 0, x, 2, 20);
          sp.addColorStop(0, "rgba(255,245,220,.6)");
          sp.addColorStop(1, "rgba(255,245,220,0)");
          g.fillStyle = sp;
          g.fillRect(x - 20, 0, 40, 40);
        }
      }
  }

  /** A Persian rug: a red field, a navy border with a cream guard stripe, a medallion and corner pieces. */
  private rugTexture() {
    const { c, g } = canvas(128, 192);
    g.fillStyle = "#1f2b5c";
    g.fillRect(0, 0, 128, 192);
    g.fillStyle = "#efe2c4";
    g.fillRect(9, 9, 110, 174);
    g.fillStyle = "#8f1d2c";
    g.fillRect(13, 13, 102, 166);
    // Border motifs: small cream diamonds along the navy band.
    g.fillStyle = "#d9b45a";
    for (let i = 0; i < 12; i++) for (const [x, y] of [[4.5, 8 + i * 15.5], [123.5, 8 + i * 15.5]]) (g.beginPath(), g.moveTo(x, y - 3), g.lineTo(x + 3, y), g.lineTo(x, y + 3), g.lineTo(x - 3, y), g.fill());
    for (let i = 0; i < 8; i++) for (const [x, y] of [[8 + i * 15.5, 4.5], [8 + i * 15.5, 187.5]]) (g.beginPath(), g.moveTo(x, y - 3), g.lineTo(x + 3, y), g.lineTo(x, y + 3), g.lineTo(x - 3, y), g.fill());
    // The medallion: nested diamonds.
    const dia = (r: number, col: string) => (g.beginPath(), g.moveTo(64, 96 - r * 1.4), g.lineTo(64 + r, 96), g.lineTo(64, 96 + r * 1.4), g.lineTo(64 - r, 96), g.closePath(), (g.fillStyle = col), g.fill());
    dia(34, "#1f2b5c");
    dia(26, "#efe2c4");
    dia(18, "#8f1d2c");
    dia(9, "#d9b45a");
    // Corner pieces.
    g.fillStyle = "#1f2b5c";
    for (const [x, y, sx, sy] of [[13, 13, 1, 1], [115, 13, -1, 1], [13, 179, 1, -1], [115, 179, -1, -1]]) (g.beginPath(), g.moveTo(x, y), g.lineTo(x + 24 * sx, y), g.lineTo(x, y + 30 * sy), g.fill());
    // Fringe.
    g.strokeStyle = "#f4ead2";
    g.lineWidth = 1;
    for (let x = 3; x < 128; x += 4) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, 3), g.moveTo(x, 189), g.lineTo(x, 192), g.stroke());
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private chalkTexture() {
    const { c, g } = canvas(64, 96);
    g.fillStyle = "#23302a";
    g.fillRect(0, 0, 64, 96);
    g.strokeStyle = "#8a6a42";
    g.lineWidth = 4;
    g.strokeRect(2, 2, 60, 92);
    g.fillStyle = "rgba(255,255,255,.8)";
    g.fillRect(10, 12, 44, 5);
    g.fillStyle = "rgba(255,255,255,.5)";
    for (let y = 28; y < 84; y += 11) {
      g.fillRect(10, y, 28, 3);
      g.fillRect(44, y, 10, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  private puffTexture() {
    const { c, g } = canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,255,255,.9)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  private crossGeo(own: <T extends { dispose: () => void }>(o: T) => T) {
    // A plus of two bars, flat (it turns about the vertical, like a barber's pole).
    const a = new THREE.BoxGeometry(0.2, 0.62, 0.08), b = new THREE.BoxGeometry(0.62, 0.2, 0.08);
    const pos: number[] = [], idx: number[] = [], nor: number[] = [];
    for (const g of [a, b]) {
      const base = pos.length / 3;
      pos.push(...g.getAttribute("position").array);
      nor.push(...g.getAttribute("normal").array);
      idx.push(...Array.from(g.index!.array, (i) => i + base));
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    return own(geo);
  }

  // ---------------------------------------------------------------- the signs
  private image(url: string | undefined) {
    if (!url) return null;
    if (this.images.has(url)) return this.images.get(url)!;
    this.images.set(url, null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      this.images.set(url, img);
      this.slots.forEach((s) => (s.sig = ""));
      this.panel.sig = "";
    };
    img.src = url;
    return null;
  }

  /**
   * One store's sign, drawn like a real lit box sign: a dark metal frame, the trade's (or the
   * brand's) colour with a glossy top, the logo in a white badge (the trade's emoji until the
   * card is read), the name outlined so it reads from across the street, and a second line —
   * the banner, else what it is and its stars. Open/closed tag, a deal sticker, the lamp strip.
   */
  private drawSign(s: Slot, l: ShopLabel, kind: StoreKind, open: boolean, detail: "text" | "bar") {
    const { SW, SH } = this;
    const g = this.atlas.g, look = STORE_LOOK[kind], info = this.infos.get(l.id);
    const x0 = s.col * SW, y0 = s.row * SH, wm = signW(l.w), U = wm * 100;
    g.save();
    g.beginPath();
    g.rect(x0, y0, SW, SH);
    g.clip();
    g.setTransform(SW / U, 0, 0, SH / 100, x0, y0);
    const brand = branded(info) ? info!.brand! : null, col = brand?.color || "";
    const top = col || look.sign[0], bottom = col ? shade(col, -0.35) : look.sign[1];
    // The frame: dark brushed metal, a hairline of light on its top edge.
    g.fillStyle = "#15181d";
    g.fillRect(0, 0, U, 100);
    const fr = brand?.tier === "featured" ? 7 : 5;
    g.fillStyle = brand?.tier === "featured" ? "#e9b949" : "rgba(255,255,255,.16)";
    g.fillRect(0, 0, U, 2);
    // The face.
    const grd = g.createLinearGradient(0, fr, 0, 100 - fr);
    grd.addColorStop(0, shade(top, 0.12));
    grd.addColorStop(0.55, top);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(fr, fr, U - fr * 2, 100 - fr * 2, 6);
    g.fill();
    // Gloss: the light box's plastic catches the sky along its top.
    const gl = g.createLinearGradient(0, fr, 0, 46);
    gl.addColorStop(0, "rgba(255,255,255,.28)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gl;
    g.fillRect(fr, fr, U - fr * 2, 40);
    if (brand?.tier === "featured") (g.strokeStyle = "#f0c05a"), (g.lineWidth = 3), g.strokeRect(fr + 2, fr + 2, U - fr * 2 - 4, 100 - fr * 2 - 4);
    const ink = col ? inkOn(col) : "#fff";
    const outline = ink === "#fff" || ink.toLowerCase() === "#ffffff" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.6)";
    // A joined store's own name, and its banner line under it (Starter and up); else what it is ★ rating.
    const named = info?.brand && info.name ? info.name : l.text;
    const [main, second0] = nameLines(named);
    const stars = info?.rating ? `★ ${fmtNum(+info.rating.toFixed(1))}` : "";
    const second = second0 ?? (brand?.tagline || (detail === "text" && wm >= 3.2 ? [t(KIND_LABEL[kind] ?? "Store"), stars].filter(Boolean).join("  ·  ") : undefined));
    const rtl = RTL.test(main);
    // The badge (the logo once the card has read it) on the reading side's start.
    const ix = rtl ? U - 52 : 52;
    const logo = detail === "text" ? this.image(info?.logo) : null;
    g.save();
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = 8;
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(ix, 50, 37, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = brand?.tier === "featured" ? "#f0c05a" : shade(top, -0.2);
    g.beginPath();
    g.arc(ix, 50, 37, 0, Math.PI * 2);
    g.stroke();
    if (logo) {
      g.save();
      g.beginPath();
      g.arc(ix, 50, 34, 0, Math.PI * 2);
      g.clip();
      const r = Math.min(68 / logo.width, 68 / logo.height), w = logo.width * r, h = logo.height * r;
      g.drawImage(logo, ix - w / 2, 50 - h / 2, w, h);
      g.restore();
    } else {
      g.font = `46px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#000";
      g.fillText(look.emoji, ix, 53);
    }
    const room = U - 128, mid = rtl ? (U - 104) / 2 : 104 + (U - 104) / 2;
    if (detail === "text") {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      const fit = (tx: string, size: number, min: number, weight = 800) => {
        g.font = `${weight} ${size}px ${FONT}`;
        while (size > min && g.measureText(tx).width > room) g.font = `${weight} ${(size -= 2)}px ${FONT}`;
        return size;
      };
      const pen = (tx: string, y: number, size: number) => {
        g.lineWidth = Math.max(3, size * 0.14);
        g.strokeStyle = outline;
        g.strokeText(tx, mid, y, room);
        g.fillStyle = ink;
        g.fillText(tx, mid, y, room);
      };
      g.direction = RTL.test(main) ? "rtl" : "ltr";
      const sz = fit(main, second ? 42 : 54, 20);
      pen(main, second ? 38 : 52, sz);
      if (second) {
        g.direction = RTL.test(second) ? "rtl" : "ltr";
        const s2 = fit(second, 24, 14, 700);
        g.globalAlpha = 0.92;
        pen(second, 75, s2);
        g.globalAlpha = 1;
      }
      g.direction = "ltr";
    } else {
      // Far: a bar the width of the name, nothing to read.
      g.fillStyle = "rgba(255,255,255,.55)";
      g.beginPath();
      g.roundRect(mid - room * 0.32, 40, room * 0.64, 20, 10);
      g.fill();
    }
    // Open: a bright lamp strip along the bottom; shut: a dark one, the sign dimmed.
    if (!open) (g.fillStyle = "rgba(0,0,0,.4)"), g.fillRect(0, 0, U, 100);
    g.fillStyle = open ? "#46ff94" : "#5a1414";
    g.fillRect(16, 92, U - 32, 3);
    // …and a tag you can read from the street: «باز» / «بسته» (Open / Closed), on the side away from the badge.
    if (detail === "text" && isShop(l.cls, main) && wm >= 2.4) {
      const tag = open ? t("Open") : t("Closed");
      g.font = `800 18px ${FONT}`;
      g.direction = getLocale() === "fa" ? "rtl" : "ltr";
      const tw = g.measureText(tag).width + 18, tx = rtl ? 12 : U - 12 - tw;
      g.fillStyle = open ? "#1f9d57" : "#8a2a2a";
      g.beginPath();
      g.roundRect(tx, 10, tw, 22, 11);
      g.fill();
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(tag, tx + tw / 2, 21.5);
      g.direction = "ltr";
    }
    if (info?.deal && detail === "text") {
      const dx = rtl ? 12 : U - 74;
      g.save();
      g.translate(dx + 30, 76);
      g.rotate(-0.12);
      g.fillStyle = "#ffd23f";
      g.beginPath();
      g.roundRect(-30, -13, 60, 26, 7);
      g.fill();
      g.fillStyle = "#3a2600";
      g.font = `800 20px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.direction = "ltr";
      g.fillText(`−${fmtNum(info.deal)}%`.replace("٪", "%"), 0, 1);
      g.restore();
    }
    g.restore();
  }

  /** Open now, per store, worked out once a minute (the Intl clock behind it is costly, and syncs come many times a second). */
  /** Stores whose keeper pulled the shutter down (gunfire nearby), until this time (performance.now ms). */
  private panicUntil = new Map<string, number>();
  /**
   * Shots or a blast by these stores: shutters down, sign dimmed, for `secs`. The next sync
   * redraws them shut; when the time is up they open again (if their hours say so).
   */
  panic(ids: string[], secs: number) {
    const until = performance.now() + secs * 1000;
    for (const id of ids) this.panicUntil.set(id, Math.max(this.panicUntil.get(id) ?? 0, until));
    if (ids.length) this.openMin = -1;
  }

  private isOpen(id: string, kind: StoreKind, week: Week | null | undefined) {
    const p = this.panicUntil.get(id);
    if (p != null) {
      if (performance.now() < p) return false;
      this.panicUntil.delete(id);
      this.openMin = -1;
    }
    const now = this.now(), min = Math.floor(now.getTime() / 60_000);
    if (min !== this.openMin) (this.openMemo.clear(), (this.openMin = min));
    let o = this.openMemo.get(id);
    if (o === undefined) this.openMemo.set(id, (o = storeOpen(kind, week, now)));
    return o;
  }

  /** A store's rating once its card has been read (null: not known). */
  ratingOf(id: string) {
    return this.infos.get(id)?.rating ?? null;
  }

  /** What's known about a store (its card read): its sign gets the logo and a deal tag; the panel its menu. */
  setInfo(id: string, info: StorePanel) {
    this.infos.set(id, info);
    this.openMemo.delete(id);
    const s = this.slots.get(id);
    if (s) s.sig = "";
    if (this.panel.id === id) this.panel.sig = "";
    this.image(info.logo);
    this.image(info.photo);
    this.dirty = true;
  }

  /**
   * The shops within reach, nearest first (`d` = metres from the player). Builds / drops signs and
   * dressed fronts to the tier's caps. Call a few times a second.
   */
  sync(list: ShopLabel[]) {
    const now = this.now();
    const shops = list.filter((l) => signDetail(l.d) !== "none").slice(0, this.cap.signs);
    const keep = new Set(shops.map((l) => l.id));
    for (const [id, s] of this.slots) if (!keep.has(id)) (this.free.push(s.row * this.cols + s.col), this.slots.delete(id));
    let redraws = 0;
    this.order = shops;
    const dressed: Dressed[] = [];
    for (const l of shops) {
      const kind = storeKind(l.cls, nameLines(l.text)[0]);
      const info = this.infos.get(l.id);
      const open = this.isOpen(l.id, kind, info?.week);
      let s = this.slots.get(l.id);
      if (!s) {
        const n = this.free.pop();
        if (n == null) continue;
        s = { id: l.id, col: n % this.cols, row: Math.floor(n / this.cols), sig: "", sw: 0 };
        this.slots.set(l.id, s);
      }
      const detail = signDetail(l.d) === "text" && this.fontReady ? "text" : "bar";
      const sig = `${detail}|${open ? 1 : 0}|${this.fontReady ? 1 : 0}|${l.w.toFixed(1)}`;
      if (s.sig !== sig && redraws < 10) {
        s.sig = sig;
        redraws++;
        this.drawSign(s, l, kind, open, detail);
        this.dirty = true;
      }
      if (!l.pole && dressed.length < this.cap.dressed && l.d < (branded(info) ? 120 : 70)) dressed.push({ l, kind, open, fx: Math.sin(l.angle), fz: Math.cos(l.angle), seed: dressed.length + (l.x * 7 + l.z * 13) % 5 });
    }
    this.dressed = dressed;
    // Windows: a slot per dressed front, kept while it stays dressed, redrawn when what it shows changes (its photo
    // arrived) — a few a call, so a street coming into view doesn't stall a frame.
    const wantWin = new Set(dressed.map((d) => d.l.id));
    for (const [id, w] of this.winSlots) if (!wantWin.has(id)) (this.winFree.push(w.n), this.winSlots.delete(id));
    let winDraws = 0;
    for (const d of dressed) {
      let w = this.winSlots.get(d.l.id);
      if (!w) {
        const n = this.winFree.pop();
        if (n == null) continue;
        this.winSlots.set(d.l.id, (w = { n, sig: "" }));
      }
      const info = this.infos.get(d.l.id), photo = this.image(info?.photo);
      const f = frontOf(d.l), aspect = (f.wm * 0.88) / f.wh;
      const sig = `${d.kind}|${d.l.cls ?? ""}|${photo ? info!.photo : ""}|${aspect.toFixed(1)}`;
      if (w.sig !== sig && winDraws < 4) {
        w.sig = sig;
        winDraws++;
        this.drawWindow(w.n, isShop(d.l.cls, nameLines(d.l.text)[0]) ? d.kind : "office", aspect, idSeed(d.l.id), photo);
      }
    }
    if (this.winDirty) ((this.winDirty = false), (this.win.tex.needsUpdate = true));
    // The reveal: an open store you come up to for the first time lights its sign up for you.
    const nowMs = performance.now();
    for (const l of shops) {
      if (l.d >= REVEAL_M || this.revealed.has(l.id)) continue;
      if (!this.isOpen(l.id, storeKind(l.cls, nameLines(l.text)[0]), this.infos.get(l.id)?.week)) continue;
      this.revealed.set(l.id, nowMs);
      if (!this.reduceMotion) this.revealing.push(l.id);
    }
    this.layout();
    this.billboards.sync(list, this.infos, (l) => this.isOpen(l.id, storeKind(l.cls, nameLines(l.text)[0]), this.infos.get(l.id)?.week), this.fontReady);
    if (this.dirty && performance.now() - this.lastUpload > 350) {
      this.dirty = false;
      this.lastUpload = performance.now();
      this.atlas.tex.needsUpdate = true;
    }
  }

  setNight(k: number) {
    if (Math.abs(k - this.night) < 0.02) return;
    this.night = k;
    (this.signs.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + k * 2.1;
    this.billboards.setNight(k);
    this.tintWindows();
  }

  /** Window glass and shutters follow the light: dim glass by day, the kind's glow at night, dark when shut. */
  private tintWindows() {
    for (let i = 0; i < this.dressed.length; i++) {
      const d = this.dressed[i], look = STORE_LOOK[d.kind];
      const glow = TMP_C.set(look.glow);
      // (By day the window still has to show its goods: the shop's lights are on behind the glass.)
      const day = WIN_DAY, lit = d.open ? day + (1.15 - day) * this.night : 0;
      this.glass.setColorAt(i, glow.multiplyScalar(Math.max(0.05, lit)));
      this.shutters.setColorAt(i, TMP_C.setScalar(0.5 - this.night * 0.38));
      // The pavement in front catches it after dark.
      this.spill.setColorAt(i, d.open ? TMP_C.set(look.glow).multiplyScalar(this.night * 0.32) : TMP_C.setScalar(0));
    }
    if (this.spill.instanceColor) this.spill.instanceColor.needsUpdate = true;
    if (this.glass.instanceColor) this.glass.instanceColor.needsUpdate = true;
    if (this.shutters.instanceColor) this.shutters.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- layout (when the set changes)
  private place(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1, pitch = 0) {
    TMP_Q.setFromEuler(TMP_E.set(pitch, yaw, 0, "YXZ"));
    m.setMatrixAt(i, TMP_M.compose(TMP_P.set(x, y, z), TMP_Q, TMP_S.set(sx, sy, sz)));
  }

  private layout() {
    // Signs (a second, turned face on pole signs).
    const slotAttr = this.signs.geometry.getAttribute("aSlot") as THREE.InstancedBufferAttribute;
    this.idOf.length = 0;
    let n = 0, b = 0, p = 0;
    const { SW, SH } = this;
    const W = SW * this.cols, H = SH * Math.ceil(this.cap.signs / this.cols);
    for (const l of this.order) {
      const s = this.slots.get(l.id);
      if (!s) continue;
      const wm = signW(l.w), fx = Math.sin(l.angle), fz = Math.cos(l.angle);
      const kind = storeKind(l.cls, nameLines(l.text)[0]);
      const open = this.isOpen(l.id, kind, this.infos.get(l.id)?.week);
      for (const back of l.pole ? [false, true] : [false]) {
        const o = back ? -0.07 : 0.07;
        this.place(this.signs, n, l.x + fx * o, l.y, l.z + fz * o, l.angle + (back ? Math.PI : 0), wm, 1, 1);
        slotAttr.setXYZW(n, (s.col * SW + 1) / W, 1 - ((s.row + 1) * SH - 1) / H, (SW - 2) / W, (SH - 2) / H);
        this.signLit[n] = open ? 1 : 0.2;
        this.litAttr.setX(n, this.signLit[n]);
        this.idOf[n++] = l.id;
      }
      this.place(this.backs, b++, l.x, l.y, l.z, l.angle, wm + 0.08, 1.08, 0.12);
      if (l.pole) this.place(this.poles, p++, l.x, l.y - 0.5, l.z, 0, 1, l.y - 0.5, 1);
    }
    this.signs.count = n;
    this.backs.count = b;
    this.poles.count = p;
    for (const m of [this.signs, this.backs, this.poles]) m.instanceMatrix.needsUpdate = true;
    slotAttr.needsUpdate = true;
    this.litAttr.needsUpdate = true;

    // Dressed fronts.
    this.glassOf.clear();
    const cnt = { awn: 0, glass: 0, shut: 0, crate: 0, prod: 0, menu: 0, neon: 0, cross: 0, garm: 0, screen: 0, steam: 0, rug: 0, samovar: 0 };
    this.neonList.length = this.crossList.length = this.screenList.length = this.steamSrc.length = 0;
    const R = (seed: number, k: number) => Math.abs(Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1;
    const crateCols = ["#c28a4a", "#a8743a", "#d9a05b"], fruit = ["#e0412b", "#f08a1e", "#5cb83a", "#e8c42a", "#b3262b"];
    for (const d of this.dressed) {
      const { l, kind, fx, fz, seed } = d, look = STORE_LOOK[kind];
      const wm = Math.max(2.6, Math.min(7.5, l.w)), rx = fz, rz = -fx; // along the wall (right of the facing direction)
      const yA = Math.max(2.3, l.y - 0.62);
      // The awning: pitched down away from the wall, its lip hanging at the front edge.
      const ai = cnt.awn++;
      this.place(this.awnings, ai, l.x + fx * 0.1, yA, l.z + fz * 0.1, l.angle, wm, 1, 1.05, 0.3);
      // A joined store's awning is in its own colour.
      const awn = (branded(this.infos.get(l.id)) && this.infos.get(l.id)!.brand!.color) || look.awning;
      this.awnings.setColorAt(ai, TMP_C.set(awn));
      this.place(this.lips, ai, l.x + fx * 1.04, yA - 0.34, l.z + fz * 1.04, l.angle, wm, 1, 1);
      this.lips.setColorAt(ai, TMP_C.set(awn));
      // Display window below it, or the rolled shutter.
      const wh = Math.max(0.8, yA - 0.2 - 0.25), wy = 0.25 + wh / 2;
      const gi = cnt.glass++, si = cnt.shut++;
      this.place(this.glass, gi, l.x + fx * 0.05, wy, l.z + fz * 0.05, l.angle, wm * 0.88, d.open ? wh : 0.0001, 1);
      // Its own slot of the window atlas (its photo or its trade's interior).
      const ws = this.winSlots.get(l.id), WA = this.win.cols * WW, HA = this.win.rows * WH;
      if (ws) this.winAttr.setXYZW(gi, ((ws.n % this.win.cols) * WW + 1) / WA, 1 - ((Math.floor(ws.n / this.win.cols) + 1) * WH - 1) / HA, (WW - 2) / WA, (WH - 2) / HA);
      this.glassOf.set(l.id, gi);
      // Its light on the pavement (lit in tintWindows, by night).
      this.place(this.spill, gi, l.x + fx * 0.08, KERB_H + 0.015, l.z + fz * 0.08, l.angle, wm * 1.15, 1, 2.6);
      this.place(this.shutters, si, l.x + fx * 0.06, wy, l.z + fz * 0.06, l.angle, wm * 0.88, d.open ? 0.0001 : wh, 1);
      // Props.
      const ground = (o: number) => ({ x: l.x + fx * 1.0 + rx * o, z: l.z + fz * 1.0 + rz * o });
      for (const prop of isShop(l.cls, nameLines(l.text)[0]) ? look.props : []) {
        if (prop === "crates") {
          const g0 = ground(wm * 0.28);
          if (this.blocked(g0.x, g0.z)) continue;
          for (let k = 0; k < 2 && cnt.crate < this.crates.instanceMatrix.count - 1; k++) {
            const o = wm * (0.12 + k * 0.17) * (k ? 1.4 : 1), g = ground(o);
            const ci = cnt.crate++;
            this.place(this.crates, ci, g.x, 0.16 + (k ? 0.32 : 0), g.z, l.angle + (R(seed, k) - 0.5) * 0.3, 1, 1, 1);
            this.crates.setColorAt(ci, TMP_C.set(crateCols[Math.floor(R(seed, k + 3) * 3)]));
            const pi = cnt.prod++;
            this.place(this.produce, pi, g.x, 0.4 + (k ? 0.32 : 0), g.z, l.angle, 1, 1, 1);
            this.produce.setColorAt(pi, TMP_C.set(kind === "bakery" ? "#d9a45a" : fruit[Math.floor(R(seed, k + 7) * 5)]));
          }
        } else if (prop === "menu") {
          const g = ground(-wm * 0.3);
          if (this.blocked(g.x, g.z) || cnt.menu >= this.dressed.length) continue;
          this.place(this.menus, cnt.menu++, g.x, 0.45, g.z, l.angle + 0.15, 1, 1, 1, -0.12);
        } else if (prop === "neon") {
          const ni = cnt.neon++;
          this.place(this.neons, ni, l.x + fx * 0.25 + rx * wm * 0.46, yA - 0.7, l.z + fz * 0.25 + rz * wm * 0.46, 0);
          this.neonList.push({ i: ni, seed, col: new THREE.Color(kind === "cafe" ? "#ffa04a" : "#ff6fb5") });
        } else if (prop === "cross") {
          const ci = cnt.cross++;
          this.crossList.push({ i: ci, x: l.x + fx * 0.5 + rx * wm * 0.5, y: l.y + 0.2, z: l.z + fz * 0.5 + rz * wm * 0.5, ang: seed });
        } else if (prop === "rack") {
          for (let k = 0; k < 4 && cnt.garm < this.garments.instanceMatrix.count; k++) {
            const gi2 = cnt.garm++;
            this.place(this.garments, gi2, l.x + fx * 0.14 + rx * (k - 1.5) * wm * 0.18, 1.35, l.z + fz * 0.14 + rz * (k - 1.5) * wm * 0.18, l.angle, 1, 1, 1);
            this.garments.setColorAt(gi2, TMP_C.setHSL(R(seed, k), 0.55, 0.5));
          }
        } else if (prop === "rug") {
          // Hung on the wall beside the window, the way carpet and fabric shops show them.
          if (cnt.rug >= this.rugs.instanceMatrix.count) continue;
          const side = R(seed, 11) < 0.5 ? -1 : 1, o = side * (wm * 0.44 + 0.55);
          this.place(this.rugs, cnt.rug++, l.x + fx * 0.07 + rx * o, 1.3, l.z + fz * 0.07 + rz * o, l.angle);
        } else if (prop === "samovar") {
          // On the window sill outside: tea's on.
          if (cnt.samovar >= this.samovars.instanceMatrix.count) continue;
          const o = (R(seed, 13) < 0.5 ? -1 : 1) * wm * 0.3;
          this.place(this.samovars, cnt.samovar++, l.x + fx * 0.32 + rx * o, 0.78, l.z + fz * 0.32 + rz * o, l.angle, 1, 1, 1);
        } else if (prop === "screen") {
          const si2 = cnt.screen++;
          this.place(this.screens, si2, l.x + fx * 0.12, 1.4, l.z + fz * 0.12, l.angle);
          this.screenList.push({ i: si2, seed });
        } else if (prop === "steam" && this.steamSrc.length * 4 < this.steam.instanceMatrix.count - 3 && this.steamSrc.length < this.cap.steam) {
          this.steamSrc.push({ x: l.x + fx * 0.5 + rx * wm * 0.35, y: yA + 0.3, z: l.z + fz * 0.5 + rz * wm * 0.35, seed });
        }
      }
    }
    this.awnings.count = this.lips.count = cnt.awn;
    this.glass.count = this.spill.count = cnt.glass;
    this.winAttr.needsUpdate = true;
    this.spill.instanceMatrix.needsUpdate = true;
    // Deal medals: the nearest open fronts with a discount, by the end of their sign.
    let mi = 0;
    for (const d of this.dressed) {
      if (mi >= this.medals.length) break;
      const pct = d.open ? dealPercent(this.infos.get(d.l.id)) : null;
      if (pct == null) continue;
      // On the sign's top corner, a little proud of it: seen from the front, not only from the side.
      const m = this.medals[mi++], { l, fx, fz } = d, off = signW(l.w) / 2 - 0.15;
      (m.id = l.id), (m.x = l.x + fx * 0.35 + fz * off), (m.y = l.y + 0.5), (m.z = l.z + fz * 0.35 - fx * off), (m.seed = idSeed(l.id) % 7);
      m.mesh.rotation.y = l.angle;
      if (m.pct !== pct) {
        m.pct = pct;
        m.face.map = m.face.emissiveMap = this.medalTexture(pct);
        m.face.needsUpdate = true;
      }
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.visible = true;
    }
    for (; mi < this.medals.length; mi++) (this.medals[mi].id = null), (this.medals[mi].mesh.visible = false);
    this.shutters.count = cnt.shut;
    this.crates.count = cnt.crate;
    this.produce.count = cnt.prod;
    this.menus.count = cnt.menu;
    this.neons.count = cnt.neon;
    this.crosses.count = cnt.cross;
    this.garments.count = cnt.garm;
    this.screens.count = cnt.screen;
    this.rugs.count = cnt.rug;
    this.samovars.count = cnt.samovar;
    this.steam.count = this.steamSrc.length * 4;
    for (const m of [this.awnings, this.lips, this.glass, this.shutters, this.crates, this.produce, this.menus, this.neons, this.garments, this.screens, this.rugs, this.samovars]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.tintWindows();
  }

  // ---------------------------------------------------------------- every frame
  /** Steam, neon, the turning cross, the panel's pop. `cam`: the camera (steam faces it). */
  update(t: number, dt: number, cam: THREE.Camera) {
    if (!this.group.visible) return;
    const motion = this.reduceMotion ? 0 : 1;
    // Neon: steady with a stutter, brighter at night.
    if (this.neonList.length) {
      for (const n of this.neonList) {
        const f = this.reduceMotion ? 1 : neonFlicker(n.seed, t);
        this.neons.setColorAt(n.i, TMP_C.copy(n.col).multiplyScalar((0.55 + this.night * 1.6) * f));
      }
      if (this.neons.instanceColor) this.neons.instanceColor.needsUpdate = true;
    }
    // The pharmacy cross turns about the vertical.
    if (this.crossList.length) {
      for (const c of this.crossList) {
        this.place(this.crosses, c.i, c.x, c.y, c.z, t * 1.4 * motion + c.ang);
      }
      this.crosses.instanceMatrix.needsUpdate = true;
      (this.crosses.material as THREE.MeshBasicMaterial).color.setScalar(0.9 + this.night * 1.4).multiply(TMP_C.set("#3dff9a"));
    }
    // Shop screens: a slow colour drift.
    if (this.screenList.length) {
      for (const s of this.screenList) this.screens.setColorAt(s.i, TMP_C.setHSL((t * 0.05 + s.seed * 0.13) % 1, 0.5, 0.35 + this.night * 0.25));
      if (this.screens.instanceColor) this.screens.instanceColor.needsUpdate = true;
    }
    // Steam: puffs rise from each source, grow and fade; they face the camera.
    if (this.steamSrc.length && motion) {
      const q = cam.quaternion;
      for (let s = 0; s < this.steamSrc.length; s++) {
        const src = this.steamSrc[s];
        for (let k = 0; k < 4; k++) {
          const ph = (t * 0.22 + k / 4 + src.seed * 0.37) % 1;
          TMP_M.compose(TMP_P.set(src.x + Math.sin(ph * 6 + k) * 0.12, src.y + ph * 1.5, src.z), q, TMP_S.setScalar(0.25 + ph * 0.7));
          this.steam.setMatrixAt(s * 4 + k, TMP_M);
          this.steam.setColorAt(s * 4 + k, TMP_C.setScalar((1 - ph) * (0.16 + this.night * 0.1)));
        }
      }
      this.steam.instanceMatrix.needsUpdate = true;
      if (this.steam.instanceColor) this.steam.instanceColor.needsUpdate = true;
    }
    this.reveal();
    // Deal medals turn and bob by their sign.
    for (const m of this.medals) {
      if (!m.id) continue;
      m.mesh.position.y = m.y + Math.sin(t * 2.2 + m.seed) * 0.06 * motion;
      if (motion) m.mesh.rotation.y = t * 1.7 + m.seed;
      m.face.emissiveIntensity = 0.25 + this.night * 0.9;
    }
    this.billboards.update(t);
    this.updatePanel(dt, cam);
  }

  /**
   * Stores lighting up for you (sync starts them): their sign stutters on and surges (lib/storeReveal.ts ignition) —
   * by day the surge is stronger, or it wouldn't show in the sun — and the window's lights come up with it.
   */
  private reveal() {
    if (!this.revealing.length) return;
    const now = performance.now(), day = 1 - this.night;
    for (let n = 0; n < this.signs.count; n++) {
      const at = this.revealed.get(this.idOf[n]);
      if (at == null || !this.revealing.includes(this.idOf[n])) continue;
      const ig = ignition((now - at) / 1000);
      this.litAttr.setX(n, this.signLit[n] * (ig > 1 ? 1 + (ig - 1) * (1 + 3 * day) : ig));
    }
    this.litAttr.needsUpdate = true;
    let glassTouched = false;
    for (const id of this.revealing) {
      const gi = this.glassOf.get(id), d = gi != null ? this.dressed[gi] : undefined;
      if (gi == null || !d || d.l.id !== id || !d.open) continue;
      const ig = ignition((now - this.revealed.get(id)!) / 1000), base = WIN_DAY + (1.15 - WIN_DAY) * this.night;
      this.glass.setColorAt(gi, TMP_C.set(STORE_LOOK[d.kind].glow).multiplyScalar(base * Math.max(0.3, ig)));
      glassTouched = true;
    }
    if (glassTouched && this.glass.instanceColor) this.glass.instanceColor.needsUpdate = true;
    this.revealing = this.revealing.filter((id) => now - this.revealed.get(id)! < REVEAL_S * 1000);
    // (Done: every sign and window back to its own level.)
    if (!this.revealing.length) {
      for (let n = 0; n < this.signs.count; n++) this.litAttr.setX(n, this.signLit[n]);
      this.litAttr.needsUpdate = true;
      this.tintWindows();
    }
  }

  // ---------------------------------------------------------------- the panel
  /** Show the panel at this store (null: put it away). */
  showPanel(id: string | null) {
    const p = this.panel;
    p.want = id ? 1 : 0;
    if (id && id !== p.id) {
      p.id = id;
      p.sig = "";
      p.k = Math.min(p.k, 0.2);
    }
  }

  private updatePanel(dt: number, cam: THREE.Camera) {
    const p = this.panel;
    // A spring-ish pop: quick to open (with a little overshoot), faster to close.
    p.k += (p.want - p.k) * Math.min(1, dt * (p.want ? 9 : 14));
    if (p.want === 0 && p.k < 0.01) {
      p.mesh.visible = false;
      return;
    }
    const l = p.id ? (this.order.find((o) => o.id === p.id) ?? null) : null;
    if (!l) {
      p.mesh.visible = false;
      return;
    }
    if (l !== p.label || !p.sig) this.drawPanel(l);
    p.label = l;
    const fx = Math.sin(l.angle), fz = Math.cos(l.angle);
    const d = l.d, big = Math.max(1, Math.min(2.2, d / 11));
    const ease = this.reduceMotion ? p.k : p.k * (1 + 0.12 * Math.sin(p.k * Math.PI));
    p.mesh.visible = true;
    p.mat.opacity = Math.min(1, p.k * 1.4);
    const bob = this.reduceMotion ? 0 : Math.sin(performance.now() / 900) * 0.05;
    p.mesh.position.set(l.x + fx * (l.pole ? 0.7 : 1.7), 1.95 * big * 0.7 + bob, l.z + fz * (l.pole ? 0.7 : 1.7));
    p.mesh.scale.setScalar(Math.max(0.01, ease) * big);
    // Faces the camera about the vertical.
    p.mesh.rotation.set(0, Math.atan2(cam.position.x - p.mesh.position.x, cam.position.z - p.mesh.position.z), 0);
  }

  private drawPanel(l: ShopLabel) {
    const p = this.panel, g = p.g, info = this.infos.get(l.id) ?? {};
    const kind = storeKind(l.cls, nameLines(l.text)[0]), look = STORE_LOOK[kind];
    const open = this.isOpen(l.id, kind, info.week);
    p.sig = "x";
    const rtl = getLocale() === "fa";
    const W = 512, H = 640;
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.roundRect(6, 6, W - 12, H - 12, 36);
    g.clip();
    g.fillStyle = "rgba(14,16,24,.94)";
    g.fillRect(0, 0, W, H);
    // Header: the store's photo (if its card was read) under the trade colour.
    const photo = this.image(info.photo);
    const hg = g.createLinearGradient(0, 0, 0, 170);
    hg.addColorStop(0, look.sign[0]);
    hg.addColorStop(1, look.sign[1]);
    g.fillStyle = hg;
    g.fillRect(0, 0, W, 170);
    if (photo) {
      g.globalAlpha = 0.55;
      const r = Math.max(W / photo.naturalWidth, 170 / photo.naturalHeight);
      g.drawImage(photo, (W - photo.naturalWidth * r) / 2, (170 - photo.naturalHeight * r) / 2, photo.naturalWidth * r, photo.naturalHeight * r);
      g.globalAlpha = 1;
      const sh = g.createLinearGradient(0, 70, 0, 170);
      sh.addColorStop(0, "rgba(0,0,0,0)");
      sh.addColorStop(1, "rgba(0,0,0,.7)");
      g.fillStyle = sh;
      g.fillRect(0, 0, W, 170);
    }
    const name = info.name || nameLines(l.text)[0];
    g.textBaseline = "middle";
    g.textAlign = rtl ? "right" : "left";
    const px = rtl ? W - 30 : 30;
    g.direction = RTL.test(name) ? "rtl" : "ltr";
    g.fillStyle = "#fff";
    g.shadowColor = "rgba(0,0,0,.6)";
    g.shadowBlur = 8;
    let size = 46;
    g.font = `800 ${size}px ${FONT}`;
    while (size > 24 && g.measureText(name).width > W - 130) g.font = `800 ${(size -= 2)}px ${FONT}`;
    g.fillText(name, px - (rtl ? 70 : -70), 108);
    g.shadowBlur = 0;
    g.font = `54px ${FONT}`;
    g.textAlign = "center";
    g.fillText(look.emoji, rtl ? W - 56 : 56, 106);
    // Rating and open now.
    g.direction = rtl ? "rtl" : "ltr";
    g.textAlign = rtl ? "right" : "left";
    g.font = `700 30px ${FONT}`;
    g.fillStyle = "#ffd23f";
    let y = 206;
    const rateText = info.rating ? `★ ${fmtNum(info.rating)}${info.reviews ? ` (${fmtNum(info.reviews)})` : ""}` : "";
    if (rateText) g.fillText(rateText, px, y);
    const pill = open ? t("Open now") : t("Closed now");
    g.font = `800 26px ${FONT}`;
    const pw = g.measureText(pill).width + 34, ppx = rtl ? 30 : W - 30 - pw;
    g.fillStyle = open ? "#1f9d57" : "#8a2a2a";
    g.beginPath();
    g.roundRect(ppx, y - 20, pw, 40, 20);
    g.fill();
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.fillText(pill, ppx + pw / 2, y + 1);
    // A deal.
    y = 262;
    if (info.deal) {
      g.fillStyle = "#ffd23f";
      g.beginPath();
      g.roundRect(30, y - 24, W - 60, 48, 14);
      g.fill();
      g.fillStyle = "#3a2600";
      g.font = `800 28px ${FONT}`;
      g.textAlign = "center";
      g.fillText(`🏷️ ${t("Up to {n}% off", { n: fmtNum(info.deal) })}`, W / 2, y + 1);
      y += 58;
    }
    // The menu's first lines.
    const items = info.items?.length ? info.items : info.menuSections ? menuHighlights(info.menuSections, info.deal ? 3 : 4) : [];
    g.font = `700 26px ${FONT}`;
    for (const it of items.slice(0, info.deal ? 3 : 4)) {
      y += 52;
      g.fillStyle = "rgba(255,255,255,.08)";
      g.fillRect(30, y - 24, W - 60, 1);
      g.fillStyle = "#f2f4f8";
      g.textAlign = rtl ? "right" : "left";
      g.direction = RTL.test(it.title) ? "rtl" : "ltr";
      let title = it.title;
      while (title.length > 6 && g.measureText(title).width > W - 60 - 170) title = title.slice(0, -2);
      if (title !== it.title) title += "…";
      g.fillText(title, px, y);
      g.fillStyle = "#9ff0c0";
      g.textAlign = rtl ? "left" : "right";
      g.direction = rtl ? "rtl" : "ltr";
      g.fillText(t("{n} toman", { n: fmtNum(it.price) }), rtl ? 30 : W - 30, y);
    }
    if (!items.length) {
      // No menu online (most walk-in stores): what this kind of store usually has, as a list of
      // chips — not "nothing here" — and the card (tap) has the searches for the real one.
      g.direction = rtl ? "rtl" : "ltr";
      g.textAlign = rtl ? "right" : "left";
      g.fillStyle = "rgba(255,255,255,.6)";
      g.font = `600 24px ${FONT}`;
      y += 48;
      g.fillText(info.rating || info.week ? t("Menu not online · usually here:") : t("Looking it up… usually here:"), px, y);
      g.font = `700 26px ${FONT}`;
      let cx = px;
      y += 50;
      for (const w of usuallyAt(kind, this.at)) {
        const label = t(w), cw = g.measureText(label).width + 30;
        if (rtl ? cx - cw < 30 : cx + cw > W - 30) {
          if (y > H - 150) break;
          (cx = px), (y += 52);
        }
        g.fillStyle = "rgba(255,255,255,.1)";
        g.beginPath();
        g.roundRect(rtl ? cx - cw : cx, y - 21, cw, 42, 21);
        g.fill();
        g.fillStyle = "#f2f4f8";
        g.textAlign = "center";
        g.fillText(label, rtl ? cx - cw / 2 : cx + cw / 2, y + 1);
        cx += rtl ? -(cw + 10) : cw + 10;
      }
    }
    g.fillStyle = "rgba(255,255,255,.7)";
    g.font = `600 24px ${FONT}`;
    g.textAlign = "center";
    g.direction = rtl ? "rtl" : "ltr";
    g.fillText(t("Tap for the full card"), W / 2, H - 38);
    g.restore();
    p.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- picking
  /** The store whose sign the ray hits (and how far), or null. */
  pick(ray: THREE.Raycaster): { id: string; distance: number } | null {
    if (!this.group.visible) return null;
    const board = this.billboards.pick(ray);
    const hit = this.signs.count ? ray.intersectObject(this.signs, false)[0] : undefined;
    const id = hit?.instanceId != null ? this.idOf[hit.instanceId] : undefined;
    const sign = id && hit ? { id, distance: hit.distance } : null;
    return board && (!sign || board.distance < sign.distance) ? board : sign;
  }

  /**
   * The nearest open store within `maxM` of (x, z) that hasn't called out in a while: where its
   * door is (a step out from the sign), its name and trade. For the shopkeeper's call.
   */
  nearestOpen(x: number, z: number, maxM: number, skip: (id: string) => boolean): { id: string; name: string; kind: StoreKind; x: number; z: number } | null {
    let best: ShopLabel | null = null, bd = maxM * maxM;
    for (const l of this.order) {
      const d = (l.x - x) ** 2 + (l.z - z) ** 2;
      if (d >= bd || skip(l.id)) continue;
      const name = this.infos.get(l.id)?.name || nameLines(l.text)[0];
      if (!isShop(l.cls, name)) continue;
      if (!this.isOpen(l.id, storeKind(l.cls, name), this.infos.get(l.id)?.week)) continue;
      (best = l), (bd = d);
    }
    if (!best) return null;
    const name = this.infos.get(best.id)?.name || nameLines(best.text)[0];
    // Out from the façade, toward the street: the sign faces along its angle's normal.
    const nx = Math.sin(best.angle), nz = Math.cos(best.angle);
    return { id: best.id, name, kind: storeKind(best.cls, name), x: best.x + nx * 1.2, z: best.z + nz * 1.2 };
  }

  /**
   * The open stores within `maxM` of (x, z), nearest first (at most `max`): each one's door spot
   * (a step out from the sign) and the way it faces (toward the street) — where its shopkeeper stands.
   */
  openNear(x: number, z: number, maxM: number, max: number): { id: string; kind: StoreKind; x: number; z: number; yaw: number }[] {
    const out: { id: string; kind: StoreKind; x: number; z: number; yaw: number; d: number }[] = [];
    const r2 = maxM * maxM;
    for (const l of this.order) {
      const d = (l.x - x) ** 2 + (l.z - z) ** 2;
      if (d >= r2) continue;
      const name = this.infos.get(l.id)?.name || nameLines(l.text)[0];
      if (!isShop(l.cls, name)) continue;
      const kind = storeKind(l.cls, name);
      if (!this.isOpen(l.id, kind, this.infos.get(l.id)?.week)) continue;
      const nx = Math.sin(l.angle), nz = Math.cos(l.angle);
      // Facing out: the person's forward (−z) turned to the sign's normal.
      // A joined store (Starter and up) always has its shopkeeper out: it sorts as if much nearer.
      out.push({ id: l.id, kind, x: l.x + nx * 1.2, z: l.z + nz * 1.2, yaw: Math.atan2(-nx, -nz), d: branded(this.infos.get(l.id)) ? d * 0.04 : d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, max).map(({ d: _d, ...o }) => o);
  }

  /** A store's sign spot (to find it again by id). */
  labelOf(id: string) {
    return this.order.find((o) => o.id === id) ?? null;
  }

  /** The dish a store is known for, once its card has been read (its popular list's top, else the first priced line). */
  bestDish(id: string): { title: string; price: number } | null {
    const info = this.infos.get(id);
    if (!info) return null;
    const f = info.menuSections?.length ? favourite(info.menuSections as MenuSection[]) : null;
    if (f) return { title: f.title, price: f.priceNow || f.price };
    const it = info.items?.find((i) => i.price > 0);
    return it ? { title: it.title, price: it.price } : null;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const o of this.owned) o.dispose();
    this.atlas.tex.dispose();
    for (const tex of this.medalTex.values()) tex.dispose();
    this.billboards.dispose();
    for (const m of this.group.children) if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
  }
}
