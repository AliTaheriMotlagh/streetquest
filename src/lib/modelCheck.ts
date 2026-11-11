// Checks a .glb before it may replace a built-in model (Admin → Objects → Replace model).
// Pure: it reads only the file's JSON chunk (node names, skins, animations, accessor
// counts and bounds), so it works on Draco/meshopt-compressed models and on the server
// with no 3D library. `slotRule` says what a slot needs (its budget, the nodes the game
// looks up by name, a rig and clips for people and soldiers, a believable size).
import { msg } from "./i18n";
import { glbProblem } from "./landmarks";
import { CAR_MODELS } from "./carModels";
import { PEOPLE_MODELS } from "./peopleModels";
import { PROP_MODELS } from "./propModels";
import { WEAPON_KEYS } from "./arena/weapons";

export type Problem = { msg: string; params?: Record<string, string | number> };
export type GlbInfo = {
  bytes: number;
  tris: number;
  nodes: string[];
  joints: string[];
  clips: string[];
  materials: number;
  textures: number;
  /** World-space bounds of every mesh vertex (metres, +Y up), null when the file doesn't say. */
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
  extensions: string[];
  /** Keys of the scene's custom properties ("extras"): cars carry their wheel positions there. */
  extras: string[];
};

type Json = {
  scene?: number;
  scenes?: { nodes?: number[]; extras?: Record<string, unknown> }[];
  nodes?: { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { primitives?: { attributes?: Record<string, number>; indices?: number; mode?: number }[] }[];
  accessors?: { count?: number; min?: number[]; max?: number[]; normalized?: boolean; componentType?: number }[];
  skins?: { joints?: number[] }[];
  animations?: { name?: string }[];
  materials?: unknown[];
  textures?: unknown[];
  extensionsUsed?: string[];
};

type Mat = number[];
const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** a × b, column-major. */
function mul(a: Mat, b: Mat): Mat {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function local(n: NonNullable<Json["nodes"]>[number]): Mat {
  if (n.matrix?.length === 16) return n.matrix;
  const [x, y, z, w] = n.rotation?.length === 4 ? n.rotation : [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale?.length === 3 ? n.scale : [1, 1, 1];
  const [tx, ty, tz] = n.translation?.length === 3 ? n.translation : [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const NORM: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/** Read what a .glb says about itself. Returns the reason it can't be read instead when it isn't a usable binary glTF. */
export function inspectGlb(buf: Uint8Array): GlbInfo | { error: string } {
  const bad = glbProblem(buf);
  if (bad) return { error: bad };
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  let j: Json;
  try {
    j = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  } catch {
    return { error: msg("That file isn't a .glb model") };
  }
  const nodes = j.nodes ?? [], acc = j.accessors ?? [];
  let tris = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const seen = new Set<number>();
  const visit = (i: number, parent: Mat, depth: number) => {
    const n = nodes[i];
    if (!n || seen.has(i) || depth > 64) return;
    seen.add(i);
    const m = mul(parent, local(n));
    if (n.mesh != null) {
      for (const p of j.meshes?.[n.mesh]?.primitives ?? []) {
        const mode = p.mode ?? 4;
        const count = (p.indices != null ? acc[p.indices]?.count : acc[p.attributes?.POSITION ?? -1]?.count) ?? 0;
        tris += mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
        const pa = acc[p.attributes?.POSITION ?? -1];
        if (pa?.min?.length === 3 && pa.max?.length === 3) {
          const k = pa.normalized ? 1 / (NORM[pa.componentType ?? 0] ?? 1) : 1;
          for (let c = 0; c < 8; c++) {
            const v = [c & 1 ? pa.max[0] : pa.min[0], c & 2 ? pa.max[1] : pa.min[1], c & 4 ? pa.max[2] : pa.min[2]].map((x) => x * k);
            for (let a = 0; a < 3; a++) {
              const w = m[a] * v[0] + m[4 + a] * v[1] + m[8 + a] * v[2] + m[12 + a];
              if (w < min[a]) min[a] = w;
              if (w > max[a]) max[a] = w;
            }
          }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m, depth + 1);
  };
  const roots = j.scenes?.[j.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  for (const r of roots) visit(r, IDENT, 0);
  const joints = new Set<string>();
  for (const s of j.skins ?? []) for (const jn of s.joints ?? []) if (nodes[jn]?.name) joints.add(nodes[jn].name!);
  return {
    bytes: buf.length,
    tris,
    nodes: nodes.flatMap((n) => (n.name ? [n.name] : [])),
    joints: [...joints],
    clips: (j.animations ?? []).flatMap((a) => (a.name ? [a.name] : [])),
    materials: j.materials?.length ?? 0,
    textures: j.textures?.length ?? 0,
    bbox: min[0] === Infinity ? null : { min: min as [number, number, number], max: max as [number, number, number] },
    extensions: j.extensionsUsed ?? [],
    extras: Object.keys(j.scenes?.[j.scene ?? 0]?.extras ?? {}),
  };
}

export type SlotRule = {
  kind: "car" | "person" | "soldier" | "weapons" | "props";
  maxBytes: number;
  /** Over `warnTris` is allowed with a warning; over `maxTris` refused. */
  warnTris: number;
  maxTris: number;
  /** Nodes the game looks up by name — all must exist. */
  nodes: string[];
  /** Custom scene properties the game reads (a car's wheel positions). */
  extras?: string[];
  /** Needs a skeleton with these bones and these animation clips. */
  rig?: { joints: string[]; clips: string[] };
  /** Believable size: tallest extent (height, metres) and longest horizontal extent. */
  height: [number, number];
  maxFootprint: number;
};

/** One file no bigger than this fits a single request on every host (Vercel caps bodies at 4.5 MB). */
export const MODEL_MAX_BYTES = 4 * 1024 * 1024;

/** The arena's own files (not in a generated registry). */
export const ARENA_FILES = { soldier: "/models/arena/soldier.glb", police: "/models/arena/police.glb", weapons: "/models/arena/weapons.glb" } as const;

const CAR_PARTS = ["paint", "kit", "head", "tail", "wheel"].flatMap((p) => [p, `${p}_far`]);

/** What a slot needs, or null for a slot that doesn't exist. Slots: car:<fleet key>, person:<key>, arena:soldier, arena:police, arena:weapons, props:street. */
export function slotRule(slot: string): SlotRule | null {
  const [group, key = ""] = slot.split(":");
  const base = { maxBytes: MODEL_MAX_BYTES };
  if (group === "car" && key in CAR_MODELS) return { ...base, kind: "car", warnTris: 40_000, maxTris: 90_000, nodes: CAR_PARTS, extras: ["wheelR", "wheels", "lamp", "roof"], height: [0.8, 4.5], maxFootprint: 14 };
  if (group === "person" && PEOPLE_MODELS.some((p) => p.key === key)) return { ...base, kind: "person", warnTris: 10_000, maxTris: 30_000, nodes: [], rig: { joints: [], clips: ["walk", "idle"] }, height: [0.5, 3], maxFootprint: 3 };
  if (slot === "arena:soldier" || slot === "arena:police") return { ...base, kind: "soldier", warnTris: 40_000, maxTris: 60_000, nodes: [], rig: { joints: ["spine"], clips: ["Idle", "Walk", "Run", "Death"] }, height: [1.2, 2.4], maxFootprint: 3 };
  if (slot === "arena:weapons") return { ...base, kind: "weapons", warnTris: 40_000, maxTris: 90_000, nodes: WEAPON_KEYS.map((k) => `fp_${k}`), height: [0.05, 3], maxFootprint: 3 };
  if (slot === "props:street") return { ...base, kind: "props", warnTris: 20_000, maxTris: 40_000, nodes: Object.keys(PROP_MODELS.kinds), height: [0.3, 30], maxFootprint: 60 };
  return null;
}

/** The slot a built-in model file belongs to (what the loaders ask the manifest about), or null. */
export function slotOfUrl(url: string): string | null {
  const car = Object.values(CAR_MODELS).find((c) => c!.file === url);
  if (car) return `car:${car.key}`;
  const person = PEOPLE_MODELS.find((p) => p.url === url);
  if (person) return `person:${person.key}`;
  if (url === PROP_MODELS.url) return "props:street";
  for (const [k, f] of Object.entries(ARENA_FILES)) if (f === url) return `arena:${k}`;
  return null;
}

/** Every slot the game has, in a stable order. */
export function allSlots(): string[] {
  return [...Object.keys(CAR_MODELS).map((k) => `car:${k}`), ...PEOPLE_MODELS.map((p) => `person:${p.key}`), "arena:soldier", "arena:police", "arena:weapons", "props:street"];
}

/** The reasons a file can't replace the slot's model (`errors`) and what's worth a second look (`warnings`). */
export function checkModel(slot: string, buf: Uint8Array): { errors: Problem[]; warnings: Problem[]; info: GlbInfo | null } {
  const errors: Problem[] = [], warnings: Problem[] = [];
  const rule = slotRule(slot);
  if (!rule) return { errors: [{ msg: msg("Unknown model slot") }], warnings, info: null };
  if (buf.length > rule.maxBytes) errors.push({ msg: msg("The model is {mb} MB — keep it under {max} MB (Draco compression and WebP textures help)"), params: { mb: +(buf.length / 1048576).toFixed(1), max: +(rule.maxBytes / 1048576).toFixed(1) } });
  const info = inspectGlb(buf);
  if ("error" in info) return { errors: [...errors, { msg: info.error }], warnings, info: null };
  if (info.tris > rule.maxTris) errors.push({ msg: msg("{n} triangles is over the {max} budget for this kind of model"), params: { n: info.tris, max: rule.maxTris } });
  else if (info.tris > rule.warnTris) warnings.push({ msg: msg("{n} triangles is heavy for phones (comfortable up to {max})"), params: { n: info.tris, max: rule.warnTris } });
  if (info.tris === 0) errors.push({ msg: msg("The model has no triangles") });
  const missing = rule.nodes.filter((n) => !info.nodes.includes(n));
  if (missing.length) errors.push({ msg: msg("Missing parts the game looks for by name: {names}"), params: { names: missing.join(", ") } });
  const noExtras = (rule.extras ?? []).filter((k) => !info.extras.includes(k));
  if (noExtras.length) errors.push({ msg: msg("Missing scene properties the game reads: {names} (a car's wheel positions, lamp and roof heights)"), params: { names: noExtras.join(", ") } });
  if (rule.rig) {
    if (!info.joints.length) errors.push({ msg: msg("The model has no skeleton — export it rigged (with its skin)") });
    const noBones = rule.rig.joints.filter((b) => !info.joints.includes(b));
    if (info.joints.length && noBones.length) errors.push({ msg: msg("Missing bones: {names}"), params: { names: noBones.join(", ") } });
    const noClips = rule.rig.clips.filter((c) => !info.clips.includes(c));
    if (noClips.length) errors.push({ msg: msg("Missing animation clips: {names}"), params: { names: noClips.join(", ") } });
  }
  // A skinned mesh's bounds are its bind pose, not what the skeleton draws (people are also scaled to their height in game): no size check.
  if (rule.rig) {
    /* size comes from the rig */
  } else if (info.bbox) {
    const [sx, sy, sz] = [0, 1, 2].map((a) => info.bbox!.max[a] - info.bbox!.min[a]);
    if (!(sy >= rule.height[0] && sy <= rule.height[1])) errors.push({ msg: msg("The model is {h} m tall — expected {lo}–{hi} m. Check the export scale (metres, +Y up)"), params: { h: +sy.toFixed(2), lo: rule.height[0], hi: rule.height[1] } });
    if (Math.max(sx, sz) > rule.maxFootprint) errors.push({ msg: msg("The model is {w} m wide — expected at most {max} m. Check the export scale (metres)"), params: { w: +Math.max(sx, sz).toFixed(1), max: rule.maxFootprint } });
  } else warnings.push({ msg: msg("The file doesn't say how big the model is, so its size wasn't checked") });
  return { errors, warnings, info };
}
