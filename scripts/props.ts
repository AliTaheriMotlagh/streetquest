// Street furniture for the 3D city from real models (assets/models/prop/*.glb, fetched with
// `npm run assets:get -- <uid> --kind=prop --as=<name>` and credited in assets/credits.json):
//
//   npm run assets:props                 build public/models/props/props.<hash>.glb + src/lib/propModels.ts
//   npm run assets:props -- --preview    also draw <out>/props.png (every model, four views; --out=<dir>)
//   npm run assets:props -- --report     list each source's materials and triangles (to write `drop`)
//
// Each model becomes one mesh the city draws instanced (world3d.ts: a street of trees is one
// draw call): every triangle's colour baked from its material and texture into vertex
// colours (no textures to download), standing on y = 0 with the foot of its post or trunk
// at the origin (the middle of what touches the ground), turned to the city's convention
// (a lamp's arm, a bench's seat and a kiosk's window to the street, +z; a bus shelter open
// to it, −z), scaled to its real height and simplified to a triangle budget. Models a
// placement can't find stay the procedural ones (world3d makeTemplates).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { lin, readGltf, shade, sheet, view, weld, type Mesh } from "./lib/meshSoup";
import type { Credit } from "../src/lib/assetLicense";
import credits from "../assets/credits.json";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets/models/prop");
const OUT = path.join(ROOT, "public/models/props");
const MANIFEST = path.join(ROOT, "src/lib/propModels.ts");
const PREVIEW = path.resolve(process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? path.join(ROOT, ".cache/props"));

/** What the city draws from a model (world3d PropKind, plus tree variants). */
export type ModelKind = "tree" | "pine" | "lamp" | "bus" | "bench" | "bin" | "hydrant" | "dumpster";

type Prop = {
  kind: ModelKind;
  file: string;
  /** Real height (m) of the top of the model. */
  height: number;
  /** Triangles at most. */
  budget: number;
  /** Turn (degrees about +y) after the automatic facing. */
  turn?: number;
  /** Materials (regex on the name) left out: ground plates, shadows. */
  drop?: string;
  /** A street lamp: turned so its arm reaches +z, over the street. */
  arm?: boolean;
  /** Material name (regex) → a flat colour (sRGB hex) instead of its own. */
  paint?: [string, string][];
};

const PROPS: Prop[] = [
  // A full, round broadleaf (the city's plane trees) and a few pines. (A leaf-card tree baked
  // into vertex colours comes out sparse and spiky: solid foliage only.)
  { kind: "tree", file: "tree_leaf.glb", height: 7.5, budget: 760 },
  { kind: "pine", file: "tree_uday.glb", height: 8.5, budget: 600 },
  { kind: "lamp", file: "lamp_pk.glb", height: 7, budget: 400, arm: true },
  // Its open side faces −x in the source; the city wants it open to the road (−z).
  { kind: "bus", file: "bus.glb", height: 2.7, budget: 700, turn: -90 },
  { kind: "bench", file: "bench.glb", height: 0.85, budget: 300 },
  { kind: "bin", file: "bin.glb", height: 1.0, budget: 220 },
  { kind: "hydrant", file: "hydrant.glb", height: 0.75, budget: 260, paint: [["fire_hydrant", "#b8322a"]] },
  { kind: "dumpster", file: "dumpster.glb", height: 1.35, budget: 320 },
];

type Built = { kind: ModelKind; mesh: Mesh; height: number; top: [number, number, number]; credit: Credit | null };

async function build(p: Prop): Promise<Built | null> {
  const file = path.join(SRC, p.file);
  if (!existsSync(file)) {
    console.log(`${p.kind.padEnd(9)} ${p.file}: missing — the procedural one stays`);
    return null;
  }
  const drop = p.drop ? new RegExp(p.drop, "i") : null;
  const { soup: s, mats } = await readGltf(file, (m) => (drop && m && drop.test(m.getName()) ? "drop" : "keep"));
  // Flat colours where a source's own are wrong or missing.
  for (const [re, hex] of p.paint ?? []) {
    const rx = new RegExp(re, "i"), rgb = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    for (let t = 0; t < s.n; t++) if (s.mat[t] >= 0 && rx.test(mats[s.mat[t]].getName())) for (let k = 0; k < 3; k++) s.col.set(rgb, t * 12 + k * 4);
  }
  const all = Array.from({ length: s.n }, (_, i) => i);
  // Bounds and the foot: the middle of everything in the lowest 6 % of the height.
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < s.n * 9; i += 3) (y0 = Math.min(y0, s.pos[i])), (y1 = Math.max(y1, s.pos[i]));
  const H = y1 - y0 || 1;
  const foot = slice(s.pos, y0, y0 + H * 0.06);
  // Up top (a lamp's head): which way it leans from the foot.
  const head = slice(s.pos, y1 - H * 0.2, y1);
  let yaw = 0;
  if (p.arm && Math.hypot(head.x - foot.x, head.z - foot.z) > H * 0.03) yaw = Math.atan2(head.x - foot.x, head.z - foot.z);
  const turn = -yaw + ((p.turn ?? 0) * Math.PI) / 180;
  const k = p.height / H, c = Math.cos(turn), sn = Math.sin(turn);
  for (let i = 0; i < s.n * 3; i++) {
    const o = i * 3;
    const x = (s.pos[o] - foot.x) * k, y = (s.pos[o + 1] - y0) * k, z = (s.pos[o + 2] - foot.z) * k;
    s.pos[o] = x * c + z * sn;
    s.pos[o + 1] = y;
    s.pos[o + 2] = -x * sn + z * c;
    const nx = s.nrm[o], nz = s.nrm[o + 2];
    s.nrm[o] = nx * c + nz * sn;
    s.nrm[o + 2] = -nx * sn + nz * c;
  }
  const mesh = weld(s, all, p.budget, 0.02 * p.height, [0, 0, 0], true);
  if (!mesh) return null;
  const top = slice(s.pos, p.height * 0.8, p.height * 1.01);
  const credit = (credits as Credit[]).find((c) => c.file === path.relative(ROOT, file)) ?? null;
  console.log(`${p.kind.padEnd(9)} ${p.file}: ${s.n} → ${mesh.idx.length / 3} tris · ${p.height} m${p.arm ? ` · arm turned ${Math.round((yaw * 180) / Math.PI)}°` : ""}${credit ? "" : " · NO CREDIT in assets/credits.json"}`);
  return { kind: p.kind, mesh, height: p.height, top: [round(top.x), round(top.y), round(top.z)], credit };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Middle (x, z) and mean height of the corners whose height is within [lo, hi]. */
function slice(pos: Float32Array, lo: number, hi: number) {
  let x = 0, y = 0, z = 0, n = 0;
  for (let i = 0; i < pos.length; i += 3)
    if (pos[i + 1] >= lo && pos[i + 1] <= hi) (x += pos[i]), (y += pos[i + 1]), (z += pos[i + 2]), n++;
  return n ? { x: x / n, y: y / n, z: z / n } : { x: 0, y: lo, z: 0 };
}

async function write(built: Built[]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("props");
  for (const b of built) {
    const m = b.mesh;
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(m.pos).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(m.nrm).setBuffer(buffer))
      .setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(m.col).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(m.pos.length / 3 > 65535 ? m.idx : Uint16Array.from(m.idx)).setBuffer(buffer));
    scene.addChild(doc.createNode(b.kind).setMesh(doc.createMesh(b.kind).addPrimitive(prim)));
  }
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bytes = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder }).writeBinary(doc);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  const file = `props.${hash}.glb`;
  for (const f of readdirSync(OUT)) if (f.startsWith("props.") && f !== file) rmSync(path.join(OUT, f));
  writeFileSync(path.join(OUT, file), bytes);

  const kinds = Object.fromEntries(built.map((b) => [b.kind, { tris: b.mesh.idx.length / 3, height: b.height, top: b.top }]));
  const used = built.map((b) => b.credit).filter((c): c is Credit => !!c);
  writeFileSync(
    MANIFEST,
    `// Generated by \`npm run assets:props\` (scripts/props.ts) — don't edit by hand.
// Street furniture from real models: one vertex-coloured mesh per kind in one file (named by
// kind), each standing on y = 0 at its foot, facing the city's way; \`top\` is where its top
// is (a lamp's head). Credits go on /credits.
export type PropModelKind = ${built.map((b) => JSON.stringify(b.kind)).join(" | ")};
export const PROP_MODELS = {
  url: "/models/props/${file}",
  bytes: ${bytes.length},
  kinds: ${JSON.stringify(kinds)} as Record<PropModelKind, { tris: number; height: number; top: [number, number, number] }>,
  credits: ${JSON.stringify(used.map((c) => ({ title: c.title, author: c.author, url: c.url, license: c.license })))},
};
`,
  );
  console.log(`\n${built.length} models · ${(bytes.length / 1024).toFixed(0)} KB → public/models/props/${file}, src/lib/propModels.ts`);
}

async function preview(built: Built[]) {
  mkdirSync(PREVIEW, { recursive: true });
  const CW = 220, CH = 260;
  const views = [view(0, 0.02), view(Math.PI / 2, 0.02), view(Math.PI * 0.25, 0.4), view(0, Math.PI / 2 - 0.001)];
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  built.forEach((b, bi) => {
    const m = b.mesh, n = m.idx.length / 3;
    const pos = new Float32Array(n * 9), nrm = new Float32Array(n * 9), col = new Float32Array(n * 9);
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 3; k++) {
        const i = m.idx[t * 3 + k];
        pos.set(m.pos.subarray(i * 3, i * 3 + 3), t * 9 + k * 3);
        nrm.set(m.nrm.subarray(i * 3, i * 3 + 3), t * 9 + k * 3);
        col.set(m.col.subarray(i * 3, i * 3 + 3), t * 9 + k * 3);
      }
    // A red stick along +z from the foot: the way the model faces the street.
    const px = Math.max(b.height, 1.2) / (CH - 20);
    views.forEach((v, vi) => tiles.push({ input: shade(pos, nrm, col, v, px, CW, CH), left: vi * CW, top: bi * CH }));
  });
  const file = path.join(PREVIEW, "props.png");
  await sheet(file, tiles, CW * views.length, CH * built.length, CW, CH);
  console.log(`preview → ${file} (views: from +z (the street), from +x, above-front, top; row per model)`);
}

async function report() {
  for (const p of PROPS) {
    const file = path.join(SRC, p.file);
    if (!existsSync(file)) continue;
    const names: Record<string, number> = {};
    const { soup, mats } = await readGltf(file, () => "keep");
    for (const mi of soup.mat) names[mi >= 0 ? mats[mi].getName() : "(none)"] = (names[mi >= 0 ? mats[mi].getName() : "(none)"] ?? 0) + 1;
    console.log(`${p.kind} ${p.file}: ${Object.entries(names).map(([n, c]) => `${n} ${c}`).join(" · ")}`);
  }
}

await MeshoptSimplifier.ready;
if (process.argv.includes("--report")) await report();
else {
  const built = (await Promise.all(PROPS.map(build))).filter((b): b is Built => !!b);
  await write(built);
  if (process.argv.includes("--preview")) await preview(built);
}
