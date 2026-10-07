// The hero's combined bonus (class + attributes + equipped gear + finished research +
// Battle Cry) — read by battles, base timers, income, FPS stats and XP.
import type { User } from "@prisma/client";
import { prisma } from "../lib/db";
import { gearMods, GEAR_BASE_BY_KEY, MAX_GEAR, rollGear, type Affix, type Slot, type WeaponKey } from "../lib/gear";
import { heroMods, sumMods, toBonus, type Bonus, type Mods } from "../lib/hero";
import { levelForXp } from "../lib/progression";
import { RESEARCH_BY_KEY, type ResearchKey } from "../lib/rts";
import type { Rarity } from "../lib/catalog";
import { notify } from "./hub";

type HeroRow = Pick<User, "id" | "heroClass" | "str" | "agi" | "int" | "cha" | "buffUntil" | "buffMult">;

export async function researchDone(userId: string): Promise<ResearchKey[]> {
  const rows = await prisma.research.findMany({ where: { userId, readyAt: { lte: new Date() } }, select: { key: true } });
  return rows.map((r) => r.key as ResearchKey).filter((k) => RESEARCH_BY_KEY[k]);
}

export async function equippedGear(userId: string) {
  return prisma.gear.findMany({ where: { userId, equipped: true } });
}

export async function heroOf(u: HeroRow) {
  const [gear, research] = await Promise.all([equippedGear(u.id), researchDone(u.id)]);
  const mods: Mods[] = [
    ...heroMods(u.heroClass, { str: u.str, agi: u.agi, int: u.int, cha: u.cha }),
    ...gear.map((g) => gearMods({ base: g.base, level: g.level, affixes: g.affixes as Affix[] })),
    ...research.map((k) => RESEARCH_BY_KEY[k].mods),
  ];
  const buff = u.buffUntil && u.buffUntil > new Date() ? u.buffMult : 1;
  const weaponGear = gear.find((g) => g.slot === "weapon");
  const weapon: WeaponKey = (weaponGear && GEAR_BASE_BY_KEY[weaponGear.base]?.weapon) || "ar";
  return { bonus: toBonus(sumMods(mods), buff), mods: sumMods(mods), research, gear, weapon, buffActive: buff > 1 };
}

export async function bonusOf(userId: string): Promise<Bonus> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, heroClass: true, str: true, agi: true, int: true, cha: true, buffUntil: true, buffMult: true } });
  return u ? (await heroOf(u)).bonus : toBonus({});
}

/** Drop a rolled item into the player's stash (or scrap it if the stash is full). */
export async function giveGear(userId: string, opts: { luck?: number; floor?: Rarity; slot?: Slot; source?: string } = {}) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
  const item = rollGear(Math.random, levelForXp(u.xp), opts);
  if ((await prisma.gear.count({ where: { userId } })) >= MAX_GEAR) {
    await prisma.user.update({ where: { id: userId }, data: { scrap: { increment: 5 } } });
    await notify(userId, { kind: "reward", title: "Stash full", body: `${item.name} was salvaged for 5 scrap` });
    return null;
  }
  const g = await prisma.gear.create({ data: { userId, slot: item.slot, base: item.base, name: item.name, rarity: item.rarity, level: item.level, affixes: item.affixes } });
  await notify(userId, { kind: "reward", title: `${GEAR_BASE_BY_KEY[item.base].emoji} Loot: ${item.name}`, body: `${item.rarity} ${item.slot}${opts.source ? ` · from ${opts.source}` : ""}` });
  return g;
}

/** Roll for a gear drop with a base chance, improved by the hero's loot bonus. */
export async function maybeGear(userId: string, chance: number, opts: Parameters<typeof giveGear>[1] = {}) {
  const loot = (await bonusOf(userId)).loot;
  if (Math.random() < chance * loot) return giveGear(userId, { ...opts, luck: (opts.luck ?? 0) + (loot - 1) });
  return null;
}
