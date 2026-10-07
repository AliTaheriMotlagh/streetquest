// RPG loot: procedurally rolled gear with rarity and affixes. The weapon you equip
// is the gun you carry in first-person fights. Pure — client and server.
import type { Rarity } from "./catalog";
import type { ModKey, Mods } from "./hero";

export type Slot = "weapon" | "armor" | "gadget";
export type WeaponKey = "ar" | "smg" | "dmr" | "lmg";
export type GearBase = { key: string; slot: Slot; name: string; emoji: string; implicit: Mods; weapon?: WeaponKey };

export const GEAR_BASES: GearBase[] = [
  { key: "ar", slot: "weapon", name: "Assault Rifle", emoji: "🔫", implicit: {}, weapon: "ar" },
  { key: "smg", slot: "weapon", name: "SMG", emoji: "🔫", implicit: { fpsSpeed: 0.05 }, weapon: "smg" },
  { key: "dmr", slot: "weapon", name: "Marksman Rifle", emoji: "🔭", implicit: { headBonus: 0.3 }, weapon: "dmr" },
  { key: "lmg", slot: "weapon", name: "LMG", emoji: "🧨", implicit: { fpsHp: 10 }, weapon: "lmg" },
  { key: "vest", slot: "armor", name: "Tactical Vest", emoji: "🦺", implicit: { fpsHp: 15 } },
  { key: "plate", slot: "armor", name: "Plate Carrier", emoji: "🛡️", implicit: { fpsHp: 28, fpsSpeed: -0.05 } },
  { key: "exo", slot: "armor", name: "Exo Frame", emoji: "🤖", implicit: { fpsHp: 18, armyHp: 0.05 } },
  { key: "radio", slot: "gadget", name: "Field Radio", emoji: "📻", implicit: { armyAtk: 0.05 } },
  { key: "drone", slot: "gadget", name: "Recon Drone", emoji: "🛸", implicit: { loot: 0.08 } },
  { key: "toolkit", slot: "gadget", name: "Engineer Kit", emoji: "🧰", implicit: { buildTime: 0.08 } },
  { key: "ledger", slot: "gadget", name: "Supply Ledger", emoji: "📒", implicit: { income: 0.1 } },
];
export const GEAR_BASE_BY_KEY = Object.fromEntries(GEAR_BASES.map((b) => [b.key, b])) as Record<string, GearBase>;

/** Value of an affix = (base + per·level) × quality(0.8–1.2). */
const AFFIXES: { key: ModKey; word: string; base: number; per: number }[] = [
  { key: "fpsDmg", word: "Deadly", base: 0.03, per: 0.004 },
  { key: "fpsHp", word: "Sturdy", base: 6, per: 1 },
  { key: "fpsSpeed", word: "Swift", base: 0.02, per: 0.001 },
  { key: "headBonus", word: "Precise", base: 0.1, per: 0.01 },
  { key: "armyAtk", word: "Commanding", base: 0.03, per: 0.003 },
  { key: "armyHp", word: "Stalwart", base: 0.03, per: 0.003 },
  { key: "buildTime", word: "Tireless", base: 0.03, per: 0.002 },
  { key: "trainTime", word: "Drillmaster's", base: 0.03, per: 0.002 },
  { key: "researchTime", word: "Scholarly", base: 0.03, per: 0.002 },
  { key: "income", word: "Prosperous", base: 0.04, per: 0.004 },
  { key: "loot", word: "Lucky", base: 0.04, per: 0.004 },
  { key: "turret", word: "Fortified", base: 0.05, per: 0.004 },
  { key: "xp", word: "Wise", base: 0.03, per: 0.002 },
];
const AFFIX_BY_KEY = Object.fromEntries(AFFIXES.map((a) => [a.key, a])) as Record<ModKey, (typeof AFFIXES)[number]>;

export const RARITY_AFFIXES: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };
const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
const LEGEND_NAMES = ["Nightfall", "Ironheart", "Last Light", "Red Dawn", "Widowmaker", "Old Faithful", "Kingmaker"];

export type Affix = { key: ModKey; q: number };
export type GearItem = { id?: string; slot: Slot; base: string; name: string; rarity: Rarity; level: number; affixes: Affix[]; equipped?: boolean };

export const affixValue = (a: Affix, level: number) => {
  const d = AFFIX_BY_KEY[a.key];
  const v = (d.base + d.per * level) * (0.8 + 0.4 * a.q);
  return a.key === "fpsHp" ? Math.round(v) : Math.round(v * 1000) / 1000;
};

export function gearMods(g: Pick<GearItem, "base" | "level" | "affixes">): Mods {
  const out: Mods = { ...(GEAR_BASE_BY_KEY[g.base]?.implicit ?? {}) };
  for (const a of g.affixes) out[a.key] = (out[a.key] ?? 0) + affixValue(a, g.level);
  return out;
}

/** Roll a new item. `luck` (0+) shifts the rarity odds up; `floor` is the minimum rarity. */
export function rollGear(rand: () => number, level: number, opts: { luck?: number; floor?: Rarity; slot?: Slot } = {}): GearItem {
  const r = rand() / (1 + (opts.luck ?? 0));
  let rarity: Rarity = r < 0.03 ? "legendary" : r < 0.13 ? "epic" : r < 0.4 ? "rare" : "common";
  if (opts.floor && RARITIES.indexOf(rarity) < RARITIES.indexOf(opts.floor)) rarity = opts.floor;
  const pool = GEAR_BASES.filter((b) => !opts.slot || b.slot === opts.slot);
  const base = pool[Math.floor(rand() * pool.length)];
  const keys = [...AFFIXES].sort(() => rand() - 0.5).slice(0, RARITY_AFFIXES[rarity]);
  const affixes = keys.map((a) => ({ key: a.key, q: Math.round(rand() * 100) / 100 }));
  const word = AFFIX_BY_KEY[affixes[0].key].word;
  const name = rarity === "legendary" ? `“${LEGEND_NAMES[Math.floor(rand() * LEGEND_NAMES.length)]}” ${base.name}` : `${word} ${base.name}`;
  return { slot: base.slot, base: base.key, name, rarity, level: Math.max(1, level), affixes };
}

export const SALVAGE_SCRAP: Record<Rarity, number> = { common: 2, rare: 5, epic: 12, legendary: 30 };
export const forgeCost = (level: number) => ({ scrap: 3 + level, coins: 20 * level });
export const MAX_GEAR = 40;
export const MAX_GEAR_LEVEL = 50;
