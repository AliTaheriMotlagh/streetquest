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
//  - one floating panel by the store you're passing (name, rating, open now, a deal, the first
//    menu lines) that pops in and out.
// Everything is instanced and pooled; counts are capped by the quality tier. No per-frame allocation.
import * as THREE from "three";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import type { Week } from "@/lib/localData";
import { isShop, menuHighlights, neonFlicker, signDetail, STORE_LOOK, storeKind, storefrontCap, storeOpen, usuallyAt, type StoreKind } from "@/lib/storeKinds";
import { patchShader, after } from "./graphics/shaders";
import { nameLines } from "./trades";

const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, -apple-system, "Segoe UI", sans-serif`;
const RTL = /[֐-ࣿ]/;
/** Atlas slot, pixels. A sign is drawn 100 units per metre tall, whatever its width, so text is never stretched. */
const SW = 512, SH = 128;

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
};

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
  private signLit: number[] = [];
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
    const glassTex = own(this.windowTexture(false));
    this.glass = this.mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: glassTex })), D, true);
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

  private drawSign(s: Slot, l: ShopLabel, kind: StoreKind, open: boolean, detail: "text" | "bar") {
    const g = this.atlas.g, look = STORE_LOOK[kind], info = this.infos.get(l.id);
    const x0 = s.col * SW, y0 = s.row * SH, wm = Math.max(2.6, Math.min(7.5, l.w)), U = wm * 100;
    g.save();
    g.beginPath();
    g.rect(x0, y0, SW, SH);
    g.clip();
    g.setTransform(SW / U, 0, 0, SH / 100, x0, y0);
    const grd = g.createLinearGradient(0, 0, 0, 100);
    grd.addColorStop(0, look.sign[0]);
    grd.addColorStop(1, look.sign[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, U, 100);
    g.strokeStyle = "rgba(255,255,255,.4)";
    g.lineWidth = 3;
    g.strokeRect(3, 3, U - 6, 94);
    const [main, second] = nameLines(l.text);
    const rtl = RTL.test(main);
    // Icon (the logo once the card has read it) on the reading side's start.
    const ix = rtl ? U - 50 : 50;
    const logo = detail === "text" ? this.image(info?.logo) : null;
    if (logo) {
      g.save();
      g.beginPath();
      g.roundRect(ix - 36, 14, 72, 72, 12);
      g.clip();
      g.fillStyle = "#fff";
      g.fillRect(ix - 36, 14, 72, 72);
      g.drawImage(logo, ix - 36, 14, 72, 72);
      g.restore();
    } else {
      g.font = `60px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff";
      g.fillText(look.emoji, ix, 52);
    }
    const room = U - 125, mid = rtl ? (U - 100) / 2 : 100 + (U - 100) / 2;
    if (detail === "text") {
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,.45)";
      g.shadowBlur = 4;
      const fit = (tx: string, size: number, min: number) => {
        g.font = `800 ${size}px ${FONT}`;
        while (size > min && g.measureText(tx).width > room) g.font = `800 ${(size -= 2)}px ${FONT}`;
      };
      g.direction = RTL.test(main) ? "rtl" : "ltr";
      fit(main, second ? 40 : 52, 22);
      g.fillText(main, mid, second ? 36 : 54, room);
      if (second) {
        g.direction = RTL.test(second) ? "rtl" : "ltr";
        fit(second, 26, 16);
        g.fillText(second, mid, 74, room);
      }
      g.shadowBlur = 0;
      g.direction = "ltr";
    } else {
      // Far: a bar the width of the name, nothing to read.
      g.fillStyle = "rgba(255,255,255,.55)";
      g.beginPath();
      g.roundRect(mid - room * 0.32, 40, room * 0.64, 20, 10);
      g.fill();
    }
    // Open: a bright lamp strip along the bottom; shut: a dark one, the sign dimmed.
    if (!open) (g.fillStyle = "rgba(0,0,0,.38)"), g.fillRect(0, 0, U, 100);
    g.fillStyle = open ? "#46ff94" : "#5a1414";
    g.fillRect(14, 90, U - 28, 4);
    // …and a tag you can read from the street: «باز» / «بسته» (Open / Closed), on the side away from the icon.
    if (detail === "text" && isShop(l.cls, main)) {
      const tag = open ? t("Open") : t("Closed");
      g.font = `800 20px ${FONT}`;
      g.direction = getLocale() === "fa" ? "rtl" : "ltr";
      const tw = g.measureText(tag).width + 20, tx = rtl ? 14 : U - 14 - tw;
      g.fillStyle = open ? "#1f9d57" : "#8a2a2a";
      g.beginPath();
      g.roundRect(tx, 64, tw, 24, 12);
      g.fill();
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(tag, tx + tw / 2, 77);
      g.direction = "ltr";
    }
    if (info?.deal && detail === "text") {
      const dx = rtl ? 14 : U - 78;
      g.fillStyle = "#ffd23f";
      g.beginPath();
      g.roundRect(dx, 8, 64, 30, 8);
      g.fill();
      g.fillStyle = "#3a2600";
      g.font = `800 22px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.direction = "ltr";
      g.fillText(`${fmtNum(info.deal)}٪`.replace("٪", "%"), dx + 32, 24);
    }
    g.restore();
  }

  /** Open now, per store, worked out once a minute (the Intl clock behind it is costly, and syncs come many times a second). */
  private isOpen(id: string, kind: StoreKind, week: Week | null | undefined) {
    const now = this.now(), min = Math.floor(now.getTime() / 60_000);
    if (min !== this.openMin) (this.openMemo.clear(), (this.openMin = min));
    let o = this.openMemo.get(id);
    if (o === undefined) this.openMemo.set(id, (o = storeOpen(kind, week, now)));
    return o;
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
      if (!l.pole && dressed.length < this.cap.dressed && l.d < 70) dressed.push({ l, kind, open, fx: Math.sin(l.angle), fz: Math.cos(l.angle), seed: dressed.length + (l.x * 7 + l.z * 13) % 5 });
    }
    this.dressed = dressed;
    this.layout();
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
    this.tintWindows();
  }

  /** Window glass and shutters follow the light: dim glass by day, the kind's glow at night, dark when shut. */
  private tintWindows() {
    for (let i = 0; i < this.dressed.length; i++) {
      const d = this.dressed[i], look = STORE_LOOK[d.kind];
      const glow = TMP_C.set(look.glow);
      const day = 0.28, lit = d.open ? day + (1.15 - day) * this.night : 0;
      this.glass.setColorAt(i, glow.multiplyScalar(Math.max(0.05, lit)));
      this.shutters.setColorAt(i, TMP_C.setScalar(0.5 - this.night * 0.38));
    }
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
    const W = SW * this.cols, H = SH * Math.ceil(this.cap.signs / this.cols);
    for (const l of this.order) {
      const s = this.slots.get(l.id);
      if (!s) continue;
      const wm = Math.max(2.6, Math.min(7.5, l.w)), fx = Math.sin(l.angle), fz = Math.cos(l.angle);
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
      this.awnings.setColorAt(ai, TMP_C.set(look.awning));
      this.place(this.lips, ai, l.x + fx * 1.04, yA - 0.34, l.z + fz * 1.04, l.angle, wm, 1, 1);
      this.lips.setColorAt(ai, TMP_C.set(look.awning));
      // Display window below it, or the rolled shutter.
      const wh = Math.max(0.8, yA - 0.2 - 0.25), wy = 0.25 + wh / 2;
      const gi = cnt.glass++, si = cnt.shut++;
      this.place(this.glass, gi, l.x + fx * 0.05, wy, l.z + fz * 0.05, l.angle, wm * 0.88, d.open ? wh : 0.0001, 1);
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
    this.glass.count = cnt.glass;
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
    this.updatePanel(dt, cam);
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
    if (!this.group.visible || !this.signs.count) return null;
    const hit = ray.intersectObject(this.signs, false)[0];
    if (hit?.instanceId == null) return null;
    const id = this.idOf[hit.instanceId];
    return id ? { id, distance: hit.distance } : null;
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
      out.push({ id: l.id, kind, x: l.x + nx * 1.2, z: l.z + nz * 1.2, yaw: Math.atan2(-nx, -nz), d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, max).map(({ d: _d, ...o }) => o);
  }

  /** A store's sign spot (to find it again by id). */
  labelOf(id: string) {
    return this.order.find((o) => o.id === id) ?? null;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const o of this.owned) o.dispose();
    this.atlas.tex.dispose();
    for (const m of this.group.children) if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
  }
}
