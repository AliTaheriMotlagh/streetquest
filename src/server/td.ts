// Tower defense + field armies, settled lazily (no background jobs): commanders take
// fire when they report their position, squads resolve their orders the next time
// anyone looks at the map, and raider waves are simulated once they've finished.
import type { Squad, Tower, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { bbox, distanceM, type LatLng } from "../lib/geo";
import { resolveOutpost } from "../lib/outposts";
import { levelForXp } from "../lib/progression";
import { factionOf, levelOf, resolveBattle, vaultProtection, type Army } from "../lib/rts";
import {
  baseDefender,
  buildWave,
  currentHp,
  stealCap,
  DOWNED_COIN_LOSS,
  DOWNED_MS,
  GUARD_RANGE_M,
  PLAYER_MAX_HP,
  RESPAWN_IMMUNE_MS,
  ROOKIE_LEVEL,
  simulateWave,
  squadDps,
  squadSpeed,
  TOWER_BY_KEY,
  towerStats,
  unitCount,
  WAVE_EVERY_MIN,
  waveSeed,
  type Defender,
  type Strike,
  type TowerKey,
} from "../lib/td";
import { SUPERWEAPONS, type SuperKey } from "../lib/superweapons";
import { addUnits, fmtLosses, loadBase } from "./army";
import { bonusOf, heroOf } from "./hero";
import { HttpError } from "./http";
import { notify } from "./hub";
import { questEvent } from "./quests";
import { grant, unlock } from "./rewards";
import { friendIds } from "./rooms";
import { assaultOutpost, clean, siegeBase, squadForce } from "./warfare";

// Dev/testing only: GAME_SPEED makes marches faster too.
export const SPEED = process.env.NODE_ENV !== "production" ? Math.max(1, Number(process.env.GAME_SPEED) || 1) : 1;

const box = (p: LatLng, r: number, prefix: "" | "to" = "") => {
  const b = bbox(p, r);
  const k = (s: string) => (prefix ? `${prefix}${s[0].toUpperCase()}${s.slice(1)}` : s);
  return { [k("lat")]: { gte: b.minLat, lte: b.maxLat }, [k("lng")]: { gte: b.minLng, lte: b.maxLng } };
};

export const towerReady = (t: Pick<Tower, "readyAt" | "hp">, now = Date.now()) => t.readyAt.getTime() <= now && t.hp > 0;

export async function maxHpOf(userId: string) {
  return PLAYER_MAX_HP + Math.round((await bonusOf(userId)).fpsHp);
}

// ---------------------------------------------------------------- commanders under fire
export type Hit = { by: string; emoji: string; dmg: number };
export type FireReport = { hp: number; maxHp: number; hits: Hit[]; downed: { by: string; coins: number } | null; protectedReason?: string };

/** Called on every position report: hostile towers and guard squads in range open fire. */
export async function takeFire(u: User, pos: LatLng, dtSec: number): Promise<FireReport | null> {
  const now = Date.now();
  const dt = Math.max(0, Math.min(12, dtSec));
  const [towers, guards] = await Promise.all([
    prisma.tower.findMany({ where: { ...box(pos, 140), ownerId: { not: u.id }, hp: { gt: 0 }, readyAt: { lte: new Date() } }, include: { owner: { select: { username: true } } } }),
    prisma.squad.findMany({ where: { ...box(pos, GUARD_RANGE_M + 10, "to"), ownerId: { not: u.id }, status: "HOLD", order: "guard" }, include: { owner: { select: { username: true } } } }),
  ]);
  const inRange = [
    ...towers.map((t) => ({ t, s: towerStats(t) })).filter(({ t, s }) => distanceM(pos, t) <= s.range).map(({ t, s }) => ({ ownerId: t.ownerId, name: t.owner.username, emoji: s.def.emoji, dps: s.dps * s.def.vsPlayer, towerId: t.id as string | null })),
    ...guards.filter((g) => distanceM(pos, { lat: g.toLat, lng: g.toLng }) <= GUARD_RANGE_M).map((g) => ({ ownerId: g.ownerId, name: g.owner.username, emoji: "🪖", dps: Math.min(8, squadDps(g.units as Army) / 4), towerId: null })),
  ];
  // Superweapon fallout (radiation / toxins) hurts everyone but the launcher.
  const zones = await prisma.superstrike.findMany({ where: { ...box(pos, 250), hazardUntil: { gt: new Date() }, ownerId: { not: u.id } }, include: { owner: { select: { username: true } } } });
  const fallout = zones
    .filter((z) => distanceM(pos, z) <= z.radius && SUPERWEAPONS[z.kind as SuperKey]?.hazard)
    .map((z) => ({ ownerId: z.ownerId, name: `${z.owner.username}'s ${SUPERWEAPONS[z.kind as SuperKey].hazard!.label}`, emoji: "☣️", dps: SUPERWEAPONS[z.kind as SuperKey].hazard!.dps, towerId: null as string | null }));
  if (!inRange.length && !fallout.length) return null;
  const friends = new Set(await friendIds(u.id));
  const hostile = [...inRange.filter((x) => !friends.has(x.ownerId)), ...fallout];
  if (!hostile.length) return null;

  const maxHp = await maxHpOf(u.id);
  const hp = currentHp(u.hp, u.hpAt, maxHp, now);
  if (levelForXp(u.xp) < ROOKIE_LEVEL) return { hp, maxHp, hits: [], downed: null, protectedReason: `Rookie cover: towers hold fire until you reach level ${ROOKIE_LEVEL}` };
  if (u.downedUntil && now < u.downedUntil.getTime() + RESPAWN_IMMUNE_MS) return { hp, maxHp, hits: [], downed: null, protectedReason: "Respawn cover — towers ignore you for a few minutes" };
  if (dt <= 0) return { hp, maxHp, hits: [], downed: null };

  const hits: Hit[] = hostile.map((x) => ({ by: x.name, emoji: x.emoji, dmg: Math.max(1, Math.round(x.dps * dt)) }));
  const total = hits.reduce((s, h) => s + h.dmg, 0);
  const left = hp - total;
  if (left > 0) {
    await prisma.user.update({ where: { id: u.id }, data: { hp: left, hpAt: new Date(now) } });
    return { hp: left, maxHp, hits, downed: null };
  }

  // Downed: the heaviest hitter's owner takes the bounty.
  const top = hostile.sort((a, b) => b.dps - a.dps)[0];
  const coins = await knockDown(u, maxHp, top.ownerId);
  if (top.towerId) await prisma.tower.updateMany({ where: { id: top.towerId }, data: { kills: { increment: 1 } } });
  await notify(top.ownerId, { kind: "reward", title: `${top.emoji} Your defenses downed ${u.username}`, body: `+${coins} 🪙 bounty` });
  return { hp: 0, maxHp, hits, downed: { by: top.name, coins } };
}

/** Put a commander down: 3 min out, HP refilled for later, a cut of their coins to whoever did it. */
export async function knockDown(u: Pick<User, "id" | "coins">, maxHp: number, byUserId: string) {
  const now = Date.now();
  const coins = Math.min(300, Math.floor(u.coins * DOWNED_COIN_LOSS));
  const took = await prisma.user.updateMany({
    where: { id: u.id, OR: [{ downedUntil: null }, { downedUntil: { lt: new Date(now) } }] },
    data: { hp: maxHp, hpAt: new Date(now + DOWNED_MS), downedUntil: new Date(now + DOWNED_MS), coins: { decrement: Math.min(coins, Math.max(0, u.coins)) } },
  });
  if (!took.count) return 0; // someone else got there first
  if (coins > 0) await grant(byUserId, { coins, xp: 40 }, { raw: true });
  if (byUserId !== u.id) await claimBounties(u.id, byUserId);
  return coins;
}

/** Whoever downs a wanted commander collects every open bounty on them. */
export async function claimBounties(targetId: string, byUserId: string) {
  const open = await prisma.bounty.findMany({ where: { targetId, claimedAt: null, posterId: { not: byUserId } } });
  let total = 0;
  for (const b of open) {
    const ok = await prisma.bounty.updateMany({ where: { id: b.id, claimedAt: null }, data: { claimedAt: new Date(), claimedById: byUserId } });
    if (ok.count) total += b.amount;
  }
  if (!total) return 0;
  await grant(byUserId, { coins: total, xp: Math.min(500, Math.round(total / 5)) }, { raw: true });
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { username: true } });
  await notify(byUserId, { kind: "reward", title: `💀 Bounty collected on ${target?.username}!`, body: `+${total} 🪙` });
  await unlock(byUserId, "bounty_hunter");
  return total;
}

/** Can this commander be shot right now? Returns the reason if not. */
export function shotProtection(u: Pick<User, "xp" | "downedUntil">, now = Date.now()) {
  if (levelForXp(u.xp) < ROOKIE_LEVEL) return "is a rookie (below level 3)";
  if (u.downedUntil && now < u.downedUntil.getTime()) return "is already down";
  if (u.downedUntil && now < u.downedUntil.getTime() + RESPAWN_IMMUNE_MS) return "just respawned";
  return null;
}

export async function assertNotDowned(u: Pick<User, "downedUntil">) {
  if (u.downedUntil && u.downedUntil.getTime() > Date.now()) {
    const s = Math.ceil((u.downedUntil.getTime() - Date.now()) / 1000);
    throw new HttpError(400, `You're down! Patching up for ${s}s more`);
  }
}

// ---------------------------------------------------------------- squads
export function marchArrival(units: Army, from: LatLng, to: LatLng, at = Date.now()) {
  const secs = distanceM(from, to) / squadSpeed(units) / SPEED;
  return new Date(at + Math.max(2, secs) * 1000);
}

/** Send a squad (or what's left of it) back to its owner's base. */
async function sendHome(s: Squad, from: LatLng) {
  const base = await prisma.base.findUnique({ where: { ownerId: s.ownerId }, select: { lat: true, lng: true } });
  if (!base) return;
  const fresh = await prisma.squad.findUnique({ where: { id: s.id } });
  if (!fresh) return;
  await prisma.squad.update({
    where: { id: s.id },
    data: { order: "return", status: "MARCH", targetKind: null, targetId: null, fromLat: from.lat, fromLng: from.lng, toLat: base.lat, toLng: base.lng, departAt: new Date(), arriveAt: marchArrival(fresh.units as Army, from, base) },
  });
}

async function holdAt(id: string) {
  await prisma.squad.updateMany({ where: { id }, data: { order: "guard", status: "HOLD", targetKind: null, targetId: null } });
}

/** Resolve every squad that has reached its destination. Idempotent and race-safe. */
export async function settleSquads(where: { near?: LatLng; ownerId?: string }) {
  const due = await prisma.squad.findMany({
    where: { status: "MARCH", arriveAt: { lte: new Date() }, ...(where.ownerId ? { ownerId: where.ownerId } : {}), ...(where.near ? box(where.near, 8000, "to") : {}) },
    take: 20,
  });
  for (const s of due) {
    // Claim it: only one request gets to resolve this arrival.
    const claim = await prisma.squad.updateMany({ where: { id: s.id, status: "MARCH", arriveAt: s.arriveAt }, data: { status: "HOLD" } });
    if (!claim.count) continue;
    const at = { lat: s.toLat, lng: s.toLng };
    try {
      if (s.order === "return") {
        const del = await prisma.squad.deleteMany({ where: { id: s.id } });
        if (del.count) for (const [k, q] of Object.entries(s.units as Army)) if (q) await addUnits(s.ownerId, k, q, ((s.vets as Record<string, number>) ?? {})[k] ?? 0);
        continue;
      }
      if (s.order !== "attack" || !s.targetId) {
        await holdAt(s.id);
        continue;
      }
      await resolveAttack(s, at);
    } catch (e) {
      console.error("squad settle failed", e);
      await holdAt(s.id);
    }
  }
}

async function resolveAttack(s: Squad, at: LatLng) {
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: s.ownerId } });
  const force = squadForce(s);
  const say = (title: string, body?: string) => notify(owner.id, { kind: "event", title, body });

  if (s.targetKind === "tower") {
    const t = await prisma.tower.findUnique({ where: { id: s.targetId! }, include: { owner: { select: { username: true } } } });
    if (!t) return holdAt(s.id).then(() => say("🎖️ Squad arrived", "The target tower was already gone — holding position"));
    const st = towerStats(t);
    const defBonus = await heroOf(await prisma.user.findUniqueOrThrow({ where: { id: t.ownerId } }));
    const r = resolveBattle(
      { army: force.army, vets: force.vets, faction: factionOf(owner.faction), bonus: (await heroOf(owner)).bonus },
      { army: {}, faction: null, structures: { atk: st.dps * 8 * defBonus.bonus.turret, hp: t.hp } },
      `${t.id}|${s.id}|${Date.now()}`,
    );
    await force.onLosses(r.attackerLosses, r.won);
    if (r.won) {
      await prisma.tower.deleteMany({ where: { id: t.id } });
      await grant(owner.id, { coins: Math.round(TOWER_BY_KEY[t.type as TowerKey].cost * 0.25), xp: 80, scrap: 2 + t.level });
      await questEvent(owner.id, "tower_down");
      await notify(t.ownerId, { kind: "event", title: `💥 ${owner.username}'s squad destroyed your ${st.def.name}`, body: "Rebuild it from Base → Defense" });
      await say(`💥 ${st.def.emoji} ${t.owner.username}'s ${st.def.name} destroyed!`, `Lost ${fmtLosses(r.attackerLosses)} · squad is holding the ground`);
      if (await prisma.squad.findUnique({ where: { id: s.id } })) await holdAt(s.id);
    } else {
      await prisma.tower.update({ where: { id: t.id }, data: { hp: Math.max(1, t.hp - r.structureDamage) } });
      await say(`☠️ Squad failed to take the ${st.def.name}`, `It's at ${Math.max(1, t.hp - r.structureDamage)} HP · lost ${fmtLosses(r.attackerLosses)} · survivors falling back`);
      if (await prisma.squad.findUnique({ where: { id: s.id } })) await sendHome(s, at);
    }
    return;
  }

  if (s.targetKind === "squad") {
    const target = await prisma.squad.findUnique({ where: { id: s.targetId! }, include: { owner: true } });
    const where = target && (target.status === "HOLD" ? { lat: target.toLat, lng: target.toLng } : null);
    if (!target || !where || distanceM(where, at) > 150) return holdAt(s.id).then(() => say("🎖️ Squad arrived", "The enemy squad slipped away — holding position"));
    const enemy = squadForce(target);
    const r = resolveBattle(
      { army: force.army, vets: force.vets, faction: factionOf(owner.faction), bonus: (await heroOf(owner)).bonus },
      { army: enemy.army, vets: enemy.vets, faction: factionOf(target.owner.faction), bonus: (await heroOf(target.owner)).bonus },
      `${target.id}|${s.id}|${Date.now()}`,
    );
    await force.onLosses(r.attackerLosses, r.won);
    await enemy.onLosses(r.defenderLosses, !r.won);
    await prisma.battle.create({ data: { attackerId: owner.id, defenderId: target.ownerId, kind: "skirmish", targetId: target.id, targetName: `${target.owner.username}'s squad`, won: r.won, loot: 0, log: r } });
    await notify(target.ownerId, { kind: "event", title: r.won ? `☠️ ${owner.username} routed your squad` : `🛡️ Your squad beat off ${owner.username}`, body: `You lost ${fmtLosses(r.defenderLosses)}` });
    if (r.won) await grant(owner.id, { xp: 80, scrap: 2 });
    await say(r.won ? "⚔️ Skirmish won!" : "☠️ Skirmish lost", `Lost ${fmtLosses(r.attackerLosses)} · they lost ${fmtLosses(r.defenderLosses)}`);
    if (await prisma.squad.findUnique({ where: { id: s.id } })) await (r.won ? holdAt(s.id) : sendHome(s, at));
    return;
  }

  if (s.targetKind === "base") {
    const target = await loadBase({ id: s.targetId! });
    const myBase = await prisma.base.findUnique({ where: { ownerId: owner.id }, select: { id: true } });
    if (!target) return holdAt(s.id);
    if (target.shieldUntil && target.shieldUntil > new Date()) return holdAt(s.id).then(() => say(`🛡️ ${target.name} put up a shield`, "Your squad is holding outside"));
    const out = await siegeBase(owner, myBase?.id ?? null, force, target, "squad");
    await say(out.won ? "🎖️ Squad assault succeeded" : "☠️ Squad assault failed", out.message);
    if (await prisma.squad.findUnique({ where: { id: s.id } })) await sendHome(s, at);
    return;
  }

  if (s.targetKind === "outpost") {
    const site = resolveOutpost(s.targetId!);
    const row = site ? await prisma.outpost.findUnique({ where: { id: site.id } }) : null;
    if (!site) return holdAt(s.id);
    if (row?.ownerId === owner.id) return holdAt(s.id);
    if (row?.shieldUntil && row.shieldUntil > new Date()) return holdAt(s.id).then(() => say(`🛡️ ${site.name} is dug in`, "Your squad is holding nearby"));
    const out = await assaultOutpost(owner, force, site);
    await say(out.won ? "🚩 Squad took the outpost" : "☠️ Squad assault failed", out.message);
    const left = await prisma.squad.findUnique({ where: { id: s.id } });
    if (!left) return;
    if (out.won) {
      // Survivors dig in as the new garrison.
      await prisma.outpost.update({ where: { id: site.id }, data: { garrison: clean(left.units as Army) } });
      await prisma.squad.deleteMany({ where: { id: s.id } });
    } else await sendHome(s, at);
    return;
  }
  await holdAt(s.id);
}

// ---------------------------------------------------------------- raider waves
export const WAVE_DEFEND_M = 700;

/** Towers and guard squads that fight for a base: the owner's and their crew's. */
export async function defendersFor(base: LatLng & { id: string; buildings: { type: string; level: number; readyAt: Date }[] }, ownerId: string): Promise<Defender[]> {
  const allies = [ownerId, ...(await friendIds(ownerId))];
  const now = new Date();
  const [towers, squads] = await Promise.all([
    prisma.tower.findMany({ where: { ...box(base, WAVE_DEFEND_M), ownerId: { in: allies }, hp: { gt: 0 }, readyAt: { lte: now } }, orderBy: { createdAt: "asc" } }),
    prisma.squad.findMany({ where: { ...box(base, WAVE_DEFEND_M, "to"), ownerId: { in: allies }, status: "HOLD", order: "guard" }, orderBy: { departAt: "asc" } }),
  ]);
  const home = baseDefender({ id: base.id, ownerId, lat: base.lat, lng: base.lng }, levelOf(base.buildings, "turret"), levelOf(base.buildings, "hq"));
  return [
    ...(home ? [home] : []),
    ...towers.map((t) => {
      const s = towerStats(t);
      return { id: t.id, ownerId: t.ownerId, lat: t.lat, lng: t.lng, range: s.range, dps: s.dps, vs: s.def.vs };
    }),
    ...squads.map((q) => ({ id: q.id, ownerId: q.ownerId, lat: q.toLat, lng: q.toLng, range: GUARD_RANGE_M, dps: squadDps(q.units as Army), vs: { infantry: 1, vehicle: 1, air: 0.7 } })),
  ];
}

type BaseLite = { id: string; ownerId: string; lat: number; lng: number; shieldUntil: Date | null; buildings: { type: string; level: number; readyAt: Date }[] };

/** Bases with HQ 2+ get raided every so often. Called with the bases near whoever is looking. */
export async function scheduleWaves(bases: BaseLite[]) {
  const eligible = bases.filter((b) => levelOf(b.buildings, "hq") >= 2 && !(b.shieldUntil && b.shieldUntil > new Date()));
  if (!eligible.length) return;
  const open = await prisma.wave.findMany({ where: { baseId: { in: eligible.map((b) => b.id) }, resolvedAt: null }, select: { baseId: true } });
  const has = new Set(open.map((w) => w.baseId));
  for (const b of eligible.filter((x) => !has.has(x.id)).slice(0, 5)) {
    const [lo, hi] = WAVE_EVERY_MIN;
    const startAt = Date.now() + (lo + Math.random() * (hi - lo)) * 60_000;
    await createWave(b, startAt, 1);
  }
}

export async function createWave(b: BaseLite, startAt: number, boost: number) {
  const hq = Math.max(1, levelOf(b.buildings, "hq"));
  const seed = waveSeed(b.id, startAt);
  const def = buildWave({ id: "", seed, startAt, hq, boost, base: b });
  return prisma.wave.create({ data: { baseId: b.id, seed, hq, boost, startAt: new Date(startAt), endAt: new Date(def.endAt) } });
}

/** Simulate and pay out every finished wave for these bases. */
export async function resolveWaves(baseIds: string[]) {
  if (!baseIds.length) return;
  const due = await prisma.wave.findMany({ where: { baseId: { in: baseIds }, resolvedAt: null, endAt: { lte: new Date() } }, take: 5 });
  for (const w of due) {
    const claim = await prisma.wave.updateMany({ where: { id: w.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (!claim.count) continue;
    const base = await loadBase({ id: w.baseId });
    if (!base) continue;
    const def = buildWave({ id: w.id, seed: w.seed, startAt: w.startAt.getTime(), hq: w.hq, boost: w.boost, base });
    const out = simulateWave(def, await defendersFor(base, base.ownerId), (w.strikes as Strike[]) ?? []);
    const killed = out.killer.filter(Boolean).length;
    const leaked = out.leaked.filter(Boolean).length;
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: base.ownerId } });
    const raidable = Math.floor(owner.coins * (1 - vaultProtection(base.buildings)) * 0.15);
    let stolen = Math.min(out.stolen, raidable, stealCap(w.hq));
    if (stolen > 0 && !(await prisma.user.updateMany({ where: { id: owner.id, coins: { gte: stolen } }, data: { coins: { decrement: stolen } } })).count) stolen = 0;
    if (out.baseDmg) await prisma.base.update({ where: { id: base.id }, data: { hp: Math.max(0, base.hp - out.baseDmg) } });
    for (const [userId, coins] of Object.entries(out.bounty)) {
      await grant(userId, { coins, xp: coins });
      await questEvent(userId, "raiders", out.kills[userId] ?? 0);
      if (userId !== owner.id) await notify(userId, { kind: "reward", title: `🛡️ You helped defend ${base.name}`, body: `${out.kills[userId]} raiders down · +${coins} 🪙` });
    }
    const result = { killed, leaked, total: def.creeps.length, stolen, baseDmg: out.baseDmg, kills: out.kills, bounty: out.bounty };
    await prisma.wave.update({ where: { id: w.id }, data: { result } });
    if (!leaked && killed > 0) await unlock(owner.id, "wave_clear");
    await prisma.battle.create({ data: { attackerId: owner.id, kind: "wave", targetId: base.id, targetName: base.name, won: leaked === 0, loot: (out.bounty[owner.id] ?? 0) - stolen, log: result } });
    await notify(owner.id, {
      kind: leaked ? "event" : "reward",
      title: leaked ? `🏴‍☠️ Raiders hit ${base.name}: ${leaked} got through` : `🛡️ Raid wave crushed at ${base.name}!`,
      body: `${killed}/${def.creeps.length} raiders down${out.bounty[owner.id] ? ` · +${out.bounty[owner.id]} 🪙 bounty` : ""}${stolen ? ` · −${stolen} 🪙 stolen` : ""}${out.baseDmg ? ` · −${out.baseDmg} integrity` : ""}`,
    });
  }
}

/** Units out in the field still take up Army Camp space. */
export async function deployedArmy(userId: string): Promise<Army> {
  const out: Army = {};
  for (const s of await prisma.squad.findMany({ where: { ownerId: userId }, select: { units: true } }))
    for (const [k, q] of Object.entries(s.units as Army)) out[k as keyof Army] = (out[k as keyof Army] ?? 0) + (q ?? 0);
  return out;
}

export { unitCount };
