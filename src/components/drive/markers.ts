"use client";
// The game's businesses (real stores that joined, lib/business.ts) standing in the 3D city as
// real shops: each one takes over its own shop front on the map when there is one (the shop
// sign of the same name close by, or the nearest one right where it is), else a sign on a pole
// at the kerb in front of it. Storefronts (storefronts.ts) draws them like every other store —
// in their own colours with their logo, banner line and menu from Starter up, with a lit
// billboard from Pro up. Store missions are job beacons on top (Drive). Tapping the sign opens
// its card; only the nearest ones are placed.
import type { Frame } from "@/lib/city";
import type { BizLook } from "@/lib/business";
import type { Selected, World } from "../game/client";
import type { ShopLabel, StorePanel } from "./storefronts";

export type MarkerInfo = { id: string; sel: Selected; emoji: string; color: string; label: string; cls: string; lat: number; lng: number; look: BizLook };

export function markersOf(w: World | null): MarkerInfo[] {
  if (!w) return [];
  return w.businesses.map((b) => ({ id: `bz:${b.id}`, sel: { type: "biz", data: b }, emoji: b.emoji, color: b.look.tier === "featured" ? "#f0c05a" : b.mine ? "#63b3f2" : (b.look.color || "#c9a05a"), label: b.name, cls: b.category, lat: b.lat, lng: b.lng, look: b.look }));
}

/** What a business's sign and panel show (Storefronts.setInfo). */
export const panelOf = (m: MarkerInfo): StorePanel => ({
  name: m.label,
  logo: m.look.logo ?? undefined,
  week: m.look.week,
  items: m.look.menu.length ? m.look.menu : undefined,
  brand: { tier: m.look.tier, color: m.look.color, tagline: m.look.tagline },
});

/** Where a sign stands for a store at (x, z) (Drive: on the pavement in front of it, facing the street). */
/** Null: no pavement for it there (a junction, a road with no kerb) — the sign isn't put up rather than stand in the street. */
export type SignPlace = (x: number, z: number) => { x: number; z: number; angle: number } | null;
/** The map's own shop front for a store at (x, z) called `name` (its sign spot on the wall), or null. */
export type FacadeFind = (x: number, z: number, name: string) => { id: string; x: number; y: number; z: number; angle: number; w: number } | null;

type Placed = { info: MarkerInfo; label: ShopLabel; facade: string | null };

export class Markers {
  private placed = new Map<string, Placed>();
  private all: MarkerInfo[] = [];
  /** Out of the way (a match is on). */
  hidden = false;

  constructor(private frame: Frame, private max: number, private place: SignPlace, private facade: FacadeFind) {}

  set(list: MarkerInfo[]) {
    this.all = list;
  }

  /** Keep the nearest `max` placed (within 320 m — a billboard is seen from far); call a few times a second. */
  sync(x: number, z: number) {
    const near = this.all
      .map((m) => ({ m, p: this.frame.toXZ(m.lat, m.lng) }))
      .map((e) => ({ ...e, d: Math.hypot(e.p.x - x, e.p.z - z) }))
      .filter((e) => e.d < 320)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.max);
    const keep = new Set(near.map((e) => e.m.id));
    for (const id of this.placed.keys()) if (!keep.has(id)) this.placed.delete(id);
    for (const { m, p } of near) {
      // Placed again each time: the streets and shop fronts around it may have loaded since.
      const f = this.facade(p.x, p.z, m.label);
      const w = Math.min(7.5, Math.max(2.6, m.label.length * 0.36 + 1.6));
      let label: ShopLabel;
      if (f) label = { id: m.id, text: m.label, cls: m.cls, x: f.x, y: f.y, z: f.z, angle: f.angle, w: Math.max(f.w, w), d: 0 };
      else {
        const s = this.place(p.x, p.z);
        if (!s) {
          this.placed.delete(m.id);
          continue;
        }
        label = { id: m.id, text: m.label, cls: m.cls, x: s.x, y: 2.6, z: s.z, angle: s.angle, w: Math.min(4.2, w), pole: true, d: 0 };
      }
      label.d = Math.hypot(label.x - x, label.z - z);
      this.placed.set(m.id, { info: m, label, facade: f?.id ?? null });
    }
  }

  get(id: string) {
    return this.placed.get(id)?.info ?? this.all.find((m) => m.id === id) ?? null;
  }

  /** The businesses' sign spots, for Storefronts (none while hidden). */
  labels(): ShopLabel[] {
    return this.hidden ? [] : [...this.placed.values()].map((p) => p.label);
  }

  /** The map's shop fronts a business has taken over (their own signs step aside). */
  claimed(): Set<string> {
    return new Set([...this.placed.values()].flatMap((p) => (p.facade ? [p.facade] : [])));
  }

  /** Where the placed ones stand (the minimap, the store card). */
  spots() {
    return [...this.placed.values()].map((p) => ({ id: p.info.id, x: p.label.x, z: p.label.z, name: p.info.label, cls: p.info.cls, emoji: p.info.emoji, color: p.info.color }));
  }

  dispose() {
    this.placed.clear();
  }
}
