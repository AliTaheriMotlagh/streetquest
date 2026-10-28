// The open city: everyone driving or walking around, GTA Online's free mode.
//
// Who sees whom follows the map's privacy rules (as server/drive.ts does): friends
// always; strangers only once you've moved 300 m from where your drive began (usually
// home). Only players on a virtual position (play from home / test mode) are here at all.
//
// Fighting is opt-in: everyone starts in passive mode (can't shoot, can't be shot).
// Turning it off needs level 3; turning it back on waits until you haven't fired or been
// hit for a while, so it can't be used to escape a fight.
import { distanceM } from "../src/lib/geo";
import { FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL } from "../src/lib/arena/modes";
import type { LL } from "../src/lib/arena/protocol";
import type { WeaponKey } from "../src/lib/arena/weapons";
import type { Player } from "./player";
import { Space } from "./space";

const VIEW_M = 600;
const PRIVATE_START_M = 300;
const CELL = 0.006; // ≈ 600 m of latitude
const RESPAWN_NEAR_M = 400;
const FEED_M = 500;

export class World extends Space {
  private grid = new Map<string, Player[]>();

  constructor() {
    super("world");
  }

  private key(lat: number, lng: number) {
    return `${Math.floor(lat / CELL)}_${Math.floor((lng * Math.cos((lat * Math.PI) / 180)) / CELL)}`;
  }

  /** Rebuild the spatial grid (once per tick). */
  index() {
    this.grid.clear();
    for (const p of this.players) {
      if (!p.placed) continue;
      const k = this.key(p.lat, p.lng);
      const list = this.grid.get(k);
      if (list) list.push(p);
      else this.grid.set(k, [p]);
    }
  }

  private friends(a: Player, b: Player) {
    return a.friends.has(b.userId) || b.friends.has(a.userId);
  }

  /** May `viewer` see `p` at all (privacy)? */
  shows(viewer: Player, p: Player) {
    if (this.friends(viewer, p)) return true;
    return !!p.start && distanceM(p.ll, p.start) > PRIVATE_START_M;
  }

  *near(p: Player, m: number) {
    const cy = Math.floor(p.lat / CELL), cx = Math.floor((p.lng * Math.cos((p.lat * Math.PI) / 180)) / CELL);
    const r = Math.ceil(m / 600);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        for (const o of this.grid.get(`${cy + dy}_${cx + dx}`) ?? []) if (o !== p && distanceM(p.ll, o.ll) <= m) yield o;
  }

  *visible(p: Player) {
    if (!p.placed) return;
    for (const o of this.near(p, VIEW_M)) if (this.shows(p, o)) yield o;
  }

  canHurt(a: Player, b: Player, now: number) {
    void now;
    if (a === b) return true;
    if (a.passive || b.passive || a.level < ROOKIE_LEVEL || b.level < ROOKIE_LEVEL) return false;
    return this.shows(a, b) && this.shows(b, a);
  }

  onKill(victim: Player, killer: Player | null, w: WeaponKey | "zone" | "bomb", head: boolean, now: number) {
    victim.respawnAt = now + FREE_RESPAWN_S * 1000;
    victim.deaths++;
    if (killer && killer !== victim) killer.kills++;
    const m = { t: "kill" as const, killer: killer?.sid ?? 0, victim: victim.sid, w, head, killerName: killer?.name ?? "", victimName: victim.name, killerTeam: 0 as const, victimTeam: 0 as const };
    victim.send(m);
    for (const o of this.near(victim, FEED_M)) o.send(m);
    victim.status(this.id);
    killer?.status(this.id);
  }

  setPassive(p: Player, on: boolean, now: number) {
    if (on === p.passive) return p.status(this.id);
    if (!on && p.level < ROOKIE_LEVEL) return p.send({ t: "err", text: "Fighting in the open city unlocks at level {n}", vars: { n: ROOKIE_LEVEL } });
    if (on && now < p.passiveLockUntil) return p.send({ t: "err", text: "You were just in a fight — passive mode in {s} s", vars: { s: Math.ceil((p.passiveLockUntil - now) / 1000) } });
    p.passive = on;
    if (!on) p.passiveLockUntil = now + PASSIVE_COOLDOWN_S * 1000;
    p.status(this.id);
  }

  /** Back on your feet near where you fell (the client picks a street). */
  respawn(p: Player, at: LL, y: number, now: number) {
    if (!p.dead || now < p.respawnAt) return;
    if (p.deathLL && distanceM(p.deathLL, at) > RESPAWN_NEAR_M) at = p.deathLL;
    p.revive(now, 3);
    p.place(at, Math.max(0, Math.min(3, y)), p.yaw, now);
    p.status(this.id);
  }
}
