// Landmarks (pure — client and server): a store's own 3D building in the drive city.
// An admin builds it in Blender on the real footprint (exported from the admin panel),
// uploads the .glb, and it replaces the map's building at that spot.
//
// Model frame = footprint frame: origin at the landmark's pin, +X east, −Z north, +Y up,
// 1 unit = 1 metre (Blender's top view is the map: +X east, +Y north). `yaw` turns it
// clockwise seen from above, `scale` and `lift` fine-tune; a model made on the exported
// footprint keeps 0 / 1 / 0.
import { msg } from "./i18n";

/** Largest .glb accepted. Fits one request on every host (Vercel caps bodies at 4.5 MB). */
export const LANDMARK_MAX_BYTES = 4 * 1024 * 1024;
export const LANDMARK_LIMITS = { name: 60 } as const;
/** Drive mode asks for landmarks this far around, and loads models this close. */
export const LANDMARK_LIST_M = 3000;
export const LANDMARK_LOAD_M = 700;
export const LANDMARK_DROP_M = 1000;
/** Most outline points kept (a convex hull is small; this caps what clients may send). */
export const HULL_MAX_POINTS = 64;

/**
 * What one model may cost so drive mode stays smooth on phones: over `warn` the admin
 * panel says so, over `max` it refuses the upload.
 */
export const BUDGET = {
  triangles: { warn: 60_000, max: 250_000 },
  materials: { warn: 12, max: 40 },
  texturePx: { warn: 2048, max: 4096 },
  textures: { warn: 10, max: 32 },
  bytes: { warn: 2.5 * 1024 * 1024, max: LANDMARK_MAX_BYTES },
} as const;
export type ModelStats = { triangles: number; materials: number; textures: number; texturePx: number; meshes: number; bytes: number };
export const BUDGET_LABEL: Record<keyof typeof BUDGET, string> = {
  triangles: msg("Triangles"),
  materials: msg("Materials"),
  texturePx: msg("Largest texture (px)"),
  textures: msg("Textures"),
  bytes: msg("File size"),
};

/** A landmark as drive mode sees it. */
export type LandmarkView = {
  id: string;
  name: string;
  businessId: string | null;
  emoji: string;
  lat: number;
  lng: number;
  yaw: number;
  scale: number;
  lift: number;
  hull: number[];
  height: number;
  /** The model's address (changes whenever the file does, so it can be cached forever). */
  url: string | null;
};

export const modelUrl = (id: string, hash: string) => (hash ? `/landmark/${id}/${hash}.glb` : null);

/**
 * Model metres → world metres around the pin (x east, z south): scale, turn by `yaw`
 * (clockwise from above), then move to the pin's spot `at`.
 */
export function placeHull(hull: number[], yawDeg: number, scale: number, at: { x: number; z: number }) {
  const a = (-yawDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i + 1 < hull.length; i += 2) {
    const x = hull[i] * scale, z = hull[i + 1] * scale;
    out.push(at.x + x * c + z * s, at.z - x * s + z * c);
  }
  return out;
}

/** Convex hull (monotone chain) of x/z pairs, counter-clockwise, as a flat list. */
export function convexHull(pts: number[]): number[] {
  const P: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P.flat();
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of P) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].flat();
}

/** Drop near-collinear points until the hull fits HULL_MAX_POINTS. */
export function simplifyHull(h: number[]): number[] {
  const pts = [...h];
  while (pts.length / 2 > HULL_MAX_POINTS) {
    let best = 0, bestA = Infinity;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const area = Math.abs((pts[i * 2] - pts[a * 2]) * (pts[b * 2 + 1] - pts[a * 2 + 1]) - (pts[b * 2] - pts[a * 2]) * (pts[i * 2 + 1] - pts[a * 2 + 1]));
      if (area < bestA) (bestA = area), (best = i);
    }
    pts.splice(best * 2, 2);
  }
  return pts;
}

/**
 * Check a .glb before storing it: binary glTF 2.0, the length it claims, everything
 * embedded (no outside files) and only extensions drive mode can decode. Returns the
 * reason it can't be used, or null.
 */
export function glbProblem(buf: Uint8Array): string | null {
  if (buf.length < 20) return msg("That file isn't a .glb model");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return msg("That file isn't a .glb model — export as glTF Binary (.glb)");
  if (dv.getUint32(4, true) !== 2) return msg("Only glTF 2.0 models are supported");
  if (dv.getUint32(8, true) !== buf.length) return msg("The model file is cut short — export it again");
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLen > buf.length) return msg("That file isn't a .glb model");
  let json: { extensionsRequired?: string[]; buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try {
    json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  } catch {
    return msg("That file isn't a .glb model");
  }
  const external = (list?: { uri?: string }[]) => (list ?? []).some((x) => x.uri != null && !x.uri.startsWith("data:"));
  if (external(json.buffers) || external(json.images)) return msg("The model points at outside files — export as .glb with everything packed in");
  const unsupported = (json.extensionsRequired ?? []).filter((e) => !SUPPORTED_EXTENSIONS.includes(e));
  if (unsupported.length) return msg("The model needs an extension drive mode can't read — export without KTX2/Basis textures");
  return null;
}
/** Required glTF extensions the drive loader handles (GLTFLoader + Draco + meshopt). */
const SUPPORTED_EXTENSIONS = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform", "EXT_texture_webp", "KHR_materials_emissive_strength", "KHR_materials_unlit"];
