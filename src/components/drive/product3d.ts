"use client";
// A store's products in 3D (interior3d.ts puts them on the shelves): every listed thing is built from its kind's
// template (lib/product3d/kinds.ts) at its real size — a can, a PET bottle, an estekan of tea on its saucer, a plate
// with the dish's own photo on it, a pizza on its board, a stone dizi pot, a sohan tin, a pot plant — with the item's
// real photo mapped on: laid on the food from above, projected on the front (cropped to the product: the photo's
// plain background is found and cut off), or as a cut-out standee. When the pipeline (scripts/product3d/) has made a
// model from the photo and it's live, that model replaces the template once it loads (scaled to the same size).
//
// Cheap: geometries are shared per body, a photo is one texture however many shelves show it, photos are the small
// thumbnails, the lite tier skips the reconstructed models and the cut-outs' second plane.
import * as THREE from "three";
import { KINDS, fitInto, sizeOf, type Body, type ProductKind } from "@/lib/product3d/kinds";
import { disposeModel, loadModel } from "./gltf";

export type ProductLook = { kind: ProductKind; title: string; photo?: string; model?: string | null };

type PhotoInfo = {
  tex: THREE.Texture;
  /** The product's box inside the photo (0–1, v up), found from the plain background. */
  crop: { u0: number; v0: number; u1: number; v1: number };
  /** Its average colour (the liquid in a clear cup, a fruit's skin). */
  color: THREE.Color;
  /** A cut-out (alpha = not background), for standees. */
  cut: THREE.Texture | null;
};

const SAMPLE = 64;

/** Find the product in a photo: the background is the colour at the corners; what differs from it is the thing. */
function analyse(img: HTMLImageElement | ImageBitmap, wantCut: boolean): Omit<PhotoInfo, "tex"> {
  const c = document.createElement("canvas");
  c.width = c.height = SAMPLE;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img as CanvasImageSource, 0, 0, SAMPLE, SAMPLE);
  let px: Uint8ClampedArray;
  try {
    px = g.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } catch {
    // A photo without CORS: no analysis, the whole photo is the product.
    return { crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, color: new THREE.Color("#b08a60"), cut: null };
  }
  const at = (x: number, y: number) => (y * SAMPLE + x) * 4;
  const bg = [0, 0, 0];
  for (const [x, y] of [[1, 1], [SAMPLE - 2, 1], [1, SAMPLE - 2], [SAMPLE - 2, SAMPLE - 2]]) for (let k = 0; k < 3; k++) bg[k] += px[at(x, y) + k] / 4;
  const differs = (i: number) => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 54;
  // Flood the background in from the border (a white bottle on white keeps its insides).
  const isBg = new Uint8Array(SAMPLE * SAMPLE);
  const stack: number[] = [];
  for (let i = 0; i < SAMPLE; i++) stack.push(i, (SAMPLE - 1) * SAMPLE + i, i * SAMPLE, i * SAMPLE + SAMPLE - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (isBg[p] || differs(p * 4)) continue;
    isBg[p] = 1;
    const x = p % SAMPLE, y = (p / SAMPLE) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < SAMPLE - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - SAMPLE);
    if (y < SAMPLE - 1) stack.push(p + SAMPLE);
  }
  let x0 = SAMPLE, y0 = SAMPLE, x1 = -1, y1 = -1, n = 0;
  const sum = [0, 0, 0];
  for (let y = 0; y < SAMPLE; y++)
    for (let x = 0; x < SAMPLE; x++) {
      if (isBg[y * SAMPLE + x]) continue;
      (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
      for (let k = 0; k < 3; k++) sum[k] += px[at(x, y) + k];
      n++;
    }
  const whole = n < SAMPLE * SAMPLE * 0.04 || n > SAMPLE * SAMPLE * 0.97;
  const crop = whole ? { u0: 0, v0: 0, u1: 1, v1: 1 } : { u0: x0 / SAMPLE, u1: (x1 + 1) / SAMPLE, v0: 1 - (y1 + 1) / SAMPLE, v1: 1 - y0 / SAMPLE };
  const color = n ? new THREE.Color(sum[0] / n / 255, sum[1] / n / 255, sum[2] / n / 255).convertSRGBToLinear() : new THREE.Color("#b08a60");
  let cut: THREE.Texture | null = null;
  if (wantCut && !whole) {
    // Full-size cut-out: the photo with the flooded background made transparent (mask scaled up, edges soft).
    const W = 256;
    const cc = document.createElement("canvas");
    cc.width = cc.height = W;
    const cg = cc.getContext("2d")!;
    cg.drawImage(img as CanvasImageSource, 0, 0, W, W);
    const big = cg.getImageData(0, 0, W, W);
    const s = SAMPLE / W;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) if (isBg[((y * s) | 0) * SAMPLE + ((x * s) | 0)]) big.data[(y * W + x) * 4 + 3] = 0;
    cg.putImageData(big, 0, 0);
    cut = new THREE.CanvasTexture(cc);
    cut.colorSpace = THREE.SRGBColorSpace;
  }
  return { crop, color, cut };
}

/** A lathe from a profile of [radius, height] (unit height, unit radius), closed at the bottom. */
const lathe = (pts: [number, number][], seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Front projection: u across the width, v up the height (each vertex by its own position; the back gets a mirror). */
function frontUV(geo: THREE.BufferGeometry, crop: PhotoInfo["crop"]) {
  const g = geo.clone();
  g.computeBoundingBox();
  const b = g.boundingBox!, pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - b.min.x) / Math.max(1e-6, b.max.x - b.min.x), v = (pos.getY(i) - b.min.y) / Math.max(1e-6, b.max.y - b.min.y);
    uv[i * 2] = crop.u0 + u * (crop.u1 - crop.u0);
    uv[i * 2 + 1] = crop.v0 + v * (crop.v1 - crop.v0);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

export class ProductKit {
  private geo = new Map<string, THREE.BufferGeometry>();
  private mats = new Map<string, THREE.Material>();
  private photos = new Map<string, Promise<PhotoInfo | null>>();
  private trash: { dispose(): void }[] = [];
  private loader = new THREE.TextureLoader().setCrossOrigin("anonymous");
  private models: THREE.Object3D[] = [];
  private disposed = false;

  constructor(private lite: boolean) {}

  private g(key: string, make: () => THREE.BufferGeometry) {
    let x = this.geo.get(key);
    if (!x) this.geo.set(key, (x = make()));
    return x;
  }
  private m(key: string, make: () => THREE.Material) {
    let x = this.mats.get(key);
    if (!x) this.mats.set(key, (x = make()));
    return x;
  }
  private std(color: string | THREE.Color, rough = 0.6, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const c = typeof color === "string" ? color : `#${color.getHexString()}`;
    return this.m(`s|${c}|${rough}|${metal}|${extra.transparent ? extra.opacity : ""}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  }

  private photo(url: string, wantCut: boolean): Promise<PhotoInfo | null> {
    const key = `${url}|${wantCut ? 1 : 0}`;
    let p = this.photos.get(key);
    if (!p) {
      p = new Promise<PhotoInfo | null>((resolve) => {
        this.loader.load(
          url,
          (tex) => {
            if (this.disposed) return (tex.dispose(), resolve(null));
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            const info = { tex, ...analyse(tex.image as HTMLImageElement, wantCut) };
            this.trash.push(tex);
            if (info.cut) this.trash.push(info.cut);
            resolve(info);
          },
          undefined,
          () => resolve(null),
        );
      });
      this.photos.set(key, p);
    }
    return p;
  }

  /**
   * A product, standing on y = 0 at the origin, front towards +z, fitted into maxW × maxH × maxD (m). Returned at once
   * (plain colours); the photo goes on when it has loaded, and a live reconstructed model replaces the template.
   */
  build(look: ProductLook, maxW: number, maxH: number, maxD: number): THREE.Group {
    const spec = KINDS[look.kind];
    const { size } = fitInto(sizeOf(look.kind, look.title), maxW, maxH, maxD);
    const grp = new THREE.Group();
    grp.userData.size = size;
    const tpl = new THREE.Group();
    grp.add(tpl);
    this.template(tpl, spec.body, size, spec.tint, null, look.kind);
    if (look.photo && spec.photo !== "none") {
      this.photo(look.photo, spec.photo === "card").then((p) => {
        if (!p || this.disposed || !tpl.parent) return;
        tpl.clear();
        this.template(tpl, spec.body, size, spec.tint, p, look.kind);
      });
    }
    if (look.model && !this.lite) {
      loadModel(look.model)
        .then((m) => {
          if (this.disposed || !grp.parent) return disposeModel(m);
          // Fitted into the same box the template had, standing on the shelf, centred.
          const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
          const k = Math.min(size[0] / Math.max(1e-6, s.x), size[1] / Math.max(1e-6, s.y), size[2] / Math.max(1e-6, s.z));
          m.scale.setScalar(k);
          m.position.set(-((b.min.x + b.max.x) / 2) * k, -b.min.y * k, -((b.min.z + b.max.z) / 2) * k);
          m.traverse((o) => {
            const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (mm && "roughness" in mm) (mm.roughness = Math.max(0.45, mm.roughness)), (mm.metalness = Math.min(0.2, mm.metalness));
          });
          tpl.visible = false;
          grp.add(m);
          this.models.push(m);
        })
        .catch(() => {});
    }
    return grp;
  }

  /** The template body at size [w, h, d] (m); with the photo when it's in. */
  private template(out: THREE.Group, body: Body, [w, h, d]: [number, number, number], tint: string, p: PhotoInfo | null, kind: ProductKind) {
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      out.add(mesh);
      return mesh;
    };
    const photoMat = (key: string) => (p ? this.m(`ph|${p.tex.uuid}|${key}`, () => new THREE.MeshStandardMaterial({ map: p.tex, roughness: 0.55 })) : this.std(tint, 0.6));
    /** A unit geometry with the photo projected on its front (cropped to the product). */
    const front = (key: string, make: () => THREE.BufferGeometry) => (p ? this.g(`${key}|f|${p.tex.uuid}`, () => frontUV(this.g(key, make), p.crop)) : this.g(key, make));
    /** A disc with the photo laid on it (the centre of the photo: food photos are framed on the dish). */
    const topDisc = (r: number, y: number, x = 0, z = 0) => {
      const m = add(this.g("disc", () => new THREE.CircleGeometry(0.5, 28).rotateX(-Math.PI / 2)), p ? photoMat("top") : this.std(tint, 0.7), x, y, z, r * 2, 1, r * 2);
      m.renderOrder = 1;
      return m;
    };
    const liquid = p ? p.color : new THREE.Color(tint);
    const white = this.std("#f7f5ef", 0.3);
    switch (body) {
      case "plate": {
        add(this.g("plate", () => lathe([[0, 0], [0.42, 0], [0.5, 0.06], [0.5, 0.08], [0.4, 0.03], [0, 0.03]], 28)), white, 0, 0, 0, w, h * 0.5, d);
        // Food: a low mound under the photo, so it reads as a portion from the side.
        add(this.g("mound", () => new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)), this.std(liquid, 0.75), 0, h * 0.02, 0, w * 0.8, h * 0.7, d * 0.8);
        topDisc(Math.min(w, d) * 0.4, h * 0.72);
        break;
      }
      case "pizza": {
        add(this.g("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), this.std("#a8743f", 0.85), 0, 0, 0, w * 1.06, h * 0.3, d * 1.06);
        add(this.g("crust", () => new THREE.TorusGeometry(0.47, 0.035, 6, 32).rotateX(Math.PI / 2)), this.std("#c98b3e", 0.8), 0, h * 0.55, 0, w, h * 6, d);
        topDisc(Math.min(w, d) * 0.47, h * 0.62);
        break;
      }
      case "bowl":
      case "pan": {
        if (body === "pan") {
          add(this.g("pan", () => lathe([[0, 0], [0.48, 0], [0.5, 0.25], [0.47, 0.25], [0.45, 0.04], [0, 0.04]], 24)), this.std("#2a2a2a", 0.4, 0.6), 0, 0, 0, w, h, d);
          add(this.g("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), this.std("#1b1b1b", 0.5, 0.5), w * 0.7, h * 0.12, 0, w * 0.45, h * 0.12, d * 0.06);
        } else add(this.g("bowl", () => lathe([[0, 0], [0.3, 0], [0.45, 0.5], [0.5, 1], [0.46, 1], [0.41, 0.52], [0, 0.1]], 24)), this.std("#f4efe6", 0.35), 0, 0, 0, w, h, d);
        topDisc(Math.min(w, d) * 0.43, h * (body === "pan" ? 0.2 : 0.82));
        break;
      }
      case "dizi": {
        // The stone pot (dizi sangi) on its little plate, its lid off beside it.
        add(this.g("dizi", () => lathe([[0, 0], [0.36, 0], [0.48, 0.35], [0.46, 0.85], [0.4, 1], [0.36, 1], [0.4, 0.86], [0, 0.86]], 20)), this.std("#4a3a30", 0.85), 0, 0, 0, w * 0.9, h, d * 0.9);
        topDisc(Math.min(w, d) * 0.36, h * 0.87);
        break;
      }
      case "burger": {
        const bun = this.std("#c98a3c", 0.7);
        add(this.g("dome", () => new THREE.SphereGeometry(0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)), bun, 0, h * 0.55, 0, w, h * 0.9, d);
        add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), this.std("#5a3020", 0.8), 0, h * 0.3, 0, w * 1.02, h * 0.18, d * 1.02);
        add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), this.std("#f2b632", 0.6), 0, h * 0.47, 0, w * 1.05, h * 0.05, d * 1.05);
        add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), bun, 0, 0, 0, w * 0.98, h * 0.3, d * 0.98);
        if (p) add(front("card", () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)), this.cutOrPhoto(p), 0, 0, d * 0.52, w, h, 1);
        break;
      }
      case "cakeSlice": {
        const wedge = this.g("wedge", () => {
          const s = new THREE.Shape([new THREE.Vector2(-0.5, 0.5), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0, -0.5)]);
          return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2);
        });
        add(wedge, this.std(liquid, 0.7), 0, 0, 0, w, h, d);
        if (p) add(front("card", () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)), photoMat("front"), 0, 0, d * 0.5 + 0.002, w, h, 1);
        break;
      }
      case "cake":
      case "tin":
      case "tub":
      case "can":
      case "jar": {
        const shape = body === "can" ? [[0, 0], [0.45, 0], [0.5, 0.05], [0.5, 0.93], [0.43, 1], [0, 1]] : body === "jar" ? [[0, 0], [0.5, 0], [0.5, 0.82], [0.4, 0.88], [0, 0.88]] : body === "tub" ? [[0, 0], [0.42, 0], [0.5, 0.92], [0, 0.92]] : [[0, 0], [0.5, 0], [0.5, 1], [0, 1]];
        const geo = front(`lathe-${body}`, () => lathe(shape as [number, number][], 24));
        const mat = p ? photoMat("front") : this.std(tint, body === "can" ? 0.3 : 0.5, body === "can" ? 0.5 : 0);
        add(geo, mat, 0, 0, 0, w, h, d);
        if (body === "jar") add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), this.std("#c9a227", 0.35, 0.7), 0, h * 0.86, 0, w * 0.82, h * 0.14, d * 0.82);
        if (body === "tub") add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), white, 0, h * 0.9, 0, w * 1.02, h * 0.1, d * 1.02);
        if (body === "can") add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), this.std("#cfd3d6", 0.25, 0.9), 0, h * 0.985, 0, w * 0.86, h * 0.015, d * 0.86);
        if ((body === "cake" || body === "tin") && p) topDisc(Math.min(w, d) * 0.49, h + 0.001);
        break;
      }
      case "bottle": {
        const pet = kind === "bottle" || kind === "water" || kind === "oil";
        const geo = front("lathe-bottle", () => lathe([[0, 0], [0.45, 0], [0.5, 0.06], [0.5, 0.62], [0.36, 0.78], [0.17, 0.9], [0.17, 0.96], [0, 0.96]], 20));
        add(geo, p ? photoMat("front") : this.std(tint, pet ? 0.12 : 0.08, 0, { transparent: true, opacity: 0.88 }), 0, 0, 0, w, h, d);
        add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)), this.std(kind === "doogh" ? "#2e7d32" : kind === "glassBottle" ? "#c9a227" : "#d32f2f", 0.4, kind === "glassBottle" ? 0.7 : 0), 0, h * 0.94, 0, w * 0.38, h * 0.06, d * 0.38);
        break;
      }
      case "carton": {
        const geo = front("carton", () => {
          const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.5, 0.85), new THREE.Vector2(0, 1), new THREE.Vector2(-0.5, 0.85)]);
          return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
        });
        add(geo, photoMat("front"), 0, 0, 0, w, h, d);
        break;
      }
      case "paperCup":
      case "clearCup": {
        const clear = body === "clearCup";
        add(this.g("cup", () => lathe([[0, 0], [0.36, 0], [0.5, 0.9], [0.5, 0.92], [0, 0.92]], 20)), clear ? this.std("#ffffff", 0.05, 0, { transparent: true, opacity: 0.35 }) : white, 0, 0, 0, w, h, d);
        if (clear) add(front("liquid", () => lathe([[0, 0], [0.34, 0], [0.46, 0.8], [0, 0.8]], 20)), p ? photoMat("front") : this.std(liquid, 0.3), 0, h * 0.01, 0, w * 0.97, h * 0.97, d * 0.97);
        else add(front("sleeve", () => lathe([[0.42, 0.3], [0.48, 0.72], [0, 0.72]], 20)), p ? photoMat("front") : this.std("#6d4c41", 0.8), 0, 0, 0, w * 1.02, h, d * 1.02);
        // Lid: a flat one with a sip hole on hot coffee, a dome and a straw on a cold one.
        add(this.g(clear ? "dome" : "cyl", () => (clear ? new THREE.SphereGeometry(0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0))), clear ? this.std("#ffffff", 0.05, 0, { transparent: true, opacity: 0.3 }) : this.std("#2b2b2b", 0.5), 0, h * 0.92, 0, w * 1.02, clear ? h * 0.22 : h * 0.06, d * 1.02);
        if (clear) add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0)), this.std("#e53935", 0.5), w * 0.12, h * 0.6, 0, w * 0.07, h * 0.7, d * 0.07).rotation.z = -0.18;
        break;
      }
      case "teaGlass": {
        // Tea the Iranian way: an estekan on its saucer, a sugar cube (ghand) beside it.
        add(this.g("saucer", () => lathe([[0, 0], [0.6, 0], [0.8, 0.08], [0.78, 0.1], [0, 0.03]], 24)), this.std("#f4efe6", 0.3), 0, 0, 0, w * 1.6, h * 0.5, d * 1.6);
        add(this.g("estekan", () => lathe([[0, 0], [0.34, 0], [0.38, 0.15], [0.3, 0.45], [0.38, 0.9], [0.42, 1], [0, 1]], 20)), this.std("#ffffff", 0.05, 0, { transparent: true, opacity: 0.3 }), 0, h * 0.04, 0, w, h, d);
        add(this.g("tea", () => lathe([[0, 0], [0.32, 0], [0.36, 0.15], [0.28, 0.45], [0.35, 0.82], [0, 0.82]], 20)), this.std("#9e2a12", 0.15), 0, h * 0.05, 0, w * 0.95, h * 0.95, d * 0.95);
        add(this.g("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), this.std("#ffffff", 0.9), w * 0.62, h * 0.06, d * 0.2, w * 0.22, w * 0.18, w * 0.22);
        break;
      }
      case "cone": {
        add(this.g("cone", () => new THREE.ConeGeometry(0.5, 1, 14).rotateX(Math.PI).translate(0, 0.5, 0)), this.std("#d9a35a", 0.8), 0, 0, 0, w * 0.75, h * 0.62, d * 0.75);
        add(this.g("sphere", () => new THREE.SphereGeometry(0.5, 16, 12)), this.std(liquid, 0.6), 0, h * 0.72, 0, w, h * 0.42, d);
        break;
      }
      case "flatbread":
      case "loaf":
      case "sandwich":
      case "wrap":
      case "shoe": {
        const round = body === "loaf" || body === "wrap" || body === "sandwich" || body === "shoe";
        const geo = round ? front("capsule", () => new THREE.SphereGeometry(0.5, 18, 10).translate(0, 0.5, 0)) : this.g("slab", () => new THREE.BoxGeometry(1, 1, 1, 1, 1, 1).translate(0, 0.5, 0));
        add(geo, round && p ? photoMat("front") : this.std(p ? p.color : new THREE.Color(tint), 0.85), 0, 0, 0, w, h, d);
        if (body === "flatbread") topDisc(Math.min(w, d) * 0.5, h + 0.001, 0, 0).scale.set(w, 1, d);
        break;
      }
      case "fries":
      case "bucket": {
        add(front(`lathe-${body}`, () => lathe([[0, 0], [0.4, 0], [0.5, 1], [0, 1]], 16)), photoMat("front"), 0, 0, 0, w, h * (body === "fries" ? 0.65 : 0.85), d);
        add(this.g("sticks", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), this.std(body === "fries" ? "#f2c14e" : "#b0602b", 0.8), 0, h * (body === "fries" ? 0.6 : 0.8), 0, w * 0.8, h * 0.25, d * 0.7);
        break;
      }
      case "pastryBox": {
        add(this.g("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), white, 0, 0, 0, w, h, d);
        // The window in the lid shows the photo of what's inside.
        add(this.g("plane", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), p ? photoMat("top") : this.std(tint, 0.7), 0, h + 0.001, 0, w * 0.7, 1, d * 0.6);
        break;
      }
      case "fruit": {
        // A little pile: by the kilo, as at the greengrocer's.
        const skin = this.std(liquid, 0.45);
        const r = Math.min(w, h, d);
        for (const [x, y, z] of [[0, 0, 0], [0.9, 0, 0.2], [-0.8, 0, 0.3], [0.1, 0.75, 0.1]] as const) add(this.g("sphere", () => new THREE.SphereGeometry(0.5, 16, 12)), skin, x * r * 0.5, r * 0.5 + y * r * 0.5, z * r * 0.5, r, r, r);
        break;
      }
      case "herbs": {
        const leaf = this.std("#3d8b37", 0.8);
        for (let i = 0; i < 5; i++) add(this.g("cone", () => new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0)), leaf, (i - 2) * w * 0.15, 0, (i % 2) * d * 0.1, w * 0.3, h, d * 0.8).rotation.z = Math.PI / 2;
        break;
      }
      case "tray": {
        add(this.g("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), this.std(kind === "eggs" ? "#cdb38a" : "#f5f5f5", 0.9), 0, 0, 0, w, h * 0.4, d);
        if (kind === "eggs")
          for (let i = 0; i < 9; i++) add(this.g("sphere", () => new THREE.SphereGeometry(0.5, 12, 8)), this.std("#efe3cf", 0.6), ((i % 3) - 1) * w * 0.3, h * 0.5, (Math.floor(i / 3) - 1) * d * 0.3, w * 0.2, h * 0.9, d * 0.18);
        else topDisc(Math.min(w, d) * 0.45, h * 0.42).scale.set(w * 0.9, 1, d * 0.9);
        break;
      }
      case "pot":
      case "card": {
        if (body === "pot") add(this.g("pot", () => lathe([[0, 0], [0.36, 0], [0.5, 0.9], [0.52, 1], [0, 1]], 18)), this.std("#b5653b", 0.85), 0, 0, 0, w * 0.75, h * 0.3, d * 0.75);
        else add(this.g("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0)), this.std("#2a2a2a", 0.5), 0, 0, 0, w * 0.6, 0.006, Math.max(d, 0.05));
        const y0 = body === "pot" ? h * 0.22 : 0.006, ch = h - y0;
        const mat = p ? this.cutOrPhoto(p) : this.std(tint, 0.8);
        add(this.g("card", () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)), mat, 0, y0, 0, w, ch, 1);
        // Crossed: a pot plant reads as round from any side (not on the lite tier).
        if (body === "pot" && !this.lite) add(this.g("card", () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)), mat, 0, y0, 0, w, ch, 1).rotation.y = Math.PI / 2;
        break;
      }
      case "phone":
      case "laptop":
      case "pillBox":
      case "box":
      case "bag":
      case "pouch":
      case "sack":
      case "tube":
      case "handbag":
      default: {
        const geo = front(`box-${body}`, () => {
          if (body === "bag" || body === "pouch" || body === "sack") return new THREE.SphereGeometry(0.5, 14, 10).scale(1, 1, 1).translate(0, 0.5, 0);
          if (body === "tube") return new THREE.CylinderGeometry(0.5, 0.35, 1, 14).translate(0, 0.5, 0);
          return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
        });
        // Packs are flatter in depth than a sphere: squash it (a chips bag, a rice sack).
        const sd = body === "bag" || body === "pouch" || body === "sack" ? d : d;
        add(geo, photoMat("front"), 0, 0, 0, w, h, sd);
        if (body === "handbag") add(this.g("handle", () => new THREE.TorusGeometry(0.3, 0.03, 6, 16, Math.PI)), this.std("#5d4037", 0.6), 0, h, 0, w, h * 0.8, 1);
        if (body === "laptop") out.rotation.x = 0;
        break;
      }
    }
  }

  /** The cut-out photo (transparent where the background was), else the photo itself. */
  private cutOrPhoto(p: PhotoInfo) {
    if (!p.cut) return this.m(`ph|${p.tex.uuid}|card`, () => new THREE.MeshStandardMaterial({ map: p.tex, roughness: 0.7, side: THREE.DoubleSide }));
    return this.m(`cut|${p.cut.uuid}`, () => new THREE.MeshStandardMaterial({ map: p.cut, roughness: 0.75, alphaTest: 0.5, side: THREE.DoubleSide }));
  }

  dispose() {
    this.disposed = true;
    for (const g of this.geo.values()) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.trash) t.dispose();
    for (const m of this.models) disposeModel(m);
    this.geo.clear();
    this.mats.clear();
  }
}
