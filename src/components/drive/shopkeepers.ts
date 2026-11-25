"use client";
// A shopkeeper in the doorway of every open shop near you (storefronts.openNear: open by its
// hours, a shop — not a mosque, school or hospital, lib/storeKinds.ts isShop): one of the street's
// real people models (peopleModels.ts) standing at the door, facing the street, idling. Closed
// shops have none. Their calls (street.shopCall) already come from that same door spot, so the
// voice is the person's. A small pool, re-placed about once a second; the nearest few only.
// They don't run at every bang: each keeper's fear follows how threatening things are where they stand
// (lib/street/threat.ts — a car bearing down, a gun drawn, shots, a blast, the wanted level; braver than
// passers-by), runs in above FLEE_AT with the shutter down, and comes back out to the door once calm.
import * as THREE from "three";
import { CALM, freshScares, mayReturn, stepFear, threatOf, type Fear, type Scare, type ScareEvent, type ThreatCtx } from "@/lib/street/threat";
import { loadPeople, PersonModel, TINT_COUNT, type PersonTemplate } from "./peopleModels";
import type { Storefronts } from "./storefronts";

/** At most this many shopkeepers, within this far (m); fewer on the lite tier. */
const MAX = 10, MAX_LITE = 4, NEAR_M = 60;
const PLACE_EVERY_S = 1;

/** Running in from the door (s); the shutter stays down at most this long (s) — it lifts sooner once they're calm. */
const RUN_IN_S = 0.9, SHUT_MAX_S = 120;

/** What the player is doing, for the keepers' fear. */
export type KeeperCtx = Omit<ThreatCtx["me"], "x" | "z"> & { stars: number };
/** A keeper's fear, by shop (it outlives the keeper's model, which goes back to the pool once they're inside). */
type Fright = Fear & { x: number; z: number; inside: number };

type Keeper = { id: string | null; model: PersonModel; /** Running inside (s left), 0 = at the door. */ fleeing: number };

export class Shopkeepers {
  private pool: Keeper[] = [];
  private tpls: PersonTemplate[] = [];
  private since = PLACE_EVERY_S;
  /** Off in a match and while the street people are off. */
  enabled = true;
  /** Someone at a door shouts as they run in: the words and where from. */
  onShout: ((text: string, at: { x: number; y: number; z: number }) => void) | null = null;
  /** What they shout (by a seed). */
  shoutLine: ((seed: number) => string) | null = null;
  private shoutAt = -Infinity;
  private seed = 0;
  /** Shots, blasts, crashes lately (s on the performance clock). */
  private scares: ScareEvent[] = [];
  private fright = new Map<string, Fright>();

  /** Shots, a blast, a crash, a car swerving past at (x, z), heard up to `r` m: weighed by each keeper's fear (tick). */
  alarm(x: number, z: number, r: number, kind: Scare) {
    const now = performance.now() / 1000;
    this.scares = freshScares(this.scares, now);
    if (this.scares.length > 40) this.scares.shift();
    this.scares.push({ kind, x, z, r, at: now });
  }

  /** What frightening thing happened within earshot of (x, z) in the last `secs` s, worst first (people talk about it). */
  recentNear(x: number, z: number, secs = 20): "shots" | "blast" | "crash" | null {
    const now = performance.now() / 1000;
    let worst: "shots" | "blast" | "crash" | null = null;
    for (const e of this.scares) {
      if (now - e.at > secs || e.kind === "dodge" || Math.hypot(e.x - x, e.z - z) > e.r) continue;
      const k = e.kind === "shot" ? "shots" : e.kind;
      if (k === "blast" || (k === "shots" && worst !== "blast") || !worst) worst = k;
    }
    return worst;
  }

  /** Each keeper's fear for this frame: the ones at the door run in when afraid; the ones inside come back out when calm. */
  private fear(dt: number, px: number, pz: number, me: KeeperCtx) {
    const now = performance.now() / 1000;
    if (this.scares.length && now - this.scares[this.scares.length - 1].at > 20) this.scares = [];
    const ctx = (x: number, z: number): ThreatCtx => ({ x, z, me: { ...me, x: px, z: pz }, stars: me.stars, events: this.scares, now, keeper: true });
    const ran: Keeper[] = [];
    for (const k of this.pool) {
      if (!k.id || !k.model.group.visible || k.fleeing > 0) continue;
      const g = k.model.group.position;
      const was = this.fright.get(k.id) ?? { ...CALM, x: g.x, z: g.z, inside: 0 };
      const f = stepFear(was, threatOf(ctx(g.x, g.z)), dt);
      if (f.level < 0.01 && !f.afraid) {
        this.fright.delete(k.id);
        continue;
      }
      this.fright.set(k.id, { ...f, x: g.x, z: g.z, inside: 0 });
      if (f.afraid) {
        k.fleeing = RUN_IN_S;
        k.model.group.rotation.y += Math.PI; // turn to the door
        ran.push(k);
      }
    }
    if (ran.length) {
      this.fronts.panic(ran.map((k) => k.id!), SHUT_MAX_S);
      const t = performance.now();
      if (t - this.shoutAt > 4000 && this.onShout && this.shoutLine) {
        this.shoutAt = t;
        const g = ran[0].model.group.position;
        this.onShout(this.shoutLine(this.seed++), { x: g.x, y: 1.75, z: g.z });
      }
    }
    // Inside: their fear goes on (it's still loud out there?); calm again, the shutter lifts and they're back at the door.
    const atDoor = new Set(this.pool.filter((k) => k.id && k.model.group.visible && k.fleeing <= 0).map((k) => k.id!));
    for (const [id, f] of this.fright) {
      if (atDoor.has(id)) continue;
      const next = { ...stepFear(f, threatOf(ctx(f.x, f.z)), dt), x: f.x, z: f.z, inside: f.inside + dt };
      if (mayReturn(next, next.inside)) {
        this.fright.delete(id);
        this.fronts.reopen(id);
      } else this.fright.set(id, next);
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

  tick(dt: number, px: number, pz: number, me: KeeperCtx = { vx: 0, vz: 0, inCar: false, gunDrawn: false, stars: 0 }) {
    if (!this.enabled || !this.tpls.length) {
      for (const k of this.pool) k.model.group.visible = false;
      return;
    }
    this.fear(dt, px, pz, me);
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
