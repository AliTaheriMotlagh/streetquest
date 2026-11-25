// A store owner's 3D scan, checked before it is stored (pure — server and browser; tests/glbCheck.test.ts). The scan
// is a binary glTF (.glb) exported by a phone scanning app (Polycam, Scaniverse, RealityScan, Luma…) and optimised in
// the owner's browser (components/game/scan.ts: meshopt geometry, WebP textures no bigger than 2048 px) before upload;
// this reads only its header and JSON chunk: the right magic and version, lengths that add up, nothing the game's
// loader can't draw (extensionsRequired), and how heavy it is (triangles, textures) against the caps below.
import { msg } from "./i18n";

/** Caps for a stored scan: what a mid-range phone draws smoothly as a whole room. */
export const SCAN_LIMITS = { bytes: 12 * 1024 * 1024, triangles: 600_000, textures: 16, textureSize: 2048 } as const;

/** Extensions the game's loader (three.js GLTFLoader + meshopt + Draco, components/drive/gltf.ts) handles. */
const SUPPORTED = new Set([
  "KHR_mesh_quantization", "EXT_meshopt_compression", "KHR_meshopt_compression", "KHR_draco_mesh_compression", "EXT_texture_webp",
  "KHR_texture_transform", "KHR_materials_unlit", "KHR_materials_emissive_strength", "KHR_materials_ior", "KHR_materials_specular",
  "KHR_materials_transmission", "KHR_materials_volume", "KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_lights_punctual",
]);

export type GlbInfo = { triangles: number; meshes: number; textures: number; materials: number; required: string[] };
export type GlbCheck = { ok: true; info: GlbInfo } | { ok: false; problem: string };

type Json = {
  asset?: { version?: string };
  extensionsRequired?: string[];
  meshes?: { primitives?: { indices?: number; attributes?: { POSITION?: number }; mode?: number }[] }[];
  accessors?: { count?: number }[];
  images?: unknown[];
  materials?: unknown[];
};

/** Read a .glb's header and JSON (no geometry is decoded). */
export function checkGlb(buf: ArrayBuffer | Uint8Array): GlbCheck {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteLength > SCAN_LIMITS.bytes) return { ok: false, problem: msg("The scan is too big (12 MB at most) — export it smaller") };
  if (u8.byteLength < 20) return { ok: false, problem: msg("That isn't a 3D scan (.glb)") };
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // "glTF", version 2, the whole file's length.
  if (dv.getUint32(0, true) !== 0x46546c67) return { ok: false, problem: msg("That isn't a 3D scan (.glb)") };
  if (dv.getUint32(4, true) !== 2) return { ok: false, problem: msg("Only glTF 2 scans (.glb) can be used") };
  if (dv.getUint32(8, true) !== u8.byteLength) return { ok: false, problem: msg("The scan file is damaged — export it again") };
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLen > u8.byteLength) return { ok: false, problem: msg("The scan file is damaged — export it again") };
  let json: Json;
  try {
    json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jsonLen))) as Json;
  } catch {
    return { ok: false, problem: msg("The scan file is damaged — export it again") };
  }
  if (!json.asset?.version?.startsWith("2")) return { ok: false, problem: msg("Only glTF 2 scans (.glb) can be used") };
  const required = json.extensionsRequired ?? [];
  if (required.some((e) => !SUPPORTED.has(e))) return { ok: false, problem: msg("The scan uses a format the game can't show — export it as a plain .glb") };
  let triangles = 0;
  for (const m of json.meshes ?? [])
    for (const p of m.primitives ?? []) {
      const mode = p.mode ?? 4;
      if (mode !== 4 && mode !== 5 && mode !== 6) continue; // points and lines aren't surfaces
      const n = p.indices != null ? json.accessors?.[p.indices]?.count ?? 0 : json.accessors?.[p.attributes?.POSITION ?? -1]?.count ?? 0;
      triangles += mode === 4 ? Math.floor(n / 3) : Math.max(0, n - 2);
    }
  const info: GlbInfo = { triangles, meshes: json.meshes?.length ?? 0, textures: json.images?.length ?? 0, materials: json.materials?.length ?? 0, required };
  if (!info.meshes || !triangles) return { ok: false, problem: msg("The scan has nothing in it") };
  if (triangles > SCAN_LIMITS.triangles) return { ok: false, problem: msg("The scan is too detailed — export it with fewer triangles") };
  if (info.textures > SCAN_LIMITS.textures) return { ok: false, problem: msg("The scan has too many textures") };
  return { ok: true, info };
}

/** A scan's quarter turns, 0–3. */
export const quarterTurns = (n: unknown) => (((Math.round(Number(n) || 0) % 4) + 4) % 4);
