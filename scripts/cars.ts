// Builds the street cars drive mode draws from real 3D models (assets/models/*.glb, from
// Sketchfab; big, so not in git):
//   npm run assets:cars                 every car in CARS below
//   npm run assets:cars -- pars,samand  only these
//   npm run assets:cars -- --report     list each source's materials (to write the rules)
//   npm run assets:cars -- --preview    also draw .cache/cars/<key>.png (both levels of detail, 5 views;
//                                       --out=<dir> elsewhere); --report draws <key>-materials.png
//
// For each car it
//  1. reads every triangle in metres, its colour baked from the material and its texture
//     (so a car is a few vertex-coloured meshes: no textures to download or bind);
//  2. turns it to the game's frame (forward −z, wheels on y = 0, centred) and scales it
//     to the real car's length (lib/fleet.ts);
//  3. drops what nobody sees from the street: it's drawn from 60 directions with the glass
//     opaque (as drive mode draws it), and a triangle no view shows goes — the cabin,
//     engine, underside and inner faces (often 40–70 % of a showroom model);
//  4. sorts the rest into the parts traffic instances (fleet3d.ts): paint (tinted per car),
//     kit (trim, chrome, plates: vertex colours), glass, head lamps, tail lamps (lit on
//     braking) and one wheel (the rear-left one; the game turns it round for the right
//     side) with where the four go;
//  5. simplifies each part to two levels of detail (near / far) and writes
//     public/models/cars/<key>.<hash>.glb (meshopt-compressed, quantized) and the manifest
//     src/lib/carModels.ts (address, size, triangles, credit).
// The address carries a hash of the bytes, so phones and the service worker keep a car
// forever and fetch it again only when it's rebuilt.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO, type Material } from "@gltf-transform/core";
import { raster, readGltf, shade, sheet, view, weld as mesh, type Mesh, type Soup as MeshSoup, type V3 } from "./lib/meshSoup";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { FLEET, type FleetKey } from "../src/lib/fleet";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets/models");
const OUT = path.join(ROOT, "public/models/cars");
const MANIFEST = path.join(ROOT, "src/lib/carModels.ts");
/** Where --preview / --report draw (--out=<dir> to change). */
const PREVIEW = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? path.join(ROOT, ".cache/cars"));

/** What a source material becomes: a part, "light" (head, tail or kit by where it is and its colour), or nothing. */
type Kind = "paint" | "kit" | "glass" | "light" | "wheel" | "drop";
type Slot = "paint" | "kit" | "glass" | "head" | "tail" | "wheel";
const SLOTS: Slot[] = ["paint", "kit", "glass", "head", "tail", "wheel"];

type Car = {
  key: FleetKey;
  file: string;
  /** Material name (regex, case-insensitive) → kind; checked before the general RULES. */
  rules?: [string, Kind][];
  /** Which way the source's nose points; found from where its red lamps are when left out. */
  nose?: "+z" | "-z";
  /** Triangles for the near model (the far one gets FAR_SHARE of it). */
  budget?: number;
  /** Trim the scale by this (when the source's length includes something sticking out). */
  lenFix?: number;
  /** Materials (regex) the tyres and rims are mixed into, when they have none of their own: found by shape. */
  wheelsIn?: string;
  /** Its lamps carry no colour: any lamp at the back is a tail lamp, at the front a head lamp. */
  plainLamps?: boolean;
};

const CARS: Car[] = [
  // Peugeot 405 GLX — the Pars is its Iranian facelift.
  { key: "pars", file: "1994_peugeot_405_glx_facelift_version.glb" },
  {
    key: "samand",
    file: "ikco_samand_x7_free_iranian_car.glb",
    // One side's lamp texture is mirrored (its colours don't read): sort its lamps by where they are.
    nose: "-z",
    plainLamps: true,
    rules: [
      ["^wire_006134113$", "paint"],
      ["^Material\\.0(03|05|10|11|12|13|15|16)$|^wire_177088026|^wire_115115115$|^Car_chrome\\.00[123]$", "wheel"],
      ["^Material\\.00[6-9]$|^wire_108008136$|^wire_214229166|^wire_153228214$|^wire_255147007$|^Car_chrome\\.00[4-6]$", "light"],
    ],
  },
  {
    key: "vanet",
    file: "iranian_zamyad.glb",
    rules: [
      ["^03_-_Default$", "paint"],
      ["^15_-_Default$", "wheel"],
      ["^02_-_Default$", "glass"],
      ["^(07|14)_-_Default$", "light"],
    ],
  },
  {
    key: "suv",
    file: "citroen_c5_aircross.glb",
    rules: [
      ["black_paint|underbody|^trim", "kit"],
    ],
  },
  { key: "xantia", file: "f446dacbcfbc48c6870e0f2339987f0f.glb", wheelsIn: "^(Plastic|Chrome)$" },
  // Dacia Logan — built in Iran as the Renault Tondar 90 (L90).
  // Its front windows are down: the cabin shows through, so it stays (only what shows is kept).
  { key: "l90", file: "2009_dacia_logan.glb", rules: [["^Gimap1Mtl$", "paint"], ["^Interior1Mtl$", "kit"]] },
  // Saipa 232 is the Shahin.
  {
    key: "shahin",
    file: "saipa_232.glb",
    nose: "-z",
    plainLamps: true,
    rules: [
      ["^Plane0121Mtl$", "paint"],
      ["^Object(2321|241)Mtl$", "wheel"],
      ["^Plane0041Mtl$|^Sphere0131Mtl$", "light"],
    ],
  },
];

/** General material-name rules (after a car's own). */
const RULES: [RegExp, Kind][] = [
  [/shadow|collision|interior|\bint\d*\b|_int|seat|stitch|gauge|dashboard|engine|digital/i, "drop"],
  [/head ?light|tail ?light|brake ?light|lamp|\bled\b|_led|reflector|lens|\blights?\d*\b|_light|light_|blinker|indicator/i, "light"],
  [/glass|window|windshield|windscreen/i, "glass"],
  [/tyre|tire|wheel|(?<!t)rims?\b|hub|tread|sidewall|disk|disc\b|brake(?!.?light)/i, "wheel"],
  [/body|paint|^colou?r$/i, "paint"],
];

const NEAR_BUDGET = 14_000;
const FAR_SHARE = 0.16;
const WHEEL_NEAR = 900;
const WHEEL_FAR = 140;

// ---------------------------------------------------------------- reading
/** Every triangle of a source: positions (9 per), normals (9 per), linear RGBA colours (12 per), the kind and source material. */
type Soup = MeshSoup<Kind>;
type MatInfo = { name: string; kind: Kind; color: number[]; alpha: string; transmission: number; tex: string | null };

function kindOf(car: Car, m: Material | null): Kind {
  const name = m?.getName() ?? "";
  for (const [re, k] of car.rules ?? []) if (new RegExp(re, "i").test(name)) return k;
  for (const [re, k] of RULES) if (re.test(name)) return k;
  if (m) {
    const tr = (m.getExtension("KHR_materials_transmission") as { getTransmissionFactor(): number } | null)?.getTransmissionFactor() ?? 0;
    if (tr > 0.2 || (m.getAlphaMode() === "BLEND" && m.getBaseColorFactor()[3] < 0.7)) return "glass";
  }
  return "kit";
}

async function read(car: Car) {
  const { soup, mats, kinds, extras } = await readGltf<Kind>(path.join(SRC, car.file), (m) => kindOf(car, m));
  const info: MatInfo[] = mats.map((m, i) => ({
    name: m.getName(),
    kind: kinds[i],
    color: m.getBaseColorFactor(),
    alpha: m.getAlphaMode(),
    transmission: (m.getExtension("KHR_materials_transmission") as { getTransmissionFactor(): number } | null)?.getTransmissionFactor() ?? 0,
    tex: m.getBaseColorTexture()?.getURI() || (m.getBaseColorTexture() ? "embedded" : null),
  }));
  return { soup, info, extras };
}

// ---------------------------------------------------------------- drawing (visibility and previews)
/** The triangles some view from the street (or above) shows. */
function visible(pos: Float32Array, ids: Int32Array): Set<number> {
  const seen = new Set<number>();
  for (const el of [-0.08, 0.12, 0.38, 0.75, 1.3, Math.PI / 2])
    for (let a = 0, steps = el > 1.5 ? 1 : el > 1.2 ? 6 : 14; a < steps; a++) {
      const { id } = raster(pos, ids, view((a / steps) * Math.PI * 2 + el, el), 0.007);
      for (const t of id) if (t >= 0) seen.add(t);
    }
  return seen;
}

// ---------------------------------------------------------------- the car's frame
const centroid = (pos: Float32Array, t: number, k: number) => (pos[t * 9 + k] + pos[t * 9 + 3 + k] + pos[t * 9 + 6 + k]) / 3;
function bounds(pos: Float32Array, ids: Iterable<number>) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of ids)
    for (let k = 0; k < 9; k++) {
      const a = k % 3, x = pos[t * 9 + k];
      if (x < lo[a]) lo[a] = x;
      if (x > hi[a]) hi[a] = x;
    }
  return { lo, hi };
}
const isRed = (c: Float32Array, o: number) => c[o] > 0.12 && c[o] > c[o + 1] * 2.2 && c[o] > c[o + 2] * 2.2;
const luma = (c: Float32Array, o: number) => 0.2126 * c[o] + 0.7152 * c[o + 1] + 0.0722 * c[o + 2];
const isAmber = (c: Float32Array, o: number) => c[o] > 0.2 && c[o + 1] > c[o] * 0.18 && c[o + 1] < c[o] * 0.75 && c[o + 2] < c[o + 1] * 0.6;
const triColor = (s: Soup, t: number, out: Float32Array) => {
  for (let j = 0; j < 4; j++) out[j] = (s.col[t * 12 + j] + s.col[t * 12 + 4 + j] + s.col[t * 12 + 8 + j]) / 3;
  return out;
};

function apply(s: Soup, f: (x: number, y: number, z: number) => V3, rotN: (x: number, y: number, z: number) => V3) {
  for (let i = 0; i < s.n * 3; i++) {
    const o = i * 3;
    s.pos.set(f(s.pos[o], s.pos[o + 1], s.pos[o + 2]), o);
    s.nrm.set(rotN(s.nrm[o], s.nrm[o + 1], s.nrm[o + 2]), o);
  }
}

/** Union-find islands of triangles sharing a vertex (welded to a millimetre). */
function islands(pos: Float32Array, ids: number[]) {
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    let x = a;
    while (x !== r) {
      const nx = parent.get(x)!;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  for (const t of ids) parent.set(t, t);
  const at = new Map<string, number>();
  for (const t of ids)
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const key = `${Math.round(pos[o] * 1000)},${Math.round(pos[o + 1] * 1000)},${Math.round(pos[o + 2] * 1000)}`;
      const other = at.get(key);
      if (other === undefined) at.set(key, t);
      else {
        const a = find(t), b = find(other);
        if (a !== b) parent.set(a, b);
      }
    }
  const groups = new Map<number, number[]>();
  for (const t of ids) {
    const r = find(t);
    const g = groups.get(r);
    if (g) g.push(t);
    else groups.set(r, [t]);
  }
  return [...groups.values()];
}

type Wheel = { x: number; y: number; z: number; r: number; tris: number[] };
/**
 * The road wheels: islands of wheel material (or of `ids` in general) no bigger than a
 * wheel, gathered by where they are; the four round ones standing on the ground.
 */
function findWheels(s: Soup, ids: number[], debug = false): Wheel[] {
  const parts = islands(s.pos, ids)
    .map((tris) => ({ tris, ...bounds(s.pos, tris) }))
    .filter((p) => p.hi[0] - p.lo[0] < 0.45 && p.hi[1] - p.lo[1] < 0.9 && p.hi[2] - p.lo[2] < 0.9);
  const groups: { tris: number[]; lo: number[]; hi: number[] }[] = [];
  for (const p of parts.sort((a, b) => b.tris.length - a.tris.length)) {
    const cx = (p.lo[0] + p.hi[0]) / 2, cy = (p.lo[1] + p.hi[1]) / 2, cz = (p.lo[2] + p.hi[2]) / 2;
    const g = groups.find((q) => cx > q.lo[0] - 0.12 && cx < q.hi[0] + 0.12 && cz > q.lo[2] - 0.05 && cz < q.hi[2] + 0.05 && cy > q.lo[1] - 0.05 && cy < q.hi[1] + 0.05);
    if (g) {
      g.tris.push(...p.tris);
      for (let k = 0; k < 3; k++) {
        g.lo[k] = Math.min(g.lo[k], p.lo[k]);
        g.hi[k] = Math.max(g.hi[k], p.hi[k]);
      }
    } else groups.push({ tris: [...p.tris], lo: [...p.lo], hi: [...p.hi] });
  }
  const ground = Math.min(...groups.map((g) => g.lo[1]));
  if (debug) for (const g of groups.filter((g) => g.tris.length > 200)) console.log(g.tris.length, g.lo.map((v) => v.toFixed(2)).join(","), g.hi.map((v) => v.toFixed(2)).join(","));
  const round = (g: (typeof groups)[number]) => g.hi[1] - g.lo[1] > 0.4 && Math.abs(g.hi[1] - g.lo[1] - (g.hi[2] - g.lo[2])) < 0.12;
  const big = groups.filter((g) => round(g) && g.lo[1] < ground + 0.12 && Math.abs(g.hi[0] + g.lo[0]) / 2 > 0.4).sort((a, b) => b.tris.length - a.tris.length);
  return big.slice(0, 4).map((g) => ({ x: (g.lo[0] + g.hi[0]) / 2, y: (g.lo[1] + g.hi[1]) / 2, z: (g.lo[2] + g.hi[2]) / 2, r: (g.hi[1] - g.lo[1]) / 2, tris: g.tris }));
}

// ---------------------------------------------------------------- meshes
// ---------------------------------------------------------------- one car
type Built = { key: FleetKey; file: string; bytes: number; tris: [number, number]; credit: { title: string; author: string; url: string; license: string } };

async function build(car: Car, preview: boolean): Promise<Built> {
  const t0 = Date.now();
  const { soup: s, info, extras } = await read(car);
  const all = Array.from({ length: s.n }, (_, i) => i);
  const def = FLEET[car.key];

  // Forward: the red lamps are at the back.
  const c = new Float32Array(4);
  let nose = car.nose;
  if (!nose) {
    let red = 0, redZ = 0;
    const { lo, hi } = bounds(s.pos, all);
    const mid = (lo[2] + hi[2]) / 2;
    for (const t of all) if (s.kind[t] === "light" && isRed(triColor(s, t, c), 0)) (red++, (redZ += centroid(s.pos, t, 2) - mid));
    if (!red) throw new Error(`${car.key}: no red lamps to tell its back from its front — set nose`);
    nose = redZ > 0 ? "-z" : "+z";
  }
  if (nose === "+z") apply(s, (x, y, z) => [-x, y, -z], (x, y, z) => [-x, y, -z]);
  // Scale to the real car's length, bumper to bumper; centre it.
  const b0 = bounds(s.pos, all.filter((t) => s.kind[t] !== "drop"));
  const scale = (def.len / (b0.hi[2] - b0.lo[2])) * (car.lenFix ?? 1);
  const cx = (b0.lo[0] + b0.hi[0]) / 2, cz = (b0.lo[2] + b0.hi[2]) / 2;
  apply(s, (x, y, z) => [(x - cx) * scale, y * scale, (z - cz) * scale], (x, y, z) => [x, y, z]);
  // Wheels on the ground.
  const mixed = car.wheelsIn ? new RegExp(car.wheelsIn, "i") : null;
  const wheels = findWheels(s, all.filter((t) => s.kind[t] === "wheel" || (mixed && s.mat[t] >= 0 && mixed.test(info[s.mat[t]].name))));
  if (wheels.length < 4 && process.env.DEBUG_WHEELS) findWheels(s, all.filter((t) => s.kind[t] === "wheel" || (mixed && s.mat[t] >= 0 && mixed.test(info[s.mat[t]].name))), true);
  if (wheels.length < 4) throw new Error(`${car.key}: found ${wheels.length} wheels — check its wheel rules (--report)`);
  // Wheel material that isn't a road wheel (a spare, the steering wheel) is trim.
  for (const t of all) if (s.kind[t] === "wheel") s.kind[t] = "kit";
  for (const w of wheels) for (const t of w.tris) s.kind[t] = "wheel";
  // Level it (some sources sit nose-down): pitch it so the front and back tyres both touch the ground.
  const axle = (front: boolean) => wheels.filter((w) => (w.z < 0) === front);
  const bottom = (ws: Wheel[]) => ws.reduce((n, w) => n + w.y - w.r, 0) / ws.length;
  const along = (ws: Wheel[]) => ws.reduce((n, w) => n + w.z, 0) / ws.length;
  const pitch = Math.atan2(bottom(axle(false)) - bottom(axle(true)), along(axle(false)) - along(axle(true)));
  if (Math.abs(pitch) > 0.002) {
    const cos = Math.cos(pitch), sin = Math.sin(pitch);
    const rot = (x: number, y: number, z: number): V3 => [x, y * cos - z * sin, y * sin + z * cos];
    apply(s, rot, rot);
    for (const w of wheels) [, w.y, w.z] = rot(w.x, w.y, w.z);
  }
  const ground = Math.min(...wheels.map((w) => w.y - w.r));
  apply(s, (x, y, z) => [x, y - ground, z], (x, y, z) => [x, y, z]);
  for (const w of wheels) w.y -= ground;

  // What can be seen (glass opaque).
  const seen = visible(s.pos, Int32Array.from(all));
  const slot: (Slot | null)[] = new Array(s.n).fill(null);
  const len = def.len;
  for (const t of all) {
    if (!seen.has(t)) continue;
    let k = s.kind[t];
    // Clear glass over a lamp (low, at either end) is the lamp's lens.
    if (k === "glass" && Math.abs(centroid(s.pos, t, 2)) > len * 0.36 && centroid(s.pos, t, 1) < def.hgt * 0.55) k = "light";
    if (k === "light") {
      const z = centroid(s.pos, t, 2);
      triColor(s, t, c);
      if (z < -len * 0.25) slot[t] = !car.plainLamps && (isAmber(c, 0) || isRed(c, 0)) ? "kit" : "head";
      else if (z > len * 0.25) slot[t] = car.plainLamps || isRed(c, 0) || (luma(c, 0) < 0.08 && c[0] > c[2] * 1.5) ? "tail" : "kit";
      else slot[t] = "kit";
    } else if (k !== "wheel" && k !== "drop") slot[t] = k;
  }
  // The rear-left wheel is the one copied to all four (rear wheels are never steered in the model).
  const ws = [...wheels].sort((a, b) => b.z - a.z);
  const rearLeft = ws.slice(0, 2).sort((a, b) => a.x - b.x)[0];
  // Only its faces that show from outside, on any wheel position, matter: use its own visibility.
  const wheelTris = rearLeft.tris.filter((t) => seen.has(t));

  const byslot: Record<Slot, number[]> = { paint: [], kit: [], glass: [], head: [], tail: [], wheel: wheelTris };
  for (const t of all) if (slot[t] && slot[t] !== "wheel") byslot[slot[t]!].push(t);
  const bodyTris = SLOTS.filter((k) => k !== "wheel").reduce((n, k) => n + byslot[k].length, 0);
  const budget = car.budget ?? NEAR_BUDGET;
  const lods = [
    { budget, err: 0.03, wheel: WHEEL_NEAR },
    { budget: budget * FAR_SHARE, err: 0.05, wheel: WHEEL_FAR },
  ];
  const levels = lods.map((l) => {
    const out = {} as Record<Slot, Mesh | null>;
    for (const k of SLOTS) {
      if (k === "wheel") out.wheel = mesh(s, byslot.wheel, l.wheel, l.err / 3, [rearLeft.x, rearLeft.y, rearLeft.z]);
      // Small parts (lamps) keep a minimum so they stay the right shape.
      else out[k] = mesh(s, byslot[k], Math.max(k === "head" || k === "tail" || k === "glass" ? 80 : 12, (l.budget * byslot[k].length) / Math.max(1, bodyTris)), k === "glass" ? Math.min(l.err, 0.01) : l.err, undefined, k === "kit");
    }
    return out;
  });

  // Where things sit: lamp beams, a parcel on the roof (or in the bed), the roof for a taxi sign.
  const kept = all.filter((t) => slot[t]);
  const bb = bounds(s.pos, kept);
  const heads = byslot.head.length ? bounds(s.pos, byslot.head) : null;
  let roofY = 0, roofZ = 0;
  for (const t of kept)
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      if (Math.abs(s.pos[o]) < 0.3 && s.pos[o + 1] > roofY) ((roofY = s.pos[o + 1]), (roofZ = s.pos[o + 2]));
    }
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const meta = {
    key: car.key,
    len: r3(bb.hi[2] - bb.lo[2]),
    wid: r3(bb.hi[0] - bb.lo[0]),
    hgt: r3(bb.hi[1]),
    wheelR: r3(rearLeft.r),
    wheels: wheels.map((w) => ({ x: r3(w.x), y: r3(w.y), z: r3(w.z), steers: w.z < 0 })),
    lamp: { y: r3(heads ? (heads.lo[1] + heads.hi[1]) / 2 : 0.7), z: r3(heads ? heads.lo[2] : bb.lo[2]) },
    roof: { y: r3(roofY), z: r3(roofZ) },
  };

  // Write it: one mesh per part and level ("paint", "paint_far", …), the frame in the scene's extras.
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("car").setExtras(meta);
  levels.forEach((lv, li) => {
    for (const k of SLOTS) {
      const m = lv[k];
      if (!m) continue;
      const prim = doc
        .createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(m.pos).setBuffer(buffer))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(m.nrm).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(m.pos.length / 3 > 65535 ? m.idx : Uint16Array.from(m.idx)).setBuffer(buffer));
      if (k === "kit" || k === "wheel") prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(m.col).setBuffer(buffer));
      const name = li ? `${k}_far` : k;
      scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
    }
  });
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bytes = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder }).writeBinary(doc);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const file = `${car.key}.${hash}.glb`;
  for (const f of readdirSync(OUT)) if (f.startsWith(`${car.key}.`) && f !== file) rmSync(path.join(OUT, f));
  writeFileSync(path.join(OUT, file), bytes);

  const tris = levels.map((lv) => SLOTS.reduce((n, k) => n + (lv[k]?.idx.length ?? 0) / 3 * (k === "wheel" ? meta.wheels.length : 1), 0)) as [number, number];
  console.log(`${car.key.padEnd(7)} ${car.file}\n        ${s.n} tris → ${seen.size} seen → near ${tris[0]} / far ${tris[1]} · ${(bytes.length / 1024).toFixed(0)} KB · ${meta.len}×${meta.wid}×${meta.hgt} m · wheels r ${meta.wheelR} · nose was ${nose} · ${((Date.now() - t0) / 1000).toFixed(1)} s\n        ${SLOTS.map((k) => `${k} ${byslot[k].length}→${(levels[0][k]?.idx.length ?? 0) / 3}`).join(" · ")}`);
  if (preview) await drawPreview(car.key, levels, meta);
  const url = String(extras.source || "").trim() || String(extras.author || "").match(/\((https?:[^)]+)\)/)?.[1] || "";
  return {
    key: car.key,
    file: `/models/cars/${file}`,
    bytes: bytes.length,
    tris,
    credit: { title: String(extras.title || car.file), author: String(extras.author || "").replace(/\s*\(https?:[^)]*\)/, ""), url, license: String(extras.license || "").replace(/\s*\(https?:[^)]*\)/, "") },
  };
}

// ---------------------------------------------------------------- previews
const SHADE: Record<Slot, [number, number, number] | null> = { paint: [0.62, 0.65, 0.7], kit: null, glass: [0.03, 0.06, 0.1], head: [1, 0.95, 0.8], tail: [0.75, 0.04, 0.05], wheel: null };
async function drawPreview(key: string, levels: Record<Slot, Mesh | null>[], meta: { wheels: { x: number; y: number; z: number }[] }) {
  mkdirSync(PREVIEW, { recursive: true });
  const views = [view(-Math.PI / 2, 0.02), view(-Math.PI * 0.8, 0.3), view(Math.PI * 0.2, 0.3), view(Math.PI, 0.05), view(-Math.PI / 2, Math.PI / 2 - 0.001)];
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  const PX = 0.012, CW = 520, CH = 300;
  levels.forEach((lv, li) => {
    // A soup of the whole car (wheels placed, the right ones turned round) to draw.
    const pos: number[] = [], col: number[] = [], nrm: number[] = [];
    for (const k of SLOTS) {
      const m = lv[k];
      if (!m) continue;
      const places = k === "wheel" ? meta.wheels : [{ x: 0, y: 0, z: 0 }];
      for (const at of places) {
        const turn = k === "wheel" && at.x > 0 ? -1 : 1;
        for (const i of m.idx) {
          pos.push(m.pos[i * 3] * turn + at.x, m.pos[i * 3 + 1] + at.y, m.pos[i * 3 + 2] * turn + at.z);
          nrm.push(m.nrm[i * 3] * turn, m.nrm[i * 3 + 1], m.nrm[i * 3 + 2] * turn);
          const sc = SHADE[k];
          col.push(...(sc ?? [m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]]));
        }
      }
    }
    const P = new Float32Array(pos);
    views.forEach((v, vi) => tiles.push({ input: shade(P, nrm, col, v, PX, CW, CH), left: vi * CW, top: li * CH }));
  });
  await sheet(path.join(PREVIEW, `${key}.png`), tiles, CW * views.length, CH * 2, CW, CH);
}

// ---------------------------------------------------------------- report
async function report(car: Car) {
  const { soup: s, info } = await read(car);
  const per = new Map<number, { n: number; lo: number[]; hi: number[]; c: number[] }>();
  const c = new Float32Array(4);
  for (let t = 0; t < s.n; t++) {
    let e = per.get(s.mat[t]);
    if (!e) per.set(s.mat[t], (e = { n: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], c: [0, 0, 0] }));
    e.n++;
    triColor(s, t, c);
    for (let k = 0; k < 3; k++) {
      e.c[k] += c[k];
      const x = centroid(s.pos, t, k);
      e.lo[k] = Math.min(e.lo[k], x);
      e.hi[k] = Math.max(e.hi[k], x);
    }
  }
  const all = bounds(s.pos, Array.from({ length: s.n }, (_, i) => i));
  const rel = (x: number, k: number) => ((x - all.lo[k]) / (all.hi[k] - all.lo[k] || 1)).toFixed(2);
  const hex = (x: number) => Math.round(Math.min(1, x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, "0");
  console.log(`\n== ${car.key} (${car.file}) — box ${all.lo.map((v, k) => (all.hi[k] - v).toFixed(2)).join(" × ")}`);
  info.forEach((m, i) => {
    const e = per.get(i);
    if (!e && m.kind !== "drop") return;
    const col = e ? `#${e.c.map((x) => hex(x / e.n)).join("")}` : "";
    const where = e ? `x ${rel(e.lo[0], 0)}–${rel(e.hi[0], 0)} y ${rel(e.lo[1], 1)}–${rel(e.hi[1], 1)} z ${rel(e.lo[2], 2)}–${rel(e.hi[2], 2)}` : "";
    console.log(`  ${m.kind.padEnd(5)} ${m.name.slice(0, 34).padEnd(34)} ${String(e?.n ?? 0).padStart(7)} ${col} ${m.alpha === "OPAQUE" ? "" : m.alpha} ${m.transmission ? "tr" + m.transmission : ""} ${m.tex ? "tex" : ""}  ${where}`);
  });
  // One picture per material, lit up in red on the grey car (side and three-quarter views):
  // .cache/cars/<key>-materials.png.
  const ids = Int32Array.from({ length: s.n }, (_, i) => i);
  const px = (all.hi[2] - all.lo[2]) / 300;
  const shots = [view(-Math.PI / 2, 0.05), view(-Math.PI * 0.78, 0.35), view(Math.PI * 0.22, 0.35)].map((v) => raster(s.pos, ids, v, px));
  const mats = [...per.keys()].filter((i) => i >= 0).sort((a, b) => a - b);
  const TW = 330, TH = 150, COLS = 2;
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  for (const [n, mi] of mats.entries()) {
    const img = Buffer.alloc(TW * 3 * TH * 3, 250);
    shots.forEach(({ W, H, id }, si) => {
      for (let y = 0; y < Math.min(H, TH - 16); y++)
        for (let x = 0; x < Math.min(W, TW); x++) {
          const t = id[y * W + x];
          if (t < 0) continue;
          const on = s.mat[t] === mi, o = ((y + 16) * TW * 3 + si * TW + x) * 3;
          img.set(on ? [220, 30, 40] : [150, 150, 155], o);
        }
    });
    const label = Buffer.from(`<svg width="${TW * 3}" height="16"><text x="4" y="12" font-family="Helvetica" font-size="12">${mi}: ${info[mi].name.replace(/[<&]/g, "")} (${info[mi].kind})</text></svg>`);
    const tile = await sharp(img, { raw: { width: TW * 3, height: TH, channels: 3 } }).composite([{ input: label, left: 0, top: 0 }]).png().toBuffer();
    tiles.push({ input: tile, left: (n % COLS) * TW * 3, top: Math.floor(n / COLS) * TH });
  }
  mkdirSync(PREVIEW, { recursive: true });
  const rows = Math.ceil(mats.length / COLS);
  await sharp({ create: { width: TW * 3 * COLS, height: TH * rows, channels: 3, background: "#ffffff" } }).composite(tiles).png().toFile(path.join(PREVIEW, `${car.key}-materials.png`));
}

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith("--"))?.split(",");
const pick = CARS.filter((c) => !only || only.includes(c.key));
await MeshoptSimplifier.ready;
if (args.includes("--report")) {
  for (const car of pick) await report(car);
} else {
  mkdirSync(OUT, { recursive: true });
  const built: Built[] = [];
  for (const car of pick) {
    if (!existsSync(path.join(SRC, car.file))) {
      console.warn(`${car.key}: ${car.file} isn't in assets/models — skipped`);
      continue;
    }
    built.push(await build(car, args.includes("--preview")));
  }
  writeManifest(built);
}

function writeManifest(built: Built[]) {
  // Cars not rebuilt this time keep their entry.
  const prev: Record<string, Built> = {};
  if (existsSync(MANIFEST)) {
    const m = /export const CAR_MODELS[^=]*= (\{[\s\S]*?\n\});/.exec(readFileSync(MANIFEST, "utf8"));
    if (m) Object.assign(prev, JSON.parse(m[1]));
  }
  for (const b of built) prev[b.key] = b;
  const entries = Object.fromEntries(CARS.filter((c) => prev[c.key] && existsSync(path.join(ROOT, "public", prev[c.key].file))).map((c) => [c.key, prev[c.key]]));
  writeFileSync(
    MANIFEST,
    `// The street cars made from real 3D models — written by scripts/cars.ts (npm run assets:cars);
// don't edit by hand. Each file's address carries a hash of its bytes (cache it forever).
// Every model is CC BY 4.0: their credits are on /credits (linked from drive mode).
import type { FleetKey } from "./fleet";

export type CarModel = {
  key: FleetKey;
  /** Under /public: <key>.<hash>.glb. */
  file: string;
  bytes: number;
  /** Triangles near and far (wheels counted four times). */
  tris: [number, number];
  credit: { title: string; author: string; url: string; license: string };
};

export const CAR_MODELS: Partial<Record<FleetKey, CarModel>> = {\n${Object.values(entries).map((e) => `  ${JSON.stringify(e.key)}: ${JSON.stringify(e)}`).join(",\n")}\n};
`,
  );
  console.log(`\n${Object.keys(entries).length} cars → ${path.relative(ROOT, MANIFEST)}`);
}
