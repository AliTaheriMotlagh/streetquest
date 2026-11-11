"use client";
// Cinemas in the 3D city (what's on: cinematicket.org, via /api/cinema): in front of each
// cinema near you, a big lit billboard on two posts at the kerb — the cinema's name on a
// marquee of bulbs, the posters of the films it's showing with each one's next session
// under it. It glows at night like the shop signs. Tapping it opens the cinema's card (every film and session, and the tickets).
// Only the nearest few are built; the sessions come from the server's ten-minute cache.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { showTime, type Cinema, type CinemaShows, type Film } from "@/lib/cinema";
import { api } from "../game/client";
import type { SignPlace } from "./markers";

/** Built for cinemas this near (m), at most this many. */
const NEAR_M = 450, MAX = 3;
/** The board: metres wide and tall, how high its bottom edge is, and how far past the kerb it stands. */
const W = 8.4, H = 4.2, LIFT = 2.6, OUT = 2.4;
/** Posters on it at most. */
const POSTERS = 4;
const CW = 1024, CH = 512;

type Board = { c: Cinema; group: THREE.Group; mat: THREE.MeshStandardMaterial; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; films: Film[]; posters: (HTMLImageElement | null)[] };

export class CinemaBoards {
  private all: Cinema[] = [];
  private built = new Map<number, Board>();
  private night = 0.15;
  private post = new THREE.CylinderGeometry(0.12, 0.14, 1, 8).translate(0, 0.5, 0);
  private postMat = new THREE.MeshStandardMaterial({ color: "#2b2f36", metalness: 0.6, roughness: 0.4 });
  private panel = new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.25);
  private frameMat = new THREE.MeshStandardMaterial({ color: "#1a1a1f", metalness: 0.4, roughness: 0.5 });
  private face = new THREE.PlaneGeometry(W, H);
  /** Out of the way (a match is on). */
  hidden = false;
  constructor(private scene: THREE.Scene, private frame: Frame, private place: SignPlace) {}

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
    for (const { c, p } of near) {
      let b = this.built.get(c.id);
      if (!b) b = this.build(c);
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
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(this.post, this.postMat);
      post.scale.set(1, LIFT + H / 2, 1);
      post.position.x = side * (W / 2 - 0.6);
      group.add(post);
    }
    const back = new THREE.Mesh(this.panel, this.frameMat);
    back.position.y = LIFT + H / 2;
    group.add(back);
    const canvas = document.createElement("canvas");
    canvas.width = CW;
    canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: this.night, roughness: 0.55 });
    const face = new THREE.Mesh(this.face, mat);
    face.position.set(0, LIFT + H / 2, 0.13);
    group.add(face);
    group.traverse((o) => (o.userData = { pick: { kind: "cinema", id: String(c.id) } }));
    this.scene.add(group);
    const b: Board = { c, group, mat, tex, canvas, films: [], posters: [] };
    this.built.set(c.id, b);
    this.draw(b);
    // What's on (the server's cached sessions): the posters load as they come.
    void api<CinemaShows>(`/api/cinema?id=${c.id}`)
      .then((r) => {
        if (this.built.get(c.id) !== b) return;
        b.films = r.films.slice(0, POSTERS);
        b.posters = b.films.map((f) => {
          if (!f.poster) return null;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.referrerPolicy = "no-referrer";
          img.onload = () => this.built.get(c.id) === b && this.draw(b);
          img.src = f.poster;
          return img;
        });
        this.draw(b);
      })
      .catch(() => {});
    return b;
  }

  /** The board's face: marquee, posters with titles and next sessions, the scrolling strip. */
  private draw(b: Board) {
    const g = b.canvas.getContext("2d")!;
    const bg = g.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, "#14101c");
    bg.addColorStop(1, "#07060a");
    g.fillStyle = bg;
    g.fillRect(0, 0, CW, CH);
    // The marquee: the cinema's name between two rows of bulbs.
    g.fillStyle = "#7a0d16";
    g.fillRect(0, 0, CW, 92);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? "#ffe9a8" : "#ffc94a";
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
    fit(g, b.c.name, CW - 60, 50, "Vazirmatn, Tahoma, sans-serif");
    g.fillText(b.c.name, CW / 2, 47);
    // The posters, side by side, each with its title and next session.
    const n = Math.max(1, b.films.length), slot = (CW - 40) / Math.max(n, 3), pw = Math.min(slot - 24, 170), ph = pw * 1.42;
    const x0 = (CW - slot * n) / 2;
    if (!b.films.length) {
      g.fillStyle = "#c9c2b0";
      g.font = "700 38px Vazirmatn, Tahoma, sans-serif";
      g.fillText("🎬", CW / 2, 250);
    }
    b.films.forEach((f, i) => {
      const cx = CW - (x0 + slot * i + slot / 2), top = 112;
      const img = b.posters[i];
      if (img?.complete && img.naturalWidth) g.drawImage(img, cx - pw / 2, top, pw, ph);
      else {
        g.fillStyle = "#2a2433";
        g.fillRect(cx - pw / 2, top, pw, ph);
      }
      g.strokeStyle = "rgba(255,255,255,.35)";
      g.lineWidth = 3;
      g.strokeRect(cx - pw / 2, top, pw, ph);
      g.fillStyle = "#ffffff";
      fit(g, f.name, slot - 16, 28, "Vazirmatn, Tahoma, sans-serif");
      g.fillText(f.name, cx, top + ph + 24);
      const next = f.showings.find((s) => Date.parse(s.at) > Date.now() - 5 * 60_000);
      if (next) {
        g.fillStyle = "#ffc94a";
        g.font = "800 26px Vazirmatn, Tahoma, sans-serif";
        g.fillText(showTime(next.at), cx, top + ph + 56);
      }
    });
    b.tex.needsUpdate = true;
  }

  /** Signs glow at night (the boards' level). */
  setNight(k: number) {
    this.night = k;
    for (const b of this.built.values()) b.mat.emissiveIntensity = 0.25 + k * 0.75;
  }

  get(id: string) {
    return this.all.find((c) => String(c.id) === id) ?? null;
  }

  pickables() {
    return [...this.built.values()].flatMap((b) => b.group.children);
  }

  private drop(id: number, b: Board) {
    this.scene.remove(b.group);
    b.mat.dispose();
    b.tex.dispose();
    this.built.delete(id);
  }

  dispose() {
    for (const [id, b] of this.built) this.drop(id, b);
    for (const x of [this.post, this.panel, this.face]) x.dispose();
    this.postMat.dispose();
    this.frameMat.dispose();
  }
}

/** Set a bold font no bigger than `size` px that fits `text` in `w` px. */
function fit(g: CanvasRenderingContext2D, text: string, w: number, size: number, family: string) {
  let s = size;
  g.font = `800 ${s}px ${family}`;
  while (s > 14 && g.measureText(text).width > w) g.font = `800 ${(s -= 2)}px ${family}`;
}
