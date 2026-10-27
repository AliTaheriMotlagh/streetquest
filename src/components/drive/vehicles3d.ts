"use client";
// The garage, modelled: hatchback, motorbike (with rider), pickup, sports car, drone and
// helicopter, each from a few primitives. Forward is −z, like the drive physics.
// "real" style gets painted metal, glass and rubber that reflect the sky; "toon" the
// chunky cartoon look. Other players' vehicles use the same models (without lights).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { VehicleKey } from "@/lib/vehicles";
import { toon, type Style } from "./world3d";

export type Rotor = { obj: THREE.Object3D; axis: "x" | "y"; speed: number; blur?: THREE.Mesh };
export type VehicleModel = {
  key: VehicleKey;
  group: THREE.Group;
  /** Leans and pitches (body roll, squat). */
  body: THREE.Group;
  wheels: THREE.Object3D[];
  steer: THREE.Object3D[];
  rotors: Rotor[];
  brake: THREE.MeshBasicMaterial;
  /** Cone beams (toon) — real style uses `light`. */
  beams: THREE.Object3D | null;
  light: THREE.SpotLight | null;
  cargo: THREE.Object3D;
  /** Roughly how tall it is (camera, collisions under canopies). */
  height: number;
  dispose: () => void;
};

type Mats = { paint: THREE.Material; trim: THREE.Material; glass: THREE.Material; tire: THREE.Material; rim: THREE.Material; skin: THREE.Material };

function materials(style: Style, color: string, keep: <T extends { dispose: () => void }>(x: T) => T): Mats {
  if (style === "toon")
    return {
      paint: keep(toon({ color })),
      trim: keep(toon({ color: "#2b2f45" })),
      glass: keep(toon({ color: "#1d3557", emissive: new THREE.Color("#2a4d7a"), emissiveIntensity: 0.35 })),
      tire: keep(toon({ color: "#2b2f45" })),
      rim: keep(toon({ color: "#e8ecf5" })),
      skin: keep(toon({ color: "#f2c39a" })),
    };
  return {
    paint: keep(new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 })),
    trim: keep(new THREE.MeshStandardMaterial({ color: "#1f2124", metalness: 0.2, roughness: 0.65 })),
    glass: keep(new THREE.MeshStandardMaterial({ color: "#121a24", metalness: 0.9, roughness: 0.06 })),
    tire: keep(new THREE.MeshStandardMaterial({ color: "#161618", roughness: 0.92 })),
    rim: keep(new THREE.MeshStandardMaterial({ color: "#c9ccd1", metalness: 0.9, roughness: 0.28 })),
    skin: keep(new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.7 })),
  };
}

export function makeVehicle(key: VehicleKey, color: string, style: Style, opts: { lights?: boolean; shadows?: boolean } = {}): VehicleModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const M = materials(style, color, keep);
  const shadows = opts.shadows ?? true;
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, r = 0.1) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

  const lights = keep(new THREE.MeshBasicMaterial({ color: "#fff6d8" }));
  const brake = keep(new THREE.MeshBasicMaterial({ color: "#5a0d16" }));
  const lamp = keep(new THREE.BoxGeometry(0.36, 0.14, 0.06));
  const lampsAt = (w: number, y: number, front: number, back: number) => {
    for (const x of [-w, w]) {
      const h = new THREE.Mesh(lamp, lights);
      h.position.set(x, y, front);
      const t = new THREE.Mesh(lamp, brake);
      t.position.set(x, y, back);
      body.add(h, t);
    }
  };

  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  const rotors: Rotor[] = [];
  const wheel = (x: number, z: number, r: number, w: number, steers: boolean) => {
    const tire = keep(new THREE.CylinderGeometry(r, r, w, 18));
    tire.rotateZ(Math.PI / 2);
    const rim = keep(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10));
    rim.rotateZ(Math.PI / 2);
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(tire, M.tire);
    t.castShadow = shadows;
    spin.add(t, new THREE.Mesh(rim, M.rim));
    pivot.add(spin);
    group.add(pivot);
    wheels.push(spin);
    if (steers) steer.push(pivot);
  };

  let height = 1.6;
  let cargoAt = new THREE.Vector3(0, 1.9, 0.3);
  let beamAt = { y: 0.75, z: -2.1 };

  if (key === "car") {
    add(body, box(1.84, 0.62, 4.1, 0.2), M.paint, 0, 0.66, 0);
    add(body, box(1.62, 0.6, 2.25, 0.22), M.glass, 0, 1.22, 0.3);
    add(body, box(1.56, 0.08, 1.9, 0.04), M.paint, 0, 1.53, 0.35);
    add(body, box(1.88, 0.22, 0.24, 0.08), M.trim, 0, 0.44, -2.02);
    add(body, box(1.88, 0.22, 0.24, 0.08), M.trim, 0, 0.44, 2.02);
    for (const x of [-0.98, 0.98]) add(body, box(0.1, 0.12, 0.2, 0.03), M.paint, x, 1.05, -0.65);
    lampsAt(0.62, 0.78, -2.06, 2.06);
    for (const [x, z] of [[-0.82, -1.3], [0.82, -1.3], [-0.82, 1.3], [0.82, 1.3]] as const) wheel(x, z, 0.34, 0.24, z < 0);
    cargoAt = new THREE.Vector3(0, 1.88, 0.4);
  } else if (key === "sports") {
    add(body, box(1.94, 0.5, 4.45, 0.22), M.paint, 0, 0.55, 0);
    add(body, box(1.5, 0.42, 1.8, 0.2), M.glass, 0, 0.98, 0.35);
    add(body, box(1.7, 0.1, 0.4, 0.04), M.trim, 0, 1.08, 2.0);
    for (const x of [-0.7, 0.7]) add(body, box(0.08, 0.32, 0.1, 0.02), M.trim, x, 0.9, 2.0);
    add(body, box(1.98, 0.16, 0.28, 0.06), M.trim, 0, 0.36, -2.18);
    lampsAt(0.66, 0.62, -2.2, 2.2);
    for (const [x, z] of [[-0.86, -1.38], [0.86, -1.38], [-0.86, 1.38], [0.86, 1.38]] as const) wheel(x, z, 0.36, 0.3, z < 0);
    height = 1.2;
    cargoAt = new THREE.Vector3(0, 1.45, 0.5);
    beamAt = { y: 0.6, z: -2.25 };
  } else if (key === "pickup") {
    add(body, box(2.0, 0.75, 5.2, 0.16), M.paint, 0, 1.02, 0);
    add(body, box(1.86, 0.8, 1.9, 0.2), M.glass, 0, 1.78, -0.75);
    add(body, box(1.8, 0.08, 1.7, 0.04), M.paint, 0, 2.2, -0.75);
    // The open bed.
    add(body, box(1.9, 0.08, 2.2, 0.03), M.trim, 0, 1.42, 1.35);
    for (const x of [-0.95, 0.95]) add(body, box(0.08, 0.45, 2.2, 0.03), M.paint, x, 1.62, 1.35);
    add(body, box(1.9, 0.45, 0.08, 0.03), M.paint, 0, 1.62, 2.45);
    add(body, box(2.04, 0.28, 0.26, 0.08), M.rim, 0, 0.68, -2.6);
    lampsAt(0.7, 1.15, -2.62, 2.62);
    for (const [x, z] of [[-0.9, -1.7], [0.9, -1.7], [-0.9, 1.6], [0.9, 1.6]] as const) wheel(x, z, 0.44, 0.32, z < 0);
    height = 2.3;
    cargoAt = new THREE.Vector3(0, 1.75, 1.3);
    beamAt = { y: 1.15, z: -2.7 };
  } else if (key === "moto") {
    add(body, box(0.26, 0.42, 1.3, 0.08), M.trim, 0, 0.62, 0.05);
    add(body, box(0.42, 0.3, 0.62, 0.12), M.paint, 0, 0.95, -0.25);
    add(body, box(0.32, 0.12, 0.62, 0.05), M.trim, 0, 0.95, 0.35);
    add(body, box(0.3, 0.2, 0.5, 0.06), M.paint, 0, 0.82, 0.78);
    // Fork + bars turn with the front wheel.
    const fork = new THREE.Group();
    fork.position.set(0, 0, -0.72);
    add(fork, box(0.08, 0.95, 0.08, 0.02), M.rim, 0, 0.72, 0.08);
    add(fork, box(0.7, 0.05, 0.05, 0.02), M.trim, 0, 1.22, 0.18);
    add(fork, box(0.24, 0.2, 0.12, 0.05), M.paint, 0, 0.98, -0.02);
    body.add(fork);
    steer.push(fork);
    // Rider: leaning into the bars, helmet in the bike's colour.
    add(body, box(0.42, 0.62, 0.32, 0.12), M.skin, 0, 1.38, 0.18).rotation.x = -0.5;
    add(body, new THREE.SphereGeometry(0.17, 14, 10), M.paint, 0, 1.78, -0.05);
    for (const x of [-0.18, 0.18]) add(body, box(0.11, 0.5, 0.12, 0.04), M.skin, x, 1.22, -0.25).rotation.x = -1.1;
    lampsAt(0.0001, 1.0, -0.86, 0.98);
    for (const z of [-0.72, 0.72]) {
      const r = 0.33;
      const tire = keep(new THREE.TorusGeometry(r - 0.06, 0.07, 8, 20));
      tire.rotateY(Math.PI / 2);
      const hub = keep(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8));
      hub.rotateZ(Math.PI / 2);
      const spin = new THREE.Group();
      spin.add(new THREE.Mesh(tire, M.tire), new THREE.Mesh(hub, M.rim));
      spin.children[0].castShadow = shadows;
      spin.position.set(0, r, 0);
      if (z < 0) {
        const fw = new THREE.Group();
        fw.add(spin);
        fork.add(fw);
      } else {
        spin.position.z = z;
        body.add(spin);
      }
      wheels.push(spin);
    }
    height = 1.9;
    cargoAt = new THREE.Vector3(0, 1.2, 0.95);
    beamAt = { y: 1.0, z: -0.9 };
  } else if (key === "drone") {
    add(body, box(0.62, 0.2, 0.62, 0.08), M.paint, 0, 0, 0);
    add(body, box(0.3, 0.16, 0.2, 0.05), M.glass, 0, -0.16, -0.22);
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]] as const) {
      const arm = add(body, box(0.82, 0.06, 0.08, 0.02), M.trim, x / 2, 0, z / 2);
      arm.rotation.y = Math.atan2(-z, x);
      add(body, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), M.trim, x, 0.06, z);
      const rotor = new THREE.Group();
      rotor.position.set(x, 0.14, z);
      add(rotor, box(0.62, 0.015, 0.06, 0.005), M.trim, 0, 0, 0);
      const blurMat = keep(new THREE.MeshBasicMaterial({ color: "#d0d6e0", transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      const blur = new THREE.Mesh(keep(new THREE.CircleGeometry(0.33, 20)), blurMat);
      blur.rotation.x = -Math.PI / 2;
      blur.position.set(x, 0.15, z);
      body.add(rotor, blur);
      rotors.push({ obj: rotor, axis: "y", speed: 60, blur });
    }
    for (const x of [-0.18, 0.18]) add(body, box(0.04, 0.22, 0.5, 0.01), M.trim, x, -0.2, 0);
    body.position.y = 0.32;
    height = 0.6;
    cargoAt = new THREE.Vector3(0, -0.12, 0.05);
    beamAt = { y: 0.2, z: -0.4 };
  } else {
    // Helicopter: cabin, glass nose, tail boom with fin and tail rotor, skids, main rotor.
    const cab = add(body, new THREE.SphereGeometry(1, 20, 14), M.paint, 0, 1.55, 0.1);
    cab.scale.set(1.25, 1.1, 2.0);
    const nose = add(body, new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, 0, 1.55, -0.85);
    nose.scale.set(1.05, 0.95, 1.1);
    nose.rotation.x = -Math.PI / 2;
    const boom = add(body, new THREE.CylinderGeometry(0.16, 0.32, 4.6, 10), M.paint, 0, 1.75, 3.6);
    boom.rotation.x = Math.PI / 2;
    add(body, box(0.1, 1.3, 0.8, 0.05), M.paint, 0, 2.3, 5.75);
    add(body, box(1.6, 0.08, 0.45, 0.03), M.paint, 0, 1.8, 5.3);
    for (const x of [-0.95, 0.95]) {
      add(body, box(0.1, 0.1, 3.2, 0.04), M.rim, x, 0.08, 0.2);
      for (const z of [-0.7, 0.9]) add(body, box(0.07, 0.6, 0.07, 0.02), M.rim, x * 0.82, 0.38, z);
    }
    add(body, new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), M.trim, 0, 2.75, 0.1);
    const main = new THREE.Group();
    main.position.set(0, 3.02, 0.1);
    for (const a of [0, Math.PI / 2]) add(main, box(10.5, 0.04, 0.32, 0.01), M.trim, 0, 0, 0).rotation.y = a;
    const blurMat = keep(new THREE.MeshBasicMaterial({ color: "#c8ccd4", transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    const blur = new THREE.Mesh(keep(new THREE.CircleGeometry(5.25, 40)), blurMat);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(0, 3.03, 0.1);
    body.add(main, blur);
    rotors.push({ obj: main, axis: "y", speed: 28, blur });
    const tail = new THREE.Group();
    tail.position.set(0.12, 2.35, 5.85);
    for (const a of [0, Math.PI / 2]) add(tail, box(0.04, 1.3, 0.14, 0.01), M.trim, 0, 0, 0).rotation.x = a;
    body.add(tail);
    rotors.push({ obj: tail, axis: "x", speed: 45 });
    lampsAt(0.0001, 0.9, -1.9, 6.1);
    height = 3.2;
    cargoAt = new THREE.Vector3(0, 0.25, 0.2);
    beamAt = { y: 0.8, z: -1.6 };
  }

  // Headlights: soft cones in toon style, a real spotlight (own vehicle only) otherwise.
  let beams: THREE.Object3D | null = null;
  let light: THREE.SpotLight | null = null;
  if (opts.lights) {
    if (style === "toon") {
      const beamMat = keep(new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      const beamG = keep(new THREE.ConeGeometry(3.2, 16, 16, 1, true));
      beamG.rotateX(Math.PI / 2);
      beamG.translate(0, beamAt.y, beamAt.z - 8);
      beams = new THREE.Mesh(beamG, beamMat);
      beams.visible = false;
      body.add(beams);
    } else {
      light = new THREE.SpotLight("#fff1d6", key === "heli" ? 900 : 260, key === "heli" ? 160 : 70, key === "heli" ? 0.42 : 0.62, 0.55, 1.6);
      light.position.set(0, beamAt.y, beamAt.z);
      light.target.position.set(0, key === "heli" ? -30 : 0, beamAt.z - (key === "heli" ? 30 : 20));
      light.visible = false;
      body.add(light, light.target);
    }
  }

  // A delivery box rides along while carrying an order.
  const cargo = new THREE.Mesh(keep(new RoundedBoxGeometry(0.8, 0.55, 0.8, 2, 0.08)), keep(style === "toon" ? toon({ color: "#ffb347" }) : new THREE.MeshStandardMaterial({ color: "#b8834f", roughness: 0.85 })));
  cargo.position.copy(cargoAt);
  cargo.visible = false;
  body.add(cargo);

  // Soft blob shadow, always on, so phones without shadow maps still ground the vehicle.
  const blob = document.createElement("canvas");
  blob.width = blob.height = 64;
  const g = blob.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const size = key === "heli" ? [5, 8] : key === "moto" ? [1.2, 2.6] : key === "drone" ? [1.3, 1.3] : key === "pickup" ? [3.2, 6.4] : [3, 5.4];
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(size[0], size[1])), keep(new THREE.MeshBasicMaterial({ map: keep(new THREE.CanvasTexture(blob)), transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.12;
  shadow.name = "blob";
  group.add(shadow);

  return { key, group, body, wheels, steer, rotors, brake, beams, light, cargo, height, dispose: () => disposables.forEach((d) => d.dispose()) };
}

// ---------------------------------------------------------------- first person
export type Cockpit = {
  group: THREE.Group;
  /** Where the driver's eyes are, in the vehicle's own frame. */
  eye: THREE.Vector3;
  /** Turns with the steering (null: no wheel — bike bars turn instead, drones have none). */
  wheel: THREE.Object3D | null;
  dispose: () => void;
};

/**
 * The view from the driver's seat: dashboard, steering wheel, pillars, mirror and the
 * bonnet ahead (left-hand drive). Lives in the vehicle's frame, shown instead of the
 * body in first-person.
 */
export function makeCockpit(key: VehicleKey, color: string, style: Style): Cockpit {
  const group = new THREE.Group();
  const keep: { dispose: () => void }[] = [];
  const mat = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => {
    const m = style === "toon" ? toon({ color: c }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    keep.push(m);
    return m;
  };
  const dash = mat("#1b1d21"), trim = mat("#2a2d33"), paint = mat(color, { metalness: 0.55, roughness: 0.3 }), chrome = mat("#c9ccd1", { metalness: 0.9, roughness: 0.25 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
    keep.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  let eye = new THREE.Vector3(-0.36, 1.2, 0.15);
  let wheel: THREE.Object3D | null = null;
  const steeringWheel = (x: number, y: number, z: number, r: number, tilt: number) => {
    const w = new THREE.Group();
    w.position.set(x, y, z);
    w.rotation.x = tilt;
    const ring = new THREE.TorusGeometry(r, 0.025, 8, 28);
    const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12);
    hub.rotateX(Math.PI / 2);
    const spoke = new THREE.BoxGeometry(r * 2, 0.03, 0.02);
    keep.push(ring, hub, spoke);
    w.add(new THREE.Mesh(ring, dash), new THREE.Mesh(hub, trim), new THREE.Mesh(spoke, trim));
    const s2 = new THREE.Mesh(spoke, trim);
    s2.rotation.z = Math.PI / 2;
    s2.scale.x = 0.5;
    s2.position.y = -r / 2;
    w.add(s2);
    group.add(w);
    return w;
  };

  if (key === "moto") {
    // Tank and bars below the eye line.
    eye = new THREE.Vector3(0, 1.72, 0.1);
    box(0.4, 0.22, 0.55, paint, 0, 1.0, -0.3);
    const bars = new THREE.Group();
    bars.position.set(0, 1.25, -0.62);
    box(0.72, 0.04, 0.04, trim, 0, 0, 0, bars);
    for (const x of [-0.36, 0.36]) box(0.12, 0.05, 0.05, dash, x, 0, 0, bars);
    box(0.22, 0.12, 0.08, dash, 0, 0.06, 0.02, bars);
    group.add(bars);
    wheel = bars;
  } else if (key === "drone") {
    eye = new THREE.Vector3(0, 0.1, -0.35);
  } else if (key === "heli") {
    eye = new THREE.Vector3(-0.5, 1.95, -0.9);
    box(2.1, 0.32, 0.5, dash, 0, 1.45, -1.55);
    for (const x of [-0.95, 0.95]) box(0.06, 1.2, 0.06, trim, x, 1.95, -1.6).rotation.x = -0.35;
    box(1.9, 0.06, 0.06, trim, 0, 2.55, -1.35);
    box(0.06, 0.6, 0.06, trim, 0, 1.75, -1.85).rotation.x = -0.35;
    const stick = box(0.04, 0.5, 0.04, trim, -0.5, 1.35, -0.6);
    stick.rotation.x = 0.2;
  } else {
    // Cars: driver on the left, real cab proportions — the dash top sits ~25 cm below the
    // eyes and ~75 cm ahead, the wheel 40 cm ahead at chest height, pillars leaning back.
    const low = key === "sports", tall = key === "pickup";
    const y = low ? -0.2 : tall ? 0.5 : 0, zf = tall ? -0.75 : 0;
    eye = new THREE.Vector3(-0.36, 1.22 + y, 0.12 + zf);
    box(1.74, 0.24, 0.42, dash, 0, 0.86 + y, -0.78 + zf);
    box(0.42, 0.08, 0.2, trim, -0.36, 1.0 + y, -0.6 + zf); // instrument binnacle
    box(1.8, 0.07, 1.5, paint, 0, 0.84 + y, -1.7 + zf).rotation.x = 0.05; // the bonnet
    for (const x of [-0.79, 0.79]) box(0.07, 0.9, 0.07, trim, x, 1.27 + y, -0.62 + zf).rotation.x = 0.89;
    box(1.6, 0.06, 0.1, trim, 0, 1.57 + y, -0.27 + zf); // roof header
    box(0.18, 0.055, 0.03, chrome, 0.02, 1.5 + y, -0.36 + zf); // rear-view mirror
    for (const x of [-0.98, 0.98]) box(0.05, 0.09, 0.14, paint, x, 1.0 + y, -0.82 + zf); // side mirrors
    wheel = steeringWheel(-0.36, 0.86 + y, -0.3 + zf, 0.18, -0.45);
  }
  return { group, eye, wheel, dispose: () => keep.forEach((k) => k.dispose()) };
}
