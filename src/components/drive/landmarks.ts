"use client";
// Stores' own 3D buildings in the city (see lib/landmarks.ts): the list comes from
// /api/landmarks around the player (asked again after driving a kilometre), each model
// is downloaded only when it's close (one at a time, its shaders compiled before it
// appears so the frame never hitches) and freed again when far behind.
// Its street-level outline is solid from the start — before the model has arrived —
// and is handed to the tile builder so the map's building under it isn't drawn.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { LANDMARK_DROP_M, LANDMARK_LIST_M, LANDMARK_LOAD_M, placeHull, type LandmarkView } from "@/lib/landmarks";
import { api } from "../game/client";
import { disposeModel, loadModel, prepare } from "./gltf";
import type { CollisionWorld } from "./physics";
import type { Cut, Footprint } from "./tileMesh";

type Entry = {
  v: LandmarkView;
  sig: string;
  at: { x: number; z: number };
  cut: Cut;
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  root: THREE.Group | null;
  glow: ReturnType<typeof prepare> | null;
  state: "idle" | "loading" | "shown" | "failed";
  retryAt: number;
};

export class Landmarks {
  private list = new Map<string, Entry>();
  private fetchedAt: { x: number; z: number } | null = null;
  private fetching = false;
  private loading = false;
  private night = 0;
  private disposed = false;

  /** `onCuts`: the outlines changed — tiles under these boxes need building again. */
  constructor(
    private scene: THREE.Scene,
    private frame: Frame,
    private renderer: THREE.WebGLRenderer,
    private camera: THREE.Camera,
    private collision: CollisionWorld,
    private shadows: boolean,
    private onCuts: (boxes: Entry["box"][]) => void,
  ) {}

  /** Outlines on (or near) a tile's box, for its build. */
  cutsFor(box: { minX: number; maxX: number; minZ: number; maxZ: number }): Cut[] {
    const out: Cut[] = [];
    for (const e of this.list.values()) if (e.box.maxX > box.minX - 5 && e.box.minX < box.maxX + 5 && e.box.maxZ > box.minZ - 5 && e.box.minZ < box.maxZ + 5) out.push(e.cut);
    return out;
  }

  /** Call every so often with the vehicle's spot: refreshes the list, loads and frees models. */
  update(x: number, z: number) {
    if (this.disposed) return;
    if (!this.fetching && (!this.fetchedAt || Math.hypot(x - this.fetchedAt.x, z - this.fetchedAt.z) > LANDMARK_LIST_M / 3)) void this.fetch(x, z);
    const now = performance.now();
    let next: Entry | null = null, nextD = Infinity;
    for (const e of this.list.values()) {
      const d = Math.hypot(e.at.x - x, e.at.z - z);
      if (e.root && d > LANDMARK_DROP_M) this.unload(e);
      else if (!e.root && e.v.url && d < LANDMARK_LOAD_M && (e.state === "idle" || (e.state === "failed" && now > e.retryAt)) && d < nextD) (next = e), (nextD = d);
    }
    if (next && !this.loading) void this.load(next);
  }

  /** Brighten lit signs at night (0 … 1). */
  setNight(n: number) {
    this.night = n;
    for (const e of this.list.values()) e.glow?.night(n);
  }

  /** Models on screen, for tap picking. */
  pickables(): THREE.Object3D[] {
    return [...this.list.values()].flatMap((e) => (e.root ? [e.root] : []));
  }

  /** Which landmark a tapped mesh belongs to. */
  of(o: THREE.Object3D): LandmarkView | null {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      const id = p.userData.landmark as string | undefined;
      if (id) return this.list.get(id)?.v ?? null;
    }
    return null;
  }

  dispose() {
    this.disposed = true;
    for (const e of this.list.values()) this.unload(e);
    for (const id of this.list.keys()) this.collision.remove(`lm:${id}`);
    this.list.clear();
  }

  private async fetch(x: number, z: number) {
    this.fetching = true;
    const here = this.frame.toLatLng(x, z);
    try {
      const r = await api<{ landmarks: LandmarkView[] }>(`/api/landmarks?lat=${here.lat.toFixed(5)}&lng=${here.lng.toFixed(5)}`);
      if (this.disposed) return;
      this.fetchedAt = { x, z };
      this.set(r.landmarks);
    } catch {
      // Offline or no session: try again after the next kilometre (or the next minute).
      this.fetchedAt = { x, z };
      setTimeout(() => (this.fetchedAt = null), 60_000);
    } finally {
      this.fetching = false;
    }
  }

  private set(views: LandmarkView[]) {
    const changed: Entry["box"][] = [];
    const keep = new Set(views.map((v) => v.id));
    for (const [id, e] of this.list)
      if (!keep.has(id)) {
        this.unload(e);
        this.collision.remove(`lm:${id}`);
        this.list.delete(id);
        changed.push(e.box);
      }
    for (const v of views) {
      const sig = `${v.url}|${v.yaw}|${v.scale}|${v.lift}|${v.lat}|${v.lng}|${v.hull.join(",")}`;
      const have = this.list.get(v.id);
      if (have?.sig === sig) {
        have.v = v;
        continue;
      }
      if (have) (this.unload(have), changed.push(have.box));
      const at = this.frame.toXZ(v.lat, v.lng);
      const pts = placeHull(v.hull, v.yaw, v.scale, at);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 2) (minX = Math.min(minX, pts[i])), (maxX = Math.max(maxX, pts[i])), (minZ = Math.min(minZ, pts[i + 1])), (maxZ = Math.max(maxZ, pts[i + 1]));
      const box = { minX, maxX, minZ, maxZ };
      const e: Entry = { v, sig, at, cut: { pts, ax: at.x, az: at.z }, box, root: null, glow: null, state: "idle", retryAt: 0 };
      this.list.set(v.id, e);
      if (pts.length >= 6) {
        const fp: Footprint = { pts: new Float32Array(pts), ...box, h: Math.max(3, v.height * v.scale + v.lift), mh: Math.max(0, v.lift) };
        this.collision.add(`lm:${v.id}`, [fp]);
      } else this.collision.remove(`lm:${v.id}`);
      changed.push(box);
    }
    if (changed.length) this.onCuts(changed);
  }

  private async load(e: Entry) {
    if (!e.v.url) return;
    this.loading = true;
    e.state = "loading";
    try {
      const model = await loadModel(e.v.url);
      if (this.disposed || this.list.get(e.v.id) !== e) return disposeModel(model);
      const root = new THREE.Group();
      root.add(model);
      root.position.set(e.at.x, e.v.lift, e.at.z);
      root.rotation.y = (-e.v.yaw * Math.PI) / 180;
      root.scale.setScalar(e.v.scale);
      root.userData.landmark = e.v.id;
      e.glow = prepare(root, this.shadows);
      e.glow.night(this.night);
      // Compile its shaders first: adding an unseen material mid-drive costs a frame.
      await this.renderer.compileAsync(root, this.camera, this.scene).catch(() => {});
      if (this.disposed || this.list.get(e.v.id) !== e) return disposeModel(root);
      this.scene.add(root);
      e.root = root;
      e.state = "shown";
    } catch {
      e.state = "failed";
      e.retryAt = performance.now() + 30_000;
    } finally {
      this.loading = false;
    }
  }

  private unload(e: Entry) {
    if (!e.root) return;
    this.scene.remove(e.root);
    disposeModel(e.root);
    e.root = null;
    e.glow = null;
    e.state = "idle";
  }
}
