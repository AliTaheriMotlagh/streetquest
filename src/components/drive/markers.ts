"use client";
// The game's businesses that aren't a mission right now (yours, or ones you've done),
// standing in the 3D city the way a real shop does: its sign on a pole at the kerb in
// front of it, in its trade's colours with its name, lit at night — no glowing marker
// (those are for missions and money: lib/storefront.ts). Store missions are job beacons
// (Drive). Tapping the sign opens its card; only the nearest ones are built.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import type { Selected, World } from "../game/client";
import { makeShopSign, type Board, type Style } from "./world3d";

export type MarkerInfo = { id: string; sel: Selected; emoji: string; color: string; label: string; cls: string; lat: number; lng: number };

export function markersOf(w: World | null): MarkerInfo[] {
  if (!w) return [];
  return w.businesses
    .filter((b) => b.mine || !b.campaigns.some((c) => !c.visited))
    .map((b) => ({ id: `bz:${b.id}`, sel: { type: "biz", data: b }, emoji: b.emoji, color: b.mine ? "#63b3f2" : "#c9a05a", label: b.name, cls: b.category, lat: b.lat, lng: b.lng }));
}

type Built = { info: MarkerInfo; board: Board; x: number; z: number };
/** Where a sign stands for a store at (x, z) (Drive: on the pavement in front of it, facing the street). */
/** Null: no pavement for it there (a junction, a road with no kerb) — the sign isn't put up rather than stand in the street. */
export type SignPlace = (x: number, z: number) => { x: number; z: number; angle: number } | null;

export class Markers {
  private built = new Map<string, Built>();
  private all: MarkerInfo[] = [];
  private night = 0.15;
  /** Out of the way (a match is on). */
  hidden = false;

  constructor(private scene: THREE.Scene, private frame: Frame, private max: number, private style: Style, private place: SignPlace) {}

  set(list: MarkerInfo[]) {
    this.all = list;
  }

  /** Keep the nearest `max` built (within 220 m — a sign is read up close); call a few times a second. */
  sync(x: number, z: number) {
    const near = this.all
      .map((m) => ({ m, p: this.frame.toXZ(m.lat, m.lng) }))
      .map((e) => ({ ...e, d: Math.hypot(e.p.x - x, e.p.z - z) }))
      .filter((e) => e.d < 220)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.max);
    const keep = new Set(near.map((e) => e.m.id));
    for (const [id, b] of this.built) if (!keep.has(id)) this.drop(id, b);
    for (const { m, p } of near) {
      let b = this.built.get(m.id);
      if (b && (b.info.label !== m.label || b.info.cls !== m.cls)) (this.drop(m.id, b), (b = undefined));
      if (!b) {
        const board = makeShopSign(m.label, m.cls, Math.max(2.6, Math.min(4, m.label.length * 0.36 + 1.6)), this.style, { pole: true });
        board.group.traverse((o) => (o.userData = { pick: { kind: "marker", id: m.id } }));
        if ("emissiveIntensity" in board.mat) board.mat.emissiveIntensity = this.night;
        this.scene.add(board.group);
        b = { info: m, board, x: p.x, z: p.z };
        this.built.set(m.id, b);
      }
      b.info = m;
      // Placed again each time: the streets around it may have loaded since.
      const s = this.place(p.x, p.z);
      if (!s) {
        b.board.group.visible = false;
        continue;
      }
      b.x = s.x;
      b.z = s.z;
      b.board.group.position.set(s.x, 2.6, s.z);
      b.board.group.rotation.y = s.angle;
      b.board.group.visible = !this.hidden;
    }
  }

  private drop(id: string, b: Built) {
    this.scene.remove(b.board.group);
    b.board.dispose();
    this.built.delete(id);
  }

  /** The signs light up at night (the boards' glow). */
  setNight(k: number) {
    this.night = k;
    for (const b of this.built.values()) if ("emissiveIntensity" in b.board.mat) b.board.mat.emissiveIntensity = k;
  }

  get(id: string) {
    return this.built.get(id)?.info ?? this.all.find((m) => m.id === id) ?? null;
  }

  pickables() {
    return [...this.built.values()].flatMap((b) => b.board.group.children);
  }

  /** Where the built ones stand (the minimap, the store card). */
  spots() {
    return [...this.built.values()].map((b) => ({ id: b.info.id, x: b.x, z: b.z, name: b.info.label, cls: b.info.cls, emoji: b.info.emoji, color: b.info.color }));
  }

  dispose() {
    for (const [id, b] of this.built) this.drop(id, b);
  }
}
