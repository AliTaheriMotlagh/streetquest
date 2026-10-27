"use client";
// Other players in the 3D city.
//  - Drivers (from /api/drive) in their own vehicle and paint, with a name tag. Samples
//    arrive a few times a second; each one is drawn ~450 ms in the past and interpolated
//    between the two samples around that moment (entity interpolation), so motion is
//    smooth whatever the network does. Past the newest sample it coasts along its
//    heading for up to a second, then stops.
//  - Everyone else on the map (walking, or privacy-fuzzed) as a figure on the pavement.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import type { VehicleKey } from "@/lib/vehicles";
import type { WorldPlayer } from "../game/client";
import type { OtherDriver } from "./net";
import { makeVehicle, type VehicleModel } from "./vehicles3d";
import { makeIcon, makeSign, type Style } from "./world3d";

const DELAY_MS = 450;
const COAST_MS = 1000;
const MAX_SNAPS = 12;

type Snap = { t: number; x: number; z: number; alt: number; yaw: number; speed: number };
type Driver = { id: string; data: OtherDriver; model: VehicleModel; tag: ReturnType<typeof makeSign>; tagKey: string; snaps: Snap[]; spin: number; it: THREE.Mesh | null };
type Walker = { id: string; data: WorldPlayer; icon: ReturnType<typeof makeIcon>; tag: ReturnType<typeof makeSign>; group: THREE.Group; to: { x: number; z: number } };

const angle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const tagColor = (o: { friend: boolean; party?: boolean }) => (o.party ? "#63b3f2" : o.friend ? "#5bd38c" : "#ffffff");

export class Others {
  private drivers = new Map<string, Driver>();
  private walkers = new Map<string, Walker>();
  private itMat = new THREE.MeshBasicMaterial({ color: "#ff2e55", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  private itGeo = new THREE.CylinderGeometry(2.4, 2.4, 40, 16, 1, true);
  private itId: string | null = null;

  constructor(private scene: THREE.Scene, private frame: Frame, private style: Style, private lite: boolean) {
    this.itGeo.translate(0, 20, 0);
  }

  /** A fresh list from the server (server-clock timestamps). */
  setDrivers(list: OtherDriver[]) {
    const seen = new Set<string>();
    for (const o of list) {
      seen.add(o.id);
      const p = this.frame.toXZ(o.lat, o.lng);
      const snap = { t: o.at, x: p.x, z: p.z, alt: o.alt, yaw: o.yaw, speed: o.speed };
      let d = this.drivers.get(o.id);
      if (d && (d.data.vehicle !== o.vehicle || d.data.color !== o.color)) {
        this.removeDriver(d);
        d = undefined;
      }
      if (!d) {
        const model = makeVehicle(o.vehicle as VehicleKey, o.color, this.style, { shadows: !this.lite });
        const tag = makeSign(o.avatar, `${o.name} · ${o.level}`, tagColor(o));
        tag.sprite.scale.multiplyScalar(0.8);
        model.group.add(tag.sprite);
        this.scene.add(model.group);
        d = { id: o.id, data: o, model, tag, tagKey: `${o.name}|${o.level}|${tagColor(o)}`, snaps: [], spin: 0, it: null };
        this.drivers.set(o.id, d);
      }
      d.data = o;
      const key = `${o.name}|${o.level}|${tagColor(o)}`;
      if (key !== d.tagKey) {
        d.model.group.remove(d.tag.sprite);
        d.tag.dispose();
        d.tag = makeSign(o.avatar, `${o.name} · ${o.level}`, tagColor(o));
        d.tag.sprite.scale.multiplyScalar(0.8);
        d.model.group.add(d.tag.sprite);
        d.tagKey = key;
      }
      d.tag.sprite.position.y = d.model.height + 2.2;
      const last = d.snaps[d.snaps.length - 1];
      if (!last || snap.t > last.t) d.snaps.push(snap);
      if (d.snaps.length > MAX_SNAPS) d.snaps.shift();
    }
    for (const d of [...this.drivers.values()]) if (!seen.has(d.id)) this.removeDriver(d);
    this.setIt(this.itId);
  }

  /** People on the map who aren't driving: a figure where the map shows them. */
  setWalkers(players: WorldPlayer[]) {
    const seen = new Set<string>();
    for (const p of players) {
      if (this.drivers.has(p.id)) continue;
      seen.add(p.id);
      const at = this.frame.toXZ(p.lat, p.lng);
      let w = this.walkers.get(p.id);
      if (!w) {
        const group = new THREE.Group();
        const icon = makeIcon(p.avatar);
        icon.sprite.scale.setScalar(2.4);
        icon.sprite.position.y = 1.3;
        const tag = makeSign(p.home ? "🛋️" : "", `${p.username} · ${p.level}`, tagColor({ friend: p.friend }));
        tag.sprite.scale.multiplyScalar(0.7);
        tag.sprite.position.y = 3.3;
        group.add(icon.sprite, tag.sprite);
        group.position.set(at.x, 0, at.z);
        group.userData = { pick: { kind: "player", id: p.id } };
        icon.sprite.userData = group.userData;
        this.scene.add(group);
        w = { id: p.id, data: p, icon, tag, group, to: at };
        this.walkers.set(p.id, w);
      }
      w.data = p;
      w.to = at;
    }
    for (const w of [...this.walkers.values()]) if (!seen.has(w.id)) this.removeWalker(w);
  }

  /** Tag: a red column over whoever is IT. */
  setIt(id: string | null) {
    this.itId = id;
    for (const d of this.drivers.values()) {
      const want = d.id === id;
      if (want && !d.it) {
        d.it = new THREE.Mesh(this.itGeo, this.itMat);
        d.model.group.add(d.it);
      } else if (!want && d.it) {
        d.model.group.remove(d.it);
        d.it = null;
      }
    }
  }

  /** Where a driver is drawn right now (for the minimap and party HUD). */
  positions() {
    return [...this.drivers.values()].map((d) => ({ id: d.id, x: d.model.group.position.x, z: d.model.group.position.z, color: d.data.party ? "#63b3f2" : d.data.friend ? "#5bd38c" : "#ffffff" }));
  }

  /** Objects you can tap: players' name tags and figures. */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const d of this.drivers.values()) {
      d.tag.sprite.userData = { pick: { kind: "player", id: d.id } };
      out.push(d.tag.sprite);
    }
    for (const w of this.walkers.values()) out.push(w.icon.sprite);
    return out;
  }

  driver(id: string) {
    return this.drivers.get(id)?.data ?? null;
  }

  tick(dt: number, serverNow: number, camX: number, camZ: number) {
    const t = serverNow - DELAY_MS;
    for (const d of this.drivers.values()) {
      const s = d.snaps;
      if (!s.length) continue;
      let pose: Snap;
      if (t <= s[0].t) pose = s[0];
      else if (t >= s[s.length - 1].t) {
        // Past the newest sample: coast along the heading for a moment.
        const last = s[s.length - 1];
        const ahead = Math.min(COAST_MS, t - last.t) / 1000;
        pose = { ...last, x: last.x - Math.sin(last.yaw) * last.speed * ahead, z: last.z - Math.cos(last.yaw) * last.speed * ahead };
      } else {
        let i = s.length - 2;
        while (i > 0 && s[i].t > t) i--;
        const a = s[i], b = s[i + 1], k = (t - a.t) / Math.max(1, b.t - a.t);
        pose = { t, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, alt: a.alt + (b.alt - a.alt) * k, yaw: angle(a.yaw, b.yaw, k), speed: a.speed + (b.speed - a.speed) * k };
      }
      const g = d.model.group;
      g.position.set(pose.x, pose.alt, pose.z);
      g.rotation.y = pose.yaw;
      d.spin += (pose.speed / 0.36) * dt;
      for (const w of d.model.wheels) w.rotation.x = -d.spin;
      for (const r of d.model.rotors) r.obj.rotation[r.axis] += r.speed * dt;
      const blob = g.getObjectByName("blob");
      if (blob) blob.position.y = -pose.alt + 0.12;
      // Name tags only up close (they're big sprites).
      d.tag.sprite.visible = Math.hypot(pose.x - camX, pose.z - camZ) < 260;
    }
    const k = 1 - Math.exp(-dt * 2);
    for (const w of this.walkers.values()) {
      w.group.position.x += (w.to.x - w.group.position.x) * k;
      w.group.position.z += (w.to.z - w.group.position.z) * k;
      w.tag.sprite.visible = Math.hypot(w.group.position.x - camX, w.group.position.z - camZ) < 160;
    }
  }

  private removeDriver(d: Driver) {
    this.scene.remove(d.model.group);
    d.model.dispose();
    d.tag.dispose();
    this.drivers.delete(d.id);
  }

  private removeWalker(w: Walker) {
    this.scene.remove(w.group);
    w.icon.dispose();
    w.tag.dispose();
    this.walkers.delete(w.id);
  }

  dispose() {
    for (const d of [...this.drivers.values()]) this.removeDriver(d);
    for (const w of [...this.walkers.values()]) this.removeWalker(w);
    this.itMat.dispose();
    this.itGeo.dispose();
  }
}
