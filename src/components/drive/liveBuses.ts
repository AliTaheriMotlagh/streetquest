"use client";
// Istanbul's real buses in the 3D city (IETT's live feed via /api/transit?buses, server/transit.ts):
// the nearest few drive where the real ones are, gliding between the 20-second positions and
// turning to where they're going, each with its line number above. Elsewhere (and when the feed
// isn't reachable) nothing is drawn: the traffic's own buses (traffic.ts) fill the streets.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { busesNear, type LiveBus } from "@/lib/transit/iett";
import { clientFleet } from "../game/iettClient";
import { cityAt } from "@/lib/transit/network";
import { api } from "../game/client";
import { makeSign, type Style } from "./world3d";
import { makeVehicle, type VehicleModel } from "./vehicles3d";


const POLL_MS = 20_000;
/** Drawn at most (the nearest), and only this close. */
const MAX = 10, MAX_LITE = 4, NEAR_M = 900;
/** IETT's buses are red and white. */
const PAINT = "#c8102e";

type Bus = { id: string; line: string; model: VehicleModel | null; tag: ReturnType<typeof makeSign> | null; from: { x: number; z: number }; to: { x: number; z: number }; got: number; yaw: number };

export class LiveBuses {
  private buses = new Map<string, Bus>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private disposed = false;

  constructor(private scene: THREE.Scene, private frame: Frame, private style: Style, private lite: boolean) {}

  /** Polls while the player is in Istanbul (`where`: the player's position now). */
  start(where: () => { lat: number; lng: number } | null) {
    const poll = async () => {
      const at = where();
      if (this.busy || !at || document.hidden || cityAt(at) !== "istanbul") return;
      this.busy = true;
      try {
        const r = await api<{ live: boolean; buses: LiveBus[] }>(`/api/transit?buses=1&lat=${at.lat.toFixed(4)}&lng=${at.lng.toFixed(4)}`);
        // No relay: this phone asks IETT itself (it's in Istanbul).
        const mine = r.live ? null : await clientFleet();
        if (!this.disposed) this.set(mine ? busesNear(mine, at, 1500) : r.buses);
      } catch {
        // Feed down: keep what's drawn until it goes stale below.
      } finally {
        this.busy = false;
      }
    };
    void poll();
    this.timer = setInterval(() => void poll(), POLL_MS);
  }

  private set(list: LiveBus[]) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const b of list) {
      seen.add(b.id);
      const p = this.frame.toXZ(b.lat, b.lng);
      const had = this.buses.get(b.id);
      if (!had) {
        this.buses.set(b.id, { id: b.id, line: b.line ?? "", model: null, tag: null, from: p, to: p, got: now, yaw: 0 });
        continue;
      }
      // From where it's drawn now to the new position, over the next poll.
      const cur = this.at(had, now);
      const moved = Math.hypot(p.x - cur.x, p.z - cur.z);
      if (moved > 2) had.yaw = Math.atan2(-(p.x - cur.x), -(p.z - cur.z));
      // A jump (a gap in the feed, a bus that teleported to its garage): no glide across the city.
      had.from = moved > 400 ? p : cur;
      had.to = p;
      had.got = now;
      had.line = b.line ?? had.line;
    }
    for (const [id, b] of this.buses) if (!seen.has(id)) (this.drop(b), this.buses.delete(id));
  }

  private at(b: Bus, now: number) {
    const k = Math.min(1, (now - b.got) / POLL_MS);
    return { x: b.from.x + (b.to.x - b.from.x) * k, z: b.from.z + (b.to.z - b.from.z) * k };
  }

  private drop(b: Bus) {
    if (b.model) (b.model.group.removeFromParent(), b.model.dispose(), (b.model = null));
    if (b.tag) (b.tag.dispose(), (b.tag = null));
  }

  tick(camX: number, camZ: number) {
    if (!this.buses.size) return;
    const now = performance.now();
    const near = [...this.buses.values()]
      .map((b) => ({ b, p: this.at(b, now) }))
      .map((x) => ({ ...x, d: Math.hypot(x.p.x - camX, x.p.z - camZ) }))
      .sort((a, c) => a.d - c.d);
    const cap = this.lite ? MAX_LITE : MAX;
    near.forEach(({ b, p, d }, i) => {
      const show = i < cap && d < NEAR_M;
      if (!show) return void (b.model && this.drop(b));
      if (!b.model) {
        b.model = makeVehicle("bus", PAINT, this.style, { shadows: !this.lite });
        if (b.line) {
          b.tag = makeSign("🚌", b.line, "#ffffff");
          b.tag.sprite.scale.multiplyScalar(0.7);
          b.tag.sprite.position.y = b.model.height + 1.6;
          b.model.group.add(b.tag.sprite);
        }
        this.scene.add(b.model.group);
      }
      b.model.group.position.set(p.x, 0, p.z);
      b.model.group.rotation.y = b.yaw;
      if (b.tag) b.tag.sprite.visible = d < 220;
    });
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    for (const b of this.buses.values()) this.drop(b);
    this.buses.clear();
  }
}
