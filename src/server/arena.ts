// Street Arena fights in the open city without the realtime server (serverless: the game
// on Vercel). Positions already flow through /api/drive (DriveState); this adds health.
//
// The shooter's client decides what its bullet hit (it has the buildings); the server
// checks what it can from the stored positions: both players on foot, alive, fighting
// (not passive, level 3+), able to see each other (the same privacy rules as the
// presence), within the gun's range, and not firing faster than the gun. Damage falls
// off with the server's distance. The victim learns about it from `events` on their
// next report (a few times a second). Casual-grade anti-cheat — the realtime server
// (realtime/) is the stronger referee when it's deployed.
import type { DriveState, Prisma, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM } from "../lib/geo";
import { t } from "../lib/i18n";
import { levelForXp } from "../lib/progression";
import { FREE_RESPAWN_S, PASSIVE_COOLDOWN_S, ROOKIE_LEVEL } from "../lib/arena/modes";
import { F_AIM, F_AIR, F_CROUCH, F_FIRE, F_FOOT, F_RELOAD, F_SPRINT } from "../lib/arena/protocol";
import { damageAt, isWeapon, MAX_HP, shotGap, WEAPONS, type WeaponKey, type Zone } from "../lib/arena/weapons";
import { HttpError } from "./http";
import { areFriends } from "./rooms";

const FRESH_MS = 8_000;
const PRIVATE_START_M = 300;
const EVENTS_MS = 10_000;
/** Positions are a few hundred ms old: allow for running apart in that time. */
const RANGE_SLACK_M = 12;

export type ArenaEvent = { at: number; kind: "hit"; from: string; name: string; dmg: number; zone: Zone; hp: number; kill: boolean; w: WeaponKey; lat: number; lng: number };

/** Only the flags a client may set (not "dead"). */
export const footFlags = (f?: number) => (f ?? 0) & (F_FOOT | F_CROUCH | F_AIM | F_SPRINT | F_AIR | F_RELOAD | F_FIRE);
/** Down until they respawn (deadUntil is the earliest they may). */
export const isDead = (s: Pick<DriveState, "hp">) => s.hp <= 0;

/** My own fight state, for /api/drive's answer. */
export function arenaMe(s: DriveState) {
  const events = ((s.events as ArenaEvent[] | null) ?? []).filter((e) => Date.now() - e.at < EVENTS_MS);
  return { hp: isDead(s) ? 0 : s.hp, dead: isDead(s), respawnAt: s.deadUntil?.getTime() ?? 0, passive: s.passive, events };
}

const fresh = (s: DriveState | null): s is DriveState => !!s && Date.now() - s.updatedAt.getTime() < FRESH_MS;
const seen = async (viewer: DriveState, p: DriveState) => (p.virtual && distanceM({ lat: p.startLat, lng: p.startLng }, p) > PRIVATE_START_M) || areFriends(viewer.userId, p.userId);

export async function setPassive(u: User, on: boolean) {
  const s = await prisma.driveState.findUnique({ where: { userId: u.id } });
  if (!s) throw new HttpError(400, t("Open the 3D city first"));
  if (!on && levelForXp(u.xp) < ROOKIE_LEVEL) throw new HttpError(403, t("Fighting in the open city unlocks at level {n}", { n: ROOKIE_LEVEL }));
  const wait = s.fightAt ? PASSIVE_COOLDOWN_S * 1000 - (Date.now() - s.fightAt.getTime()) : 0;
  if (on && !s.passive && wait > 0) throw new HttpError(409, t("You were just in a fight — passive mode in {s} s", { s: Math.ceil(wait / 1000) }));
  await prisma.driveState.update({ where: { userId: u.id }, data: { passive: on, ...(on ? {} : { fightAt: new Date() }) } });
  return { passive: on };
}

export async function respawn(userId: string) {
  const s = await prisma.driveState.findUnique({ where: { userId } });
  if (!s || !isDead(s)) return { hp: s?.hp ?? MAX_HP };
  if (s.deadUntil && s.deadUntil.getTime() - 1000 > Date.now()) throw new HttpError(409, t("Back in {s} s", { s: Math.ceil((s.deadUntil.getTime() - Date.now()) / 1000) }));
  await prisma.driveState.update({ where: { userId }, data: { hp: MAX_HP, deadUntil: null } });
  return { hp: MAX_HP };
}

/** One shot (all its pellets) that hit `targetId`, as the shooter's client saw it. */
export async function hit(u: User, targetId: string, w: string, zone: Zone, pellets: number) {
  if (!isWeapon(w) || !["head", "body", "legs"].includes(zone)) throw new HttpError(400, "bad shot");
  const W = WEAPONS[w];
  const now = Date.now();
  const [me, them] = await Promise.all([prisma.driveState.findUnique({ where: { userId: u.id } }), prisma.driveState.findUnique({ where: { userId: targetId } })]);
  const refuse = { ok: false as const };
  if (!fresh(me) || !fresh(them) || !(me.flags & F_FOOT) || isDead(me) || isDead(them)) return refuse;
  if (me.passive || them.passive || levelForXp(u.xp) < ROOKIE_LEVEL || them.level < ROOKIE_LEVEL) return refuse;
  if (me.shotAt && now - me.shotAt.getTime() < shotGap(W) * 1000 * 0.6) return refuse;
  const dist = distanceM(me, them);
  if (dist > W.range + RANGE_SLACK_M) return refuse;
  if (!(await seen(me, them)) || !(await seen(them, me))) return refuse;

  const dmg = damageAt(W, dist, zone) * Math.max(1, Math.min(W.pellets, Math.round(pellets)));
  await prisma.driveState.update({ where: { userId: u.id }, data: { shotAt: new Date(now), fightAt: new Date(now) } });
  // Only a living target loses health (two shots landing together can't kill twice).
  const took = await prisma.driveState.updateMany({ where: { userId: targetId, hp: { gt: 0 } }, data: { hp: { decrement: dmg }, fightAt: new Date(now) } });
  if (!took.count) return refuse;
  const after = await prisma.driveState.findUniqueOrThrow({ where: { userId: targetId } });
  const kill = after.hp <= 0;
  const event: ArenaEvent = { at: now, kind: "hit", from: u.id, name: u.username, dmg, zone, hp: Math.max(0, after.hp), kill, w, lat: me.lat, lng: me.lng };
  const events = [...((after.events as ArenaEvent[] | null) ?? []).filter((e) => now - e.at < EVENTS_MS), event].slice(-12);
  await prisma.driveState.update({
    where: { userId: targetId },
    data: { events: events as unknown as Prisma.InputJsonValue, ...(kill ? { hp: 0, deadUntil: new Date(now + FREE_RESPAWN_S * 1000) } : {}) },
  });
  return { ok: true as const, dmg, hp: Math.max(0, after.hp), kill, victim: after.name };
}
