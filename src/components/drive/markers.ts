"use client";
// Stores on the game map that aren't already a job beacon, standing in the 3D city:
// businesses with no open mission right now (yours, or ones you've done). Money is loot
// you drive through and store missions are job beacons (both in Drive). Each marker can
// be tapped (→ its card in the game, or navigate there). Only the nearest ones are
// built, and their name signs show up close.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import type { Selected, World } from "../game/client";
import { makeBeacon } from "./world3d";

export type MarkerInfo = { id: string; sel: Selected; emoji: string; color: string; label: string; lat: number; lng: number; tall: boolean; size: number };

export function markersOf(w: World | null): MarkerInfo[] {
  if (!w) return [];
  return w.businesses
    .filter((b) => b.mine || !b.campaigns.some((c) => !c.visited))
    .map((b) => ({ id: `bz:${b.id}`, sel: { type: "biz", data: b }, emoji: b.emoji, color: b.featured ? "#f0c05a" : b.mine ? "#63b3f2" : "#ff7ad9", label: b.name, lat: b.lat, lng: b.lng, tall: b.featured, size: 1 }));
}

type Built = { info: MarkerInfo; beacon: ReturnType<typeof makeBeacon> };

export class Markers {
  private built = new Map<string, Built>();
  private all: MarkerInfo[] = [];
  /** Out of the way (a match is on). */
  hidden = false;

  constructor(private scene: THREE.Scene, private frame: Frame, private max: number) {}

  set(list: MarkerInfo[]) {
    this.all = list;
  }

  /** Keep the nearest `max` built; call a few times a second. */
  sync(x: number, z: number) {
    const near = this.all
      .map((m) => ({ m, p: this.frame.toXZ(m.lat, m.lng) }))
      .map((e) => ({ ...e, d: Math.hypot(e.p.x - x, e.p.z - z) }))
      .filter((e) => e.d < 1200)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.max);
    const keep = new Set(near.map((e) => e.m.id));
    for (const [id, b] of this.built) if (!keep.has(id)) (this.scene.remove(b.beacon.group), b.beacon.dispose(), this.built.delete(id));
    for (const { m, p, d } of near) {
      let b = this.built.get(m.id);
      const sig = `${m.emoji}|${m.color}|${m.label}|${m.tall}`;
      if (b && `${b.info.emoji}|${b.info.color}|${b.info.label}|${b.info.tall}` !== sig) {
        this.scene.remove(b.beacon.group);
        b.beacon.dispose();
        b = undefined;
      }
      if (!b) {
        const beacon = makeBeacon(m.emoji, m.color, m.label, { tall: m.tall, size: m.size });
        beacon.icon.userData = { pick: { kind: "marker", id: m.id } };
        this.scene.add(beacon.group);
        b = { info: m, beacon };
        this.built.set(m.id, b);
      }
      b.info = m;
      b.beacon.group.position.set(p.x, 0, p.z);
      b.beacon.group.visible = !this.hidden;
      // Not right on top of us either: up close a sign would fill the screen.
      b.beacon.sign.visible = d > 30 && d < (m.tall ? 400 : 180);
    }
  }

  get(id: string) {
    return this.built.get(id)?.info ?? this.all.find((m) => m.id === id) ?? null;
  }

  pickables() {
    return [...this.built.values()].map((b) => b.beacon.icon);
  }

  dots() {
    return [...this.built.values()].map((b) => ({ x: b.beacon.group.position.x, z: b.beacon.group.position.z, color: b.info.color }));
  }

  tick(time: number) {
    for (const b of this.built.values()) b.beacon.tick(time);
  }

  dispose() {
    for (const b of this.built.values()) (this.scene.remove(b.beacon.group), b.beacon.dispose());
    this.built.clear();
  }
}
