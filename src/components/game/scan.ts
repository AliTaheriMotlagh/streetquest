"use client";
// A store owner's 3D scan, made game-ready in their own browser before it's uploaded (the server — Cloudflare Workers —
// can't run image or mesh tools): a .glb exported by a phone scanning app (Polycam, Scaniverse, RealityScan, Luma…)
// is welded, cut down to the triangle budget (meshoptimizer's simplifier keeps the shape), its textures resized to at
// most 2048 px (1024 when there are many) and re-encoded as WebP (JPEG where the browser can't write WebP — Safari),
// then compressed with meshopt (quantised, reordered). A typical 40–80 MB phone scan ends up at 3–8 MB, which a phone
// loads in a second or two and draws smoothly. The heavy tools are loaded only when an owner picks a file.
import { checkGlb, SCAN_LIMITS } from "@/lib/glbCheck";

export type ScanResult = { glb: Uint8Array; before: number; after: number; triangles: number };
/** The triangle budget the scan is simplified to (well under SCAN_LIMITS.triangles). */
const TARGET_TRIS = 300_000;

/** An image re-encoded smaller: WebP if this browser can write it, else JPEG for opaque images, else PNG. */
async function shrinkImage(bytes: Uint8Array, mime: string, max: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime })).catch(() => null);
  if (!bmp) return null;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  // Powers of two mip cleanly on old GPUs.
  const pow2 = (n: number) => 2 ** Math.round(Math.log2(Math.max(1, n)));
  const w = Math.min(max, pow2(bmp.width * k)), h = Math.min(max, pow2(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const enc = (type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
  let out = await enc("image/webp", 0.82);
  if (!out || out.type !== "image/webp") out = mime === "image/png" ? await enc("image/png") : await enc("image/jpeg", 0.85);
  if (!out) return null;
  const nb = new Uint8Array(await out.arrayBuffer());
  return nb.byteLength < bytes.byteLength || k < 1 ? { bytes: nb, mime: out.type } : null;
}

/** `file` (a .glb) → an optimised .glb that passes lib/glbCheck.ts; throws with a player-facing msg key when it can't. */
export async function optimiseScan(file: File, onStep: (step: "read" | "mesh" | "textures" | "pack") => void = () => {}): Promise<ScanResult> {
  onStep("read");
  const [{ WebIO }, { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization }, F, mo] = await Promise.all([
    import("@gltf-transform/core"),
    import("@gltf-transform/extensions"),
    import("@gltf-transform/functions"),
    import("meshoptimizer"),
  ]);
  await Promise.all([mo.MeshoptEncoder.ready, mo.MeshoptDecoder.ready, mo.MeshoptSimplifier.ready]);
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": mo.MeshoptEncoder, "meshopt.decoder": mo.MeshoptDecoder });
  const src = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await io.readBinary(src);
  } catch {
    throw new Error("That isn't a 3D scan (.glb)");
  }

  onStep("mesh");
  const count = () => {
    let n = 0;
    for (const m of doc.getRoot().listMeshes())
      for (const p of m.listPrimitives()) {
        const idx = p.getIndices(), pos = p.getAttribute("POSITION");
        n += Math.floor((idx ? idx.getCount() : pos?.getCount() ?? 0) / 3);
      }
    return n;
  };
  await doc.transform(F.dedup(), F.prune(), F.weld());
  const tris = count();
  if (tris > TARGET_TRIS) await doc.transform(F.simplify({ simplifier: mo.MeshoptSimplifier, ratio: TARGET_TRIS / tris, error: 0.002, lockBorder: false }));

  onStep("textures");
  const textures = doc.getRoot().listTextures();
  const max = textures.length > 4 ? 1024 : SCAN_LIMITS.textureSize;
  let webp = false;
  for (const t of textures) {
    const img = t.getImage();
    if (!img) continue;
    const r = await shrinkImage(img, t.getMimeType() || "image/jpeg", max);
    if (!r) continue;
    t.setImage(r.bytes).setMimeType(r.mime);
    t.setURI(""); // inside the .glb: no file name needed
    if (r.mime === "image/webp") webp = true;
  }
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);

  onStep("pack");
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await doc.transform(F.prune(), F.meshopt({ encoder: mo.MeshoptEncoder, level: "medium" }));
  const glb = await io.writeBinary(doc);
  const c = checkGlb(glb);
  if (!c.ok) throw new Error(c.problem);
  return { glb, before: src.byteLength, after: glb.byteLength, triangles: c.info.triangles };
}
