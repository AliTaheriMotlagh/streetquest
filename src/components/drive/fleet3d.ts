"use client";
// The cars, pickups, buses and motorbikes of Iran's streets in 3D (which drive where, and
// how often: lib/fleet.ts). Each model is built once, from its side profile — extruded
// across its width, with the wheel arches cut in — plus boxes for the lamps, bumpers,
// grille, mirrors and the Iranian number plate (white, blue strip; yellow on a taxi), and
// split by material: paint · kit (trim, chrome, plates, loads, riders: vertex colours) ·
// glass · head lamps · tail lamps · one wheel. Traffic draws every copy of a model with
// one instanced mesh per part (FleetInstances: a handful of draw calls for a whole
// street of cars); a player's own car wraps the same geometry in ordinary meshes
// (vehicles3d.ts). Forward is −z.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLEET, type FleetKey } from "@/lib/fleet";
import { paint as tint, toon, type Style } from "./world3d";

/** One model, split by material. Shared by every copy: never disposed with a car. */
export type FleetParts = {
  key: FleetKey;
  len: number;
  wid: number;
  hgt: number;
  paint: THREE.BufferGeometry;
  kit: THREE.BufferGeometry;
  glass: THREE.BufferGeometry | null;
  head: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  /** One wheel, centred on its axle (along x). */
  wheel: THREE.BufferGeometry;
  /** Wheel centres in the model's frame; the front ones steer. */
  wheels: { x: number; y: number; z: number; steers: boolean }[];
  wheelR: number;
  /** Where the headlight beam starts. */
  lamp: { y: number; z: number };
  /** Where a delivery parcel rides. */
  cargo: THREE.Vector3;
};

const TRIM = "#1c1d20", CHROME = "#cfd3d8", GRILLE = "#0e0f11", PLATE = "#f4f4f0", PLATE_BLUE = "#1f4fa8", RUBBER = "#151517", RIM = "#aeb2b8";
const BEVEL = 0.05;

// ---------------------------------------------------------------- building blocks
/** (u, y): metres back from the nose, metres up. */
type P = [number, number];
type Slot = "paint" | "kit" | "glass" | "head" | "tail";

class Build {
  private parts: Record<Slot, THREE.BufferGeometry[]> = { paint: [], kit: [], glass: [], head: [], tail: [] };
  constructor(readonly len: number) {}
  add(slot: Slot, g: THREE.BufferGeometry, color = "#ffffff") {
    this.parts[slot].push(tint(g, color));
  }
  /** A box centred x across, y up and u back from the nose, leaning back by `tilt`, turned by `turn`. */
  box(slot: Slot, w: number, h: number, d: number, x: number, y: number, u: number, color?: string, tilt = 0, turn = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tilt) g.rotateX(tilt);
    if (turn) g.rotateY(turn);
    this.add(slot, g.translate(x, y, u - this.len / 2), color);
  }
  ball(slot: Slot, r: number, x: number, y: number, u: number, color: string) {
    this.add(slot, new THREE.SphereGeometry(r, 10, 7).translate(x, y, u - this.len / 2), color);
  }
  /** A tube along the car (exhausts). */
  tube(slot: Slot, r: number, l: number, x: number, y: number, u: number, color: string) {
    this.add(slot, new THREE.CylinderGeometry(r, r, l, 8).rotateX(Math.PI / 2).translate(x, y, u - this.len / 2), color);
  }
  done(slot: Slot) {
    const l = this.parts[slot];
    return l.length ? mergeGeometries(l)! : null;
  }
}

/** A side outline extruded across `width` (u → z, nose at −len/2), centred on x = 0. */
function slab(pts: P[], width: number, len: number, bevel = BEVEL) {
  const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  const depth = Math.max(0.02, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel > 0 ? 2 : 0, steps: 1, curveSegments: 1 });
  g.rotateY(-Math.PI / 2);
  return g.translate(depth / 2, 0, -len / 2);
}

/** Under the sills, tail to nose, arching over each axle. */
function underside(len: number, floor: number, axles: number[], r: number): P[] {
  const out: P[] = [[len - 0.08, floor]];
  for (const a of [...axles].sort((p, q) => q - p)) {
    // (No repeated points: a zero-length edge breaks the bevel's normals.)
    const ar = r + 0.06, cy = Math.max(r, floor), rise = cy > floor + 1e-3;
    out.push([a + ar, floor]);
    if (rise) out.push([a + ar, cy]);
    for (let i = 1; i < 8; i++) {
      const t = (i / 8) * Math.PI;
      out.push([a + Math.cos(t) * ar, cy + Math.sin(t) * ar]);
    }
    if (rise) out.push([a - ar, cy]);
    out.push([a - ar, floor]);
  }
  out.push([0.08, floor]);
  return out;
}

/** A pillar from a to b on the profile, at x. */
function strut(a: P, b: P, x: number, len: number, t = 0.075) {
  const du = b[0] - a[0], dy = b[1] - a[1];
  const g = new THREE.BoxGeometry(t * 0.6, Math.hypot(du, dy), t);
  g.rotateX(Math.atan2(du, dy));
  return g.translate(x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2 - len / 2);
}

/** Where the outline crosses height y at the front (or back): how far back from the nose, and how the surface leans there. */
function surface(poly: P[], y: number, back: boolean) {
  let u = back ? -Infinity : Infinity, tilt = 0;
  for (let i = 0; i < poly.length; i++) {
    const [u0, y0] = poly[i], [u1, y1] = poly[(i + 1) % poly.length];
    if (y0 === y1 || (y0 - y) * (y1 - y) > 0) continue;
    const at = u0 + ((u1 - u0) * (y - y0)) / (y1 - y0);
    if (back ? at <= u : at >= u) continue;
    u = at;
    tilt = Math.atan2(y1 > y0 ? u1 - u0 : u0 - u1, Math.abs(y1 - y0));
  }
  return { u: Number.isFinite(u) ? u : 0, tilt };
}
type Face = ReturnType<typeof surface>;
/** Centre of a part `d` deep sitting on a face, just proud of the paint. */
const onFront = (f: Face, d: number) => f.u - BEVEL / Math.cos(Math.min(1.1, Math.abs(f.tilt))) + 0.015 - d / 2;
const onBack = (f: Face, d: number) => f.u + BEVEL / Math.cos(Math.min(1.1, Math.abs(f.tilt))) - 0.015 + d / 2;

type Lamp = { x: number; y: number; w: number; h: number; turn?: number };
/** A pair of lamps (x and −x), swept back round the corners by `turn`. */
function lamps(b: Build, slot: "head" | "tail", poly: P[], list: Lamp[], back: boolean) {
  for (const l of list)
    for (const side of [-1, 1]) {
      const f = surface(poly, l.y, back);
      // Turning a lamp swings its inner end out of the bodywork: set it back by as much,
      // so the outer end tucks round the corner instead.
      const sink = (l.w / 2) * Math.sin(l.turn ?? 0) * 0.85;
      b.box(slot, l.w, l.h, 0.05, side * l.x, l.y, back ? onBack(f, 0.05) - sink : onFront(f, 0.05) + sink, undefined, f.tilt, side * (l.turn ?? 0) * (back ? 1 : -1));
    }
}

/** An Iranian number plate: white, the blue "I.R. IRAN" strip on its left as you face it (yellow on a taxi). */
function plate(b: Build, y: number, u: number, back: boolean, tilt = 0, yellow = false) {
  b.box("kit", 0.52, 0.115, 0.02, 0, y, u, yellow ? "#f2c230" : PLATE, tilt);
  b.box("kit", 0.07, 0.115, 0.024, back ? -0.225 : 0.225, y, u + (back ? 0.003 : -0.003), PLATE_BLUE, tilt);
}

function wheelGeo(r: number, w: number, bike: boolean) {
  const parts = bike
    ? [
        tint(new THREE.TorusGeometry(r - 0.045, 0.045, 6, 18).rotateY(Math.PI / 2), RUBBER),
        tint(new THREE.CylinderGeometry(r - 0.08, r - 0.08, 0.02, 12).rotateZ(Math.PI / 2), "#8a8d92"),
        tint(new THREE.CylinderGeometry(0.06, 0.06, w + 0.05, 8).rotateZ(Math.PI / 2), RIM),
      ]
    : [
        tint(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), RUBBER),
        tint(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 12).rotateZ(Math.PI / 2), RIM),
        tint(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 0.04, 8).rotateZ(Math.PI / 2), "#6f737a"),
      ];
  return mergeGeometries(parts)!;
}

type Wheels = { r: number; w: number; axles: number[]; track: number };
function finish(key: FleetKey, b: Build, w: Wheels, lamp: P, cargo: [number, number, number], bike = false): FleetParts {
  const { len, wid, hgt } = FLEET[key];
  return {
    key,
    len,
    wid,
    hgt,
    paint: b.done("paint")!,
    kit: b.done("kit")!,
    glass: b.done("glass"),
    head: b.done("head")!,
    tail: b.done("tail")!,
    wheel: wheelGeo(w.r, w.w, bike),
    wheelR: w.r,
    wheels: w.axles.flatMap((a, i) => (bike ? [0] : [-w.track, w.track]).map((x) => ({ x, y: w.r, z: a - len / 2, steers: i === 0 }))),
    lamp: { y: lamp[1], z: lamp[0] - len / 2 },
    cargo: new THREE.Vector3(cargo[0], cargo[1], cargo[2] - len / 2),
  };
}

// ---------------------------------------------------------------- saloons and hatchbacks
type CarSpec = {
  floor: number;
  wheel: Wheels & { axles: [number, number] };
  /** The body above the sills, nose (bottom) to tail (bottom): along the bonnet, beltline and boot. */
  top: P[];
  /** The greenhouse: windscreen, side windows and back window; its width. */
  glass: P[];
  glassW: number;
  roof: P[];
  /** Pillars between two profile points; `true`: black trim (206, 207). */
  posts: [P, P, boolean?][];
  heads: Lamp[];
  tails: Lamp[];
  grilles: { y: number; w: number; h: number; chrome?: boolean }[];
  /** Separate bumpers (black, or chrome on a Peykan); otherwise painted ones with a black lip. */
  bumpers?: { y: number; h: number; chrome?: boolean };
  plates: [number, number];
  mirror: P;
  /** A chrome strip down the sides at this height. */
  strip?: number;
  taxi?: boolean;
  extra?: (b: Build) => void;
};

function car(key: FleetKey, s: CarSpec): FleetParts {
  const { len, wid } = FLEET[key];
  const b = new Build(len);
  const body = [...s.top, ...underside(len, s.floor, s.wheel.axles, s.wheel.r)];
  b.add("paint", slab(body, wid, len));
  b.add("glass", slab(s.glass, s.glassW, len, 0.02));
  b.add("paint", slab(s.roof, s.glassW + 0.06, len, 0.025));
  for (const [a, c, black] of s.posts) for (const side of [-1, 1]) b.add(black ? "kit" : "paint", strut(a, c, side * (s.glassW / 2 + 0.015), len), TRIM);
  lamps(b, "head", body, s.heads, false);
  lamps(b, "tail", body, s.tails, true);
  for (const g of s.grilles) {
    const f = surface(body, g.y, false);
    b.box("kit", g.w, g.h, 0.04, 0, g.y, onFront(f, 0.04), g.chrome ? CHROME : GRILLE, f.tilt);
    if (g.chrome) b.box("kit", g.w - 0.07, g.h - 0.06, 0.04, 0, g.y, onFront(f, 0.04) - 0.006, GRILLE, f.tilt);
  }
  // Bumpers, and where each plate goes: on the bumper when they share a height.
  const bumperAt = { front: -Infinity, back: Infinity };
  for (const back of [false, true]) {
    const y = s.bumpers?.y ?? s.floor + 0.08, h = s.bumpers?.h ?? 0.08, d = s.bumpers ? 0.13 : 0.1;
    const f = surface(body, y, back), u = back ? onBack(f, d) : onFront(f, d);
    b.box("kit", s.bumpers ? wid + 0.03 : wid - 0.1, h, d, 0, y, u, s.bumpers?.chrome ? CHROME : TRIM);
    if (s.bumpers) bumperAt[back ? "back" : "front"] = u + (back ? d / 2 : -d / 2);
    const py = s.plates[back ? 1 : 0], pf = surface(body, py, back);
    const onBumper = !!s.bumpers && Math.abs(py - s.bumpers.y) < s.bumpers.h / 2 + 0.06;
    const pu = onBumper ? bumperAt[back ? "back" : "front"] + (back ? 0.012 : -0.012) : back ? onBack(pf, 0.02) + 0.03 : onFront(pf, 0.02) - 0.03;
    plate(b, py, pu, back, onBumper ? 0 : pf.tilt, s.taxi);
  }
  for (const side of [-1, 1]) {
    b.box("kit", 0.1, 0.085, 0.15, side * (wid / 2 + 0.07), s.mirror[1], s.mirror[0], TRIM);
    b.box("kit", 0.09, 0.03, 0.05, side * (wid / 2 + 0.01), s.mirror[1] - 0.02, s.mirror[0] + 0.03, TRIM);
    if (s.strip != null) b.box("kit", 0.012, 0.03, len * 0.72, side * (wid / 2 + 0.004), s.strip, len * 0.52, CHROME);
  }
  s.extra?.(b);
  const lampY = s.heads[0].y;
  return finish(key, b, s.wheel, [surface(body, lampY, false).u, lampY], [0, FLEET[key].hgt + 0.32, len * 0.55]);
}

const samand = (taxi: boolean): CarSpec => ({
  floor: 0.2,
  wheel: { r: 0.31, w: 0.19, axles: [0.92, 3.59], track: 0.72 },
  top: [[0.04, 0.28], [0, 0.55], [0.08, 0.72], [0.5, 0.8], [1.32, 0.9], [3.62, 1.0], [4.4, 1.02], [4.48, 0.94], [4.5, 0.54], [4.46, 0.28]],
  glass: [[1.28, 0.88], [2.02, 1.42], [3.18, 1.42], [3.7, 0.98]],
  glassW: 1.48,
  roof: [[1.96, 1.39], [2.08, 1.46], [3.12, 1.46], [3.24, 1.39]],
  posts: [[[1.32, 0.9], [2.02, 1.42]], [[2.62, 0.95], [2.62, 1.42]], [[3.18, 1.42], [3.68, 1.0]]],
  heads: [{ x: 0.56, y: 0.66, w: 0.44, h: 0.17, turn: 0.3 }],
  tails: [{ x: 0.6, y: 0.86, w: 0.38, h: 0.17, turn: 0.25 }],
  grilles: [{ y: 0.64, w: 0.5, h: 0.12, chrome: true }],
  plates: [0.42, 0.64],
  mirror: [1.38, 1.02],
  taxi,
  // The taxi's roof sign.
  extra: taxi
    ? (b) => {
        b.box("kit", 0.62, 0.05, 0.3, 0, 1.485, 2.6, TRIM);
        b.box("kit", 0.54, 0.16, 0.2, 0, 1.59, 2.6, "#f6f4ea");
        b.box("kit", 0.546, 0.04, 0.206, 0, 1.56, 2.6, "#1b1b1b");
      }
    : undefined,
});

const CARS: Partial<Record<FleetKey, () => FleetParts>> = {
  // Saipa Pride 131: small, square, everywhere.
  pride: () =>
    car("pride", {
      floor: 0.2,
      wheel: { r: 0.29, w: 0.17, axles: [0.74, 3.12], track: 0.67 },
      top: [[0.04, 0.26], [0, 0.5], [0.02, 0.76], [0.12, 0.82], [0.96, 0.88], [3.28, 0.95], [3.86, 0.96], [3.93, 0.9], [3.95, 0.5], [3.92, 0.26]],
      glass: [[0.98, 0.86], [1.62, 1.36], [2.8, 1.37], [3.3, 0.93]],
      glassW: 1.38,
      roof: [[1.57, 1.34], [1.65, 1.43], [2.76, 1.43], [2.85, 1.35]],
      posts: [[[1.0, 0.88], [1.62, 1.36]], [[2.14, 0.91], [2.14, 1.36]], [[2.8, 1.37], [3.28, 0.95]]],
      heads: [{ x: 0.52, y: 0.66, w: 0.34, h: 0.15 }],
      tails: [{ x: 0.6, y: 0.76, w: 0.28, h: 0.16 }],
      grilles: [{ y: 0.66, w: 0.58, h: 0.1 }],
      bumpers: { y: 0.36, h: 0.16 },
      plates: [0.36, 0.6],
      mirror: [1.06, 0.97],
    }),
  // Paykan: the long flat bonnet, chrome grille and bumpers, a long boot.
  peykan: () =>
    car("peykan", {
      floor: 0.22,
      wheel: { r: 0.3, w: 0.17, axles: [0.86, 3.36], track: 0.66 },
      top: [[0.02, 0.3], [0, 0.8], [0.08, 0.85], [1.3, 0.89], [3.5, 0.92], [4.2, 0.93], [4.27, 0.87], [4.28, 0.3]],
      glass: [[1.27, 0.87], [1.88, 1.36], [2.96, 1.37], [3.52, 0.9]],
      glassW: 1.4,
      roof: [[1.83, 1.33], [1.9, 1.41], [2.92, 1.41], [3.0, 1.34]],
      posts: [[[1.3, 0.89], [1.88, 1.36]], [[2.42, 0.9], [2.42, 1.37]], [[2.96, 1.37], [3.5, 0.92]]],
      heads: [{ x: 0.56, y: 0.64, w: 0.3, h: 0.17 }],
      tails: [{ x: 0.66, y: 0.66, w: 0.18, h: 0.26 }],
      grilles: [{ y: 0.64, w: 0.74, h: 0.2, chrome: true }],
      bumpers: { y: 0.4, h: 0.12, chrome: true },
      plates: [0.4, 0.58],
      mirror: [1.34, 0.96],
      strip: 0.62,
    }),
  // Peugeot 206: rounded hatch, swept-back lamps, a wide "mouth".
  p206: () =>
    car("p206", {
      floor: 0.2,
      wheel: { r: 0.3, w: 0.18, axles: [0.72, 3.16], track: 0.69 },
      top: [[0.03, 0.28], [0, 0.48], [0.05, 0.62], [0.3, 0.72], [0.92, 0.86], [3.35, 0.97], [3.72, 0.98], [3.8, 0.9], [3.83, 0.5], [3.8, 0.28]],
      glass: [[0.88, 0.84], [1.74, 1.36], [3.18, 1.36], [3.62, 0.96]],
      glassW: 1.42,
      roof: [[1.68, 1.33], [1.78, 1.43], [3.12, 1.42], [3.24, 1.33]],
      posts: [[[0.92, 0.86], [1.74, 1.36]], [[2.26, 0.92], [2.26, 1.36], true], [[3.18, 1.36], [3.6, 0.97]]],
      heads: [{ x: 0.55, y: 0.62, w: 0.4, h: 0.13, turn: 0.35 }],
      tails: [{ x: 0.62, y: 0.82, w: 0.2, h: 0.22 }],
      grilles: [{ y: 0.38, w: 0.78, h: 0.15 }, { y: 0.56, w: 0.36, h: 0.05 }],
      plates: [0.4, 0.62],
      mirror: [0.98, 0.98],
    }),
  // Peugeot 207: rounder and taller, bigger lamps and mouth.
  p207: () =>
    car("p207", {
      floor: 0.2,
      wheel: { r: 0.31, w: 0.19, axles: [0.78, 3.32], track: 0.72 },
      top: [[0.03, 0.28], [0, 0.5], [0.06, 0.65], [0.42, 0.77], [1.02, 0.9], [3.52, 1.0], [3.9, 1.01], [3.98, 0.93], [4.03, 0.52], [4.0, 0.28]],
      glass: [[0.97, 0.88], [1.86, 1.4], [3.32, 1.4], [3.8, 0.99]],
      glassW: 1.48,
      roof: [[1.8, 1.37], [1.92, 1.47], [3.26, 1.46], [3.38, 1.37]],
      posts: [[[1.02, 0.9], [1.86, 1.4]], [[2.42, 0.94], [2.42, 1.4], true], [[3.32, 1.4], [3.78, 1.0]]],
      heads: [{ x: 0.56, y: 0.66, w: 0.46, h: 0.15, turn: 0.45 }],
      tails: [{ x: 0.62, y: 0.86, w: 0.26, h: 0.24, turn: 0.3 }],
      grilles: [{ y: 0.4, w: 0.92, h: 0.2 }, { y: 0.6, w: 0.3, h: 0.05 }],
      plates: [0.42, 0.64],
      mirror: [1.06, 1.02],
    }),
  // Peugeot Pars / 405: the wedge saloon, slim lamps, a wide band of tail lamps.
  pars: () =>
    car("pars", {
      floor: 0.2,
      wheel: { r: 0.31, w: 0.19, axles: [0.92, 3.59], track: 0.71 },
      top: [[0.03, 0.26], [0, 0.52], [0.05, 0.7], [1.32, 0.86], [3.56, 0.96], [4.38, 0.98], [4.44, 0.9], [4.46, 0.5], [4.42, 0.26]],
      glass: [[1.28, 0.84], [2.04, 1.38], [3.1, 1.38], [3.62, 0.94]],
      glassW: 1.44,
      roof: [[1.98, 1.35], [2.08, 1.42], [3.06, 1.42], [3.16, 1.35]],
      posts: [[[1.32, 0.86], [2.04, 1.38]], [[2.6, 0.92], [2.6, 1.38]], [[3.1, 1.38], [3.6, 0.96]]],
      heads: [{ x: 0.54, y: 0.62, w: 0.46, h: 0.13 }],
      tails: [{ x: 0.5, y: 0.8, w: 0.6, h: 0.15 }],
      grilles: [{ y: 0.62, w: 0.5, h: 0.09 }],
      bumpers: { y: 0.36, h: 0.17 },
      plates: [0.36, 0.62],
      mirror: [1.38, 0.98],
    }),
  samand: () => car("samand", samand(false)),
  taxi: () => car("taxi", samand(true)),
  // Saipa Tiba: the small tall saloon.
  tiba: () =>
    car("tiba", {
      floor: 0.2,
      wheel: { r: 0.3, w: 0.18, axles: [0.84, 3.32], track: 0.69 },
      top: [[0.03, 0.28], [0, 0.54], [0.08, 0.7], [1.0, 0.9], [3.42, 1.0], [4.1, 1.02], [4.16, 0.94], [4.18, 0.54], [4.14, 0.28]],
      glass: [[0.96, 0.88], [1.72, 1.43], [3.0, 1.43], [3.5, 0.98]],
      glassW: 1.44,
      roof: [[1.66, 1.4], [1.78, 1.5], [2.94, 1.5], [3.06, 1.4]],
      posts: [[[1.0, 0.9], [1.72, 1.43]], [[2.36, 0.95], [2.36, 1.43]], [[3.0, 1.43], [3.48, 1.0]]],
      heads: [{ x: 0.54, y: 0.68, w: 0.4, h: 0.17, turn: 0.25 }],
      tails: [{ x: 0.6, y: 0.86, w: 0.3, h: 0.18 }],
      grilles: [{ y: 0.64, w: 0.46, h: 0.1 }, { y: 0.4, w: 0.6, h: 0.1 }],
      plates: [0.44, 0.62],
      mirror: [1.04, 1.0],
    }),
  // A crossover, the way the newer Chinese and Korean ones look.
  suv: () =>
    car("suv", {
      floor: 0.28,
      wheel: { r: 0.36, w: 0.22, axles: [0.92, 3.52], track: 0.76 },
      top: [[0.04, 0.36], [0, 0.66], [0.08, 0.86], [0.32, 0.96], [1.14, 1.04], [3.92, 1.1], [4.3, 1.12], [4.38, 1.04], [4.4, 0.62], [4.36, 0.36]],
      glass: [[1.1, 1.02], [1.88, 1.58], [3.94, 1.57], [4.28, 1.1]],
      glassW: 1.58,
      roof: [[1.82, 1.55], [1.94, 1.64], [3.9, 1.63], [4.04, 1.54]],
      posts: [[[1.14, 1.04], [1.88, 1.58]], [[2.52, 1.08], [2.52, 1.58], true], [[3.34, 1.1], [3.34, 1.58], true], [[3.94, 1.57], [4.26, 1.12]]],
      heads: [{ x: 0.62, y: 0.84, w: 0.46, h: 0.13, turn: 0.3 }],
      tails: [{ x: 0.64, y: 1.0, w: 0.28, h: 0.16, turn: 0.2 }],
      grilles: [{ y: 0.7, w: 0.9, h: 0.24, chrome: true }],
      plates: [0.48, 0.74],
      mirror: [1.18, 1.14],
      extra: (b) => {
        for (const s of [-1, 1]) b.box("kit", 0.05, 0.05, 1.9, s * 0.68, 1.665, 2.92, CHROME);
      },
    }),
  vanet: () => vanet("vanet"),
  vanetLoad: () => vanet("vanetLoad"),
  bus,
  bike: () => bike("bike"),
  bikeBox: () => bike("bikeBox"),
};

// ---------------------------------------------------------------- the blue pickup
/** Zamyad (Nissan) pickup: short bonnet, cab, a drop-side bed — empty, or stacked with fruit crates. */
function vanet(key: "vanet" | "vanetLoad"): FleetParts {
  const { len, wid } = FLEET[key];
  const b = new Build(len);
  const r = 0.33, axles = [0.98, 3.94], track = 0.7;
  const cab: P[] = [[0.03, 0.36], [0, 0.72], [0.06, 0.94], [0.84, 1.02], [1.96, 1.05], [1.98, 0.36], ...underside(1.98, 0.34, [axles[0]], r)];
  b.add("paint", slab(cab, wid, len));
  b.add("glass", slab([[0.82, 1.0], [1.18, 1.56], [1.9, 1.58], [1.94, 1.02]], 1.5, len, 0.02));
  b.add("paint", slab([[1.14, 1.54], [1.2, 1.66], [1.9, 1.66], [1.96, 1.55]], 1.56, len, 0.025));
  for (const side of [-1, 1]) {
    b.add("paint", strut([0.84, 1.02], [1.18, 1.56], side * 0.765, len));
    b.add("paint", strut([1.92, 1.04], [1.92, 1.56], side * 0.765, len));
  }
  // The bed: floor, drop sides, tailgate, headboard with a rack; the chassis under it.
  b.box("paint", wid, 0.08, 2.86, 0, 0.9, 3.43);
  for (const side of [-1, 1]) b.box("paint", 0.05, 0.42, 2.86, side * (wid / 2 - 0.025), 1.15, 3.43);
  b.box("paint", wid, 0.42, 0.05, 0, 1.15, 4.87);
  b.box("paint", wid, 0.5, 0.05, 0, 1.19, 2.02);
  for (const y of [1.5, 1.66]) b.box("kit", wid - 0.1, 0.035, 0.035, 0, y, 2.05, "#7d8288");
  b.box("kit", 1.0, 0.3, 3.0, 0, 0.66, 3.4, TRIM);
  // Front: chrome grille and bumper, square lamps, big mirrors on arms.
  const g = surface(cab, 0.78, false);
  b.box("kit", 0.72, 0.24, 0.04, 0, 0.78, onFront(g, 0.04), CHROME, g.tilt);
  b.box("kit", 0.64, 0.17, 0.04, 0, 0.78, onFront(g, 0.04) - 0.006, GRILLE, g.tilt);
  lamps(b, "head", cab, [{ x: 0.6, y: 0.77, w: 0.2, h: 0.2 }], false);
  const bf = surface(cab, 0.44, false);
  b.box("kit", wid + 0.04, 0.14, 0.13, 0, 0.44, onFront(bf, 0.13), CHROME);
  const pf = surface(cab, 0.58, false);
  plate(b, 0.58, onFront(pf, 0.02) - 0.02, false, pf.tilt);
  for (const side of [-1, 1]) {
    b.box("kit", 0.16, 0.025, 0.025, side * (wid / 2 + 0.06), 1.16, 0.92, TRIM);
    b.box("kit", 0.05, 0.22, 0.13, side * (wid / 2 + 0.14), 1.2, 0.92, TRIM);
    b.box("tail", 0.14, 0.24, 0.05, side * 0.72, 0.72, 4.93);
  }
  // Rear: bumper bar and plate.
  b.box("kit", wid, 0.1, 0.12, 0, 0.56, 4.86, TRIM);
  plate(b, 0.72, 4.93, true);
  if (key === "vanetLoad") {
    // Fruit crates, two wide, four long, two high (one short at the back).
    const fruit = ["#e8502f", "#f2a33a", "#8fbf3a", "#e8502f"];
    for (let i = 0; i < 4; i++)
      for (const x of [-0.38, 0.38])
        for (let k = 0; k < (i < 3 ? 2 : 1); k++) {
          const u = 2.42 + i * 0.66, y = 1.09 + k * 0.3;
          b.box("kit", 0.7, 0.27, 0.6, x, y, u, "#b9853f");
          b.box("kit", 0.62, 0.05, 0.52, x, y + 0.15, u, fruit[(i + k) % fruit.length]);
        }
  }
  return finish(key, b, { r, w: 0.19, axles, track }, [surface(cab, 0.77, false).u, 0.77], [0, 1.2, 3.4]);
}

// ---------------------------------------------------------------- the city bus
/** A Tehran city bus: long box, band of windows, doors on the kerb side, a destination sign. */
function bus(): FleetParts {
  const { len, wid } = FLEET.bus;
  const b = new Build(len);
  const r = 0.5, axles = [2.65, 8.75];
  const body: P[] = [[0.02, 0.38], [0, 1.15], [0.1, 2.95], [0.32, 3.12], [11.72, 3.12], [11.96, 2.95], [12, 1.2], [12, 0.38], ...underside(len, 0.34, axles, r)];
  b.add("paint", slab(body, wid, len, 0.08));
  b.box("glass", wid + 0.02, 1.3, 11.1, 0, 2.0, 6.05);
  for (const u of [0.85, 6.3]) b.box("glass", 0.04, 2.3, 1.15, wid / 2 + 0.012, 1.55, u);
  const ws = surface(body, 2.05, false);
  b.box("glass", wid - 0.18, 1.55, 0.05, 0, 2.08, onFront(ws, 0.05), undefined, ws.tilt);
  b.box("glass", wid - 0.5, 0.9, 0.05, 0, 2.3, onBack(surface(body, 2.3, true), 0.05));
  const sign = surface(body, 2.86, false);
  b.box("kit", 1.9, 0.22, 0.05, 0, 2.86, onFront(sign, 0.05) - 0.006, "#ffb020", sign.tilt);
  for (const back of [false, true]) {
    const f = surface(body, 0.5, back);
    b.box("kit", wid + 0.04, 0.32, 0.16, 0, 0.5, back ? onBack(f, 0.16) : onFront(f, 0.16), "#2a2c30");
    const pf = surface(body, back ? 0.8 : 0.74, back);
    plate(b, back ? 0.8 : 0.74, back ? onBack(pf, 0.02) + 0.01 : onFront(pf, 0.02) - 0.01, back);
  }
  for (const side of [-1, 1]) {
    b.box("kit", 0.012, 0.12, len - 0.6, side * (wid / 2 + 0.004), 1.22, len / 2, "#f2f2ee");
    b.box("kit", 0.34, 0.03, 0.03, side * (wid / 2 + 0.16), 2.7, 0.18, TRIM);
    b.box("kit", 0.06, 0.36, 0.16, side * (wid / 2 + 0.32), 2.5, 0.12, TRIM);
  }
  b.box("kit", 1.7, 0.22, 2.6, 0, 3.23, 5.0, "#d4d7db");
  lamps(b, "head", body, [{ x: 1.0, y: 0.78, w: 0.36, h: 0.16 }], false);
  lamps(b, "tail", body, [{ x: 1.12, y: 0.9, w: 0.16, h: 0.42 }], true);
  return finish("bus", b, { r, w: 0.32, axles, track: 1.0 }, [0, 0.78], [0, 3.6, 6]);
}

// ---------------------------------------------------------------- motorbikes
/** The 125 cc commuter bike, rider leaning on the bars — and the delivery one, a box on its rack. */
function bike(key: "bike" | "bikeBox"): FleetParts {
  const { len } = FLEET[key];
  const box = key === "bikeBox";
  const b = new Build(len);
  const r = 0.3, axles = [0.36, 1.66];
  const METAL = "#2a2b2f", JACKET = box ? "#2b2f36" : "#3a4152", PANTS = "#28304a", TANK = box ? "#7a1f1f" : undefined;
  b.box("kit", 0.24, 0.3, 0.46, 0, 0.46, 1.08, METAL);
  b.box("kit", 0.07, 0.07, 0.9, 0, 0.8, 1.0, METAL, 0.17);
  for (const side of [-1, 1]) b.add("kit", strut([0.36, 0.3], [0.56, 1.02], side * 0.09, len, 0.045), CHROME);
  b.box("kit", 0.7, 0.035, 0.035, 0, 1.06, 0.6, TRIM);
  for (const side of [-1, 1]) b.box("kit", 0.1, 0.045, 0.045, side * 0.33, 1.06, 0.6, "#111111");
  b.box("kit", 0.2, 0.16, 0.12, 0, 0.94, 0.48, METAL);
  b.box("head", 0.15, 0.12, 0.03, 0, 0.94, 0.41);
  b.box("kit", 0.12, 0.04, 0.5, 0, 0.66, 0.36, METAL, -0.2);
  b.box("kit", 0.14, 0.04, 0.6, 0, 0.68, 1.78, METAL, 0.3);
  b.box(TANK ? "kit" : "paint", 0.3, 0.2, 0.48, 0, 0.9, 0.86, TANK);
  b.box(TANK ? "kit" : "paint", 0.27, 0.22, 0.28, 0, 0.66, 1.3, TANK);
  b.box("kit", 0.26, 0.1, 0.62, 0, 0.86, 1.36, "#141414");
  b.box("kit", 0.32, 0.03, 0.42, 0, 0.9, 1.82, "#9a9ea4");
  b.tube("kit", 0.045, 0.9, 0.16, 0.36, 1.45, CHROME);
  b.box("tail", 0.12, 0.06, 0.03, 0, 0.84, 2.0);
  b.box("kit", 0.2, 0.12, 0.02, 0, 0.74, 2.01, PLATE);
  // The rider, leaning to the bars, feet on the pegs.
  b.box("kit", 0.36, 0.5, 0.24, 0, 1.28, 1.22, JACKET, -0.42);
  b.ball("kit", 0.15, 0, 1.64, 1.04, "#1a1a1a");
  b.box("kit", 0.2, 0.08, 0.04, 0, 1.62, 0.9, "#3b4a5c");
  for (const side of [-1, 1]) {
    b.add("kit", strut([1.12, 1.45], [0.64, 1.08], side * 0.22, len, 0.09), JACKET);
    b.add("kit", strut([1.3, 0.98], [0.96, 0.92], side * 0.16, len, 0.13), PANTS);
    b.add("kit", strut([0.96, 0.92], [1.02, 0.46], side * 0.17, len, 0.11), PANTS);
    b.box("kit", 0.1, 0.07, 0.22, side * 0.17, 0.42, 0.96, "#202020");
  }
  if (box) {
    b.box("paint", 0.48, 0.44, 0.46, 0, 1.15, 1.84);
    b.box("kit", 0.5, 0.04, 0.48, 0, 1.39, 1.84, "#f4f4f0");
  }
  return finish(key, b, { r, w: 0.09, axles, track: 0 }, [0.4, 0.94], [0, 1.55, 1.84], true);
}

const cache = new Map<FleetKey, FleetParts>();
/** A model's geometry, built the first time it's needed and shared after that. */
export function fleetParts(key: FleetKey): FleetParts {
  let p = cache.get(key);
  if (!p) cache.set(key, (p = CARS[key]!()));
  return p;
}

// ---------------------------------------------------------------- materials
/** Trim, chrome, plates and riders: one material, coloured per vertex. */
export const kitMaterial = (style: Style) => (style === "toon" ? toon({ color: "#ffffff", vertexColors: true }) : new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, metalness: 0.25, roughness: 0.55 }));
export const wheelMaterial = (style: Style) => (style === "toon" ? toon({ color: "#ffffff", vertexColors: true }) : new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, metalness: 0.3, roughness: 0.75 }));

let blobTex: THREE.CanvasTexture | null = null;
/** The soft round shadow under a vehicle (phones without shadow maps still see it grounded). */
export function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return (blobTex = new THREE.CanvasTexture(c));
}

// ---------------------------------------------------------------- traffic, instanced
const Y = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
const BRAKE_ON = new THREE.Color("#ff2a3d"), BRAKE_OFF = new THREE.Color("#5a0d16");
const BLOB = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
type Pool = { parts: FleetParts; body: THREE.InstancedMesh[]; paint: THREE.InstancedMesh; tail: THREE.InstancedMesh; wheel: THREE.InstancedMesh; cap: number; n: number };

/**
 * Every vehicle in traffic, drawn per model with one instanced mesh per part (paint in
 * each car's own colour, tail lamps lit while braking): fill it each frame between
 * begin() and end().
 */
export class FleetInstances {
  private pools = new Map<FleetKey, Pool>();
  private mats: { paint: THREE.Material; kit: THREE.Material; glass: THREE.Material; head: THREE.Material; tail: THREE.Material; wheel: THREE.Material; blob: THREE.Material };
  private blob: THREE.InstancedMesh;
  private blobN = 0;
  private m = new THREE.Matrix4();
  private w = new THREE.Matrix4();
  private s = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qr = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(private scene: THREE.Scene, style: Style) {
    const real = style === "real";
    this.mats = {
      paint: real ? new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.5, roughness: 0.32 }) : toon({ color: "#ffffff" }),
      kit: kitMaterial(style),
      glass: real ? new THREE.MeshStandardMaterial({ color: "#121a24", metalness: 0.9, roughness: 0.06 }) : toon({ color: "#1d3557", emissive: new THREE.Color("#2a4d7a"), emissiveIntensity: 0.35 }),
      head: new THREE.MeshBasicMaterial({ color: "#fff6d8" }),
      tail: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      wheel: wheelMaterial(style),
      blob: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    };
    this.blob = this.inst(BLOB, this.mats.blob, 48);
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, colored = false) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) m.setColorAt(0, BRAKE_OFF);
    this.scene.add(m);
    return m;
  }

  private make(parts: FleetParts, cap: number): Pool {
    const paint = this.inst(parts.paint, this.mats.paint, cap, true);
    const tail = this.inst(parts.tail, this.mats.tail, cap, true);
    const body = [paint, this.inst(parts.kit, this.mats.kit, cap), this.inst(parts.head, this.mats.head, cap), tail];
    if (parts.glass) body.push(this.inst(parts.glass, this.mats.glass, cap));
    return { parts, body, paint, tail, wheel: this.inst(parts.wheel, this.mats.wheel, cap * parts.wheels.length), cap, n: 0 };
  }

  private drop(p: Pool) {
    for (const m of [...p.body, p.wheel]) {
      this.scene.remove(m);
      m.dispose();
    }
  }

  /** Room for twice as many of this model, keeping what this frame has put so far. */
  private grow(p: Pool) {
    const big = this.make(p.parts, p.cap * 2);
    const copy = (from: THREE.InstancedMesh, to: THREE.InstancedMesh, n: number) => {
      to.instanceMatrix.array.set(from.instanceMatrix.array.subarray(0, n * 16));
      if (from.instanceColor && to.instanceColor) to.instanceColor.array.set(from.instanceColor.array.subarray(0, n * 3));
    };
    p.body.forEach((m, i) => copy(m, big.body[i], p.n));
    copy(p.wheel, big.wheel, p.n * p.parts.wheels.length);
    big.n = p.n;
    this.drop(p);
    this.pools.set(p.parts.key, big);
    return big;
  }

  begin() {
    for (const p of this.pools.values()) p.n = 0;
    this.blobN = 0;
  }

  /** One vehicle this frame: where, which way, its paint, whether it's braking, how far its wheels have turned, how far it leans. */
  put(key: FleetKey, x: number, z: number, yaw: number, color: THREE.Color, braking: boolean, spin: number, lean = 0) {
    let p = this.pools.get(key);
    if (!p) this.pools.set(key, (p = this.make(fleetParts(key), 8)));
    if (p.n >= p.cap) p = this.grow(p);
    const i = p.n++;
    this.q.setFromAxisAngle(Y, yaw);
    if (lean) this.q.multiply(this.qr.setFromAxisAngle(ZA, lean));
    this.m.compose(this.p.set(x, 0, z), this.q, this.one);
    for (const mesh of p.body) mesh.setMatrixAt(i, this.m);
    p.paint.setColorAt(i, color);
    p.tail.setColorAt(i, braking ? BRAKE_ON : BRAKE_OFF);
    const W = p.parts.wheels;
    for (let j = 0; j < W.length; j++) {
      this.w.makeRotationX(-spin).setPosition(W[j].x, W[j].y, W[j].z);
      p.wheel.setMatrixAt(i * W.length + j, this.s.multiplyMatrices(this.m, this.w));
    }
    if (this.blobN < this.blob.instanceMatrix.count) {
      this.q.setFromAxisAngle(Y, yaw);
      this.blob.setMatrixAt(this.blobN++, this.s.compose(this.p.set(x, 0.06, z), this.q, this.sc.set(p.parts.wid + 0.9, 1, p.parts.len + 0.9)));
    }
  }

  end() {
    for (const p of this.pools.values()) {
      for (const m of p.body) {
        m.count = p.n;
        m.instanceMatrix.needsUpdate = true;
      }
      p.paint.instanceColor!.needsUpdate = true;
      p.tail.instanceColor!.needsUpdate = true;
      p.wheel.count = p.n * p.parts.wheels.length;
      p.wheel.instanceMatrix.needsUpdate = true;
    }
    this.blob.count = this.blobN;
    this.blob.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const p of this.pools.values()) this.drop(p);
    this.pools.clear();
    this.scene.remove(this.blob);
    this.blob.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
