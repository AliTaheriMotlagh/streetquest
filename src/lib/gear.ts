// RPG loot: procedurally rolled gear with rarity and affixes. The weapon you equip
// is the gun you carry in first-person fights. Pure — client and server.
import { msg, t } from "./i18n";
import type { Rarity } from "./catalog";
import type { ModKey, Mods } from "./hero";

export type Slot = "weapon" | "armor" | "gadget";
export type WeaponKey = "ar" | "smg" | "dmr" | "lmg";
/** Slot names — English keys, shown with t(). */
export const SLOT_LABEL: Record<Slot, string> = { weapon: msg("weapon"), armor: msg("armor"), gadget: msg("gadget") };

export type GearBase = { key: string; slot: Slot; name: string; emoji: string; implicit: Mods; weapon?: WeaponKey };

export const GEAR_BASES: GearBase[] = [
  { key: "ar", slot: "weapon", name: msg("Assault Rifle"), emoji: "🔫", implicit: {}, weapon: "ar" },
  { key: "smg", slot: "weapon", name: msg("SMG"), emoji: "🔫", implicit: { fpsSpeed: 0.05 }, weapon: "smg" },
  { key: "dmr", slot: "weapon", name: msg("Marksman Rifle"), emoji: "🔭", implicit: { headBonus: 0.3 }, weapon: "dmr" },
  { key: "lmg", slot: "weapon", name: msg("LMG"), emoji: "🧨", implicit: { fpsHp: 10 }, weapon: "lmg" },
  { key: "vest", slot: "armor", name: msg("Tactical Vest"), emoji: "🦺", implicit: { fpsHp: 15 } },
  { key: "plate", slot: "armor", name: msg("Plate Carrier"), emoji: "🛡️", implicit: { fpsHp: 28, fpsSpeed: -0.05 } },
  { key: "exo", slot: "armor", name: msg("Exo Frame"), emoji: "🤖", implicit: { fpsHp: 18, armyHp: 0.05 } },
  { key: "radio", slot: "gadget", name: msg("Field Radio"), emoji: "📻", implicit: { armyAtk: 0.05 } },
  { key: "drone", slot: "gadget", name: msg("Recon Drone"), emoji: "🛸", implicit: { loot: 0.08 } },
  { key: "toolkit", slot: "gadget", name: msg("Engineer Kit"), emoji: "🧰", implicit: { buildTime: 0.08 } },
  { key: "ledger", slot: "gadget", name: msg("Supply Ledger"), emoji: "📒", implicit: { income: 0.1 } },
];
export const GEAR_BASE_BY_KEY = Object.fromEntries(GEAR_BASES.map((b) => [b.key, b])) as Record<string, GearBase>;

/** Value of an affix = (base + per·level) × quality(0.8–1.2). */
const AFFIXES: { key: ModKey; word: string; base: number; per: number }[] = [
  { key: "fpsDmg", word: msg("Deadly"), base: 0.03, per: 0.004 },
  { key: "fpsHp", word: msg("Sturdy"), base: 6, per: 1 },
  { key: "fpsSpeed", word: msg("Swift"), base: 0.02, per: 0.001 },
  { key: "headBonus", word: msg("Precise"), base: 0.1, per: 0.01 },
  { key: "armyAtk", word: msg("Commanding"), base: 0.03, per: 0.003 },
  { key: "armyHp", word: msg("Stalwart"), base: 0.03, per: 0.003 },
  { key: "buildTime", word: msg("Tireless"), base: 0.03, per: 0.002 },
  { key: "trainTime", word: msg("Drillmaster's"), base: 0.03, per: 0.002 },
  { key: "researchTime", word: msg("Scholarly"), base: 0.03, per: 0.002 },
  { key: "income", word: msg("Prosperous"), base: 0.04, per: 0.004 },
  { key: "loot", word: msg("Lucky"), base: 0.04, per: 0.004 },
  { key: "turret", word: msg("Fortified"), base: 0.05, per: 0.004 },
  { key: "xp", word: msg("Wise"), base: 0.03, per: 0.002 },
];
const AFFIX_BY_KEY = Object.fromEntries(AFFIXES.map((a) => [a.key, a])) as Record<ModKey, (typeof AFFIXES)[number]>;

export const RARITY_AFFIXES: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };
const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
const LEGEND_NAMES = [msg("Nightfall"), msg("Ironheart"), msg("Last Light"), msg("Red Dawn"), msg("Widowmaker"), msg("Old Faithful"), msg("Kingmaker")];

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

/**
 * A gear item's name in the reader's language. Names are stored in English as
 * "<Affix word> <Base>" or "“<Legend>” <Base>", so they're rebuilt from their parts.
 */
export function gearName(g: Pick<GearItem, "base" | "name">) {
  const base = GEAR_BASE_BY_KEY[g.base];
  if (!base || !g.name.endsWith(base.name)) return g.name;
  const head = g.name.slice(0, -base.name.length).trim();
  const legend = /^“(.+)”$/.exec(head);
  if (legend) return t("“{legend}” {base}", { legend: t(legend[1]), base: t(base.name) });
  return head ? t("{word} {base}", { word: t(head), base: t(base.name) }) : t(base.name);
}

export const SALVAGE_SCRAP: Record<Rarity, number> = { common: 2, rare: 5, epic: 12, legendary: 30 };
export const forgeCost = (level: number) => ({ scrap: 3 + level, coins: 20 * level });
export const MAX_GEAR = 40;
export const MAX_GEAR_LEVEL = 50;
