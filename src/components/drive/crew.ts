"use client";
// Who's in the cars in traffic: a driver at the wheel of every car that's driving (Iran
// drives on the right, so the wheel is on the left), seen through the tinted glass — and
// the cabin they sit in, so the glass shows a dark interior with seats, a dashboard and a
// steering wheel instead of the street through an empty shell.
//  - The cabin is worked out from the model's own glass (the shape of the windows seen
//    from the side, pulled in a little and taken down to the floor), facing inward so only
//    its far walls draw: it can't cover anything outside the car. It's added to the
//    traffic copy of the model's trim (one material, coloured per vertex), so it costs no
//    extra draw call. Your own car shares the model but not this (its cockpit view).
//  - Drivers are two instanced meshes for the whole city (shirt; head and hands), each
//    copy with its own shirt and skin tone, sat where that model's driver's head goes.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Where a model's driver sits: the middle of their head, in the model's frame (nose at −z). */
export type Seat = { x: number; y: number; z: number };

type P2 = [number, number];

/** The convex hull of points (z, y), counter-clockwise. */
export function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [], hi: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-9) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/**
 * The cabin a model's glass encloses (null: no glass, or none above the waist — a bike):
 * its outline seen from the side (z, y; floor to roof), how wide inside, and the driver's seat.
 * Pure: tests/crew.test.ts.
 */
export function cabinShape(
  pos: ArrayLike<number>,
  hgt: number,
): {
  outline: P2[];
  x0: number;
  x1: number;
  seat: Seat;
  roof: number;
  waist: number;
  front: number;
  back: number;
} | null {
  const pts: P2[] = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    // Lamp lenses low on the nose and tail aren't windows.
    if (y < hgt * 0.5) continue;
    pts.push([z, y]);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (pts.length < 6 || x1 - x0 < 0.5 || y1 - y0 < 0.2) return null;
  const floor = Math.max(0.25, y0 - 0.5);
  let zs = Infinity, ze = -Infinity;
  for (const [z] of pts) ((zs = Math.min(zs, z)), (ze = Math.max(ze, z)));
  const h = hull([...pts, [zs, floor], [ze, floor]]);
  // Pulled in 4 cm toward the middle: inside the glass, never through it.
  const cz = h.reduce((s, q) => s + q[0], 0) / h.length, cy = h.reduce((s, q) => s + q[1], 0) / h.length;
  const outline = h.map(([z, y]): P2 => {
    const dz = cz - z, dy = cy - y, l = Math.hypot(dz, dy) || 1;
    return [z + (dz / l) * 0.04, y + (dy / l) * 0.04];
  });
  // The roof's front edge: where the windscreen meets it.
  let roofFront = ze;
  for (const [z, y] of pts) if (y > y1 - 0.08) roofFront = Math.min(roofFront, z);
  const cx = (x0 + x1) / 2, half = (x1 - x0) / 2 - 0.05;
  const seat = {
    x: cx - half * 0.5,
    y: Math.min(y1 - 0.24, y0 + 0.42),
    z: Math.min(ze - 0.3, Math.max(roofFront + 0.15, zs + Math.min(0.97, 0.4 * (ze - zs)))),
  };
  return {
    outline,
    x0: cx - half,
    x1: cx + half,
    seat,
    roof: y1,
    waist: y0,
    front: zs,
    back: ze,
  };
}

/** A box (w × h × d) at (x, y, z), coloured `color`. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
}

function paint(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) ((a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b));
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

/** A box from a to b, `t` thick. */
function limb(a: THREE.Vector3, b: THREE.Vector3, t: number, color: string) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}

/** The cabin's walls (inward), seats, dashboard and steering wheel. */
export function cabinGeometry(c: NonNullable<ReturnType<typeof cabinShape>>): THREE.BufferGeometry {
  const shape = new THREE.Shape(c.outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = c.x1 - c.x0;
  // Extruded along the shape's own z, then swapped round to run across the car (x) from x0.
  // The swap is a mirror: it turns every triangle inside out by itself (only the far walls
  // draw) — the normals, mirrored with it, still point out, so they're turned in.
  const walls = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  walls.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, c.x0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  const inside = walls.toNonIndexed();
  const n = inside.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  const parts: THREE.BufferGeometry[] = [paint(inside, "#0d0f12")];
  const s = c.seat, mid = (c.x0 + c.x1) / 2, other = 2 * mid - s.x;
  // Front seats (back and headrest) and, if there's room, a rear bench.
  for (const x of [s.x, other]) {
    parts.push(box(0.46, 0.55, 0.1, x, s.y - 0.4, s.z + 0.2, "#2a2622"));
    parts.push(box(0.24, 0.18, 0.09, x, s.y + 0.02, s.z + 0.2, "#2a2622"));
  }
  if (s.z + 0.95 < c.back - 0.15) parts.push(box(c.x1 - c.x0 - 0.12, 0.5, 0.12, mid, s.y - 0.42, s.z + 0.98, "#2a2622"));
  // The dashboard under the windscreen, and the wheel in front of the driver.
  const dashBack = s.z - 0.48;
  if (dashBack > c.front + 0.12) parts.push(box(c.x1 - c.x0 - 0.04, 0.16, dashBack - c.front - 0.06, mid, c.waist - 0.02, (c.front + 0.06 + dashBack) / 2, "#16171a"));
  const wheel = new THREE.TorusGeometry(0.16, 0.022, 5, 14).rotateX(-0.45).translate(s.x, s.y - 0.33, s.z - 0.42);
  parts.push(paint(wheel, "#0b0b0c"));
  return mergeAll(parts);
}

/** Merge geometries with only position, normal and colour (no uv, no index). */
function mergeAll(gs: THREE.BufferGeometry[]) {
  const clean = gs.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(f.attributes)) if (k !== "position" && k !== "normal" && k !== "color") f.deleteAttribute(k);
    return f;
  });
  return mergeGeometries(clean)!;
}

/** Every attribute as plain floats (a real model's colours can be normalized bytes; merging needs one kind). */
function asFloats(g: THREE.BufferGeometry) {
  for (const [k, a] of Object.entries(g.attributes) as [string, THREE.BufferAttribute][]) {
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
    g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  g.morphAttributes = {};
  return g;
}

/** A model's trim with its cabin added (and where its driver sits), for traffic. */
export function withCabin(kit: THREE.BufferGeometry, glass: THREE.BufferGeometry | null, hgt: number): { kit: THREE.BufferGeometry; seat: Seat | null } {
  if (!glass) return { kit, seat: null };
  const c = cabinShape(glass.getAttribute("position").array, hgt);
  if (!c) return { kit, seat: null };
  const cabin = cabinGeometry(c);
  // In the same form as the trim, so the two merge.
  const base = asFloats(kit.index ? kit.toNonIndexed() : kit.clone());
  const n = cabin.getAttribute("position").count;
  for (const [k, a] of Object.entries(base.attributes)) {
    const have = cabin.getAttribute(k);
    if (have && have.itemSize === a.itemSize) continue;
    const f = new Float32Array(n * a.itemSize);
    if (have) {
      // The trim's colours carry alpha: the cabin's too (opaque).
      for (let i = 0; i < n; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = j < have.itemSize ? have.getComponent(i, j) : 1;
    }
    cabin.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  for (const k of Object.keys(cabin.attributes)) if (!base.getAttribute(k)) cabin.deleteAttribute(k);
  const merged = mergeGeometries([base, cabin]);
  if (base !== kit) base.dispose();
  if (!merged) return { kit, seat: c.seat };
  merged.computeBoundingSphere();
  return { kit: merged, seat: c.seat };
}

// ---------------------------------------------------------------- the drivers
const SHIRTS = ["#f1f1ee", "#1f2a44", "#3a3a3c", "#6b4f3a", "#2f5d50", "#7d1d2a", "#c9c2b0", "#24476b", "#111214", "#5c6470"];
/** Women's manteaus: darker and plainer. */
const MANTEAUS = ["#1c1c1e", "#2b2f3a", "#5a4a42", "#6b6f7a", "#3a2d2a", "#7a6a58", "#26323f", "#4a2f3a"];
const SCARVES = ["#111111", "#1b1f2a", "#3b2a2a", "#6d5a4a", "#2c3e50", "#5b2333", "#8a7f72", "#3d4d3a", "#7a1f2b", "#c2b8a3", "#111111"];
const HAIRS = ["#1b1410", "#2a1e17", "#3a2a1e", "#0f0f10", "#5c5a58"];
const SKINS = ["#f0c9a5", "#e0b48f", "#c99670", "#a87652", "#8a5a3c"];
/** About a third of drivers are women, in a headscarf (as on the pavements: people.ts). */
export const WOMEN_SHARE = 0.35;

/** A driver's look from their car's number: the same car, the same driver. */
export function driverLook(seed: number, uniform = false) {
  const f = (k: number) => (((seed * k) % 1) + 1) % 1;
  const woman = !uniform && f(0.3819) < WOMEN_SHARE;
  const pick = <T,>(l: T[], k: number) => l[Math.floor(f(k) * l.length) % l.length];
  return { woman, top: woman ? pick(MANTEAUS, 0.7071) : pick(SHIRTS, 0.7071), skin: pick(SKINS, 0.5772), hair: woman ? pick(SCARVES, 0.1618) : pick(HAIRS, 0.1618) };
}

/**
 * A driver, the middle of the head at the origin, facing −z, hands on a wheel 0.42 m ahead:
 * the top (shirt or manteau, coloured per copy), the skin (face, neck, hands), a man's
 * hair, and a woman's headscarf (a hood open at the face, wrapped under the chin and
 * over the shoulders).
 */
function driverGeometry() {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const W = "#ffffff";
  const top: THREE.BufferGeometry[] = [box(0.4, 0.5, 0.22, 0, -0.46, 0.05, W), box(0.44, 0.1, 0.2, 0, -0.25, 0.04, W)];
  const skin: THREE.BufferGeometry[] = [paint(new THREE.SphereGeometry(0.1, 10, 8).scale(0.95, 1.15, 1.05), W), paint(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6).translate(0, -0.14, 0.01), W)];
  for (const side of [-1, 1]) {
    const sh = v(side * 0.2, -0.27, 0.04), el = v(side * 0.21, -0.48, -0.18), hand = v(side * 0.14, -0.31, -0.4);
    top.push(limb(sh, el, 0.09, W), limb(el, hand, 0.075, W));
    skin.push(paint(new THREE.SphereGeometry(0.042, 6, 5).translate(hand.x, hand.y, hand.z), W));
  }
  // Hair: a cap over the top and back of the head.
  const hair = paint(new THREE.SphereGeometry(0.107, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.97, 1.12, 1.08).translate(0, 0.012, 0.012), W);
  // The scarf: round the head but open at the face (the front is −z: φ = 3π/2 in three's
  // sphere), down past the chin; and a drape from under the chin over the shoulders.
  const gap = 0.8;
  const hood = new THREE.SphereGeometry(0.12, 14, 9, (3 * Math.PI) / 2 + gap, Math.PI * 2 - gap * 2, 0, Math.PI * 0.8).scale(0.97, 1.13, 1.08).translate(0, 0.004, 0.012);
  const drape = new THREE.CylinderGeometry(0.095, 0.22, 0.26, 14, 1, true).translate(0, -0.2, 0.02);
  const scarf = mergeAll([paint(hood, W), paint(drape, W)]);
  return { top: mergeAll(top), skin: mergeAll(skin), hair: mergeAll([hair]), scarf };
}

type Part = "top" | "skin" | "hair" | "scarf";

export class Crew {
  private mesh: Record<Part, THREE.InstancedMesh>;
  private count: Record<Part, number> = { top: 0, skin: 0, hair: 0, scarf: 0 };
  private m = new THREE.Matrix4();
  private t = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(private scene: THREE.Scene, private cap = 48) {
    const g = driverGeometry();
    const mat = () => new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.85, metalness: 0 });
    // The scarf is a thin shell: seen from inside through the open face too.
    const cloth = mat();
    cloth.side = THREE.DoubleSide;
    this.mesh = { top: this.inst(g.top, mat(), cap), skin: this.inst(g.skin, mat(), cap), hair: this.inst(g.hair, mat(), cap), scarf: this.inst(g.scarf, cloth, cap) };
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, this.c.set("#fff"));
    m.castShadow = false;
    this.scene.add(m);
    return m;
  }

  begin() {
    for (const k of Object.keys(this.count) as Part[]) this.count[k] = 0;
  }

  /** How many drivers are drawn this frame. */
  get n() {
    return this.count.top;
  }

  private add(k: Part, color: THREE.ColorRepresentation) {
    if (this.count[k] >= this.cap) this.grow();
    const i = this.count[k]++;
    this.mesh[k].setMatrixAt(i, this.m);
    this.mesh[k].setColorAt(i, this.c.set(color));
  }

  /** A driver in the car drawn with matrix `car`, at `seat`; `seed` picks who (the same for the same car); `shirt`: a uniform. */
  put(car: THREE.Matrix4, seat: Seat, seed: number, shirt?: THREE.ColorRepresentation) {
    const look = driverLook(seed, shirt != null);
    // A little turn of the body, so a row of drivers isn't one pose.
    const turn = (((seed * 0.6180339) % 1) - 0.5) * 0.25;
    this.m.multiplyMatrices(car, this.t.makeRotationY(turn).setPosition(seat.x, seat.y, seat.z));
    this.add("top", shirt ?? look.top);
    this.add("skin", look.skin);
    this.add(look.woman ? "scarf" : "hair", look.hair);
  }

  private grow() {
    const cap = this.cap * 2;
    for (const k of Object.keys(this.mesh) as Part[]) {
      const old = this.mesh[k], m = this.inst(old.geometry, old.material as THREE.Material, cap);
      m.instanceMatrix.array.set(old.instanceMatrix.array);
      m.instanceColor!.array.set(old.instanceColor!.array);
      this.scene.remove(old);
      old.dispose();
      this.mesh[k] = m;
    }
    this.cap = cap;
  }

  end() {
    for (const k of Object.keys(this.mesh) as Part[]) {
      const m = this.mesh[k];
      m.count = this.count[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of Object.values(this.mesh)) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }
}
