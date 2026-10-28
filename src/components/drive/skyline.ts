"use client";
// The real mountains on the horizon (Alborz, Tochal and Damavand from Tehran), from
// elevation tiles (/api/dem). A ring of terrain from ~1.2 km out to ~80 km around where
// we are, heights relative to the ground here and dropped for the Earth's curve, drawn
// like the sky: behind the city, never hiding it, far ridges first so nearer ones cover
// them. It's scaled toward the camera every frame (which keeps every point exactly where
// it appears) so it fits inside the camera's far plane. The streets themselves stay flat.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import type { LatLng } from "@/lib/geo";

const Z = 9;
const AZ = 360;
const RINGS = 64;
const R0 = 1200;
const EARTH = 6_371_000;
/** Rebuild after moving this far from where the ring was built. */
const REBUILD_M = 3000;

type Dem = { z: number; tiles: Map<string, Float32Array | null> };

const tileXY = (p: LatLng, z: number) => {
  const n = 2 ** z, s = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

async function loadTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  try {
    const res = await fetch(`/api/dem/${z}/${x}/${y}`);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d")!;
    g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const h = new Float32Array(256 * 256);
    for (let i = 0; i < h.length; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
    return h;
  } catch {
    return null;
  }
}

/** Height in metres at a point (bilinear), or null where no tile loaded. */
function heightAt(d: Dem, p: LatLng) {
  const t = tileXY(p, d.z), tx = Math.floor(t.x), ty = Math.floor(t.y);
  const h = d.tiles.get(`${tx}_${ty}`);
  if (!h) return null;
  const fx = Math.min(254.999, (t.x - tx) * 256 - 0.5), fy = Math.min(254.999, (t.y - ty) * 256 - 0.5);
  const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), kx = Math.max(0, fx - x0), ky = Math.max(0, fy - y0);
  const v = (x: number, y: number) => h[y * 256 + x];
  return (v(x0, y0) * (1 - kx) + v(x0 + 1, y0) * kx) * (1 - ky) + (v(x0, y0 + 1) * (1 - kx) + v(x0 + 1, y0 + 1) * kx) * ky;
}

const BROWN = new THREE.Color("#9c8b6c"), ROCK = new THREE.Color("#7d7468"), SNOW = new THREE.Color("#f4f6f8");

export class Skyline {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  // Unlit: the shading is baked in (recolor), so the low ground matches the fog exactly.
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false, toneMapped: false });
  /** Per vertex: height above sea level and distance from us (for recolouring). */
  private heights: Float32Array | null = null;
  private dists: Float32Array | null = null;
  private ground = 0;
  private hazeNow = new THREE.Color();
  private center: { x: number; z: number } | null = null;
  private busy = false;
  private disposed = false;
  private radius: number;

  /** `haze`: the far-air colour now (the fog's), read whenever the ring is built. */
  constructor(private frame: Frame, private haze: () => THREE.Color, lite: boolean) {
    this.radius = lite ? 55_000 : 80_000;
    this.group.matrixAutoUpdate = false;
  }

  /** Keep it around the camera; rebuild after a long drive. */
  update(camera: THREE.Camera, x: number, z: number) {
    // Dawn, dusk, night: the haze changed colour.
    const haze = this.haze();
    if (this.mesh && Math.abs(haze.r - this.hazeNow.r) + Math.abs(haze.g - this.hazeNow.g) + Math.abs(haze.b - this.hazeNow.b) > 0.02) this.recolor();
    if (!this.busy && (!this.center || Math.hypot(x - this.center.x, z - this.center.z) > REBUILD_M)) void this.build(x, z);
    // world = cam + k·(p − cam): every vertex stays on the same line of sight, k brings the far ring inside the far plane.
    const k = (2000 / this.radius) * 0.95, c = camera.position;
    this.group.matrix.makeScale(k, k, k).setPosition(c.x * (1 - k), c.y * (1 - k), c.z * (1 - k));
    this.group.matrixWorldNeedsUpdate = true;
  }

  private async build(x: number, z: number) {
    this.busy = true;
    const here = this.frame.toLatLng(x, z);
    const dLat = this.radius / 110_540, dLng = this.radius / (111_320 * Math.cos((here.lat * Math.PI) / 180));
    const a = tileXY({ lat: here.lat + dLat, lng: here.lng - dLng }, Z), b = tileXY({ lat: here.lat - dLat, lng: here.lng + dLng }, Z);
    const dem: Dem = { z: Z, tiles: new Map() };
    const jobs: Promise<void>[] = [];
    for (let tx = Math.floor(a.x); tx <= Math.floor(b.x); tx++) for (let ty = Math.floor(a.y); ty <= Math.floor(b.y); ty++) jobs.push(loadTile(Z, tx, ty).then((h) => void dem.tiles.set(`${tx}_${ty}`, h)));
    await Promise.all(jobs);
    const ground = heightAt(dem, here);
    if (this.disposed || ground == null) return void (this.busy = false);

    const pos = new Float32Array(AZ * RINGS * 3), col = new Float32Array(AZ * RINGS * 3);
    const heights = new Float32Array(AZ * RINGS), dists = new Float32Array(AZ * RINGS);
    for (let r = 0; r < RINGS; r++) {
      // Closer rings near us, ~2.5 km apart at the far edge (a peak like Damavand stays sharp).
      const dist = R0 + (this.radius - R0) * (r / (RINGS - 1)) ** 2;
      for (let i = 0; i < AZ; i++) {
        const ang = (i / AZ) * Math.PI * 2;
        const px = x + Math.sin(ang) * dist, pz = z - Math.cos(ang) * dist;
        const h = heightAt(dem, this.frame.toLatLng(px, pz)) ?? ground;
        // The Earth's curve (with the usual 13% for refraction) sinks distant ground.
        const y = h - ground - ((dist * dist) / (2 * EARTH)) * 0.87;
        const v = (r * AZ + i) * 3;
        pos[v] = px;
        pos[v + 1] = y;
        pos[v + 2] = pz;
        heights[v / 3] = h;
        dists[v / 3] = dist;
      }
    }
    // Far rings first: without depth testing, nearer ridges are drawn over farther ones.
    const idx: number[] = [];
    for (let r = RINGS - 2; r >= 0; r--)
      for (let i = 0; i < AZ; i++) {
        const j = (i + 1) % AZ, a0 = r * AZ + i, a1 = r * AZ + j, b0 = (r + 1) * AZ + i, b1 = (r + 1) * AZ + j;
        idx.push(a0, a1, b0, a1, b1, b0); // facing up
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.heights = heights;
    this.dists = dists;
    this.ground = ground;
    if (this.mesh) (this.group.remove(this.mesh), this.mesh.geometry.dispose());
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.center = { x, z };
    this.busy = false;
    this.recolor();
  }

  /**
   * Dry foothills, bare rock higher up, snow on the peaks, lit from the south-west.
   * Ground about as low as ours (the rest of the city, the plain) melts into the haze so
   * only real relief stands out; that gets hazier with distance.
   */
  private recolor() {
    if (!this.mesh || !this.heights || !this.dists) return;
    const geo = this.mesh.geometry, col = geo.attributes.color as THREE.BufferAttribute, nor = geo.attributes.normal;
    const haze = this.hazeNow.copy(this.haze()), c = new THREE.Color();
    for (let i = 0; i < this.heights.length; i++) {
      const h = this.heights[i], dist = this.dists[i];
      if (h < 2200) c.copy(BROWN);
      else if (h < 3600) c.copy(BROWN).lerp(ROCK, (h - 2200) / 1400);
      else c.copy(ROCK).lerp(SNOW, Math.min(1, (h - 3600) / 500));
      c.multiplyScalar(0.72 + 0.4 * Math.max(0, nor.getX(i) * -0.5 + nor.getY(i) * 0.6 + nor.getZ(i) * 0.62));
      const relief = THREE.MathUtils.smoothstep(h - this.ground, 120, 900);
      c.lerp(haze, THREE.MathUtils.lerp(1, 0.25 + 0.5 * (1 - Math.exp(-dist / 40_000)), relief));
      c.toArray(col.array, i * 3);
    }
    col.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.mesh?.geometry.dispose();
    this.mat.dispose();
  }
}
