// People on the 3D city's pavements from real rigged, animated models (assets/models/character/
// *.glb, fetched with `npm run assets:get -- <uid> --kind=character --as=<name>` and credited in
// assets/credits.json):
//
//   npm run assets:people              build public/models/people/<name>.<hash>.glb + src/lib/peopleModels.ts
//   npm run assets:people -- --report  each source's node tree, materials and animations
//
// For phones: no face shapes (morph targets); only the clips the street needs are kept (walk, run, idle and, when the source
// has one, fall — under those names), resampled; textures shrunk to 512 px WebP (the base
// colour and normal map — nothing else); geometry quantized and meshopt-compressed.
// Height, feet on the ground and facing are set when the game loads a model (peopleModels.ts
// measures the skinned figure with three.js itself: these rigs' stored rest pose lies flat,
// only their clips stand them up).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Animation, type Document, NodeIO, type Node as GNode } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import type { Credit } from "../src/lib/assetLicense";
import credits from "../assets/credits.json";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets/models/character");
const OUT = path.join(ROOT, "public/models/people");
const MANIFEST = path.join(ROOT, "src/lib/peopleModels.ts");
const REPORT = process.argv.includes("--report");

type Clip = "walk" | "run" | "idle" | "fall";

type Person = {
  key: string;
  file: string;
  /** Real height (m) the game scales it to. */
  height: number;
  /** Source animation name (regex) for each clip the street uses. */
  clips: Partial<Record<Clip, string>>;
  /** Ground speed (m/s) the walk and run cycles were made for (feet don't skate when matched). */
  pace: { walk: number; run: number };
};

const PEOPLE: Person[] = [
  { key: "casual", file: "casual.glb", height: 1.76, clips: { walk: "man_walk_in_place$", run: "man_run_in_place$", idle: "man_idle$", fall: "man_fall$" }, pace: { walk: 1.35, run: 3.9 } },
  { key: "casual2", file: "casual2.glb", height: 1.78, clips: { walk: "new_man_walk_in_place$", run: "new_man_run_in_place$", idle: "new_man_idle$", fall: "new_man_fall$" }, pace: { walk: 1.35, run: 3.9 } },
  { key: "suit", file: "businessman.glb", height: 1.8, clips: { walk: "\\|walk$", run: "\\|run$", idle: "\\|idle$" }, pace: { walk: 1.3, run: 3.8 } },
];

const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

function report(doc: Document, name: string) {
  console.log(`\n=== ${name}`);
  const show = (n: GNode, d: number) => {
    if (d > 3) return;
    const f = (a: number[]) => a.map((v) => +v.toFixed(3)).join(",");
    console.log(`${"  ".repeat(d)}${n.getName()} t[${f(n.getTranslation())}] r[${f(n.getRotation())}] s[${f(n.getScale())}]${n.getMesh() ? " MESH" : ""}${n.getSkin() ? " SKIN" : ""}`);
    for (const c of n.listChildren()) show(c, d + 1);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) show(n, 0);
  for (const m of doc.getRoot().listMaterials()) console.log("material", m.getName(), { base: !!m.getBaseColorTexture(), normal: !!m.getNormalTexture(), mr: !!m.getMetallicRoughnessTexture(), occ: !!m.getOcclusionTexture() });
  for (const t of doc.getRoot().listTextures()) console.log("texture", t.getMimeType(), t.getSize());
  for (const a of doc.getRoot().listAnimations()) console.log("animation", a.getName(), a.listChannels().length);
}

/** Gone with its channels and samplers (a disposed animation alone leaves them holding their keyframes). */
function dropAnimation(a: Animation) {
  for (const ch of a.listChannels()) ch.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

/** Fingers and faces nobody sees from the road; bones that only ever turn. */
const STILL_BONES = /index|middle|ring|pinky|thumb|eye|lid|lip|jaw|tongue|brow|face|teeth|cheek/i;
/** Long clips are cut to this (a standing loop doesn't need eleven seconds). */
const MAX_CLIP_S = 4;

/**
 * Leaner animation for phones: no channels for fingers and the face, no scale tracks,
 * translation only on the hips (the rest only rotate), and long clips cut short.
 */
function slim(doc: Document) {
  for (const a of doc.getRoot().listAnimations()) {
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode(), path = ch.getTargetPath();
      const name = node?.getName() ?? "";
      const keepMove = path === "translation" && /hip|root|pelvis/i.test(name);
      if (!node || STILL_BONES.test(name) || path === "scale" || (path === "translation" && !keepMove)) {
        ch.dispose();
      }
    }
    // Samplers no channel uses any more.
    const used = new Set(a.listChannels().map((ch) => ch.getSampler()));
    for (const smp of a.listSamplers()) if (!used.has(smp)) smp.dispose();
    for (const smp of a.listSamplers()) {
      const inp = smp.getInput(), out = smp.getOutput();
      if (!inp || !out) continue;
      const t = inp.getArray()!;
      let n = t.length;
      while (n > 2 && t[n - 1] > MAX_CLIP_S) n--;
      if (n === t.length) continue;
      const stride = out.getElementSize() * (smp.getInterpolation() === "CUBICSPLINE" ? 3 : 1);
      inp.setArray(Float32Array.from(t.subarray(0, n)));
      out.setArray(Float32Array.from(out.getArray()!.subarray(0, n * stride)));
    }
  }
}

async function build(p: Person) {
  const file = path.join(SRC, p.file);
  if (!existsSync(file)) {
    console.log(`${p.key.padEnd(8)} ${p.file}: missing — skipped`);
    return null;
  }
  const doc = await io().read(file);
  if (REPORT) return report(doc, p.file), null;
  const root = doc.getRoot();

  // The street's clips, renamed; every other animation goes.
  const kept: Clip[] = [];
  for (const a of root.listAnimations()) {
    const role = (Object.keys(p.clips) as Clip[]).find((c) => new RegExp(p.clips[c]!).test(a.getName()) && !kept.includes(c));
    if (role) (a.setName(role), kept.push(role));
    else dropAnimation(a);
  }
  const missing = (["walk", "run", "idle"] as Clip[]).filter((c) => !kept.includes(c));
  if (missing.length) throw new Error(`${p.file}: no ${missing.join(", ")} clip — check the regexes with --report`);
  slim(doc);

  // No face shapes (lip sync nobody sees from the road): they were most of the file.
  for (const m of root.listMeshes()) {
    for (const pr of m.listPrimitives()) for (const t of pr.listTargets()) t.dispose();
    m.setWeights([]);
  }

  // Base colour and normal map only, a matte cloth/skin finish.
  for (const m of root.listMaterials()) {
    m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(0.85).setEmissiveFactor([0, 0, 0]).setDoubleSided(false);
  }

  await doc.transform(resample({ tolerance: 1e-3 }), prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 82 }));
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bytes = await io().writeBinary(doc);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const name = `${p.key}.${hash}.glb`;
  writeFileSync(path.join(OUT, name), bytes);
  let tris = 0;
  for (const m of root.listMeshes()) for (const pr of m.listPrimitives()) tris += (pr.getIndices()?.getCount() ?? pr.getAttribute("POSITION")!.getCount()) / 3;
  const credit = (credits as Credit[]).find((cr) => cr.file === path.relative(ROOT, file)) ?? null;
  console.log(`${p.key.padEnd(8)} ${p.file}: ${(bytes.length / 1e6).toFixed(2)} MB · ${tris} tris · clips ${kept.join(" ")}${credit ? "" : " · NO CREDIT in assets/credits.json"}`);
  return { key: p.key, url: `/models/people/${name}`, bytes: bytes.length, tris, height: p.height, clips: kept, pace: p.pace, credit: credit && { title: credit.title, author: credit.author, url: credit.url, license: credit.license } };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const built = [];
  for (const p of PEOPLE) {
    const b = await build(p);
    if (b) built.push(b);
  }
  if (REPORT) return;
  // Old builds go (a rebuilt model gets a new hashed name).
  const keep = new Set(built.map((b) => path.basename(b.url)));
  for (const f of readdirSync(OUT)) if (!keep.has(f)) rmSync(path.join(OUT, f));
  const body = `// Generated by \`npm run assets:people\` (scripts/people.ts) — don't edit by hand.
// People on the pavements from real rigged models, with the clips the street uses ("walk",
// "run", "idle" and, when the source has one, "fall"); \`height\` is what the game scales each
// to, \`pace\` the ground speed (m/s) each cycle was made for. Credits go on /credits.
export type PersonClip = "walk" | "run" | "idle" | "fall";
export type PersonModel = { key: string; url: string; bytes: number; tris: number; height: number; clips: PersonClip[]; pace: { walk: number; run: number }; credit: { title: string; author: string; url: string; license: string } | null };
export const PEOPLE_MODELS: PersonModel[] = ${JSON.stringify(built)};
`;
  writeFileSync(MANIFEST, body);
  console.log(`\n${built.length} people → ${path.relative(ROOT, OUT)} · ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
