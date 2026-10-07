// RPG layer: hero class, attributes, gear (equip / salvage / forge) and quests.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { forgeCost, GEAR_BASE_BY_KEY, MAX_GEAR_LEVEL, SALVAGE_SCRAP, type Affix } from "@/lib/gear";
import { ATTR_BASE, attrPointsFree, CLASS_BY_KEY, RESPEC_COST, type ClassKey } from "@/lib/hero";
import { commandPoints, POWERS } from "@/lib/powers";
import { levelForXp } from "@/lib/progression";
import type { Rarity } from "@/lib/catalog";
import { requireUser } from "@/server/auth";
import { heroOf, giveGear } from "@/server/hero";
import { body, HttpError, route } from "@/server/http";
import { claimQuest, questEvent, questView } from "@/server/quests";
import { grant, spendCoins } from "@/server/rewards";

const CLASS_CHANGE_COST = 500;

async function state(userId: string) {
  const [base, equipped] = await Promise.all([prisma.base.count({ where: { ownerId: userId } }), prisma.gear.count({ where: { userId, equipped: true } })]);
  return { base: base > 0, equipped: equipped > 0 };
}

export const GET = route(async () => {
  const u = await requireUser();
  const level = levelForXp(u.xp);
  const [hero, gear, powers, st] = await Promise.all([
    heroOf(u),
    prisma.gear.findMany({ where: { userId: u.id }, orderBy: [{ equipped: "desc" }, { createdAt: "desc" }] }),
    prisma.powerState.findMany({ where: { userId: u.id } }),
    state(u.id),
  ]);
  const spent = powers.reduce((s, p) => s + p.rank, 0);
  return {
    heroClass: u.heroClass,
    level,
    attrs: { str: u.str, agi: u.agi, int: u.int, cha: u.cha },
    freePoints: attrPointsFree(level, u),
    commandPoints: commandPoints(level, spent),
    scrap: u.scrap,
    coins: u.coins,
    gems: u.gems,
    trophies: u.trophies,
    mods: hero.mods,
    bonus: hero.bonus,
    weapon: hero.weapon,
    research: hero.research,
    buffUntil: hero.buffActive ? u.buffUntil : null,
    gear: gear.map((g) => ({ id: g.id, slot: g.slot, base: g.base, name: g.name, rarity: g.rarity, level: g.level, affixes: g.affixes as Affix[], equipped: g.equipped })),
    powers: POWERS.map((p) => {
      const s = powers.find((x) => x.key === p.key);
      return { key: p.key, rank: s?.rank ?? 0, lastUsedAt: s?.lastUsedAt ?? null };
    }),
    quests: await questView(u.id, { heroClass: !!u.heroClass, ...st }),
    campaignStep: u.campaignStep,
  };
});

const Attr = z.enum(["str", "agi", "int", "cha"]);
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("class"), heroClass: z.enum(["vanguard", "marksman", "engineer", "quartermaster", "warlord"]) }),
  z.object({ action: z.literal("allocate"), attr: Attr, n: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal("respec") }),
  z.object({ action: z.literal("equip"), gearId: z.string().max(40) }),
  z.object({ action: z.literal("unequip"), gearId: z.string().max(40) }),
  z.object({ action: z.literal("salvage"), gearId: z.string().max(40) }),
  z.object({ action: z.literal("forge"), gearId: z.string().max(40) }),
  z.object({ action: z.literal("claimQuest"), key: z.string().max(40) }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const level = levelForXp(u.xp);

  if (d.action === "class") {
    if (u.heroClass === d.heroClass) return { message: "That's already your class" };
    if (u.heroClass) await spendCoins(u.id, CLASS_CHANGE_COST);
    await prisma.user.update({ where: { id: u.id }, data: { heroClass: d.heroClass } });
    await questEvent(u.id, "class");
    const c = CLASS_BY_KEY[d.heroClass as ClassKey];
    return { message: `${c.emoji} You are now a ${c.name}${u.heroClass ? ` (−${CLASS_CHANGE_COST} 🪙)` : ""}` };
  }

  if (d.action === "allocate") {
    if (attrPointsFree(level, u) < d.n) throw new HttpError(400, "Not enough attribute points — level up to earn more");
    // Guard against double-spends: only apply if the attribute hasn't changed since we read it.
    const res = await prisma.user.updateMany({ where: { id: u.id, [d.attr]: u[d.attr] }, data: { [d.attr]: { increment: d.n } } });
    if (!res.count) throw new HttpError(409, "Try again");
    return { message: `+${d.n} ${d.attr.toUpperCase()}` };
  }

  if (d.action === "respec") {
    await spendCoins(u.id, RESPEC_COST);
    await prisma.user.update({ where: { id: u.id }, data: { str: ATTR_BASE, agi: ATTR_BASE, int: ATTR_BASE, cha: ATTR_BASE } });
    return { message: `Attributes reset (−${RESPEC_COST} 🪙)` };
  }

  if (d.action === "claimQuest") {
    const st = await state(u.id);
    const q = await claimQuest(u.id, d.key, { heroClass: !!u.heroClass, ...st });
    const gems = q.campaign ? 5 : 2;
    await grant(u.id, { xp: q.reward.xp, coins: q.reward.coins, scrap: q.reward.scrap, gems });
    if (q.reward.gear) await giveGear(u.id, { floor: q.reward.gear as Rarity, source: q.title });
    return { message: `📜 ${q.title}: +${q.reward.coins} 🪙 +${gems} 💎${q.reward.scrap ? ` +${q.reward.scrap} scrap` : ""}${q.reward.gear ? ` + ${q.reward.gear} gear` : ""}` };
  }

  const g = await prisma.gear.findFirst({ where: { id: d.gearId, userId: u.id } });
  if (!g) throw new HttpError(404, "Item not found");

  if (d.action === "equip") {
    await prisma.$transaction([
      prisma.gear.updateMany({ where: { userId: u.id, slot: g.slot, equipped: true }, data: { equipped: false } }),
      prisma.gear.update({ where: { id: g.id }, data: { equipped: true } }),
    ]);
    await questEvent(u.id, "equip");
    return { message: `${GEAR_BASE_BY_KEY[g.base]?.emoji ?? "🎒"} Equipped ${g.name}` };
  }
  if (d.action === "unequip") {
    await prisma.gear.update({ where: { id: g.id }, data: { equipped: false } });
    return { message: `Unequipped ${g.name}` };
  }
  if (d.action === "salvage") {
    if (g.equipped) throw new HttpError(400, "Unequip it first");
    const scrap = SALVAGE_SCRAP[g.rarity as Rarity] + Math.floor(g.level / 2);
    const del = await prisma.gear.deleteMany({ where: { id: g.id, userId: u.id } });
    if (!del.count) throw new HttpError(409, "Already salvaged");
    await prisma.user.update({ where: { id: u.id }, data: { scrap: { increment: scrap } } });
    return { message: `♻️ Salvaged ${g.name}: +${scrap} scrap` };
  }
  // forge: +1 item level (affix values scale with level)
  if (g.level >= MAX_GEAR_LEVEL) throw new HttpError(400, "Already max level");
  const cost = forgeCost(g.level);
  const took = await prisma.user.updateMany({ where: { id: u.id, scrap: { gte: cost.scrap }, coins: { gte: cost.coins } }, data: { scrap: { decrement: cost.scrap }, coins: { decrement: cost.coins } } });
  if (!took.count) throw new HttpError(400, `Forging needs ${cost.scrap} scrap and ${cost.coins} 🪙`);
  await prisma.gear.update({ where: { id: g.id }, data: { level: { increment: 1 } } });
  await questEvent(u.id, "forge");
  return { message: `🔨 ${g.name} forged to level ${g.level + 1}` };
});
