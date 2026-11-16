"use client";
// A shopkeeper in the doorway of every open shop near you (storefronts.openNear: open by its
// hours, a shop — not a mosque, school or hospital, lib/storeKinds.ts isShop): one of the street's
// real people models (peopleModels.ts) standing at the door, facing the street, idling. Closed
// shops have none. Their calls (street.shopCall) already come from that same door spot, so the
// voice is the person's. A small pool, re-placed about once a second; the nearest few only.
import * as THREE from "three";
import { loadPeople, PersonModel, TINT_COUNT, type PersonTemplate } from "./peopleModels";
import type { Storefronts } from "./storefronts";

/** At most this many shopkeepers, within this far (m); fewer on the lite tier. */
const MAX = 10, MAX_LITE = 4, NEAR_M = 60;
const PLACE_EVERY_S = 1;

/** Running in from the door when shots ring out (s), and how long the shutter stays down after. */
const RUN_IN_S = 0.9, SHUT_S = [12, 20] as const;

type Keeper = { id: string | null; model: PersonModel; /** Running inside (s left), 0 = at the door. */ fleeing: number };

export class Shopkeepers {
  private pool: Keeper[] = [];
  private tpls: PersonTemplate[] = [];
  private since = PLACE_EVERY_S;
  /** Off in a match and while the street people are off. */
  enabled = true;
  /** Someone at a door shouts (gunfire): the words and where from. */
  onShout: ((text: string, at: { x: number; y: number; z: number }) => void) | null = null;
  private shoutAt = -Infinity;
  private seed = 0;

  /**
   * Shots, a blast, a crash at (x, z): every keeper within `r` m turns and runs in, the shop's
   * shutter comes down for a while (storefronts.panic), and the nearest one shouts.
   */
  alarm(x: number, z: number, r: number, say: (seed: number) => string) {
    const hit: Keeper[] = [];
    for (const k of this.pool) {
      if (!k.id || !k.model.group.visible || k.fleeing > 0) continue;
      const g = k.model.group.position;
      if (Math.hypot(g.x - x, g.z - z) <= r) hit.push(k);
    }
    if (!hit.length) return;
    for (const k of hit) {
      k.fleeing = RUN_IN_S;
      k.model.group.rotation.y += Math.PI; // turn to the door
    }
    this.fronts.panic(hit.map((k) => k.id!), SHUT_S[0] + Math.random() * (SHUT_S[1] - SHUT_S[0]));
    const now = performance.now();
    if (now - this.shoutAt > 4000 && this.onShout) {
      this.shoutAt = now;
      const g = hit[0].model.group.position;
      this.onShout(say(this.seed++), { x: g.x, y: 1.75, z: g.z });
    }
  }

  constructor(private scene: THREE.Scene, private fronts: Storefronts, private lite: boolean) {
    loadPeople()
      .then((t) => (this.tpls = t))
      .catch(() => {});
  }

  /** The same shop gets the same-looking person each time (by its id). */
  private modelFor(id: string): PersonModel | null {
    if (!this.tpls.length) return null;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    const tpl = this.tpls[Math.abs(h) % this.tpls.length];
    return new PersonModel(tpl, Math.abs(h >> 3) % TINT_COUNT);
  }

  tick(dt: number, px: number, pz: number) {
    if (!this.enabled || !this.tpls.length) {
      for (const k of this.pool) k.model.group.visible = false;
      return;
    }
    this.since += dt;
    if (this.since >= PLACE_EVERY_S) {
      this.since = 0;
      this.place(px, pz);
    }
    for (const k of this.pool) {
      if (!k.id || !k.model.group.visible) continue;
      const g = k.model.group.position;
      if (k.fleeing > 0) {
        // Into the shop: along the way they now face (local −z), at a run, then gone.
        const yaw = k.model.group.rotation.y, sp = 3.6;
        g.x -= Math.sin(yaw) * sp * dt;
        g.z -= Math.cos(yaw) * sp * dt;
        k.fleeing -= dt;
        k.model.update(dt, sp, false, Math.hypot(g.x - px, g.z - pz));
        if (k.fleeing <= 0) ((k.fleeing = 0), (k.model.group.visible = false));
        continue;
      }
      k.model.update(dt, 0, false, Math.hypot(g.x - px, g.z - pz));
    }
  }

  private place(px: number, pz: number) {
    const want = this.fronts.openNear(px, pz, NEAR_M, this.lite ? MAX_LITE : MAX);
    const ids = new Set(want.map((w) => w.id));
    // Keepers whose shop is still wanted stay; the others are free.
    for (const k of this.pool) if (k.id && !ids.has(k.id) && k.fleeing <= 0) (k.id = null), (k.model.group.visible = false);
    const placed = new Set(this.pool.filter((k) => k.id).map((k) => k.id!));
    for (const w of want) {
      if (placed.has(w.id)) continue;
      // A free keeper of the right look, else a new one while the pool has room, else any free one.
      let k = this.pool.find((x) => !x.id);
      if (!k && this.pool.length < (this.lite ? MAX_LITE : MAX)) {
        const model = this.modelFor(w.id);
        if (!model) return;
        this.scene.add(model.group);
        k = { id: null, model, fleeing: 0 };
        this.pool.push(k);
      }
      if (!k) break;
      k.id = w.id;
      k.fleeing = 0;
      k.model.group.position.set(w.x, 0, w.z);
      k.model.group.rotation.y = w.yaw;
      k.model.group.visible = true;
    }
  }

  dispose() {
    for (const k of this.pool) (k.model.group.removeFromParent(), k.model.dispose());
    this.pool = [];
  }
}
