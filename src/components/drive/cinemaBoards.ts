"use client";
// Cinemas in the 3D city (what's on: cinematicket.org, via /api/cinema): near each cinema, a
// roadside billboard on two steel posts at the kerb — a truss and catwalk, flood lamps on arms
// over the face, and the face itself: the cinema's name on a marquee of chasing bulbs, the
// posters of the films it's showing cross-fading one into the next (each held a few seconds),
// and beside the poster that film's next sessions today — time, hall, price in toman. At night
// the face and lamps glow and a pool of light spills onto the pavement in front. Tapping it
// opens the cinema's card (every film and session, and the tickets).
// Only the nearest few are built; the sessions come from the server's ten-minute cache.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { showTime, type Cinema, type CinemaShows } from "@/lib/cinema";
import { fadeAt, slidesOf, type Slide } from "@/lib/cinemaBoard";
import { fmtNum, t } from "@/lib/i18n";
import { api } from "../game/client";
import type { SignPlace } from "./markers";

/** Built for cinemas this near (m), at most this many. */
const NEAR_M = 450, MAX = 3;
/** Redrawn (fades, bulbs) only for boards this near (m). */
const LIVE_M = 160;
/** The board: metres wide and tall, how high its bottom edge is, and how far past the kerb it stands. */
const W = 8.4, H = 4.2, LIFT = 2.8, OUT = 2.4;
const CW = 1024, CH = 512;
const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, sans-serif`;

type Board = {
  c: Cinema;
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  slides: Slide[];
  posters: (HTMLImageElement | null)[];
  /** What the canvas shows now (to redraw only on change). */
  sig: string;
  dist: number;
  loaded: boolean;
};

export class CinemaBoards {
  private all: Cinema[] = [];
  private built = new Map<number, Board>();
  private night = 0.15;
  private geo = {
    post: new THREE.CylinderGeometry(0.13, 0.16, 1, 10).translate(0, 0.5, 0),
    panel: new THREE.BoxGeometry(W + 0.4, H + 0.4, 0.3),
    face: new THREE.PlaneGeometry(W, H),
    beam: new THREE.BoxGeometry(W + 0.9, 0.16, 0.16),
    walk: new THREE.BoxGeometry(W + 0.6, 0.06, 0.7),
    rail: new THREE.BoxGeometry(W + 0.6, 0.05, 0.04),
    arm: new THREE.BoxGeometry(0.06, 0.06, 0.8),
    lamp: new THREE.BoxGeometry(0.34, 0.16, 0.22),
    spill: new THREE.PlaneGeometry(14, 8).rotateX(-Math.PI / 2),
  };
  private steel = new THREE.MeshStandardMaterial({ color: "#3a3f47", metalness: 0.7, roughness: 0.45 });
  private frameMat = new THREE.MeshStandardMaterial({ color: "#16161b", metalness: 0.4, roughness: 0.5 });
  private lampMat = new THREE.MeshBasicMaterial({ color: "#fff1c4", toneMapped: false });
  private spillTex = this.spillTexture();
  private spillMat = new THREE.MeshBasicMaterial({ map: this.spillTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffd9a0", toneMapped: false });
  /** Out of the way (a match is on). */
  hidden = false;
  /** The clock (a test can pin it). */
  now: () => Date = () => new Date();
  constructor(private scene: THREE.Scene, private frame: Frame, private place: SignPlace) {}

  private spillTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, "rgba(255,255,255,.75)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  set(list: Cinema[]) {
    this.all = list;
  }

  /** Build the nearest, drop the rest; call a few times a second. */
  sync(x: number, z: number) {
    const near = this.all
      .map((c) => ({ c, p: this.frame.toXZ(c.lat, c.lng) }))
      .map((e) => ({ ...e, d: Math.hypot(e.p.x - x, e.p.z - z) }))
      .filter((e) => e.d < NEAR_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX);
    const keep = new Set(near.map((e) => e.c.id));
    for (const [id, b] of this.built) if (!keep.has(id)) this.drop(id, b);
    for (const { c, p, d } of near) {
      let b = this.built.get(c.id);
      if (!b) b = this.build(c);
      b.dist = d;
      // On the pavement in front of it, facing the street (again: streets load later).
      const s = this.place(p.x, p.z);
      if (!s) {
        b.group.visible = false;
        continue;
      }
      const f = { x: Math.sin(s.angle), z: Math.cos(s.angle) };
      // Pushed back from the kerb spot toward the cinema, so the board's face is on the pavement.
      b.group.position.set(s.x - f.x * (OUT - 1.3), 0, s.z - f.z * (OUT - 1.3));
      b.group.rotation.y = s.angle;
      b.group.visible = !this.hidden;
    }
  }

  private build(c: Cinema): Board {
    const group = new THREE.Group();
    const top = LIFT + H / 2;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(this.geo.post, this.steel);
      post.scale.set(1, LIFT + H, 1);
      post.position.x = side * (W / 2 - 0.5);
      group.add(post);
    }
    const back = new THREE.Mesh(this.geo.panel, this.frameMat);
    back.position.y = top;
    group.add(back);
    // A truss under the face, a catwalk with its rail, and flood lamps on arms over the top.
    const beam = new THREE.Mesh(this.geo.beam, this.steel);
    beam.position.set(0, LIFT - 0.1, 0.05);
    const walk = new THREE.Mesh(this.geo.walk, this.steel);
    walk.position.set(0, LIFT - 0.3, 0.45);
    const rail = new THREE.Mesh(this.geo.rail, this.steel);
    rail.position.set(0, LIFT + 0.4, 0.78);
    group.add(beam, walk, rail);
    for (const x of [-W * 0.34, 0, W * 0.34]) {
      const arm = new THREE.Mesh(this.geo.arm, this.steel);
      arm.position.set(x, LIFT + H + 0.3, 0.45);
      const lamp = new THREE.Mesh(this.geo.lamp, this.lampMat);
      lamp.position.set(x, LIFT + H + 0.3, 0.85);
      group.add(arm, lamp);
    }
    const spill = new THREE.Mesh(this.geo.spill, this.spillMat);
    spill.position.set(0, 0.05, 4);
    spill.renderOrder = 2;
    group.add(spill);
    const canvas = document.createElement("canvas");
    canvas.width = CW;
    canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.25 + this.night * 0.75, roughness: 0.55 });
    const face = new THREE.Mesh(this.geo.face, mat);
    face.position.set(0, top, 0.16);
    group.add(face);
    group.traverse((o) => (o.userData = { pick: { kind: "cinema", id: String(c.id) } }));
    spill.userData = {};
    this.scene.add(group);
    const b: Board = { c, group, mat, tex, canvas, slides: [], posters: [], sig: "", dist: 999, loaded: false };
    this.built.set(c.id, b);
    this.draw(b, 0);
    // What's on (the server's cached sessions): the posters load as they come.
    void api<CinemaShows>(`/api/cinema?id=${c.id}`)
      .then((r) => {
        if (this.built.get(c.id) !== b) return;
        b.loaded = true;
        b.slides = slidesOf(r.films, this.now());
        b.posters = b.slides.map((s) => {
          if (!s.film.poster) return null;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.referrerPolicy = "no-referrer";
          img.onload = () => (b.sig = "");
          img.src = s.film.poster;
          return img;
        });
        b.sig = "";
        this.draw(b, 0);
      })
      .catch(() => {});
    return b;
  }

  /** Cross-fades, chasing bulbs: redrawn for the boards you're near, only when something changed. */
  update(time: number) {
    if (this.hidden) return;
    for (const b of this.built.values()) {
      if (!b.group.visible || b.dist > LIVE_M) continue;
      const f = fadeAt(time, b.slides.length);
      this.draw(b, time, f);
    }
  }

  /** The board's face: marquee with its bulbs, the poster (cross-fading), that film's title and next sessions. */
  private draw(b: Board, time: number, f = { i: 0, j: 0, k: 0 }) {
    const phase = Math.floor(time * 2.5) % 4;
    const sig = `${f.i}|${f.j}|${f.k.toFixed(2)}|${phase}|${b.slides.length}`;
    if (sig === b.sig) return;
    b.sig = sig;
    const g = b.canvas.getContext("2d")!;
    const rtl = true;
    const bg = g.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, "#15111e");
    bg.addColorStop(1, "#07060a");
    g.fillStyle = bg;
    g.fillRect(0, 0, CW, CH);
    // The marquee: the cinema's name between two rows of bulbs that chase.
    g.fillStyle = "#7a0d16";
    g.fillRect(0, 0, CW, 92);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = (i + phase) % 4 < 2 ? "#fff3c4" : "#a8741f";
      for (const y of [8, 84]) {
        g.beginPath();
        g.arc(14 + i * 25.4, y, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = "#fff6dc";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.direction = "rtl";
    fit(g, b.c.name, CW - 60, 50);
    g.fillText(b.c.name, CW / 2, 47);
    g.direction = "ltr";
    const slide = (i: number, alpha: number) => {
      const s = b.slides[i];
      if (!s || alpha <= 0.01) return;
      g.save();
      g.globalAlpha = alpha;
      // The poster, covering its frame.
      const img = b.posters[i], px = 36, py = 112, pw = 278, ph = 380;
      if (img?.complete && img.naturalWidth) {
        const r = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
        g.save();
        g.beginPath();
        g.rect(px, py, pw, ph);
        g.clip();
        g.drawImage(img, px + (pw - img.naturalWidth * r) / 2, py + (ph - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r);
        g.restore();
      } else {
        g.fillStyle = "#2a2433";
        g.fillRect(px, py, pw, ph);
        g.fillStyle = "#8c8299";
        g.font = `60px ${FONT}`;
        g.fillText("🎬", px + pw / 2, py + ph / 2);
      }
      g.strokeStyle = "rgba(255,255,255,.55)";
      g.lineWidth = 4;
      g.strokeRect(px, py, pw, ph);
      // The title and its next sessions.
      const x0 = 350, x1 = CW - 36, mid = (x0 + x1) / 2;
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.direction = rtl ? "rtl" : "ltr";
      fit(g, s.film.name, x1 - x0, 46);
      g.fillText(s.film.name, mid, 134);
      g.fillStyle = "#ffc94a";
      g.font = `700 24px ${FONT}`;
      g.fillText(t("Next sessions"), mid, 176);
      s.shows.slice(0, 4).forEach((sh, row) => {
        const y = 224 + row * 62;
        g.fillStyle = "rgba(255,255,255,.07)";
        g.fillRect(x0, y - 26, x1 - x0, 54);
        g.direction = "ltr";
        g.fillStyle = "#ffe27a";
        g.font = `800 40px ${FONT}`;
        g.textAlign = "left";
        g.fillText(showTime(sh.at).replace(/\d/g, (d) => fmtNum(Number(d))), x0 + 14, y + 1);
        g.fillStyle = sh.vip ? "#ffb4e6" : "#cfd6e4";
        g.font = `700 24px ${FONT}`;
        g.textAlign = "center";
        g.direction = "rtl";
        g.fillText(sh.hall, mid + 30, y + 1, 190);
        g.fillStyle = "#9ff0c0";
        g.textAlign = "right";
        g.direction = rtl ? "rtl" : "ltr";
        g.font = `800 24px ${FONT}`;
        g.fillText(sh.toman > 0 ? t("{n} toman", { n: fmtNum(sh.toman) }) : "", x1 - 12, y + 1);
      });
      g.restore();
    };
    if (b.slides.length) {
      slide(f.i, 1 - f.k);
      if (f.k > 0) slide(f.j, f.k);
      // Pips: which poster of how many.
      g.direction = "ltr";
      b.slides.forEach((_, n) => {
        g.fillStyle = n === (f.k > 0.5 ? f.j : f.i) ? "#ffc94a" : "rgba(255,255,255,.3)";
        g.beginPath();
        g.arc(CW / 2 + (n - (b.slides.length - 1) / 2) * 20 + 160, 500, 5, 0, Math.PI * 2);
        g.fill();
      });
    } else {
      g.fillStyle = "#c9c2b0";
      g.textAlign = "center";
      g.font = `700 34px ${FONT}`;
      g.direction = "rtl";
      g.fillText(b.loaded ? t("No more sessions today") : "🎬", CW / 2, 280);
    }
    g.fillStyle = "rgba(255,255,255,.55)";
    g.font = `600 20px ${FONT}`;
    g.textAlign = "right";
    g.direction = "rtl";
    g.fillText(t("Tap for tickets"), CW - 36, 500);
    b.tex.needsUpdate = true;
  }

  /** Signs glow at night (the boards' level), and a pool of light spills in front. */
  setNight(k: number) {
    this.night = k;
    for (const b of this.built.values()) b.mat.emissiveIntensity = 0.25 + k * 0.75;
    this.spillMat.opacity = k * 0.45;
    this.lampMat.color.set("#fff1c4").multiplyScalar(0.55 + k * 1.7);
  }

  get(id: string) {
    return this.all.find((c) => String(c.id) === id) ?? null;
  }

  pickables() {
    return [...this.built.values()].flatMap((b) => b.group.children.filter((o) => o.userData.pick));
  }

  private drop(id: number, b: Board) {
    this.scene.remove(b.group);
    b.mat.dispose();
    b.tex.dispose();
    this.built.delete(id);
  }

  dispose() {
    for (const [id, b] of this.built) this.drop(id, b);
    for (const g of Object.values(this.geo)) g.dispose();
    this.steel.dispose();
    this.frameMat.dispose();
    this.lampMat.dispose();
    this.spillMat.dispose();
    this.spillTex.dispose();
  }
}

/** Set a bold font no bigger than `size` px that fits `text` in `w` px. */
function fit(g: CanvasRenderingContext2D, text: string, w: number, size: number) {
  let s = size;
  g.font = `800 ${s}px ${FONT}`;
  while (s > 14 && g.measureText(text).width > w) g.font = `800 ${(s -= 2)}px ${FONT}`;
}
