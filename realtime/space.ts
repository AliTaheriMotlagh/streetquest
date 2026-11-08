// A place players share: the open city (World) or one match (Match). Both referee gunfire
// the same way, here:
//
//  1. The shooter must be alive, on foot, carrying that gun, with a round in it, and not
//     firing faster than the gun can (a token bucket absorbs network bunching).
//  2. Lag compensation: each target is put back where it was at the moment the shooter
//     saw it (`at`, server clock, ≤ 350 ms ago — longer for players relayed through the
//     game server, see lib/arena/relay) before the ray is tested.
//  3. The ray must meet the target's hitbox (plus a little padding for the rewind's
//     error) within the gun's range — and, where the server knows the buildings (a
//     match), before any wall. The server decides the body part from where it hit.
//  4. Damage falls off with distance; shields (fresh spawns) and passive players take none.
//
// Grenades and C4 (lib/arena/throwables) are refereed here too: the server flies each throw
// through the buildings it knows (a match's) or takes the thrower's own landing spot when
// that's shorter (the open city, where it only knows the ground), sets it off, and deals
// the blast to whoever it can reach — walls shelter you, smoke hides you from bots.
import { aimDir, rayPlayer, type FootprintIndex, type Ray } from "../src/lib/arena/geom";
import type { ClientMsg, KillCause, LL } from "../src/lib/arena/protocol";
import { localFrame } from "../src/lib/arena/protocol";
import { blastDamage, BURN_TICK_MS, flashSeconds, fly, isThrow, smokeBlocks, smokeRadius, THROW_GAP_MS, THROW_MAX_M, THROWABLES, type ThrowDef, type Vec3 } from "../src/lib/arena/throwables";
import { damageAt, isWeapon, shotGap, WEAPON_BY_IDX, WEAPONS, type WeaponKey, type Zone } from "../src/lib/arena/weapons";
import type { Player } from "./player";

const REWIND_MAX_MS = 350;
const HIT_PAD = 0.22;
const SHOT_FX_M = 220;
const MUZZLE_SLACK_M = 3.5;

export type FireMsg = Extract<ClientMsg, { t: "fire" }>;
export type ThrowMsg = Extract<ClientMsg, { t: "throw" }>;

/** A thrown thing, from leaving the hand until its cloud or fire is gone. */
type Nade = {
  id: number;
  def: ThrowDef;
  by: Player;
  /** Where it ends up. */
  ll: LL;
  y: number;
  /** When it lands (C4 can be set off from then) and when it goes off (Infinity: C4 waiting for its owner). */
  landAt: number;
  goAt: number;
  live: boolean;
  /** A cloud's or a fire's end, and the fire's next burn. */
  until: number;
  nextBurn: number;
};
const NADE_FX_M = 300;
const finite3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

export abstract class Space {
  readonly players = new Set<Player>();
  constructor(readonly id: string) {}

  /** Can a hurt b here? */
  abstract canHurt(a: Player, b: Player, now: number): boolean;
  /** Who p can see right now. */
  abstract visible(p: Player): Iterable<Player>;
  abstract onKill(victim: Player, killer: Player | null, w: KillCause, head: boolean, now: number): void;
  /** Can p throw right now? (A match: only while the round is live.) */
  armed(p: Player, now: number) {
    void p, now;
    return true;
  }
  nades: Nade[] = [];
  private nadeId = 0;
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

  /** Is this point (a player's eye) and that one in clear sight of each other (no wall, no smoke)? */
  sight(a: LL, ay: number, b: LL, by: number, now = Date.now()) {
    const F = this.geo?.frame ?? localFrame(a);
    const pa = F.toXZ(a.lat, a.lng), pb = F.toXZ(b.lat, b.lng);
    if (this.nades.length && smokeBlocks(this.smokes(F, now), pa.x, ay, pa.z, pb.x, by, pb.z)) return false;
    return !this.geo || this.geo.index.clear(pa.x, ay, pa.z, pb.x, by, pb.z);
  }

  /** Smoke clouds now, as spheres in frame F. */
  private *smokes(F: ReturnType<typeof localFrame>, now: number) {
    for (const n of this.nades) {
      if (!n.live || n.def.key !== "smoke") continue;
      const r = smokeRadius((now - n.goAt) / 1000);
      if (r <= 0) continue;
      const q = F.toXZ(n.ll.lat, n.ll.lng);
      yield { x: q.x, y: n.y + r * 0.45, z: q.z, r };
    }
  }

  // ------------------------------------------------------------ grenades and C4
  throwNade(p: Player, m: ThrowMsg, now: number) {
    if (p.dead || !p.onFoot || p.passive || !isThrow(m.k) || !this.armed(p, now)) return;
    const def = THROWABLES[m.k];
    if ((p.gear[m.k] ?? 0) <= 0 || now - p.thrownAt < THROW_GAP_MS || !finite3(m.o) || !finite3(m.v)) return;
    // One C4 out at a time (the client sets the first one off instead).
    if (def.sticky && this.nades.some((n) => n.by === p && n.def.sticky)) return;
    const F = p.frame;
    const me = F.toXZ(p.lat, p.lng);
    const [ox, oy, oz] = m.o;
    if (Math.hypot(ox - me.x, oz - me.z) > (p.slackM || MUZZLE_SLACK_M) || Math.abs(oy - p.y - 1.4) > 2.5) return;
    if (Math.hypot(...m.v) > def.speed * 1.2 + 8) return;
    p.gear[m.k]--;
    p.thrownAt = now;
    p.passiveLockUntil = now + 12_000;

    // Fly it through the buildings we know (a match's), else over open ground in the thrower's frame.
    let restLL: LL, restY: number, landS: number, goS: number;
    if (this.geo) {
      const G = this.geo, ll = F.toLL(ox, oz), g = G.frame.toXZ(ll.lat, ll.lng);
      const f = fly(def, [g.x, oy, g.z], m.v, (r, maxT, n) => G.index.ray(r, maxT, n));
      (restLL = G.frame.toLL(f.rest[0], f.rest[2])), (restY = f.rest[1]), (landS = f.landS), (goS = f.goS);
    } else {
      const f = fly(def, m.o, m.v, () => Infinity);
      let [rx, ry, rz] = f.rest;
      // The thrower's city hit a wall sooner: believe it (it can only shorten the throw).
      if (finite3(m.rest)) {
        const mine = Math.hypot(rx - ox, rz - oz), theirs = Math.hypot(m.rest[0] - ox, m.rest[2] - oz);
        if (theirs <= mine + 0.5 && theirs <= THROW_MAX_M) [rx, ry, rz] = [m.rest[0], Math.max(0, Math.min(60, m.rest[1])), m.rest[2]];
      }
      (restLL = F.toLL(rx, rz)), (restY = ry), (landS = f.landS), (goS = f.goS);
    }
    const n: Nade = {
      id: ++this.nadeId, def, by: p, ll: restLL, y: restY,
      landAt: now + (Number.isFinite(landS) ? landS : 1) * 1000,
      goAt: Number.isFinite(goS) ? now + goS * 1000 : Infinity,
      live: false, until: 0, nextBurn: 0,
    };
    this.nades.push(n);
    // Everyone near draws the throw (the thrower too: its own copy learns the id).
    const from = F.toLL(ox, oz);
    for (const q of this.players) {
      if (q.bot || !q.ws || !this.within(q, from, NADE_FX_M)) continue;
      const o = q.frame.toXZ(from.lat, from.lng);
      q.send({ t: "nade", id: n.id, k: def.key, by: p.sid, o: [o.x, oy, o.z], v: m.v, at: now });
    }
  }

  /** Set off my C4 (once it has landed; straight away if it already has). */
  detonate(p: Player, now: number) {
    const n = this.nades.find((x) => x.by === p && x.def.sticky && !x.live);
    if (n) n.goAt = Math.max(now, n.landAt);
  }

  private within(q: Player, ll: LL, m: number) {
    const a = q.frame.toXZ(q.lat, q.lng), b = q.frame.toXZ(ll.lat, ll.lng);
    return Math.hypot(a.x - b.x, a.z - b.z) <= m;
  }

  /** Fuses, C4 going off, fires burning, clouds clearing. */
  tickNades(now: number) {
    if (!this.nades.length) return;
    for (const n of this.nades) {
      if (!n.live && now >= n.goAt) this.goOff(n, now);
      while (n.live && n.def.key === "molotov" && now >= n.nextBurn && n.nextBurn < n.until) {
        this.burn(n, n.nextBurn);
        n.nextBurn += BURN_TICK_MS;
      }
    }
    // Gone: done clouds and fires, and C4 whose owner left (it never goes off).
    this.nades = this.nades.filter((n) => (n.live ? now < n.until : n.goAt !== Infinity || this.players.has(n.by)));
  }

  private goOff(n: Nade, now: number) {
    n.live = true;
    n.until = now + n.def.lastsS * 1000;
    n.nextBurn = now;
    for (const q of this.players) {
      if (q.bot || !q.ws || !this.within(q, n.ll, NADE_FX_M)) continue;
      const p = q.frame.toXZ(n.ll.lat, n.ll.lng);
      q.send({ t: "boom", id: n.id, k: n.def.key, by: n.by.sid, x: p.x, y: n.y, z: p.z });
    }
    const k = n.def.key;
    if (k === "frag" || k === "c4") this.blast(n, now);
    else if (k === "flash") this.blind(n, now);
  }

  /** A blast: everyone it can see within its radius, by distance to their chest. */
  private blast(n: Nade, now: number) {
    const F = this.geo?.frame ?? n.by.frame;
    const c = F.toXZ(n.ll.lat, n.ll.lng), cy = n.y + 0.3;
    for (const p of [...this.players]) {
      if (p.dead || !p.placed) continue;
      const q = F.toXZ(p.lat, p.lng), py = p.y + (p.crouch ? 0.7 : 1.0);
      const d = Math.hypot(q.x - c.x, py - cy, q.z - c.z);
      if (d >= n.def.radius || !this.sight(n.ll, cy, p.ll, py, now)) continue;
      const dmg = blastDamage(n.def, d);
      // In a car the body takes less (the car takes the rest).
      if (dmg > 0) this.hurt(p, n.by, p.onFoot ? dmg : Math.round(dmg * 0.5), "body", n.def.key, now);
    }
  }

  /** Molotov: whoever stands in the fire burns. */
  private burn(n: Nade, now: number) {
    const F = this.geo?.frame ?? n.by.frame;
    const c = F.toXZ(n.ll.lat, n.ll.lng);
    for (const p of [...this.players]) {
      if (p.dead || !p.placed || !p.onFoot || p.y > n.y + 1.5) continue;
      const q = F.toXZ(p.lat, p.lng);
      if (Math.hypot(q.x - c.x, q.z - c.z) <= n.def.radius) this.hurt(p, n.by, n.def.damage, "legs", "molotov", now);
    }
  }

  /** Flashbang: bots that see it go blind (people's own screens work out theirs). */
  private blind(n: Nade, now: number) {
    const F = this.geo?.frame ?? n.by.frame;
    const c = F.toXZ(n.ll.lat, n.ll.lng), cy = n.y + 0.2;
    for (const b of this.players) {
      if (!b.bot || b.dead) continue;
      const q = F.toXZ(b.lat, b.lng), ey = b.y + 1.5;
      const dx = c.x - q.x, dy = cy - ey, dz = c.z - q.z, d = Math.hypot(dx, dy, dz) || 1;
      const a = aimDir(b.yaw, b.pitch);
      const s = flashSeconds(d, (a.dx * dx + a.dy * dy + a.dz * dz) / d, this.sight(b.ll, ey, n.ll, cy, now));
      if (s > 0) b.blindUntil = Math.max(b.blindUntil, now + s * 1000);
    }
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

    const at = Math.max(now - (shooter.rewindMs || REWIND_MAX_MS), Math.min(now, Number(m.at) || now));
    const F = shooter.frame;
    // The muzzle must be where the shooter is (their own latest position, in their frame).
    const me = F.toXZ(shooter.lat, shooter.lng);
    const [ox, oy, oz] = m.o.map(Number);
    if (![ox, oy, oz].every(Number.isFinite) || Math.hypot(ox - me.x, oz - me.z) > (shooter.slackM || MUZZLE_SLACK_M) || Math.abs(oy - shooter.y - 1.4) > 2.5) return;

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

  hurt(victim: Player, attacker: Player | null, dmg: number, zone: Zone, w: KillCause, now: number) {
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
  feed(victim: Player, killer: Player | null, w: KillCause, head: boolean) {
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
