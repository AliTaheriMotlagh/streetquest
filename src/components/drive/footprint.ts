"use client";
// The real footprint around a store, for modelling it in Blender (admin → 3D stores).
// Same street-map vector tile and slicing drive mode uses (vectorTile.ts), so the
// footprint is exactly the one the model will replace.
//
// Output frame = landmark frame (lib/landmarks): origin at the pin, +X east, −Z north,
// +Y up, metres. As an OBJ, Blender's default import (forward −Z, up Y) turns that into
// its own top view of the map: +X east, +Y north, +Z up.
// Objects are named ref_…: the game drops anything with that name when it loads a model,
// so a reference left in the scene at export time does no harm.
import { makeFrame } from "@/lib/city";
import { insidePacked } from "@/lib/city";
import { sliceVectorTile, VT_ZOOM } from "./vectorTile";

export type FootBuilding = { pts: number[]; h: number; mh: number; name?: string };
export type FootRoad = { pts: number[]; w: number; name?: string };
export type Footprint = { lat: number; lng: number; target: FootBuilding | null; neighbours: FootBuilding[]; roads: FootRoad[] };

const NEIGHBOUR_M = 70;
const ROAD_M = 110;

/** The building under (or nearest to) the pin, the buildings and streets around it. */
export async function footprintAt(lat: number, lng: number): Promise<Footprint> {
  const n = 2 ** VT_ZOOM;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const res = await fetch(`/api/vt/${VT_ZOOM}/${x}/${y}`);
  if (!res.ok && res.status !== 204) throw new Error(`map ${res.status}`);
  const cells = res.status === 204 ? [] : sliceVectorTile(await res.arrayBuffer(), x, y, "en", { infill: false, names: "local" });
  const frame = makeFrame({ lat, lng });
  const all: FootBuilding[] = [];
  const roads: FootRoad[] = [];
  const near = (pts: Float32Array, m: number) => {
    for (let i = 0; i < pts.length; i += 2) if (Math.hypot(pts[i], pts[i + 1]) < m) return true;
    return false;
  };
  for (const c of cells) {
    for (const b of c.b) {
      const pts = frame.unpack(c.cx, c.cy, b.r);
      if (near(pts, NEIGHBOUR_M)) all.push({ pts: open(Array.from(pts, round)), h: b.h, mh: b.mh ?? 0, name: b.n });
    }
    for (const r of c.r) {
      if ((r as { x?: 1 }).x) continue; // name-only line
      const pts = frame.unpack(c.cx, c.cy, r.l);
      if (near(pts, ROAD_M)) roads.push({ pts: Array.from(pts, round), w: r.w, name: r.n });
    }
  }
  // Under the pin, else the one whose middle is nearest (within 25 m).
  let target = all.find((b) => insidePacked(b.pts, 0, 0)) ?? null;
  if (!target) {
    let best = 25;
    for (const b of all) {
      const d = Math.hypot(...centre(b.pts));
      if (d < best) (best = d), (target = b);
    }
  }
  return { lat, lng, target, neighbours: all.filter((b) => b !== target), roads };
}

const round = (v: number) => Math.round(v * 100) / 100;
/** Rings come closed (last point = first): drop the repeat, or Blender gets a zero-length edge. */
const open = (p: number[]) => (p.length >= 8 && Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) < 0.05 ? p.slice(0, -2) : p);
function centre(p: number[]): [number, number] {
  let x = 0, z = 0;
  for (let i = 0; i < p.length; i += 2) (x += p[i]), (z += p[i + 1]);
  return [x / (p.length / 2), z / (p.length / 2)];
}

/** Footprint → Wavefront OBJ text (one object per building, street and the north arrow). */
export function footprintObj(f: Footprint, storeName: string): string {
  const out: string[] = [
    `# StreetQuest 3D store reference — ${storeName.replace(/\n/g, " ")}`,
    `# Pin: ${f.lat.toFixed(7)}, ${f.lng.toFixed(7)} (the origin). 1 unit = 1 metre.`,
    "# Blender: File → Import → Wavefront (.obj) with the default axes; top view is the map, +Y is north.",
    "# Model the store on ref_footprint and keep it at the origin. Everything named ref_ is ignored by the game.",
  ];
  let base = 1;
  const v = (x: number, y: number, z: number) => out.push(`v ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`);
  const solid = (name: string, b: FootBuilding) => {
    const n = b.pts.length / 2;
    if (n < 3) return;
    out.push(`o ${name}`);
    for (let i = 0; i < n; i++) v(b.pts[i * 2], b.mh, b.pts[i * 2 + 1]);
    for (let i = 0; i < n; i++) v(b.pts[i * 2], b.h, b.pts[i * 2 + 1]);
    // Outward faces whatever the ring's winding: Blender recalculates normals on request anyway.
    out.push(`f ${Array.from({ length: n }, (_, i) => base + n + i).join(" ")}`);
    out.push(`f ${Array.from({ length: n }, (_, i) => base + n - 1 - i).join(" ")}`);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(`f ${base + i} ${base + j} ${base + n + j} ${base + n + i}`);
    }
    base += n * 2;
  };
  if (f.target) solid("ref_footprint", f.target);
  f.neighbours.forEach((b, i) => solid(`ref_neighbour_${i + 1}`, b));
  f.roads.forEach((r, ri) => {
    const p = r.pts, n = p.length / 2;
    if (n < 2) return;
    out.push(`o ref_street_${ri + 1}${r.name ? `_${r.name.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 30)}` : ""}`);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * (r.w / 2), nz = (dx / l) * (r.w / 2);
      v(p[i * 2] + nx, 0.02, p[i * 2 + 1] + nz);
      v(p[i * 2] - nx, 0.02, p[i * 2 + 1] - nz);
    }
    for (let i = 0; i + 1 < n; i++) out.push(`f ${base + i * 2} ${base + i * 2 + 1} ${base + i * 2 + 3} ${base + i * 2 + 2}`);
    base += n * 2;
  });
  // A flat arrow 12 m north of the pin, pointing north.
  out.push("o ref_north");
  v(0, 0.05, -16);
  v(-1.5, 0.05, -12);
  v(1.5, 0.05, -12);
  out.push(`f ${base} ${base + 1} ${base + 2}`);
  return out.join("\n") + "\n";
}
