"use client";
// The parachute you jump with from the helicopter: a ram-air canopy in green, white and red
// (the flag's colours, panel by panel), its lines down to the harness, and the jumper hanging
// under it. One small group, built once; the canopy blooms open when it deploys.
import * as THREE from "three";

export type Chute3D = { group: THREE.Group; canopy: THREE.Object3D; dispose: () => void; open: (k: number) => void };

export function makeChute(): Chute3D {
  const group = new THREE.Group();
  group.visible = false;
  const owned: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(x: T) => (owned.push(x), x);

  // Canopy: a shallow dome, wider than deep, cells striped across the span.
  const geo = own(new THREE.SphereGeometry(4.4, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.32).scale(1.15, 0.55, 0.62));
  const pos = geo.getAttribute("position"), col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const FLAG = ["#239f40", "#ffffff", "#da0000"];
  for (let i = 0; i < pos.count; i++) {
    const band = Math.min(2, Math.floor(((pos.getX(i) / (4.4 * 1.15)) * 0.5 + 0.5) * 3));
    c.set(FLAG[band]).toArray(col, i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const canopy = new THREE.Mesh(geo, own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })));
  canopy.position.y = 5.2;
  canopy.castShadow = true;
  group.add(canopy);

  // Lines: from the canopy's edge down to the shoulders.
  const lineMat = own(new THREE.LineBasicMaterial({ color: "#e8e8e8", transparent: true, opacity: 0.7 }));
  const pts: THREE.Vector3[] = [];
  for (const [x, z] of [[-4.6, -1.2], [-4.6, 1.2], [-1.6, -1.6], [-1.6, 1.6], [1.6, -1.6], [1.6, 1.6], [4.6, -1.2], [4.6, 1.2]]) pts.push(new THREE.Vector3(x, 5.0, z), new THREE.Vector3(Math.sign(x) * 0.25, 1.5, 0));
  const lines = new THREE.LineSegments(own(new THREE.BufferGeometry().setFromPoints(pts)), lineMat);
  canopy.add(lines);
  lines.position.y = -5.2;

  // The jumper: torso, head, legs hanging, a little pack.
  const suit = own(new THREE.MeshStandardMaterial({ color: "#2b3442", roughness: 0.8 }));
  const skin = own(new THREE.MeshStandardMaterial({ color: "#c99772", roughness: 0.7 }));
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(own(g), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    group.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(0.46, 0.62, 0.28), suit, 0, 1.2, 0);
  add(new THREE.SphereGeometry(0.15, 10, 8), skin, 0, 1.66, 0);
  add(new THREE.BoxGeometry(0.16, 0.7, 0.18), suit, -0.12, 0.55, 0.05);
  add(new THREE.BoxGeometry(0.16, 0.7, 0.18), suit, 0.12, 0.55, 0.05);
  add(new THREE.BoxGeometry(0.36, 0.4, 0.16), own(new THREE.MeshStandardMaterial({ color: "#3d5a2a", roughness: 0.9 })), 0, 1.25, 0.22);

  return {
    group,
    canopy,
    /** 0: packed (free fall) … 1: fully open. */
    open: (k: number) => {
      const s = Math.max(0.001, k);
      canopy.visible = k > 0.01;
      canopy.scale.set(0.3 + 0.7 * s, s, 0.3 + 0.7 * s);
    },
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}
