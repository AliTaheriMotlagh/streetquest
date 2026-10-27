"use client";
// Every shop around, at a glance: a pin over its roof in its trade's colours, seen across
// the neighbourhood (the boards with the names only show up close). One point cloud per
// trade — a couple of dozen draw calls for hundreds of shops — sized in screen pixels
// within limits, so a pin 500 m off is still a dot you can tap and one next to you isn't
// a wall of colour. Tapping is screen-space: the pin nearest the finger.
import * as THREE from "three";
import { tradeOf, type Trade } from "./trades";
import { drawIcon } from "./world3d";

export type Pin = { id: string; x: number; y: number; z: number; cls?: string };

const CAP = 256;
type Cloud = { points: THREE.Points; pos: Float32Array; attr: THREE.BufferAttribute; mat: THREE.ShaderMaterial; tex: THREE.CanvasTexture };

/** The pin's picture: a round badge in the trade's colours with its icon, and a point below. */
function pinTexture(tr: Trade) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c);
  // Sampled as-is and written as-is: the canvas is already in display colours.
  t.colorSpace = THREE.NoColorSpace;
  g.shadowColor = "rgba(0,0,0,.4)";
  g.shadowBlur = 8;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(S / 2 - 14, 92);
  g.lineTo(S / 2, 122);
  g.lineTo(S / 2 + 14, 92);
  g.fill();
  g.beginPath();
  g.arc(S / 2, 54, 48, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  const grd = g.createLinearGradient(0, 10, 0, 100);
  grd.addColorStop(0, tr.bg[0]);
  grd.addColorStop(1, tr.bg[1]);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(S / 2, 54, 41, 0, Math.PI * 2);
  g.fill();
  drawIcon(g, tr.emoji, S / 2, 54, 58, () => (t.needsUpdate = true));
  return t;
}

export class StorePins {
  private clouds = new Map<string, Cloud>();
  private shown: (Pin & { color: string })[] = [];
  private v = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  /**
   * The pins to show now (already chosen and capped by the caller). `pxPerUnit`: drawing-
   * buffer pixels per metre at 1 m away (half the buffer height over tan(fov / 2)).
   */
  set(pins: Pin[], pxPerUnit: number, dpr: number) {
    const fill = new Map<string, number>();
    this.shown = [];
    for (const p of pins) {
      const tr = tradeOf(p.cls);
      const cl = this.cloud(tr);
      const n = fill.get(tr.key) ?? 0;
      if (n >= CAP) continue;
      cl.pos[n * 3] = p.x;
      cl.pos[n * 3 + 1] = p.y;
      cl.pos[n * 3 + 2] = p.z;
      fill.set(tr.key, n + 1);
      this.shown.push({ ...p, color: tr.bg[0] });
    }
    for (const [key, cl] of this.clouds) {
      const n = fill.get(key) ?? 0;
      cl.points.geometry.setDrawRange(0, n);
      cl.points.visible = n > 0;
      cl.attr.needsUpdate = true;
      cl.mat.uniforms.scale.value = pxPerUnit;
      cl.mat.uniforms.minPx.value = 22 * dpr;
      cl.mat.uniforms.maxPx.value = 58 * dpr;
    }
  }

  /** The pin under a tap (CSS pixels), if any — the nearest one within a finger's width. */
  pick(camera: THREE.Camera, rect: DOMRect, cx: number, cy: number): string | null {
    let best: string | null = null, bd = 30;
    for (const p of this.shown) {
      this.v.set(p.x, p.y, p.z).project(camera);
      if (this.v.z > 1 || this.v.z < -1) continue; // behind the camera
      const sx = rect.left + ((this.v.x + 1) / 2) * rect.width, sy = rect.top + ((1 - this.v.y) / 2) * rect.height;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < bd) (bd = d), (best = p.id);
    }
    return best;
  }

  dots() {
    return this.shown;
  }

  dispose() {
    for (const cl of this.clouds.values()) {
      this.scene.remove(cl.points);
      cl.points.geometry.dispose();
      cl.mat.dispose();
      cl.tex.dispose();
    }
    this.clouds.clear();
  }

  private cloud(tr: Trade) {
    let cl = this.clouds.get(tr.key);
    if (cl) return cl;
    const pos = new Float32Array(CAP * 3);
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);
    geo.setDrawRange(0, 0);
    const tex = pinTexture(tr);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: tex }, size: { value: 7 }, scale: { value: 400 }, minPx: { value: 22 }, maxPx: { value: 58 } },
      vertexShader: `uniform float size; uniform float scale; uniform float minPx; uniform float maxPx;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * scale / -mv.z, minPx, maxPx); }`,
      fragmentShader: `uniform sampler2D map;
        void main(){ vec4 c = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)); if (c.a < 0.35) discard; gl_FragColor = c; }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.scene.add(points);
    cl = { points, pos, attr, mat, tex };
    this.clouds.set(tr.key, cl);
    return cl;
  }
}
