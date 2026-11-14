"use client";
// The lit billboard over a featured business (Pro and Chain plans, lib/business.ts): a big
// lightbox in the store's own colours with its logo, name and banner line, a gold frame with a
// row of marquee bulbs chasing round it, and a gold star turning on top. On a shop front it
// hangs on the wall over the sign (a rooftop board on a low building); at the kerb it stands on
// two posts. Only a few are built at once (by quality tier), each its own small set of meshes
// and one canvas, drawn again only when what it shows changes.
import * as THREE from "three";
import { getLocale, t } from "@/lib/i18n";
import { inkOn, shade } from "@/lib/business";
import type { ShopLabel, StorePanel } from "./storefronts";

const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, -apple-system, "Segoe UI", sans-serif`;
const RTL = /[֐-ࣿ]/;
const CW = 1024, CH = 256;
/** Bulbs along each long edge. */
const BULBS = 14;
const GOLD = "#f0c05a";
const TMP_M = new THREE.Matrix4(), TMP_C = new THREE.Color();

type Board = {
  id: string;
  group: THREE.Group;
  faces: THREE.Mesh[];
  mat: THREE.MeshStandardMaterial;
  tex: THREE.CanvasTexture;
  g: CanvasRenderingContext2D;
  bulbs: THREE.InstancedMesh;
  star: THREE.Mesh;
  sig: string;
  w: number;
};

/** Where a billboard goes for a sign: its size and centre, and whether it stands on posts. */
export function billboardSpot(l: Pick<ShopLabel, "x" | "y" | "z" | "angle" | "w" | "pole">): { w: number; h: number; x: number; y: number; z: number; posts: boolean } {
  const w = Math.max(5, Math.min(9, l.w * 1.3)), h = w / 4;
  const fx = Math.sin(l.angle), fz = Math.cos(l.angle);
  if (l.pole) return { w, h, x: l.x, y: 5.4 + h / 2, z: l.z, posts: true };
  return { w, h, x: l.x + fx * 0.35, y: l.y + 1.1 + h / 2, z: l.z + fz * 0.35, posts: false };
}

export class BizBillboards {
  private boards = new Map<string, Board>();
  private night = 0;
  private gold: THREE.MeshStandardMaterial;
  private post: THREE.MeshStandardMaterial;
  private starGeo: THREE.ExtrudeGeometry;
  private bulbGeo: THREE.SphereGeometry;
  private bulbMat: THREE.MeshBasicMaterial;
  private postGeo: THREE.CylinderGeometry;
  private frameGeo = new THREE.BoxGeometry(1, 1, 1);
  private planeGeo = new THREE.PlaneGeometry(1, 1);

  constructor(private parent: THREE.Group, private max: number, private reduceMotion: boolean, private image: (url: string | undefined) => HTMLImageElement | null) {
    this.gold = new THREE.MeshStandardMaterial({ color: "#c99a2e", metalness: 0.85, roughness: 0.3, emissive: new THREE.Color("#5a3f08"), emissiveIntensity: 0.4 });
    this.post = new THREE.MeshStandardMaterial({ color: "#2a2f36", metalness: 0.6, roughness: 0.5 });
    this.postGeo = new THREE.CylinderGeometry(0.11, 0.14, 1, 10).translate(0, 0.5, 0);
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.17 : 0.4, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04);
    this.bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  }

  /** The featured stores near (nearest first, from Storefronts.sync); builds and drops boards. */
  sync(list: ShopLabel[], infos: Map<string, StorePanel>, isOpen: (l: ShopLabel) => boolean, fontReady: boolean) {
    const want = list.filter((l) => infos.get(l.id)?.brand?.tier === "featured" && l.d < 320).slice(0, this.max);
    const keep = new Set(want.map((l) => l.id));
    for (const [id, b] of this.boards) if (!keep.has(id)) this.drop(id, b);
    for (const l of want) {
      const info = infos.get(l.id)!;
      const spot = billboardSpot(l);
      let b = this.boards.get(l.id);
      if (b && Math.abs(b.w - spot.w) > 0.01) (this.drop(l.id, b), (b = undefined));
      if (!b) b = this.build(l.id, spot);
      b.group.position.set(spot.x, 0, spot.z);
      b.group.rotation.y = l.angle;
      const open = isOpen(l);
      const logo = this.image(info.logo);
      const sig = [info.name ?? l.text, info.brand?.color, info.brand?.tagline, info.logo, !!logo, open, fontReady, getLocale()].join("|");
      if (b.sig !== sig) {
        b.sig = sig;
        this.draw(b, info.name || l.text, info, open, logo);
      }
    }
  }

  private build(id: string, s: ReturnType<typeof billboardSpot>): Board {
    const c = document.createElement("canvas");
    c.width = CW;
    c.height = CH;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.6, roughness: 0.4 });
    const group = new THREE.Group();
    const faces: THREE.Mesh[] = [];
    for (const back of s.posts ? [false, true] : [false]) {
      const f = new THREE.Mesh(this.planeGeo, mat);
      f.scale.set(s.w, s.h, 1);
      f.position.set(0, s.y, back ? -0.16 : 0.16);
      if (back) f.rotation.y = Math.PI;
      f.userData = { bizBoard: id };
      faces.push(f);
      group.add(f);
    }
    // The gold frame round the box (a little bigger than the face, behind it).
    const frame = new THREE.Mesh(this.frameGeo, this.gold);
    frame.scale.set(s.w + 0.32, s.h + 0.32, 0.28);
    frame.position.y = s.y;
    group.add(frame);
    if (s.posts)
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(this.postGeo, this.post);
        p.scale.set(1, s.y - s.h / 2, 1);
        p.position.set(side * s.w * 0.33, 0, 0);
        group.add(p);
      }
    else
      // Two brackets back to the wall.
      for (const side of [-1, 1]) {
        const k = new THREE.Mesh(this.frameGeo, this.post);
        k.scale.set(0.12, 0.12, 0.5);
        k.position.set(side * s.w * 0.33, s.y - s.h / 2 - 0.05, -0.2);
        group.add(k);
      }
    // Marquee bulbs along the top and bottom edges of the frame, front (and back on posts).
    const sides = s.posts ? 2 : 1;
    const bulbs = new THREE.InstancedMesh(this.bulbGeo, this.bulbMat, BULBS * 2 * sides);
    bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BULBS * 2 * sides * 3).fill(1), 3);
    let n = 0;
    for (let side = 0; side < sides; side++)
      for (const edge of [1, -1])
        for (let i = 0; i < BULBS; i++) {
          const x = (i / (BULBS - 1) - 0.5) * (s.w + 0.1);
          bulbs.setMatrixAt(n++, TMP_M.makeTranslation(x, s.y + edge * (s.h / 2 + 0.16), side ? -0.17 : 0.17));
        }
    group.add(bulbs);
    // The star on top.
    const star = new THREE.Mesh(this.starGeo, new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false }));
    star.position.y = s.y + s.h / 2 + 0.75;
    group.add(star);
    this.parent.add(group);
    const b: Board = { id, group, faces, mat, tex, g: c.getContext("2d")!, bulbs, star, sig: "", w: s.w };
    this.boards.set(id, b);
    return b;
  }

  private draw(b: Board, name: string, info: StorePanel, open: boolean, logo: HTMLImageElement | null) {
    const g = b.g, col = info.brand?.color || "#7a1fa2", ink = inkOn(col);
    g.save();
    g.clearRect(0, 0, CW, CH);
    const grd = g.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, shade(col, 0.15));
    grd.addColorStop(1, shade(col, -0.4));
    g.fillStyle = grd;
    g.fillRect(0, 0, CW, CH);
    // A soft sheen across the top, and a gold inner line.
    const sheen = g.createLinearGradient(0, 0, 0, CH * 0.5);
    sheen.addColorStop(0, "rgba(255,255,255,.28)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, CW, CH * 0.5);
    g.strokeStyle = GOLD;
    g.lineWidth = 6;
    g.strokeRect(10, 10, CW - 20, CH - 20);
    const rtl = RTL.test(name);
    // The logo (or a big star) on the reading side's start.
    const L = 180, lx = rtl ? CW - 38 - L : 38, ly = (CH - L) / 2;
    if (logo) {
      g.save();
      g.beginPath();
      g.roundRect(lx, ly, L, L, 26);
      g.clip();
      g.fillStyle = "#fff";
      g.fillRect(lx, ly, L, L);
      g.drawImage(logo, lx, ly, L, L);
      g.restore();
    } else {
      g.fillStyle = GOLD;
      g.font = `150px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("★", lx + L / 2, CH / 2 + 6);
    }
    const room = CW - L - 120, mid = rtl ? (CW - L - 38) / 2 : L + 38 + (CW - L - 38) / 2;
    const tag = info.brand?.tagline ?? "";
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = 8;
    let size = tag ? 92 : 112;
    g.direction = rtl ? "rtl" : "ltr";
    g.font = `800 ${size}px ${FONT}`;
    while (size > 40 && g.measureText(name).width > room) g.font = `800 ${(size -= 4)}px ${FONT}`;
    g.fillText(name, mid, tag ? 102 : CH / 2, room);
    if (tag) {
      g.direction = RTL.test(tag) ? "rtl" : "ltr";
      let ts = 50;
      g.font = `600 ${ts}px ${FONT}`;
      while (ts > 24 && g.measureText(tag).width > room) g.font = `600 ${(ts -= 2)}px ${FONT}`;
      g.globalAlpha = 0.92;
      g.fillText(tag, mid, 184, room);
      g.globalAlpha = 1;
    }
    g.shadowBlur = 0;
    // Open / closed, in the corner away from the logo.
    const word = open ? t("Open") : t("Closed");
    g.direction = getLocale() === "fa" ? "rtl" : "ltr";
    g.font = `800 30px ${FONT}`;
    const tw = g.measureText(word).width + 30, tx = rtl ? 28 : CW - 28 - tw;
    g.fillStyle = open ? "#1f9d57" : "#8a2a2a";
    g.beginPath();
    g.roundRect(tx, CH - 62, tw, 40, 20);
    g.fill();
    g.fillStyle = "#fff";
    g.fillText(word, tx + tw / 2, CH - 41);
    g.restore();
    b.tex.needsUpdate = true;
  }

  setNight(k: number) {
    this.night = k;
  }

  /** Bulbs chase round, the star turns, the box breathes a little. */
  update(time: number) {
    const motion = this.reduceMotion ? 0 : 1;
    for (const b of this.boards.values()) {
      b.mat.emissiveIntensity = (0.55 + this.night * 1.5) * (1 + 0.05 * Math.sin(time * 2.2) * motion);
      const step = Math.floor(time * 7 * motion);
      for (let i = 0; i < b.bulbs.count; i++) {
        const lit = (i + step) % 3 === 0;
        b.bulbs.setColorAt(i, TMP_C.set(GOLD).multiplyScalar(lit ? 0.9 + this.night * 1.8 : 0.25 + this.night * 0.25));
      }
      if (b.bulbs.instanceColor) b.bulbs.instanceColor.needsUpdate = true;
      b.star.rotation.y = time * 1.2 * motion;
    }
  }

  pick(ray: THREE.Raycaster): { id: string; distance: number } | null {
    const hit = ray.intersectObjects([...this.boards.values()].flatMap((b) => b.faces), false)[0];
    return hit ? { id: hit.object.userData.bizBoard as string, distance: hit.distance } : null;
  }

  set visible(v: boolean) {
    for (const b of this.boards.values()) b.group.visible = v;
  }

  private drop(id: string, b: Board) {
    this.parent.remove(b.group);
    b.tex.dispose();
    b.mat.dispose();
    (b.star.material as THREE.Material).dispose();
    b.bulbs.dispose();
    this.boards.delete(id);
  }

  dispose() {
    for (const [id, b] of this.boards) this.drop(id, b);
    for (const o of [this.gold, this.post, this.starGeo, this.bulbGeo, this.bulbMat, this.postGeo, this.frameGeo, this.planeGeo]) o.dispose();
  }
}
