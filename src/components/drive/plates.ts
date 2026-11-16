"use client";
// Number plates on the car you drive (lib/plate.ts says the number): drawn once on a canvas the
// way the real ones look — white (yellow on a taxi), the blue strip with the flag and «I.R. IRAN»,
// «۱۲ ب ۳۴۵», the «ایران» box with the region — and stuck on the front and back bumpers. The model
// can change under them (a real car model arriving, a new vehicle): `fit` finds the bumpers again.
// The traffic's plates come from one shared sheet of numbers (plateAtlas).
import * as THREE from "three";
import { faDigits, PLATE_CELLS, PLATE_COLS, PLATE_ROWS, PLATE_TAXI, plateFor, plateSeed, type Plate } from "@/lib/plate";

const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, sans-serif`;
/** A real plate is 52 × 11.5 cm. */
const W = 0.52, H = 0.115;

const cache = new Map<string, THREE.CanvasTexture>();

/** One plate drawn into `g` on a 520 × 115 grid (the caller scales and moves it). */
function drawPlate(g: CanvasRenderingContext2D, p: Plate) {
  // The plate, its black rim.
  g.fillStyle = p.taxi ? "#f2c230" : "#f6f6f1";
  g.beginPath();
  g.roundRect(2, 2, 516, 111, 10);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "#1b1b1b";
  g.stroke();
  // The blue strip: the flag over «I.R. IRAN».
  g.fillStyle = "#1f4fa8";
  g.fillRect(6, 6, 64, 103);
  const fy = 18, fh = 14;
  for (const [i, col] of ["#239f40", "#ffffff", "#da0000"].entries()) (g.fillStyle = col), g.fillRect(16, fy + i * fh, 44, fh);
  g.fillStyle = "#fff";
  g.font = `700 13px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("I.R.", 38, 78);
  g.fillText("IRAN", 38, 94);
  // «۱۲ ب ۳۴۵» — left to right as on the plate.
  g.fillStyle = "#111";
  g.font = `800 66px ${FONT}`;
  g.direction = "ltr";
  g.fillText(faDigits(p.two), 120, 62);
  g.font = `800 58px ${FONT}`;
  g.fillText(p.letter, 196, 58);
  g.font = `800 66px ${FONT}`;
  g.fillText(faDigits(p.three), 296, 62);
  // The «ایران» box with the region.
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(392, 8);
  g.lineTo(392, 107);
  g.stroke();
  g.font = `700 20px ${FONT}`;
  g.fillText("ایران", 454, 26);
  g.font = `800 54px ${FONT}`;
  g.fillText(faDigits(p.region), 454, 74);
}

/** Draw again once the Persian font is in (it may still be loading the first time). */
function whenFont(redraw: () => void) {
  if (typeof document !== "undefined" && document.fonts?.load) void document.fonts.load(`800 40px Vazirmatn`, "۱۲۳ب").then(redraw, () => {});
}

function texture(p: Plate) {
  const key = `${p.two}${p.letter}${p.three}${p.region}${p.taxi ? "t" : ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 520;
  c.height = 115;
  const g = c.getContext("2d")!;
  drawPlate(g, p);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  whenFont(() => {
    g.clearRect(0, 0, c.width, c.height);
    drawPlate(g, p);
    tex.needsUpdate = true;
  });
  return tex;
}

/**
 * The traffic's plates (fleet3d.ts draws them on every car near you): PLATE_CELLS real numbers on one
 * canvas (lib/plate.ts PLATE_CELLS) — so every plate in the street is one instanced mesh picking its
 * cell (plateCell).
 */
const CELL_W = 256, CELL_H = 56;
let atlas: THREE.CanvasTexture | null = null;
export function plateAtlas() {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = CELL_W * PLATE_COLS;
  c.height = CELL_H * PLATE_ROWS;
  const g = c.getContext("2d");
  const draw = () => {
    // (No real 2D canvas — a headless test's stand-in — draws nothing: the plates stay blank.)
    if (typeof g?.clearRect !== "function") return;
    g.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < PLATE_CELLS; i++) {
      g.save();
      g.translate((i % PLATE_COLS) * CELL_W, Math.floor(i / PLATE_COLS) * CELL_H);
      g.scale(CELL_W / 520, CELL_H / 115);
      drawPlate(g, plateFor(plateSeed(i), i >= PLATE_CELLS - PLATE_TAXI));
      g.restore();
    }
  };
  draw();
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  whenFont(() => (draw(), (atlas!.needsUpdate = true)));
  return atlas;
}


type Fits = { group: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[] };

export class Plates {
  readonly group = new THREE.Group();
  private front: THREE.Mesh;
  private back: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private geo = new THREE.PlaneGeometry(W, H);
  private sig = "";
  private box = new THREE.Box3();
  private inv = new THREE.Matrix4();

  constructor(plate: Plate) {
    this.mat = new THREE.MeshStandardMaterial({ map: texture(plate), roughness: 0.35, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2 });
    this.front = new THREE.Mesh(this.geo, this.mat);
    this.back = new THREE.Mesh(this.geo, this.mat);
    this.front.rotation.y = Math.PI; // facing forward (−z)
    this.group.add(this.front, this.back);
    this.group.name = "plates";
  }

  set plate(p: Plate) {
    this.mat.map = texture(p);
    this.mat.needsUpdate = true;
  }

  /**
   * Put the plates on this vehicle's bumpers (cheap when nothing changed). `bike`: a plate on the
   * back only; `none` (drone, helicopter): no plates.
   */
  fit(m: Fits, kind: "car" | "bike" | "none") {
    let meshes = 0;
    m.body.traverse((o) => void ((o as THREE.Mesh).isMesh && o.parent !== this.group && meshes++));
    const sig = `${m.body.uuid}|${meshes}|${kind}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.group.removeFromParent();
    if (kind === "none") return;
    // The body's size in the car's own space (the plates themselves left out).
    m.group.updateMatrixWorld(true);
    this.inv.copy(m.group.matrixWorld).invert();
    this.box.makeEmpty();
    const b = new THREE.Box3();
    m.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      b.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(this.inv);
      this.box.union(b);
    });
    if (this.box.isEmpty()) return;
    // Keep them near the wheels (a light beam or a load mustn't drag them off into the air).
    let wz0 = Infinity, wz1 = -Infinity;
    for (const w of m.wheels) (wz0 = Math.min(wz0, w.position.z)), (wz1 = Math.max(wz1, w.position.z));
    const z0 = Number.isFinite(wz0) ? Math.max(this.box.min.z, wz0 - 1.4) : this.box.min.z;
    const z1 = Number.isFinite(wz1) ? Math.min(this.box.max.z, wz1 + 1.6) : this.box.max.z;
    const hgt = this.box.max.y - this.box.min.y;
    const y = this.box.min.y + Math.max(0.3, Math.min(0.62, hgt * 0.3));
    const bike = kind === "bike";
    this.front.visible = !bike;
    this.front.position.set(0, y, z0 - 0.012);
    this.back.position.set(0, bike ? this.box.min.y + Math.min(0.75, hgt * 0.55) : y, z1 + 0.012);
    this.back.scale.setScalar(bike ? 0.6 : 1);
    m.body.add(this.group);
  }

  dispose() {
    this.group.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
