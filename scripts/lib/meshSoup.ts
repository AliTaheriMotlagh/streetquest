// Shared by the asset pipelines that turn Sketchfab models into the game's light,
// vertex-coloured meshes (scripts/cars.ts, scripts/props.ts):
//  - readGltf: every triangle of a .glb in world space, its colour baked from the material's
//    factor × texture × vertex colour (so the game needs no textures), sorted into the
//    caller's kinds by material;
//  - view / raster: an orthographic software rasterizer (which triangle each pixel shows),
//    for "what can be seen" passes and preview sheets;
//  - shade: one view of a triangle soup, lit flat, as raw RGB for a preview.
import path from "node:path";
import { NodeIO, type Material } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

export type V3 = [number, number, number];
export type View = { d: V3; r: V3; u: V3 };
export type Img = { w: number; h: number; px: Buffer };
/** Every triangle: positions (9 per), normals (9 per), linear RGBA colours (12 per), its kind and source material index. */
export type Soup<K> = { pos: Float32Array; nrm: Float32Array; col: Float32Array; kind: K[]; mat: number[]; n: number };

type SpecGloss = { getDiffuseFactor(): number[]; getDiffuseTexture(): (object & { getImage(): Uint8Array | null }) | null; getDiffuseTextureInfo(): { getTexCoord(): number } | null };

export const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LIN = Float32Array.from({ length: 256 }, (_, i) => lin(i / 255));

/** Bilinear, wrapping, linear RGB + alpha. */
export function sample(img: Img, u: number, v: number, out: number[]) {
  const x = (((u % 1) + 1) % 1) * img.w - 0.5, y = (((v % 1) + 1) % 1) * img.h - 0.5;
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
  for (let c = 0; c < 4; c++) {
    const at = (xx: number, yy: number) => {
      const b = img.px[(yy * img.w + xx) * 4 + c];
      return c < 3 ? LIN[b] : b / 255;
    };
    out[c] = (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
  }
}

export function faceNormal(pos: Float32Array, t: number, out: Float32Array) {
  const o = t * 9;
  const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
  const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
  let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
  const l = Math.hypot(x, y, z) || 1;
  x /= l;
  y /= l;
  z /= l;
  for (let k = 0; k < 3; k++) out.set([x, y, z], o + k * 3);
}

/**
 * Read a .glb into a triangle soup in world space. `classify` sorts each material into the
 * caller's kinds ("drop" leaves its triangles out).
 */
export async function readGltf<K extends string>(file: string, classify: (m: Material | null) => K | "drop") {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const imgs = new Map<object, Img | null>();
  const image = async (t: object & { getImage(): Uint8Array | null }) => {
    if (!imgs.has(t)) {
      const b = t.getImage();
      const r = b ? await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).catch(() => null) : null;
      imgs.set(t, r ? { w: r.info.width, h: r.info.height, px: r.data } : null);
    }
    return imgs.get(t)!;
  };
  const mats = doc.getRoot().listMaterials();
  const kinds = mats.map((m) => classify(m));
  const list: { prim: import("@gltf-transform/core").Primitive; world: number[] }[] = [];
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) if (prim.getMode() === 4) list.push({ prim, world: node.getWorldMatrix() as number[] });
  });
  let total = 0;
  for (const { prim } of list) total += (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")!.getCount()) / 3;
  const soup: Soup<K> = { pos: new Float32Array(total * 9), nrm: new Float32Array(total * 9), col: new Float32Array(total * 12), kind: [], mat: [], n: 0 };
  const v = [0, 0, 0], nv = [0, 0, 0], uv = [0, 0], c = [1, 1, 1, 1], tc = [1, 1, 1, 1];
  const noMat = classify(null);
  for (const { prim, world: W } of list) {
    const m = prim.getMaterial();
    const mi = m ? mats.indexOf(m) : -1;
    const kind = mi >= 0 ? kinds[mi] : noMat;
    if (kind === "drop") continue;
    const P = prim.getAttribute("POSITION")!, N = prim.getAttribute("NORMAL"), C = prim.getAttribute("COLOR_0");
    // Older exports keep the colour in the specular-glossiness extension's diffuse instead.
    const sg = m && !m.getBaseColorTexture() ? (m.getExtension("KHR_materials_pbrSpecularGlossiness") as SpecGloss | null) : null;
    const ti = sg ? sg.getDiffuseTextureInfo() : m?.getBaseColorTextureInfo(), tex = sg ? sg.getDiffuseTexture() : m?.getBaseColorTexture();
    const T = tex ? prim.getAttribute(`TEXCOORD_${ti?.getTexCoord() ?? 0}`) : null;
    const img = tex && T ? await image(tex) : null;
    const base = sg ? sg.getDiffuseFactor() : (m?.getBaseColorFactor() ?? [1, 1, 1, 1]);
    const I = prim.getIndices();
    const count = I ? I.getCount() : P.getCount();
    // Normal matrix: the world matrix's upper 3×3 (uniform-ish scales in these exports).
    const flip = W[0] * (W[5] * W[10] - W[6] * W[9]) - W[4] * (W[1] * W[10] - W[2] * W[9]) + W[8] * (W[1] * W[6] - W[2] * W[5]) < 0;
    for (let i = 0; i < count; i += 3) {
      const t = soup.n++;
      for (let k = 0; k < 3; k++) {
        const vi = I ? I.getScalar(i + (flip ? 2 - k : k)) : i + (flip ? 2 - k : k);
        P.getElement(vi, v);
        const o = t * 9 + k * 3;
        soup.pos[o] = W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12];
        soup.pos[o + 1] = W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13];
        soup.pos[o + 2] = W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14];
        if (N) {
          N.getElement(vi, nv);
          const x = W[0] * nv[0] + W[4] * nv[1] + W[8] * nv[2], y = W[1] * nv[0] + W[5] * nv[1] + W[9] * nv[2], z = W[2] * nv[0] + W[6] * nv[1] + W[10] * nv[2];
          const l = Math.hypot(x, y, z) || 1;
          soup.nrm[o] = x / l;
          soup.nrm[o + 1] = y / l;
          soup.nrm[o + 2] = z / l;
        }
        c[0] = base[0];
        c[1] = base[1];
        c[2] = base[2];
        c[3] = base[3];
        if (img && T) {
          T.getElement(vi, uv);
          sample(img, uv[0], uv[1], tc);
          for (let j = 0; j < 4; j++) c[j] *= tc[j];
        }
        if (C) {
          C.getElement(vi, tc);
          for (let j = 0; j < C.getElementSize(); j++) c[j] *= tc[j];
        }
        soup.col.set(c, t * 12 + k * 4);
      }
      if (!N) faceNormal(soup.pos, t, soup.nrm);
      soup.kind.push(kind);
      soup.mat.push(mi);
    }
  }
  return { soup, mats, kinds, extras: (doc.getRoot().getAsset().extras ?? {}) as Record<string, string>, name: path.basename(file) };
}

// ---------------------------------------------------------------- drawing
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** An orthographic view from the side `az` (0: from behind, +z; π/2: from the right, +x), `el` up. */
export function view(az: number, el: number): View {
  const d = unit([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
  const r = el > 1.5 ? ([Math.cos(az), 0, -Math.sin(az)] as V3) : unit(cross([0, 1, 0], d));
  return { d, r, u: cross(d, r) };
}

/**
 * Draws triangles `ids` of `pos` with a depth buffer at `px` metres a pixel; returns, per
 * pixel, the triangle in front (−1 for none). Both faces count (exports flip normals).
 */
export function raster(pos: Float32Array, ids: Int32Array, v: View, px: number) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  const n = ids.length, sx = new Float32Array(n * 3), sy = new Float32Array(n * 3), sz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      const o = ids[i] * 9 + k * 3, x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const a = x * v.r[0] + y * v.r[1] + z * v.r[2], b = x * v.u[0] + y * v.u[1] + z * v.u[2];
      sx[i * 3 + k] = a;
      sy[i * 3 + k] = b;
      sz[i * 3 + k] = x * v.d[0] + y * v.d[1] + z * v.d[2];
      if (a < minx) minx = a;
      if (a > maxx) maxx = a;
      if (b < miny) miny = b;
      if (b > maxy) maxy = b;
    }
  const W = Math.ceil((maxx - minx) / px) + 3, H = Math.ceil((maxy - miny) / px) + 3;
  const depth = new Float32Array(W * H).fill(-Infinity), id = new Int32Array(W * H).fill(-1);
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const x0 = (sx[j] - minx) / px + 1, y0 = (maxy - sy[j]) / px + 1, x1 = (sx[j + 1] - minx) / px + 1, y1 = (maxy - sy[j + 1]) / px + 1, x2 = (sx[j + 2] - minx) / px + 1, y2 = (maxy - sy[j + 2]) / px + 1;
    const z0 = sz[j], z1 = sz[j + 1], z2 = sz[j + 2];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    let hit = false;
    if (Math.abs(area) > 1e-9)
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area, w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          hit = true;
          const z = w0 * z0 + w1 * z1 + w2 * z2, p = y * W + x;
          if (z > depth[p]) {
            depth[p] = z;
            id[p] = ids[i];
          }
        }
    // Smaller than a pixel: it still counts where its middle lands.
    if (!hit) {
      const p = Math.min(H - 1, Math.floor((y0 + y1 + y2) / 3)) * W + Math.min(W - 1, Math.floor((x0 + x1 + x2) / 3));
      const z = (z0 + z1 + z2) / 3;
      if (z > depth[p]) {
        depth[p] = z;
        id[p] = ids[i];
      }
    }
  }
  return { W, H, id };
}

/**
 * One view of a soup (pos/nrm 9 floats per triangle, col 9 linear RGB per triangle) lit by
 * a fixed sun, `px` metres a pixel, cropped to CW × CH: raw sRGB bytes.
 */
export function shade(pos: Float32Array, nrm: Float32Array | number[], col: Float32Array | number[], v: View, px: number, CW: number, CH: number) {
  const n = pos.length / 9;
  const { W, H, id } = raster(pos, Int32Array.from({ length: n }, (_, i) => i), v, px);
  const img = Buffer.alloc(CW * CH * 3, 236);
  const L = unit([0.4, 0.8, 0.45]);
  for (let y = 0; y < Math.min(H, CH); y++)
    for (let x = 0; x < Math.min(W, CW); x++) {
      const t = id[y * W + x];
      if (t < 0) continue;
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < 3; k++) ((nx += nrm[t * 9 + k * 3]), (ny += nrm[t * 9 + k * 3 + 1]), (nz += nrm[t * 9 + k * 3 + 2]));
      const facing = nx * v.d[0] + ny * v.d[1] + nz * v.d[2] < 0 ? -1 : 1;
      const lam = 0.35 + 0.65 * Math.max(0, (facing * (nx * L[0] + ny * L[1] + nz * L[2])) / (Math.hypot(nx, ny, nz) || 1));
      for (let c = 0; c < 3; c++) {
        const lc = (col[t * 9 + c] + col[t * 9 + 3 + c] + col[t * 9 + 6 + c]) / 3;
        const srgb = lc <= 0.0031308 ? lc * 12.92 : 1.055 * lc ** (1 / 2.4) - 0.055;
        img[(y * CW + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(srgb * lam * 255)));
      }
    }
  return img;
}

/** Tiles of raw RGB (CW × CH each) into one PNG. */
export async function sheet(file: string, tiles: { input: Buffer; left: number; top: number }[], width: number, height: number, CW: number, CH: number) {
  const raw = Buffer.alloc(width * height * 3, 255);
  const composites = await Promise.all(tiles.map(async (t) => ({ input: await sharp(t.input, { raw: { width: CW, height: CH, channels: 3 } }).png().toBuffer(), left: t.left, top: t.top })));
  await sharp(raw, { raw: { width, height, channels: 3 } }).composite(composites).png().toFile(file);
}

// ---------------------------------------------------------------- meshes
export type Mesh = { pos: Float32Array<ArrayBuffer>; nrm: Float32Array<ArrayBuffer>; col: Float32Array<ArrayBuffer>; idx: Uint32Array<ArrayBuffer> };
/** Shared vertices (same place, normal and colour), then simplified to `target` triangles. */
export function weld(s: { pos: Float32Array; nrm: Float32Array; col: Float32Array }, tris: number[], target: number, maxErr: number, shift: V3 = [0, 0, 0], prune = false): Mesh | null {
  if (!tris.length) return null;
  const keyOf = new Map<string, number>();
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3, co = t * 12 + k * 4;
      const p = [s.pos[o] - shift[0], s.pos[o + 1] - shift[1], s.pos[o + 2] - shift[2]];
      const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)},${Math.round(s.nrm[o] * 50)},${Math.round(s.nrm[o + 1] * 50)},${Math.round(s.nrm[o + 2] * 50)},${Math.round(s.col[co] * 60)},${Math.round(s.col[co + 1] * 60)},${Math.round(s.col[co + 2] * 60)}`;
      let i = keyOf.get(key);
      if (i === undefined) {
        keyOf.set(key, (i = pos.length / 3));
        pos.push(...p);
        nrm.push(s.nrm[o], s.nrm[o + 1], s.nrm[o + 2]);
        col.push(s.col[co], s.col[co + 1], s.col[co + 2]);
      }
      idx.push(i);
    }
  const P = new Float32Array(pos), N = new Float32Array(nrm), C = new Float32Array(col);
  let I = new Uint32Array(idx);
  if (I.length / 3 > target) {
    const attrs = new Float32Array((P.length / 3) * 6);
    for (let i = 0; i < P.length / 3; i++) attrs.set([N[i * 3], N[i * 3 + 1], N[i * 3 + 2], C[i * 3], C[i * 3 + 1], C[i * 3 + 2]], i * 6);
    I = Uint32Array.from(MeshoptSimplifier.simplifyWithAttributes(I, P, 3, attrs, 6, [0.25, 0.25, 0.25, 1, 1, 1], null, Math.max(3, Math.floor(target) * 3), maxErr, prune ? ["ErrorAbsolute", "Permissive", "Prune"] : ["ErrorAbsolute", "Permissive"])[0]);
  }
  // Only the vertices still used.
  const remap = new Int32Array(P.length / 3).fill(-1);
  let n = 0;
  for (const i of I) if (remap[i] < 0) remap[i] = n++;
  const out = { pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), col: new Float32Array(n * 3), idx: I.map((i) => remap[i]) };
  for (let i = 0; i < remap.length; i++) {
    const j = remap[i];
    if (j < 0) continue;
    out.pos.set(P.subarray(i * 3, i * 3 + 3), j * 3);
    out.nrm.set(N.subarray(i * 3, i * 3 + 3), j * 3);
    out.col.set(C.subarray(i * 3, i * 3 + 3), j * 3);
  }
  return out;
}
