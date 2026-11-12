"use client";
// How Iran's street kit looks (streetKit.ts places it): drawn in code from the street, one plain
// vertex-coloured geometry per kind — instanced per tile like the rest of the furniture
// (world3d makeTemplates) — and the canvas-lettered signs at the crossings:
//  - Tehran's galvanised waste container on castors, and the rubbish bags left beside it;
//  - the Iran Post box (yellow, red pyramid roof, red pedestal), the electricity cabinet (cream, a
//    yellow warning plate), the telecom cabinet (کافو, grey), the payphone hood, the saqakhaneh;
//  - a median railing panel (green frame, yellow zigzag, on a kerb), a footbridge deck piece and
//    a stair tower;
//  - the white arrow sign (a plate per side, black chevron end) and the motorway's green gantry.
// +z of a cabinet faces the street; a railing / deck piece runs along local x.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DECK_M, DECK_Y, RAIL_M } from "./streetKit";

const tint = (g: THREE.BufferGeometry, c: string) => {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  const col = new THREE.Color(c), n = out.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  out.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return out;
};
/** A box w × h × d centred at (x, y, z), turned `rz` about z then `rx` about x. */
const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, rz = 0, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  return tint(g.translate(x, y, z), c);
};
/** A tapered box: `wb` × `db` at the foot, `wt` × `dt` at the top, flat faces. */
const taper = (wb: number, db: number, wt: number, dt: number, h: number, y: number, c: string) => {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, h, 4, 1).rotateY(Math.PI / 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wt : wb));
    p.setZ(i, p.getZ(i) * (top ? dt : db));
  }
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return tint(out.translate(0, y, 0), c);
};
const cyl = (r: number, h: number, x: number, y: number, z: number, c: string, axis: "x" | "y" | "z" = "y", seg = 8) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return tint(g.translate(x, y, z), c);
};
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
};

export type KitTemplates = ReturnType<typeof makeKitTemplates>;

/** One geometry per kind of the kit (world3d makeTemplates adds them to its own). */
export function makeKitTemplates() {
  const steel = "#b6bbbe", steelDark = "#959b9f", rubber = "#1b1b1b";
  // Tehran's waste container: galvanised, sides flaring to a rolled rim, pressed ribs down the
  // front, a lid, castors, a side pipe to tip it by, a no-parking plate.
  const dumpster = merge([
    taper(1.3, 0.98, 1.5, 1.14, 1.1, 0.77, steel),
    B(1.58, 0.07, 1.22, 0, 1.33, 0, "#d2d6d8"),
    B(1.5, 0.05, 1.12, 0, 1.39, -0.02, "#a6abae", 0, -0.05),
    ...[-0.5, -0.3, 0.3, 0.5].map((x) => B(0.07, 0.9, 0.04, x, 0.8, 0.54, steelDark)),
    cyl(0.04, 0.3, -0.84, 1.05, 0, steelDark, "x"),
    // The no-parking plate: white, a red ring and a red slash.
    B(0.24, 0.3, 0.012, 0.0, 0.88, 0.555, "#f4f4f2"),
    cyl(0.095, 0.01, 0, 0.9, 0.562, "#d22b2b", "z", 14),
    cyl(0.07, 0.01, 0, 0.9, 0.566, "#f4f4f2", "z", 14),
    B(0.15, 0.025, 0.01, 0, 0.9, 0.571, "#d22b2b", -Math.PI / 4),
    B(0.03, 0.09, 0.01, 0.015, 0.9, 0.569, "#1f4fa0"),
    ...[-0.55, 0.55].flatMap((x) => [-0.4, 0.4].flatMap((z) => [cyl(0.1, 0.07, x, 0.11, z, rubber, "x"), B(0.06, 0.12, 0.08, x, 0.2, z, steelDark)])),
  ]);
  // Bags of rubbish beside it: three black, one white.
  const bag = (r: number, x: number, z: number, c: string) => tint(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1.1).translate(x, r * 0.7, z), c);
  const bags = merge([bag(0.34, 0, 0, "#1d1d20"), bag(0.28, 0.45, 0.25, "#26262a"), bag(0.3, -0.3, 0.42, "#18181b"), bag(0.24, 0.35, -0.3, "#dcdcd6"), B(0.3, 0.2, 0.22, -0.5, 0.1, -0.1, "#c9a46a", 0.3)]);
  // Iran Post box: a red tapering pedestal, the yellow box, a red pyramid roof; the slot to the street.
  const postbox = merge([
    B(0.5, 0.05, 0.46, 0, 0.025, 0, "#b8231f"),
    taper(0.44, 0.4, 0.3, 0.27, 0.72, 0.41, "#d42b25"),
    B(0.54, 0.6, 0.4, 0, 1.07, 0, "#f2b51c"),
    B(0.46, 0.48, 0.012, 0, 1.03, 0.206, "#e9a816"),
    B(0.3, 0.03, 0.02, 0, 1.3, 0.21, "#2a2a2a"),
    B(0.13, 0.08, 0.012, 0, 1.13, 0.214, "#2f8f86"),
    B(0.62, 0.04, 0.48, 0, 1.39, 0, "#c8261f"),
    tint(new THREE.ConeGeometry(0.44, 0.24, 4).rotateY(Math.PI / 4).scale(1, 1, 0.82).translate(0, 1.53, 0), "#d42b25"),
  ]);
  // Electricity cabinet (تابلو برق): cream steel on a concrete plinth, two doors, louvres, a warning plate.
  const cream = "#cbc6b3", creamDark = "#b7b29f";
  const power = merge([
    B(1.45, 0.16, 0.7, 0, 0.08, 0, "#a3a199"),
    B(1.35, 1.42, 0.6, 0, 0.87, 0, cream),
    ...[-0.34, 0.34].map((x) => B(0.62, 1.24, 0.02, x, 0.84, 0.305, creamDark)),
    ...[-0.34, 0.34].flatMap((x) => [1.3, 1.36, 1.42].map((y) => B(0.38, 0.025, 0.02, x, y, 0.318, "#6f6b60"))),
    ...[-0.06, 0.06].map((x) => B(0.03, 0.12, 0.04, x, 0.85, 0.32, "#3c3c3c")),
    B(0.22, 0.2, 0.012, 0.34, 1.0, 0.32, "#f2c230"),
    B(0.03, 0.14, 0.014, 0.34, 1.0, 0.322, "#111111", 0.45),
    B(1.47, 0.06, 0.72, 0, 1.61, 0, "#a9a592"),
  ]);
  // Telecom cabinet (کافو): grey, a sloping lid, a door with vents, a blue badge.
  const telecom = merge([
    B(0.96, 0.08, 0.52, 0, 0.04, 0, "#9a9993"),
    B(0.9, 1.18, 0.46, 0, 0.67, 0, "#b9bdbf"),
    B(0.78, 1.0, 0.02, 0, 0.65, 0.235, "#acb1b3"),
    ...[0.32, 0.37, 0.42].map((y) => B(0.4, 0.022, 0.02, 0, y, 0.248, "#6b7072")),
    B(0.16, 0.1, 0.012, 0, 1.0, 0.248, "#1f5fae"),
    B(0.98, 0.06, 0.54, 0, 1.3, -0.01, "#9fa4a6", 0, -0.08),
  ]);
  // Payphone hood: on a post, yellow shell open to the street, a blue top, the grey phone inside.
  const phone = merge([
    B(0.09, 1.15, 0.09, 0, 0.575, -0.19, "#6b7177"),
    B(0.78, 0.95, 0.04, 0, 1.6, -0.21, "#f2c230"),
    ...[-0.37, 0.37].map((x) => B(0.04, 0.95, 0.44, x, 1.6, 0.0, "#f2c230")),
    B(0.84, 0.08, 0.5, 0, 2.1, 0, "#1e5aa8"),
    B(0.26, 0.42, 0.12, 0, 1.5, -0.13, "#9ea4a8"),
    B(0.06, 0.22, 0.06, -0.08, 1.52, -0.06, "#151515"),
  ]);
  // Saqakhaneh (سقاخانه): a turquoise-tiled niche with a tap and a basin, a yellow tile band, a green dome.
  const saqa = merge([
    B(1.32, 0.26, 0.78, 0, 0.13, 0, "#d6cfbe"),
    B(1.2, 1.5, 0.62, 0, 1.01, 0, "#1b8f9a"),
    B(1.24, 0.1, 0.66, 0, 1.6, 0, "#e2b93b"),
    B(0.08, 1.5, 0.64, -0.56, 1.01, 0, "#174f7a"),
    B(0.08, 1.5, 0.64, 0.56, 1.01, 0, "#174f7a"),
    B(0.68, 0.92, 0.04, 0, 1.02, 0.3, "#0d2c36"),
    B(0.6, 0.1, 0.28, 0, 0.62, 0.42, "#c3c8ca"),
    cyl(0.025, 0.14, 0, 0.82, 0.38, "#c9a227", "z", 6),
    ...[-0.2, 0, 0.2].map((x) => B(0.04, 0.12, 0.04, x, 1.38, 0.28, "#f6f2e6")),
    B(1.0, 0.12, 0.5, 0, 1.71, 0, "#1b8f9a"),
    tint(new THREE.SphereGeometry(0.34, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.77, 0), "#1f7d4f"),
    cyl(0.03, 0.24, 0, 2.2, 0, "#d9b23a", "y", 6),
  ]);
  // Median railing panel along x: a kerb, a green frame, yellow bars zigzagging inside.
  const green = "#2e8b46", yellow = "#f2c230", h = RAIL_M / 2;
  const rail = merge([
    B(RAIL_M, 0.2, 0.55, 0, 0.1, 0, "#a4a39b"),
    B(0.07, 0.95, 0.07, -h + 0.04, 0.67, 0, green),
    B(RAIL_M, 0.06, 0.05, 0, 1.12, 0, green),
    B(RAIL_M, 0.05, 0.05, 0, 0.36, 0, green),
    ...[-0.75, -0.25, 0.25, 0.75].map((x, i) => B(0.06, 0.82, 0.03, x * (RAIL_M / 2.4), 0.74, 0, yellow, i % 2 ? 0.5 : -0.5)),
  ]);
  // Footbridge deck piece (DECK_M along x, 2.6 m wide): slab, green girders, truss railings, a canopy.
  const L = DECK_M, top = DECK_Y;
  const bridgeDeck = merge([
    B(L, 0.3, 2.6, 0, top - 0.15, 0, "#c9c7bd"),
    ...[-1.2, 1.2].flatMap((z) => [
      B(L, 0.55, 0.25, 0, top - 0.55, z, green),
      B(L, 0.07, 0.07, 0, top + 1.05, z * 1.07, green),
      B(L, 0.05, 0.05, 0, top + 0.5, z * 1.07, green),
      B(0.08, 2.8, 0.08, -L / 2 + 0.04, top + 1.4, z * 1.07, green),
      B(0.05, 1.25, 0.04, -L / 4, top + 0.53, z * 1.07, green, 0.9),
      B(0.05, 1.25, 0.04, L / 4, top + 0.53, z * 1.07, green, -0.9),
    ]),
    B(L, 0.08, 3.1, 0, top + 2.82, 0, "#7d9c88"),
  ]);
  // Stair tower: a landing on four columns, the flight running 9 m along +z to the pavement.
  const run = 9, slope = Math.atan2(top, run), len = Math.hypot(top, run);
  const bridgeStair = merge([
    B(2.6, 0.3, 2.6, 0, top - 0.15, 0, "#c9c7bd"),
    ...[-1.1, 1.1].flatMap((x) => [-1.1, 1.1].map((z) => B(0.3, top - 0.3, 0.3, x, (top - 0.3) / 2, z, green))),
    B(1.6, 0.25, len, 0, top / 2, 1.3 + run / 2, "#bdbbb2", 0, slope),
    ...[-0.84, 0.84].flatMap((x) => [B(0.08, 0.35, len, x, top / 2, 1.3 + run / 2, green, 0, slope), B(0.05, 0.05, len, x, top / 2 + 1.0, 1.3 + run / 2, green, 0, slope)]),
    ...[-1.28, 1.28].map((x) => B(0.05, 0.05, 2.6, x, top + 1.05, 0, green)),
    B(2.6, 0.05, 0.05, 0, top + 1.05, -1.28, green),
  ]);
  return { dumpster, bags, postbox, power, telecom, phone, saqa, rail, bridgeDeck, bridgeStair };
}

// ---------------------------------------------------------------- signs at the crossings
const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, -apple-system, "Segoe UI", sans-serif`;
const rtl = (s: string) => /[֐-ࣿ]/.test(s);
const lines = (text: string) => text.split("\n", 2);
let signPole: THREE.CylinderGeometry | null = null, signPoleMat: THREE.MeshStandardMaterial | null = null, unit: THREE.PlaneGeometry | null = null, backMat: THREE.MeshStandardMaterial | null = null;
const shared = () => {
  signPole ??= new THREE.CylinderGeometry(0.07, 0.08, 1, 8).translate(0, 0.5, 0);
  signPoleMat ??= new THREE.MeshStandardMaterial({ color: "#7d848b", roughness: 0.45, metalness: 0.6 });
  unit ??= new THREE.PlaneGeometry(1, 1);
  backMat ??= new THREE.MeshStandardMaterial({ color: "#8b9197", roughness: 0.6, metalness: 0.4 });
  return { pole: signPole, poleMat: signPoleMat, unit, backMat };
};

export type Sign = { group: THREE.Group; dispose: () => void };

/** A canvas lettered as one plate: `draw` paints it; returns the texture and its size in px. */
function plateTexture(cw: number, ch: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The two lines of a name (Persian on top, the English under a rule) centred in the box. */
function letter(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, colour: string, rule: boolean) {
  const [main, second] = lines(text);
  g.fillStyle = g.strokeStyle = colour;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const big = second ? h * 0.36 : h * 0.5;
  g.font = `800 ${big}px ${FONT}`;
  g.direction = rtl(main) ? "rtl" : "ltr";
  g.fillText(main, x + w / 2, y + (second ? h * 0.28 : h / 2 + 2), w - 16);
  if (!second) return;
  if (rule) {
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x + w * 0.1, y + h * 0.56);
    g.lineTo(x + w * 0.9, y + h * 0.56);
    g.stroke();
  }
  g.font = `700 ${h * 0.24}px ${FONT}`;
  g.direction = rtl(second) ? "rtl" : "ltr";
  g.fillText(second, x + w / 2, y + h * 0.78, w - 16);
}

const measure = (text: string, px: number) => {
  const g = document.createElement("canvas").getContext("2d")!;
  return Math.max(...lines(text).map((l, i) => ((g.font = `800 ${i ? px * 0.67 : px}px ${FONT}`), g.measureText(l).width)));
};

/** A plate facing +z (the drivers), its grey back, `w` × `h` m, centred at (x, y). */
function plate(group: THREE.Group, tex: THREE.Texture, w: number, h: number, x: number, y: number, owned: { dispose: () => void }[], alpha = false) {
  const { unit, backMat } = shared();
  const mat = new THREE.MeshBasicMaterial({ map: tex, ...(alpha ? { alphaTest: 0.5 } : {}) });
  const front = new THREE.Mesh(unit, mat);
  front.scale.set(w, h, 1);
  front.position.set(x, y, 0.03);
  const back = new THREE.Mesh(unit, backMat);
  back.scale.set(w * (alpha ? 0.92 : 1), h, 1);
  back.position.set(x, y, 0);
  back.rotation.y = Math.PI;
  group.add(front, back);
  owned.push(tex, mat);
}

/**
 * The white arrow sign before a junction: a plate per side, stacked, each pointing (a black
 * chevron end) the way its street goes — `dir` 1 to the driver's right. +z faces the drivers.
 */
export function makeDirectionSign(plates: { text: string; dir?: number }[]): Sign {
  const { pole, poleMat } = shared();
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const p = new THREE.Mesh(pole, poleMat);
  p.scale.y = 3.6;
  group.add(p);
  let y = 3.45;
  for (const pl of plates) {
    const ch = 128, tip = 70, tw = Math.ceil(measure(pl.text, 46));
    const cw = Math.min(900, Math.max(320, tw + tip + 80));
    const right = (pl.dir ?? 1) > 0;
    const tex = plateTexture(cw, ch, (g) => {
      const x0 = right ? 4 : tip, x1 = right ? cw - tip : cw - 4;
      g.beginPath();
      g.moveTo(x0, 4);
      g.lineTo(x1, 4);
      if (right) g.lineTo(cw - 4, ch / 2), g.lineTo(x1, ch - 4);
      else g.lineTo(x1, ch - 4);
      g.lineTo(x0, ch - 4);
      if (!right) g.lineTo(4, ch / 2);
      g.closePath();
      g.fillStyle = "#f7f7f2";
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = "#111";
      g.stroke();
      // The black chevron end with a white arrowhead stroke in it.
      g.fillStyle = "#111";
      g.beginPath();
      const bx = right ? x1 - 14 : x0 + 14;
      g.moveTo(bx, 4);
      g.lineTo(right ? cw - 4 : 4, ch / 2);
      g.lineTo(bx, ch - 4);
      g.closePath();
      g.fill();
      g.strokeStyle = "#f7f7f2";
      g.lineWidth = 9;
      g.beginPath();
      const ax = right ? x1 - 6 : x0 + 6, k = right ? 1 : -1;
      g.moveTo(ax, ch * 0.28);
      g.lineTo(ax + k * 34, ch / 2);
      g.lineTo(ax, ch * 0.72);
      g.stroke();
      letter(g, pl.text, right ? 22 : tip + 26, 10, cw - tip - 48, ch - 20, "#111", false);
    });
    const H = 0.62, W = (cw / ch) * H;
    // Each plate hangs off the post toward the side it points.
    plate(group, tex, W, H, (right ? 1 : -1) * (W / 2 - 0.25), y - H / 2, owned, true);
    y -= H + 0.08;
  }
  return { group, dispose: () => owned.forEach((o) => o.dispose()) };
}

/**
 * The motorway's green overhead sign: a post on the right-hand verge, an arm `reach` m out over
 * the lanes, a plate per destination — straight on (`dir` 0, arrows down) over the middle,
 * the exit (`dir` ±1, a slanted arrow) nearest the post. +z faces the drivers, the arm along −x.
 */
export function makeGantry(plates: { text: string; dir?: number }[], reach: number): Sign {
  const { pole, poleMat } = shared();
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const p = new THREE.Mesh(pole, poleMat);
  p.scale.set(2.6, 7.3, 2.6);
  group.add(p);
  const arm = new THREE.Mesh(pole, poleMat);
  arm.scale.set(1.4, reach + 0.3, 1.4);
  arm.rotation.z = Math.PI / 2;
  arm.position.y = 7.0;
  group.add(arm);
  const arm2 = arm.clone();
  arm2.position.y = 6.2;
  group.add(arm2);
  // Nearest the post first: the exit; the road itself further out.
  const order = [...plates].sort((a, b) => Math.abs(b.dir ?? 0) - Math.abs(a.dir ?? 0));
  let x = -0.4;
  for (const pl of order) {
    const ch = 200, tw = Math.ceil(measure(pl.text, 52));
    const cw = Math.min(760, Math.max(360, tw + 70));
    const tex = plateTexture(cw, ch, (g) => {
      g.fillStyle = "#0f6a3b";
      g.beginPath();
      if (g.roundRect) g.roundRect(3, 3, cw - 6, ch - 6, 18);
      else g.rect(3, 3, cw - 6, ch - 6);
      g.fill();
      g.strokeStyle = "#f5f5f0";
      g.lineWidth = 6;
      g.beginPath();
      if (g.roundRect) g.roundRect(12, 12, cw - 24, ch - 24, 12);
      else g.rect(12, 12, cw - 24, ch - 24);
      g.stroke();
      letter(g, pl.text, 20, 18, cw - 40, ch * 0.62, "#f5f5f0", false);
      // Arrows under the names: down over the lanes going on, slanted for the exit.
      g.strokeStyle = g.fillStyle = "#f5f5f0";
      g.lineWidth = 8;
      const ay = ch * 0.8, ax = cw / 2, d = pl.dir ?? 0;
      g.save();
      g.translate(ax, ay);
      g.rotate(d === 0 ? 0 : d > 0 ? -Math.PI * 0.75 : Math.PI * 0.75);
      g.beginPath();
      g.moveTo(0, -18);
      g.lineTo(0, 14);
      g.stroke();
      g.beginPath();
      g.moveTo(-14, 6);
      g.lineTo(0, 24);
      g.lineTo(14, 6);
      g.closePath();
      g.fill();
      g.restore();
    });
    const H = 2.2, W = Math.min((cw / ch) * H, reach * 0.6);
    if (-x + W > reach + 0.6) break; // no room left on the arm
    plate(group, tex, W, H, x - W / 2, 6.6 - H / 2 + 0.5, owned);
    x -= W + 0.3;
  }
  return { group, dispose: () => owned.forEach((o) => o.dispose()) };
}
