// A place players share: the open city (World) or one match (Match). Both referee gunfire
// the same way, here:
//
//  1. The shooter must be alive, on foot, carrying that gun, with a round in it, and not
//     firing faster than the gun can (a token bucket absorbs network bunching).
//  2. Lag compensation: each target is put back where it was at the moment the shooter
//     saw it (`at`, server clock, ≤ 350 ms ago) before the ray is tested.
//  3. The ray must meet the target's hitbox (plus a little padding for the rewind's
//     error) within the gun's range — and, where the server knows the buildings (a
//     match), before any wall. The server decides the body part from where it hit.
//  4. Damage falls off with distance; shields (fresh spawns) and passive players take none.
import { rayPlayer, type FootprintIndex, type Ray } from "../src/lib/arena/geom";
import type { ClientMsg, LL } from "../src/lib/arena/protocol";
import { localFrame } from "../src/lib/arena/protocol";
import { damageAt, isWeapon, shotGap, WEAPON_BY_IDX, WEAPONS, type WeaponKey, type Zone } from "../src/lib/arena/weapons";
import type { Player } from "./player";

const REWIND_MAX_MS = 350;
const HIT_PAD = 0.22;
const SHOT_FX_M = 220;
const MUZZLE_SLACK_M = 3.5;

export type FireMsg = Extract<ClientMsg, { t: "fire" }>;

export abstract class Space {
  readonly players = new Set<Player>();
  constructor(readonly id: string) {}

  /** Can a hurt b here? */
  abstract canHurt(a: Player, b: Player, now: number): boolean;
  /** Who p can see right now. */
  abstract visible(p: Player): Iterable<Player>;
  abstract onKill(victim: Player, killer: Player | null, w: WeaponKey | "zone" | "bomb", head: boolean, now: number): void;
  /** Buildings, in this space's frame (matches only). */
  geo: { frame: ReturnType<typeof localFrame>; index: FootprintIndex } | null = null;

  add(p: Player) {
    this.players.add(p);
    p.space = this;
    p.known.clear();
  }
  remove(p: Player) {
    this.players.delete(p);
    if (p.space === this) p.space = null;
  }

  /** Is this point (a player's eye) and that one in clear sight of each other? */
  sight(a: LL, ay: number, b: LL, by: number) {
    if (!this.geo) return true;
    const pa = this.geo.frame.toXZ(a.lat, a.lng), pb = this.geo.frame.toXZ(b.lat, b.lng);
    return this.geo.index.clear(pa.x, ay, pa.z, pb.x, by, pb.z);
  }

  // ------------------------------------------------------------ gunfire
  fire(shooter: Player, m: FireMsg, now: number) {
    if (shooter.dead || !shooter.onFoot || !isWeapon(m.w) || !shooter.loadout.includes(m.w)) return;
    const w = WEAPONS[m.w];
    if (!Array.isArray(m.o) || m.o.length !== 3 || !Array.isArray(m.d) || !m.d.length || m.d.length > w.pellets) return;
    if (now < shooter.reloadUntil) return;
    // Fire rate.
    const b = shooter.bucket.get(m.w) ?? { tokens: 2, at: now };
    b.tokens = Math.min(3, b.tokens + (now - b.at) / 1000 / shotGap(w));
    b.at = now;
    shooter.bucket.set(m.w, b);
    if (b.tokens < 0.85) return;
    b.tokens -= 1;
    const ammo = shooter.ammo.get(m.w) ?? 0;
    if (ammo <= 0) return;
    shooter.ammo.set(m.w, ammo - 1);
    // Firing ends passive mode's protection for a while (and you can't fire while passive).
    if (shooter.passive) return;
    shooter.passiveLockUntil = now + 12_000;

    const at = Math.max(now - REWIND_MAX_MS, Math.min(now, Number(m.at) || now));
    const F = shooter.frame;
    // The muzzle must be where the shooter is (their own latest position, in their frame).
    const me = F.toXZ(shooter.lat, shooter.lng);
    const [ox, oy, oz] = m.o.map(Number);
    if (![ox, oy, oz].every(Number.isFinite) || Math.hypot(ox - me.x, oz - me.z) > MUZZLE_SLACK_M || Math.abs(oy - shooter.y - 1.4) > 2.5) return;

    // Who could be hit, where they were then (in the shooter's frame).
    const targets: { p: Player; x: number; y: number; z: number; crouch: boolean }[] = [];
    for (const p of this.players) {
      if (p === shooter || p.dead || !p.placed || !this.canHurt(shooter, p, now)) continue;
      const s = p.at(at);
      const q = F.toXZ(s.lat, s.lng);
      if (Math.hypot(q.x - ox, q.z - oz) > w.range + 2) continue;
      targets.push({ p, x: q.x, y: s.y, z: q.z, crouch: p.onFoot ? s.crouch : false });
    }
    const damage = new Map<Player, { dmg: number; zone: Zone; head: boolean }>();
    let tracerEnd: { x: number; y: number; z: number } | null = null;
    for (const d of m.d) {
      if (!Array.isArray(d) || d.length !== 3) continue;
      let [dx, dy, dz] = d.map(Number);
      const l = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(l) || l < 0.5) continue;
      (dx /= l), (dy /= l), (dz /= l);
      const ray: Ray = { ox, oy, oz, dx, dy, dz };
      let best: { p: Player; t: number; zone: Zone } | null = null;
      for (const tg of targets) {
        // Inside a vehicle: one box for the driver, a little higher.
        const hit = tg.p.onFoot ? rayPlayer(ray, tg.x, tg.y, tg.z, tg.crouch, HIT_PAD) : rayPlayer(ray, tg.x, tg.y + 0.2, tg.z, true, 0.45);
        if (hit && hit.t <= w.range && (!best || hit.t < best.t)) best = { p: tg.p, t: hit.t, zone: tg.p.onFoot ? hit.zone : "body" };
      }
      let wall = Infinity;
      if (this.geo) {
        const ll = F.toLL(ox, oz), g = this.geo.frame.toXZ(ll.lat, ll.lng);
        wall = this.geo.index.ray({ ox: g.x, oy, oz: g.z, dx, dy, dz }, best ? best.t : w.range);
      }
      const end = Math.min(best?.t ?? w.range, wall, w.range);
      tracerEnd ??= { x: ox + dx * end, y: oy + dy * end, z: oz + dz * end };
      if (!best || wall < best.t) continue;
      const dmg = damageAt(w, best.t, best.zone);
      const cur = damage.get(best.p);
      if (cur) cur.dmg += dmg;
      else damage.set(best.p, { dmg, zone: best.zone, head: best.zone === "head" });
    }
    // Everyone near hears the shot and sees the tracer (in their own frame).
    if (tracerEnd) {
      const o = F.toLL(ox, oz), e = F.toLL(tracerEnd.x, tracerEnd.z);
      for (const p of this.players) {
        if (p === shooter || p.bot || !p.ws) continue;
        const pp = p.frame.toXZ(p.lat, p.lng), po = p.frame.toXZ(o.lat, o.lng);
        if (Math.hypot(pp.x - po.x, pp.z - po.z) > SHOT_FX_M) continue;
        const pe = p.frame.toXZ(e.lat, e.lng);
        p.send({ t: "shot", sid: shooter.sid, w: m.w, x: po.x, y: oy, z: po.z, ex: pe.x, ey: tracerEnd.y, ez: pe.z });
      }
    }
    for (const [victim, d] of damage) this.hurt(victim, shooter, d.dmg, d.zone, m.w, now);
  }

  /** A server-side shot (bots): damage straight to a target, with a tracer for everyone near. */
  botShot(shooter: Player, target: Player | null, w: WeaponKey, hit: { zone: Zone } | null, miss: { lat: number; lng: number; y: number } | null, now: number) {
    const ammo = shooter.ammo.get(w) ?? 0;
    if (ammo <= 0) return;
    shooter.ammo.set(w, ammo - 1);
    const fromY = shooter.y + (shooter.crouch ? 1.05 : 1.45);
    const end = hit && target ? { lat: target.lat, lng: target.lng, y: target.y + (hit.zone === "head" ? 1.65 : hit.zone === "legs" ? 0.6 : 1.2) } : miss;
    if (end)
      for (const p of this.players) {
        if (p.bot || !p.ws) continue;
        const po = p.frame.toXZ(shooter.lat, shooter.lng), me = p.frame.toXZ(p.lat, p.lng);
        if (Math.hypot(po.x - me.x, po.z - me.z) > SHOT_FX_M) continue;
        const pe = p.frame.toXZ(end.lat, end.lng);
        p.send({ t: "shot", sid: shooter.sid, w, x: po.x, y: fromY, z: po.z, ex: pe.x, ey: end.y, ez: pe.z });
      }
    if (hit && target) {
      const F = shooter.frame;
      const a = F.toXZ(shooter.lat, shooter.lng), b = F.toXZ(target.lat, target.lng);
      this.hurt(target, shooter, damageAt(WEAPONS[w], Math.hypot(a.x - b.x, a.z - b.z), hit.zone), hit.zone, w, now);
    }
  }

  hurt(victim: Player, attacker: Player | null, dmg: number, zone: Zone, w: WeaponKey | "zone" | "bomb", now: number) {
    if (victim.dead || now < victim.shieldUntil) return;
    if (attacker && !this.canHurt(attacker, victim, now)) return;
    victim.hp = Math.max(0, victim.hp - dmg);
    victim.lastHurtAt = now;
    victim.lastHurtBy = attacker?.sid ?? 0;
    victim.passiveLockUntil = now + 12_000;
    const kill = victim.hp <= 0;
    const from = attacker ?? victim;
    const fp = victim.frame.toXZ(from.lat, from.lng);
    const msg = { t: "hit" as const, from: attacker?.sid ?? 0, to: victim.sid, dmg, zone, hp: victim.hp, kill, fx: fp.x, fz: fp.z };
    victim.send(msg);
    if (attacker && attacker !== victim) attacker.send(msg);
    if (kill) {
      victim.dead = true;
      victim.diedAt = now;
      victim.deathLL = victim.ll;
      victim.actingUntil = 0;
      // (A bomb carrier's bomb is dropped by the match's onKill, which needs `carrying`.)
      this.onKill(victim, attacker, w, zone === "head", now);
    }
  }

  /** Tell everyone in the space about a kill (the kill feed). */
  feed(victim: Player, killer: Player | null, w: WeaponKey | "zone" | "bomb", head: boolean) {
    const m = { t: "kill" as const, killer: killer?.sid ?? 0, victim: victim.sid, w, head, killerName: killer?.name ?? "", victimName: victim.name, killerTeam: killer?.team ?? 0, victimTeam: victim.team };
    for (const p of this.players) p.send(m);
  }

  reload(p: Player, now: number) {
    const w = WEAPONS[weaponOf(p)];
    if (p.dead || now < p.reloadUntil || (p.ammo.get(w.key) ?? 0) >= w.mag) return;
    p.reloading = w.key;
    // A little under the animation's length, for latency.
    p.reloadUntil = now + w.reloadS * 900;
  }

  /** Finish reloads whose time is up. */
  tickReloads(now: number) {
    for (const p of this.players)
      if (p.reloading && now >= p.reloadUntil) {
        p.ammo.set(p.reloading, WEAPONS[p.reloading].mag);
        p.reloading = null;
      }
  }
}

/** The gun in their hands (what their state says, if they carry it). */
export const weaponOf = (p: Player): WeaponKey => {
  const w = WEAPON_BY_IDX[p.weapon];
  return w && p.loadout.includes(w) ? w : p.loadout[0];
};
