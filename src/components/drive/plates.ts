"use client";
// Number plates on the car you drive (lib/plate.ts says the number): drawn once on a canvas the
// way the real ones look — white (yellow on a taxi), the blue strip with the flag and «I.R. IRAN»,
// «۱۲ ب ۳۴۵», the «ایران» box with the region — and stuck on the front and back bumpers. The model
// can change under them (a real car model arriving, a new vehicle): `fit` finds the bumpers again.
import * as THREE from "three";
import { faDigits, type Plate } from "@/lib/plate";

const FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, sans-serif`;
/** A real plate is 52 × 11.5 cm. */
const W = 0.52, H = 0.115;

const cache = new Map<string, THREE.CanvasTexture>();

function texture(p: Plate) {
  const key = `${p.two}${p.letter}${p.three}${p.region}${p.taxi ? "t" : ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 520;
  c.height = 115;
  const g = c.getContext("2d")!;
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  // The Persian font may still be loading: draw it again once it's in.
  if (typeof document !== "undefined" && document.fonts?.load)
    void document.fonts.load(`800 40px Vazirmatn`, "۱۲۳ب").then(() => {
      if (cache.get(key) !== tex) return;
      cache.delete(key);
      const again = texture(p);
      tex.image = again.image;
      tex.needsUpdate = true;
      cache.set(key, tex);
    }, () => {});
  return tex;
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
