"use client";
// Everything else on the game map, standing in the 3D city: bases, bosses, outposts,
// towers, flags, events, lotteries, player shops, businesses, notes, missions, deliveries, rides,
// pings, missile strikes, marching squads and run/derrick spawns. Each is a marker you
// can tap (→ its card in the game, or navigate there). Only the nearest ones are built,
// and their name signs show up close.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { t } from "@/lib/i18n";
import type { Selected, World } from "../game/client";
import { makeBeacon } from "./world3d";

export type MarkerInfo = { id: string; sel: Selected; emoji: string; color: string; label: string; lat: number; lng: number; tall: boolean; size: number };

const MINE = "#5bd38c", FRIEND = "#63b3f2", ENEMY = "#ff4d5e";
const side = (mine: boolean, friend: boolean) => (mine ? MINE : friend ? FRIEND : ENEMY);

/** Every world entity that isn't already a job beacon, loot or a player. */
export function markersOf(w: World | null, now: number): MarkerInfo[] {
  if (!w) return [];
  const out: MarkerInfo[] = [];
  const push = (m: Omit<MarkerInfo, "tall" | "size"> & { tall?: boolean; size?: number }) => out.push({ tall: false, size: 1, ...m });
  for (const s of w.spawns) {
    if (s.claimed || (s.kind !== "run" && s.kind !== "derrick")) continue;
    if (s.kind === "run") push({ id: `s:${s.id}`, sel: { type: "spawn", data: s }, emoji: "🏁", color: "#ff7ad9", label: s.run ? t(s.run.title) : t("Street Race"), lat: s.lat, lng: s.lng });
    else push({ id: `s:${s.id}`, sel: { type: "spawn", data: s }, emoji: "🛢️", color: "#ffb703", label: t("Oil derrick"), lat: s.lat, lng: s.lng });
  }
  for (const m of w.missions) if (!m.claimed) push({ id: `m:${m.id}`, sel: { type: "mission", data: m }, emoji: m.item?.emoji ?? "🎯", color: "#f0c05a", label: m.title, lat: m.lat, lng: m.lng, tall: !!m.sponsor });
  for (const n of w.notes) push({ id: `n:${n.id}`, sel: { type: "note", data: n }, emoji: "📝", color: "#ffb4c6", label: n.author.username, lat: n.lat, lng: n.lng });
  for (const e of w.events) push({ id: `e:${e.id}`, sel: { type: "event", data: e }, emoji: "🎉", color: "#ff7ad9", label: e.title, lat: e.lat, lng: e.lng, tall: true });
  for (const d of w.deliveries) push({ id: `d:${d.id}`, sel: { type: "delivery", data: d }, emoji: "📦", color: "#ffb347", label: d.title, lat: d.pickupLat, lng: d.pickupLng });
  for (const r of w.rides) push({ id: `r:${r.id}`, sel: { type: "ride", data: r }, emoji: "🚕", color: "#f0c05a", label: r.pickupLabel, lat: r.pickupLat, lng: r.pickupLng });
  for (const l of w.lotteries) if (l.status === "OPEN") push({ id: `l:${l.id}`, sel: { type: "lottery", data: l }, emoji: "🎟️", color: "#c084fc", label: l.name, lat: l.lat, lng: l.lng, tall: l.official });
  // Businesses with an open campaign are job beacons (Drive.jobsFrom); the rest stand here.
  for (const b of w.businesses)
    if (b.mine || !b.campaigns.some((c) => !c.visited))
      push({ id: `bz:${b.id}`, sel: { type: "biz", data: b }, emoji: b.emoji, color: b.featured ? "#f0c05a" : b.mine ? FRIEND : "#ff7ad9", label: b.name, lat: b.lat, lng: b.lng, tall: b.featured });
  for (const s of w.shops) if (s.live || s.mine) push({ id: `sh:${s.id}`, sel: { type: "shop", data: s }, emoji: s.emoji, color: s.deal ? "#ff7ad9" : "#63b3f2", label: s.deal ? `${s.name} · −${s.deal}%` : s.name, lat: s.lat, lng: s.lng });
  for (const b of w.bases) push({ id: `b:${b.id}`, sel: { type: "base", data: b }, emoji: "🏰", color: side(b.mine, b.friend), label: `${b.name} · ${b.owner.username}`, lat: b.lat, lng: b.lng, tall: true, size: 1.2 });
  for (const b of w.bosses) if (b.hp > 0) push({ id: `boss:${b.id}`, sel: { type: "boss", data: b }, emoji: b.def.emoji, color: "#ff2e55", label: t(b.def.name), lat: b.lat, lng: b.lng, tall: true, size: 1.5 });
  for (const o of w.outposts) push({ id: `o:${o.id}`, sel: { type: "outpost", data: o }, emoji: "⛺", color: o.mine ? MINE : o.owner ? ENEMY : "#ffb703", label: o.name, lat: o.lat, lng: o.lng });
  for (const tw of w.towers) push({ id: `t:${tw.id}`, sel: { type: "tower", data: tw }, emoji: "🗼", color: side(tw.mine, tw.friend), label: tw.owner, lat: tw.lat, lng: tw.lng });
  for (const f of w.flags) push({ id: `f:${f.id}`, sel: { type: "flag", data: f }, emoji: "🚩", color: side(f.mine, f.friend), label: f.name, lat: f.lat, lng: f.lng, tall: !!f.capture });
  for (const p of w.pings) if (p.expiresAt > now) push({ id: `p:${p.id}`, sel: { type: "ping", data: p }, emoji: "❗", color: "#f0c05a", label: p.by, lat: p.lat, lng: p.lng });
  for (const s of w.strikes) if (!s.resolved || (s.hazardUntil ?? 0) > now) push({ id: `x:${s.id}`, sel: { type: "strike", data: s }, emoji: "☢️", color: "#ff2e55", label: s.owner, lat: s.lat, lng: s.lng, tall: true, size: 1.3 });
  for (const q of w.squads) {
    // Marching squads: where they are on their way right now.
    const k = q.status === "MARCH" && q.arriveAt > q.departAt ? Math.max(0, Math.min(1, (now - q.departAt) / (q.arriveAt - q.departAt))) : 1;
    push({ id: `q:${q.id}`, sel: { type: "squad", data: q }, emoji: q.icon || "🪖", color: side(q.mine, q.friend), label: q.owner, lat: q.fromLat + (q.toLat - q.fromLat) * k, lng: q.fromLng + (q.toLng - q.fromLng) * k });
  }
  return out;
}

type Built = { info: MarkerInfo; beacon: ReturnType<typeof makeBeacon> };

export class Markers {
  private built = new Map<string, Built>();
  private all: MarkerInfo[] = [];

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
