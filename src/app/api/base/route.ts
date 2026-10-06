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
  pendingSupply,
  powerOf,
  RELOCATE_COST,
  slowdown,
  UNIT_BY_KEY,
  unitCost,
  type BuildingKey,
  type FactionKey,
  type UnitKey,
} from "@/lib/rts";
import { requireUser } from "@/server/auth";
import { armyOf, loadBase } from "@/server/army";
import { body, HttpError, route } from "@/server/http";
import { grant, lastKnownLocation, spendCoins } from "@/server/rewards";

// Dev/testing only: GAME_SPEED=60 makes construction and training 60× faster.
const SPEED = process.env.NODE_ENV !== "production" ? Math.max(1, Number(process.env.GAME_SPEED) || 1) : 1;

export const GET = route(async () => {
  const u = await requireUser();
  const f = factionOf(u.faction);
  const [base, army, queue, battles] = await Promise.all([
    loadBase({ ownerId: u.id }),
    armyOf(u.id),
    prisma.trainOrder.findMany({ where: { userId: u.id }, orderBy: { readyAt: "asc" } }),
    prisma.battle.findMany({ where: { attackerId: u.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const defended = base ? await prisma.battle.findMany({ where: { targetId: base.id }, orderBy: { createdAt: "desc" }, take: 10, include: { attacker: { select: { username: true } } } }) : [];
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
      pending: pendingSupply(base.buildings, base.lastCollectAt),
      defense: baseDefense(base.buildings, f),
    },
    army,
    attack: armyStats(army, f),
    queue: queue.map((q) => ({ id: q.id, unitType: q.unitType, qty: q.qty, readyAt: q.readyAt })),
    battles: battles.map((b) => ({ id: b.id, kind: b.kind, targetName: b.targetName, won: b.won, loot: b.loot, createdAt: b.createdAt, side: "attack" as const })),
    defended: defended.map((b) => ({ id: b.id, kind: b.kind, targetName: b.attacker.username, won: !b.won, loot: b.loot, createdAt: b.createdAt, side: "defend" as const })),
  };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("faction"), faction: z.enum(["coalition", "dragon", "insurgency"]) }),
  z.object({ action: z.literal("found"), name: z.string().trim().min(2).max(30) }),
  z.object({ action: z.literal("build"), type: z.enum(["hq", "power", "supply", "barracks", "factory", "airfield", "turret", "quarters"]) }),
  z.object({ action: z.literal("train"), unit: z.enum(["ranger", "rocket", "tank", "artillery", "jet"]), qty: z.number().int().min(1).max(10) }),
  z.object({ action: z.literal("collect") }),
  z.object({ action: z.literal("repair") }),
]);

export const POST = route(async (req) => {
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
    return { message: `🏛️ ${d.name} established! Build a Power Plant and Supply Center next.` };
  }
  if (!base) throw new HttpError(400, "Plant your base first");

  if (d.action === "build") {
    const def = BUILDING_BY_KEY[d.type as BuildingKey];
    const now = Date.now();
    if (base.buildings.some((b) => new Date(b.readyAt).getTime() > now)) throw new HttpError(400, "Your dozer is busy — one construction at a time");
    const hq = levelOf(base.buildings, "hq");
    if (hq < def.hqLevel) throw new HttpError(400, `Needs Command Center level ${def.hqLevel}`);
    const cur = base.buildings.find((b) => b.type === d.type);
    const level = (cur ? effectiveLevel(cur) : 0) + 1;
    if (level > MAX_LEVEL) throw new HttpError(400, "Already max level");
    if (d.type !== "hq" && level > hq) throw new HttpError(400, "Upgrade your Command Center first");
    const power = powerOf(base.buildings, f);
    if (def.power < 0 && f.needsPower && power.made - power.used + def.power < 0 && d.type !== "power")
      throw new HttpError(400, "Not enough power — build or upgrade a Power Plant");
    const cost = buildCost(def, level, f);
    await spendCoins(u.id, cost);
    const readyAt = new Date(now + (buildSeconds(def, level) * 1000 * slowdown(power.ok)) / SPEED);
    if (cur) await prisma.building.update({ where: { id: cur.id }, data: { level, readyAt } });
    else await prisma.building.create({ data: { baseId: base.id, type: d.type, level, readyAt } });
    return { message: `${def.emoji} ${def.name} ${cur ? `→ level ${level}` : "under construction"} (−${cost} 🪙)` };
  }

  if (d.action === "train") {
    const unit = UNIT_BY_KEY[d.unit as UnitKey];
    if (levelOf(base.buildings, unit.building) < unit.buildingLevel) throw new HttpError(400, `Needs ${BUILDING_BY_KEY[unit.building].name} level ${unit.buildingLevel}`);
    const queued = await prisma.trainOrder.findMany({ where: { userId: u.id }, orderBy: { readyAt: "desc" }, take: 1 });
    if ((await prisma.trainOrder.count({ where: { userId: u.id } })) >= 8) throw new HttpError(400, "Training queue is full");
    const cost = unitCost(unit, f) * d.qty;
    await spendCoins(u.id, cost);
    const start = Math.max(Date.now(), queued[0]?.readyAt.getTime() ?? 0);
    const readyAt = new Date(start + (unit.seconds * d.qty * 1000 * slowdown(powerOf(base.buildings, f).ok)) / SPEED);
    await prisma.trainOrder.create({ data: { userId: u.id, unitType: unit.key, qty: d.qty, readyAt } });
    return { message: `${unit.emoji} Training ${d.qty}× ${unit.name} (−${cost} 🪙)` };
  }

  if (d.action === "collect") {
    const amount = pendingSupply(base.buildings, base.lastCollectAt);
    if (amount <= 0) throw new HttpError(400, "No supplies yet — build or upgrade a Supply Center");
    const res = await prisma.base.updateMany({ where: { id: base.id, lastCollectAt: base.lastCollectAt }, data: { lastCollectAt: new Date() } });
    if (!res.count) throw new HttpError(409, "Already collected");
    await grant(u.id, { coins: amount, xp: Math.round(amount / 10) });
    return { message: `📦 Supplies collected: +${amount} 🪙` };
  }

  // repair
  const missing = 1000 - base.hp;
  if (missing <= 0) throw new HttpError(400, "Base is at full integrity");
  const cost = Math.ceil(missing / 2);
  await spendCoins(u.id, cost);
  await prisma.base.update({ where: { id: base.id }, data: { hp: 1000 } });
  return { message: `🔧 Base repaired (−${cost} 🪙)` };
});
