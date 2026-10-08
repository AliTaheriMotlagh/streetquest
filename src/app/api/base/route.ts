// Your base: pick a faction, plant it at a real place, construct, train, collect supplies.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import {
  armyStats,
  BASE_MIN_SPACING_M,
  baseDefense,
  BUILDING_BY_KEY,
  buildCost,
  buildSeconds,
  effectiveLevel,
  FACTION_BY_KEY,
  factionOf,
  levelOf,
  MAX_LEVEL,
  LEVEL_CAP,
  pendingSupply,
  powerOf,
  RELOCATE_COST,
  RESEARCH_BY_KEY,
  builderCount,
  campCapacity,
  housingOf,
  leagueOf,
  rushCost,
  vaultProtection,
  slowdown,
  UNIT_BY_KEY,
  unitCost,
  type BuildingKey,
  type FactionKey,
  type ResearchKey,
  type UnitKey,
} from "@/lib/rts";
import { requireUser } from "@/server/auth";
import { forcesOf, loadBase } from "@/server/army";
import { heroOf } from "@/server/hero";
import { questEvent } from "@/server/quests";
import { deployedArmy } from "@/server/td";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { S } from "@/lib/settings";
import { grant, lastKnownLocation, spendCoins } from "@/server/rewards";

// Dev/testing only: GAME_SPEED=60 makes construction and training 60× faster.
const SPEED = process.env.NODE_ENV !== "production" ? Math.max(1, Number(process.env.GAME_SPEED) || 1) : 1;

export const GET = route(async () => {
  const u = await requireUser();
  const f = factionOf(u.faction);
  // Settle training first so the queue and the army never both count the same units.
  const { army, vets } = await forcesOf(u.id);
  const [base, hero, research, queue, battles, field] = await Promise.all([
    loadBase({ ownerId: u.id }),
    heroOf(u),
    prisma.research.findMany({ where: { userId: u.id } }),
    prisma.trainOrder.findMany({ where: { userId: u.id }, orderBy: { readyAt: "asc" } }),
    prisma.battle.findMany({ where: { attackerId: u.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    deployedArmy(u.id),
  ]);
  const defended = base ? await prisma.battle.findMany({ where: { targetId: base.id }, orderBy: { createdAt: "desc" }, take: 10, include: { attacker: { select: { username: true, base: { select: { id: true } } } } } }) : [];
  return {
    faction: f?.key ?? null,
    base: base && {
      id: base.id,
      name: base.name,
      lat: base.lat,
      lng: base.lng,
      hp: base.hp,
      shieldUntil: base.shieldUntil,
      buildings: base.buildings.map((b) => ({ type: b.type, level: b.level, readyAt: b.readyAt })),
      power: powerOf(base.buildings, f),
      pending: pendingSupply(base.buildings, base.lastCollectAt, Date.now(), hero.bonus.income),
      defense: baseDefense(base.buildings, f, Date.now(), hero.bonus),
    },
    army,
    vets,
    attack: armyStats(army, f, hero.bonus, vets),
    research: research.map((r) => ({ key: r.key, readyAt: r.readyAt })),
    scrap: u.scrap,
    gems: u.gems,
    trophies: u.trophies,
    league: leagueOf(u.trophies),
    housing: { used: housingOf(army) + housingOf(field) + queue.reduce((s, q) => s + (UNIT_BY_KEY[q.unitType as UnitKey]?.housing ?? 0) * q.qty, 0), cap: base ? campCapacity(base.buildings) : 10 },
    builders: base ? builderCount(base.buildings) : 1,
    protection: base ? vaultProtection(base.buildings) : 0,
    timeMult: { build: hero.bonus.buildTime, train: hero.bonus.trainTime * S.trainTimeMult, research: hero.bonus.researchTime * S.researchTimeMult },
    queue: queue.map((q) => ({ id: q.id, unitType: q.unitType, qty: q.qty, readyAt: q.readyAt, unitMs: q.unitMs })),
    battles: battles.map((b) => ({ id: b.id, kind: b.kind, targetName: b.targetName, won: b.won, loot: b.loot, stars: b.stars, destruction: b.destruction, trophies: b.trophies, createdAt: b.createdAt, side: "attack" as const, revengeBaseId: null })),
    defended: defended.map((b) => ({ id: b.id, kind: b.kind, targetName: b.attacker.username, won: !b.won, loot: b.loot, stars: b.stars, destruction: b.destruction, trophies: -b.trophies, createdAt: b.createdAt, side: "defend" as const, revengeBaseId: b.attacker.base?.id ?? null })),
  };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("faction"), faction: z.enum(["coalition", "dragon", "insurgency"]) }),
  z.object({ action: z.literal("found"), name: z.string().trim().min(2).max(30) }),
  z.object({ action: z.literal("build"), type: z.enum(["hq", "power", "supply", "barracks", "factory", "airfield", "turret", "quarters", "camp", "builder", "vault", "walls", "superweapon"]) }),
  z.object({ action: z.literal("rush"), what: z.enum(["build", "train", "research"]), type: z.string().max(20).optional() }),
  z.object({ action: z.literal("train"), unit: z.enum(["ranger", "rocket", "tank", "artillery", "jet"]), qty: z.number().int().min(1).max(10) }),
  z.object({ action: z.literal("collect") }),
  z.object({ action: z.literal("repair") }),
  z.object({ action: z.literal("research"), key: z.enum(["drills", "ap_rockets", "composite", "supply_lines", "lasers", "radar", "afterburners", "medics"]) }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const f = factionOf(u.faction);

  if (d.action === "faction") {
    if (u.faction === d.faction) return { message: "Already in that faction" };
    if (u.faction) await spendCoins(u.id, 1000); // defecting is expensive
    await prisma.user.update({ where: { id: u.id }, data: { faction: d.faction } });
    const nf = FACTION_BY_KEY[d.faction as FactionKey];
    return { message: `${nf.emoji} You joined the ${nf.name}` };
  }
  if (!f) throw new HttpError(400, "Pick a faction first");

  const base = await loadBase({ ownerId: u.id });

  if (d.action === "found") {
    const here = await lastKnownLocation(u.id);
    const near = await prisma.base.findMany({
      where: { ownerId: { not: u.id }, lat: { gte: here.lat - 0.003, lte: here.lat + 0.003 }, lng: { gte: here.lng - 0.005, lte: here.lng + 0.005 } },
    });
    if (near.some((b) => distanceM(here, b) < BASE_MIN_SPACING_M)) throw new HttpError(400, `Too close to another base — bases need ${BASE_MIN_SPACING_M} m of space`);
    if (base) {
      await spendCoins(u.id, RELOCATE_COST);
      await prisma.base.update({ where: { id: base.id }, data: { lat: here.lat, lng: here.lng, name: d.name } });
      return { message: `🚚 Base moved here (−${RELOCATE_COST} 🪙)` };
    }
    await prisma.base.create({ data: { ownerId: u.id, name: d.name, lat: here.lat, lng: here.lng, buildings: { create: { type: "hq", level: 1, readyAt: new Date() } } } });
    await questEvent(u.id, "base");
    return { message: `🏛️ ${d.name} established! Build a Power Plant and Supply Center next.` };
  }
  if (!base) throw new HttpError(400, "Plant your base first");
  const { bonus } = await heroOf(u);

  if (d.action === "build") {
    const def = BUILDING_BY_KEY[d.type as BuildingKey];
    const now = Date.now();
    const busy = base.buildings.filter((b) => new Date(b.readyAt).getTime() > now).length;
    if (busy >= builderCount(base.buildings, now)) throw new HttpError(400, "All builders are busy — build a Builder's Hut or rush with 💎");
    const hq = levelOf(base.buildings, "hq");
    if (hq < def.hqLevel) throw new HttpError(400, `Needs Command Center level ${def.hqLevel}`);
    const cur = base.buildings.find((b) => b.type === d.type);
    // Under construction, effectiveLevel is one below the target: "upgrading" again would
    // charge for the same level and restart its timer.
    if (cur && new Date(cur.readyAt).getTime() > now) throw new HttpError(400, `${def.name} is already being built — wait or rush it with 💎`);
    const level = (cur ? effectiveLevel(cur) : 0) + 1;
    if (level > (LEVEL_CAP[d.type as BuildingKey] ?? MAX_LEVEL)) throw new HttpError(400, "Already max level");
    if (d.type !== "hq" && level > hq) throw new HttpError(400, "Upgrade your Command Center first");
    const power = powerOf(base.buildings, f);
    if (def.power < 0 && f.needsPower && power.made - power.used + def.power < 0 && d.type !== "power")
      throw new HttpError(400, "Not enough power — build or upgrade a Power Plant");
    const cost = buildCost(def, level, f);
    await spendCoins(u.id, cost);
    const readyAt = new Date(now + (buildSeconds(def, level) * 1000 * slowdown(power.ok) * bonus.buildTime) / SPEED);
    if (cur) await prisma.building.update({ where: { id: cur.id }, data: { level, readyAt } });
    else await prisma.building.create({ data: { baseId: base.id, type: d.type, level, readyAt } });
    await questEvent(u.id, "build");
    return { message: `${def.emoji} ${def.name} ${cur ? `→ level ${level}` : "under construction"} (−${cost} 🪙)` };
  }

  if (d.action === "train") {
    const unit = UNIT_BY_KEY[d.unit as UnitKey];
    if (levelOf(base.buildings, unit.building) < unit.buildingLevel) throw new HttpError(400, `Needs ${BUILDING_BY_KEY[unit.building].name} level ${unit.buildingLevel}`);
    const queued = await prisma.trainOrder.findMany({ where: { userId: u.id }, orderBy: { readyAt: "desc" }, take: 1 });
    if ((await prisma.trainOrder.count({ where: { userId: u.id } })) >= 8) throw new HttpError(400, "Training queue is full");
    const [{ army }, allQueued] = await Promise.all([forcesOf(u.id), prisma.trainOrder.findMany({ where: { userId: u.id } })]);
    const queuedArmy = Object.fromEntries(Object.keys(UNIT_BY_KEY).map((k) => [k, allQueued.filter((q) => q.unitType === k).reduce((s, q) => s + q.qty, 0)]));
    const used = housingOf(army) + housingOf(queuedArmy) + housingOf(await deployedArmy(u.id));
    const cap = campCapacity(base.buildings);
    if (used + unit.housing * d.qty > cap) throw new HttpError(400, `Army Camps are full (${used}/${cap}) — build or upgrade an Army Camp`);
    const cost = unitCost(unit, f) * d.qty;
    await spendCoins(u.id, cost);
    const start = Math.max(Date.now(), queued[0]?.readyAt.getTime() ?? 0);
    const unitMs = Math.max(1, Math.round((unit.seconds * 1000 * slowdown(powerOf(base.buildings, f).ok) * bonus.trainTime * S.trainTimeMult) / SPEED));
    const readyAt = new Date(start + unitMs * d.qty);
    await prisma.trainOrder.create({ data: { userId: u.id, unitType: unit.key, qty: d.qty, readyAt, unitMs } });
    await questEvent(u.id, "train", d.qty);
    return { message: `${unit.emoji} Training ${d.qty}× ${unit.name} (−${cost} 🪙)` };
  }

  if (d.action === "collect") {
    const amount = pendingSupply(base.buildings, base.lastCollectAt, Date.now(), bonus.income);
    if (amount <= 0) throw new HttpError(400, "No supplies yet — build or upgrade a Supply Center");
    const res = await prisma.base.updateMany({ where: { id: base.id, lastCollectAt: base.lastCollectAt }, data: { lastCollectAt: new Date() } });
    if (!res.count) throw new HttpError(409, "Already collected");
    await grant(u.id, { coins: amount, xp: Math.round(amount / 10) });
    return { message: `📦 Supplies collected: +${amount} 🪙` };
  }

  if (d.action === "research") {
    const r = RESEARCH_BY_KEY[d.key as ResearchKey];
    if (levelOf(base.buildings, r.building) < r.level) throw new HttpError(400, `Needs ${BUILDING_BY_KEY[r.building].name} level ${r.level}`);
    const mine = await prisma.research.findMany({ where: { userId: u.id } });
    if (mine.some((x) => x.key === r.key)) throw new HttpError(409, "Already researched");
    if (mine.some((x) => x.readyAt.getTime() > Date.now())) throw new HttpError(400, "The lab is busy — one research at a time");
    if (u.scrap < r.scrap) throw new HttpError(400, `Needs ${r.scrap} scrap — salvage gear or raid derricks`);
    await spendCoins(u.id, r.coins);
    const took = await prisma.user.updateMany({ where: { id: u.id, scrap: { gte: r.scrap } }, data: { scrap: { decrement: r.scrap } } });
    if (!took.count) {
      await prisma.user.update({ where: { id: u.id }, data: { coins: { increment: r.coins } } });
      throw new HttpError(400, "Not enough scrap");
    }
    const readyAt = new Date(Date.now() + (r.minutes * 60_000 * bonus.researchTime * S.researchTimeMult) / SPEED);
    await prisma.research.create({ data: { userId: u.id, key: r.key, readyAt } });
    await questEvent(u.id, "research");
    return { message: `${r.emoji} Researching ${r.name} (−${r.coins} 🪙, −${r.scrap} scrap)` };
  }

  if (d.action === "rush") {
    const now = Date.now();
    let msLeft = 0;
    let apply: () => Promise<unknown>;
    if (d.what === "build") {
      const b = base.buildings.find((x) => x.type === d.type && x.readyAt.getTime() > now);
      if (!b) throw new HttpError(400, "Nothing under construction there");
      msLeft = b.readyAt.getTime() - now;
      apply = () => prisma.building.update({ where: { id: b.id }, data: { readyAt: new Date() } });
    } else if (d.what === "train") {
      const q = await prisma.trainOrder.findMany({ where: { userId: u.id } });
      if (!q.length) throw new HttpError(400, "Nothing in training");
      msLeft = Math.max(...q.map((x) => x.readyAt.getTime())) - now;
      apply = () => prisma.trainOrder.updateMany({ where: { userId: u.id }, data: { readyAt: new Date() } });
    } else {
      const r = await prisma.research.findFirst({ where: { userId: u.id, readyAt: { gt: new Date() } } });
      if (!r) throw new HttpError(400, "No research running");
      msLeft = r.readyAt.getTime() - now;
      apply = () => prisma.research.update({ where: { id: r.id }, data: { readyAt: new Date() } });
    }
    const gems = rushCost(msLeft);
    const took = await prisma.user.updateMany({ where: { id: u.id, gems: { gte: gems } }, data: { gems: { decrement: gems } } });
    if (!took.count) throw new HttpError(400, `Needs ${gems} 💎 — earn gems from quests, achievements, levels and bosses`);
    await apply();
    return { message: `💎 Finished instantly (−${gems} gems)` };
  }

  // repair
  const missing = 1000 - base.hp;
  if (missing <= 0) throw new HttpError(400, "Base is at full integrity");
  const cost = Math.ceil(missing / 2);
  await spendCoins(u.id, cost);
  await prisma.base.update({ where: { id: base.id }, data: { hp: 1000 } });
  return { message: `🔧 Base repaired (−${cost} 🪙)` };
});
