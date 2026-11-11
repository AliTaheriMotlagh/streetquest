// What's wrong with a car, measured (the admin's car lab, AdminCars.tsx, and tests/carCheck.test.ts):
//  - parts inside out (triangles wound against their normals: drawn see-through);
//  - the cabin poking out of the glass (through the roof or the rear pillars);
//  - wheels not on the ground, or sunk into it;
//  - how heavy it is (triangles near and far).
import type * as THREE from "three";
import type { FleetParts } from "./fleet3d";
import { cabinGeometry, cabinShape } from "./crew";
import { windingAgreement } from "./gltf";

export type PartCheck = { name: string; tris: number; winding: number };
export type CarIssue = { code: "insideOut" | "cabinPokes" | "floating" | "sunk" | "heavy"; part?: string; value: number };
export type CarCheck = { tris: number; farTris: number; parts: PartCheck[]; cabinPoke: number; wheelGap: number; issues: CarIssue[] };

/** Over this many triangles near (wheels counted four times) a car costs too much on a phone. */
export const HEAVY_TRIS = 40_000;

const trisOf = (g: THREE.BufferGeometry | null) => (!g ? 0 : (g.index ? g.index.count : g.getAttribute("position").count) / 3);

function partCheck(name: string, g: THREE.BufferGeometry): PartCheck {
  const p = g.getAttribute("position"), n = g.getAttribute("normal");
  return { name, tris: trisOf(g), winding: n ? windingAgreement(p.array, n.array, g.index?.array ?? null) : 1 };
}

function total(p: FleetParts) {
  return trisOf(p.paint) + trisOf(p.kit) + trisOf(p.glass) + trisOf(p.head) + trisOf(p.tail) + trisOf(p.wheel) * p.wheels.length;
}

export function checkCar(p: FleetParts): CarCheck {
  const named: [string, THREE.BufferGeometry | null][] = [["paint", p.paint], ["kit", p.kit], ["glass", p.glass], ["head", p.head], ["tail", p.tail], ["wheel", p.wheel]];
  const parts = named.filter((x): x is [string, THREE.BufferGeometry] => !!x[1]).map(([n, g]) => partCheck(n, g));
  const issues: CarIssue[] = [];
  for (const q of parts) if (q.winding < 0.5 && q.name !== "kit") issues.push({ code: "insideOut", part: q.name, value: q.winding });

  // The cabin against the glass near the roof: how far (m) any corner of it sticks out.
  let cabinPoke = 0;
  if (p.glass) {
    const gp = p.glass.getAttribute("position").array;
    const c = cabinShape(gp, p.hgt);
    if (c) {
      const mid = (c.x0 + c.x1) / 2, band = (c.roof - c.waist) * 0.25;
      let glassTop = 0;
      for (let i = 0; i + 2 < gp.length; i += 3) if (gp[i + 1] >= c.roof - band) glassTop = Math.max(glassTop, Math.abs(gp[i] - mid));
      const cp = cabinGeometry(c).getAttribute("position");
      for (let i = 0; i < cp.count; i++) if (cp.getY(i) > c.roof - 0.05) cabinPoke = Math.max(cabinPoke, Math.abs(cp.getX(i) - mid) - glassTop);
    }
  }
  if (cabinPoke > 0.02) issues.push({ code: "cabinPokes", value: cabinPoke });

  // Wheels: their lowest point against the ground (y = 0).
  const wheelGap = p.wheels.length ? Math.min(...p.wheels.map((w) => w.y)) - p.wheelR : 0;
  if (wheelGap > 0.04) issues.push({ code: "floating", value: wheelGap });
  if (wheelGap < -0.06) issues.push({ code: "sunk", value: -wheelGap });

  const tris = total(p), farTris = p.far ? total(p.far) : tris;
  if (tris > HEAVY_TRIS) issues.push({ code: "heavy", value: tris });
  return { tris, farTris, parts, cabinPoke: Math.max(0, cabinPoke), wheelGap, issues };
}
