"use client";
// Everyone else on foot, drawn a little in the past and interpolated between the two
// samples around that moment (coasting briefly past the newest): ~110 ms behind on the
// realtime link's 20 Hz snapshots, ~450 ms behind on the HTTP presence (a few reports a
// second). Players on foot are soldiers (avatar.ts); players driving on the realtime link
// are handed to the city's vehicle renderer (drive/others.ts), which interpolates the same way.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { TEAM_COLORS } from "@/lib/arena/modes";
import { F_AIR, F_CROUCH, F_DEAD, F_FOOT, G_BOT, G_PASSIVE, G_SHIELD, type RosterEntry, type SnapEntity } from "@/lib/arena/protocol";
import { WEAPON_BY_IDX } from "@/lib/arena/weapons";
import { VEHICLE_KEYS, type VehicleKey } from "@/lib/vehicles";
import type { OtherDriver } from "../drive/net";
import type { Others } from "../drive/others";
import { makeSign } from "../drive/world3d";
import { Avatar, loadSoldier } from "./avatar";

export const RT_DELAY_MS = 110;
export const HTTP_DELAY_MS = 450;
const COAST_MS = 300;
const MAX_SNAPS = 20;

type Snap = SnapEntity & { t: number };
type Sign = ReturnType<typeof makeSign>;
export type Target = { sid: number; x: number; y: number; z: number; crouch: boolean; foot: boolean; team: number; passive: boolean; shield: boolean; dead: boolean; bot: boolean; hp: number };

type Ent = {
  sid: number;
  info: RosterEntry | null;
  snaps: Snap[];
  /** How far behind (ms) it's drawn. */
  delay: number;
  avatar: Avatar | null;
  tag: Sign | null;
  tagKey: string;
  pose: Target & { yaw: number; pitch: number; vx: number; vz: number; air: boolean; weapon: number };
};

const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Remotes {
  private ents = new Map<number, Ent>();
  private template: Awaited<ReturnType<typeof loadSoldier>> | null = null;
  /** Team I'm on in a match (0 = free roam / deathmatch): decides tag colours. */
  myTeam = 0;
  inMatch = false;
  /** Realtime snapshots draw the drivers too (off when the HTTP presence draws them). */
  ownsDrivers = true;

  constructor(private scene: THREE.Scene, private frame: Frame, private others: Others, private shadows: boolean) {
    loadSoldier().then((t) => (this.template = t)).catch(() => {});
  }

  roster(add: RosterEntry[], del: number[]) {
    for (const r of add) {
      const e = this.ents.get(r.sid) ?? this.make(r.sid);
      e.info = r;
      e.tagKey = "";
      this.others.setSoldier(r.id, true);
    }
    for (const sid of del) this.drop(sid);
  }

  private make(sid: number): Ent {
    const e: Ent = {
      sid, info: null, snaps: [], delay: RT_DELAY_MS, avatar: null, tag: null, tagKey: "",
      pose: { sid, x: 0, y: 0, z: 0, crouch: false, foot: true, team: 0, passive: true, shield: false, dead: false, bot: false, hp: 100, yaw: 0, pitch: 0, vx: 0, vz: 0, air: false, weapon: 0 },
    };
    this.ents.set(sid, e);
    return e;
  }

  private drop(sid: number) {
    const e = this.ents.get(sid);
    if (!e) return;
    if (e.info) this.others.setSoldier(e.info.id, false);
    e.avatar?.dispose();
    if (e.tag) (e.tag.sprite.removeFromParent(), e.tag.dispose());
    this.ents.delete(sid);
  }

  /** One sample of one player, at time t (on the clock tick() is given). */
  push(s: SnapEntity, t: number, delay: number) {
    const e = this.ents.get(s.sid) ?? this.make(s.sid);
    e.delay = delay;
    const last = e.snaps[e.snaps.length - 1];
    if (!last || t > last.t) e.snaps.push({ ...s, t });
    if (e.snaps.length > MAX_SNAPS) e.snaps.shift();
    return e;
  }

  snap(t: number, list: SnapEntity[]) {
    const drivers: OtherDriver[] = [];
    for (const s of list) {
      const e = this.push(s, t, RT_DELAY_MS);
      if (!(s.flags & F_FOOT) && e.info) {
        const ll = this.frame.toLatLng(s.x, s.z);
        drivers.push({
          id: e.info.id, name: e.info.name, avatar: e.info.avatar, level: e.info.level, vehicle: (VEHICLE_KEYS[s.vehicle] ?? "car") as VehicleKey, color: e.info.color,
          lat: ll.lat, lng: ll.lng, alt: s.y, yaw: s.yaw, speed: Math.hypot(s.vx, s.vz), at: t, friend: e.info.friend, party: false,
          flags: s.flags, pitch: s.pitch, weapon: s.weapon, hp: s.hp, passive: (s.flags2 & G_PASSIVE) !== 0,
        });
      }
    }
    if (this.ownsDrivers) this.others.setDrivers(drivers);
  }

  /** Where each player is drawn now; soldiers posed and animated. */
  tick(dt: number, serverNow: number, cam: THREE.Vector3) {
    for (const e of this.ents.values()) {
      const t = serverNow - e.delay;
      const s = e.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0], k = 0;
      if (t >= s[s.length - 1].t) a = b = s[s.length - 1];
      else if (t > s[0].t) {
        let i = s.length - 2;
        while (i > 0 && s[i].t > t) i--;
        (a = s[i]), (b = s[i + 1]), (k = (t - a.t) / Math.max(1, b.t - a.t));
      }
      const p = e.pose;
      const coast = a === b ? Math.min(COAST_MS, Math.max(0, t - a.t)) / 1000 : 0;
      p.x = a.x + (b.x - a.x) * k + a.vx * coast;
      p.z = a.z + (b.z - a.z) * k + a.vz * coast;
      p.y = a.y + (b.y - a.y) * k;
      p.yaw = lerpAngle(a.yaw, b.yaw, k);
      p.pitch = a.pitch + (b.pitch - a.pitch) * k;
      p.vx = a.vx + (b.vx - a.vx) * k;
      p.vz = a.vz + (b.vz - a.vz) * k;
      const f = b.flags, g = b.flags2;
      p.foot = (f & F_FOOT) !== 0;
      p.crouch = (f & F_CROUCH) !== 0;
      p.air = (f & F_AIR) !== 0;
      p.dead = (f & F_DEAD) !== 0;
      p.passive = (g & G_PASSIVE) !== 0;
      p.shield = (g & G_SHIELD) !== 0;
      p.bot = (g & G_BOT) !== 0;
      p.team = b.team;
      p.hp = b.hp;
      p.weapon = b.weapon;

      // Soldiers for players on foot.
      if (p.foot && this.template) {
        if (!e.avatar) {
          const uniform = e.info?.bot ? "#6f7684" : "#7d8a6a";
          e.avatar = new Avatar(this.template, uniform, "#d7263d", this.shadows);
          this.scene.add(e.avatar.group);
        }
        const av = e.avatar;
        const far = Math.hypot(p.x - cam.x, p.z - cam.z);
        av.group.visible = far < 320;
        av.group.position.set(p.x, p.y, p.z);
        av.setWeapon(WEAPON_BY_IDX[p.weapon] ?? "rifle");
        const accent = this.inMatch && p.team ? TEAM_COLORS[p.team as 1 | 2] : e.info?.friend ? "#5bd38c" : p.passive ? "#9aa4b2" : "#e5484d";
        const key = `${accent}|${e.info?.name}|${p.team}|${p.dead}`;
        if (key !== e.tagKey && e.info) {
          e.tagKey = key;
          av.setColors(e.info.bot ? "#6f7684" : "#7d8a6a", accent);
          if (e.tag) (e.tag.sprite.removeFromParent(), e.tag.dispose());
          const enemy = this.inMatch && (!p.team || p.team !== this.myTeam);
          // Bots carry 🤖 in their name already.
          e.tag = makeSign(e.info.bot ? "" : e.info.avatar, e.info.bot ? e.info.name : `${e.info.name} · ${e.info.level}`, enemy ? "#ff8a8a" : e.info.friend ? "#5bd38c" : "#ffffff");
          e.tag.sprite.scale.multiplyScalar(0.55);
          e.tag.sprite.position.y = 2.35;
          av.group.add(e.tag.sprite);
        }
        if (e.tag) e.tag.sprite.visible = !p.dead && far < (this.inMatch ? 45 : 120);
        if (av.group.visible) av.update(dt, { vx: p.vx, vz: p.vz, yaw: p.yaw, pitch: p.pitch, crouch: p.crouch, air: p.air, dead: p.dead }, far);
      } else if (e.avatar) {
        e.avatar.dispose();
        e.avatar = null;
        if (e.tag) (e.tag.dispose(), (e.tag = null), (e.tagKey = ""));
      }
    }
  }

  /** Everyone as they're drawn right now (what my bullets can hit). */
  targets(): Target[] {
    const out: Target[] = [];
    for (const e of this.ents.values()) if (e.snaps.length) out.push(e.pose);
    return out;
  }

  info(sid: number) {
    return this.ents.get(sid)?.info ?? null;
  }

  pose(sid: number) {
    return this.ents.get(sid)?.pose ?? null;
  }

  /** The muzzle of a soldier's gun (for remote shots' flashes), if drawn. */
  muzzle(sid: number, out: THREE.Vector3) {
    const av = this.ents.get(sid)?.avatar;
    return av?.group.visible ? av.muzzle(out) : null;
  }

  dots() {
    const out: { x: number; z: number; color: string }[] = [];
    for (const e of this.ents.values()) {
      const p = e.pose;
      if (!e.snaps.length || !p.foot || p.dead) continue;
      out.push({ x: p.x, z: p.z, color: this.inMatch && p.team ? TEAM_COLORS[p.team as 1 | 2] : e.info?.friend ? "#5bd38c" : "#ffffff" });
    }
    return out;
  }

  clear() {
    for (const sid of [...this.ents.keys()]) this.drop(sid);
    if (this.ownsDrivers) this.others.setDrivers([]);
  }

  dispose() {
    this.clear();
  }
}
