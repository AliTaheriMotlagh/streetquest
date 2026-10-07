// RPG layer: your commander is a hero. Class + attributes + gear + research + buffs
// fold into one Bonus that every other layer reads (FPS, army, economy, XP). Pure.

export type ArmorClass = "infantry" | "vehicle" | "air";

/** Additive modifiers. Percentages are fractions (0.1 = +10%). */
export type Mods = Partial<{
  fpsHp: number; // flat HP
  fpsDmg: number;
  fpsSpeed: number;
  headBonus: number; // added to the weapon's headshot multiplier
  armyAtk: number;
  armyHp: number;
  infantryAtk: number;
  vehicleAtk: number;
  airAtk: number;
  rocketAtk: number;
  vehicleHp: number;
  buildTime: number; // time reductions
  trainTime: number;
  researchTime: number;
  income: number;
  loot: number;
  turret: number;
  xp: number;
  losses: number; // battle casualty reduction
}>;
export type ModKey = keyof Mods;

export type Bonus = {
  fpsHp: number;
  fpsDmg: number;
  fpsSpeed: number;
  headBonus: number;
  armyAtk: number;
  armyHp: number;
  atkBy: Record<ArmorClass, number>;
  rocketAtk: number;
  vehicleHp: number;
  buildTime: number;
  trainTime: number;
  researchTime: number;
  income: number;
  loot: number;
  turret: number;
  xp: number;
  losses: number;
};

export const MOD_LABEL: Record<ModKey, { name: string; pct: boolean; time?: boolean }> = {
  fpsHp: { name: "FPS health", pct: false },
  fpsDmg: { name: "FPS damage", pct: true },
  fpsSpeed: { name: "Move speed", pct: true },
  headBonus: { name: "Headshot ×", pct: false },
  armyAtk: { name: "Army attack", pct: true },
  armyHp: { name: "Army health", pct: true },
  infantryAtk: { name: "Infantry attack", pct: true },
  vehicleAtk: { name: "Vehicle attack", pct: true },
  airAtk: { name: "Air attack", pct: true },
  rocketAtk: { name: "Rocket attack", pct: true },
  vehicleHp: { name: "Vehicle health", pct: true },
  buildTime: { name: "Build speed", pct: true, time: true },
  trainTime: { name: "Training speed", pct: true, time: true },
  researchTime: { name: "Research speed", pct: true, time: true },
  income: { name: "Income", pct: true },
  loot: { name: "Loot", pct: true },
  turret: { name: "Turret power", pct: true },
  xp: { name: "XP", pct: true },
  losses: { name: "Fewer losses", pct: true },
};

export const fmtMod = (k: ModKey, v: number) => {
  const l = MOD_LABEL[k];
  if (!l.pct) return `+${k === "headBonus" ? v.toFixed(2) : Math.round(v)} ${l.name}`;
  return `+${Math.round(v * 100)}% ${l.name}`;
};

// ---------------------------------------------------------------- classes
export type ClassKey = "vanguard" | "marksman" | "engineer" | "quartermaster" | "warlord";
export type ClassDef = { key: ClassKey; name: string; emoji: string; blurb: string; mods: Mods };
export const CLASSES: ClassDef[] = [
  { key: "vanguard", name: "Vanguard", emoji: "🛡️", blurb: "Front-line tank. Soaks bullets and keeps the army standing.", mods: { fpsHp: 30, armyHp: 0.1, vehicleHp: 0.1 } },
  { key: "marksman", name: "Marksman", emoji: "🎯", blurb: "One shot, one kill. Deadliest in first-person fights.", mods: { fpsDmg: 0.2, headBonus: 0.5, fpsSpeed: 0.05 } },
  { key: "engineer", name: "Engineer", emoji: "🔧", blurb: "Builds faster, researches faster, turrets hit harder.", mods: { buildTime: 0.25, researchTime: 0.2, turret: 0.3 } },
  { key: "quartermaster", name: "Quartermaster", emoji: "💰", blurb: "Runs the money. More supplies, more loot, more tribute.", mods: { income: 0.3, loot: 0.2, xp: 0.05 } },
  { key: "warlord", name: "Warlord", emoji: "⚔️", blurb: "Born to command. Stronger, faster-trained armies.", mods: { armyAtk: 0.15, trainTime: 0.15, losses: 0.1 } },
];
export const CLASS_BY_KEY = Object.fromEntries(CLASSES.map((c) => [c.key, c])) as Record<ClassKey, ClassDef>;
export const classOf = (k: string | null | undefined) => (k && k in CLASS_BY_KEY ? CLASS_BY_KEY[k as ClassKey] : null);

// ---------------------------------------------------------------- attributes
export type AttrKey = "str" | "agi" | "int" | "cha";
export const ATTR_BASE = 5;
export const ATTRS: { key: AttrKey; name: string; emoji: string; blurb: string; per: Mods }[] = [
  { key: "str", name: "Strength", emoji: "💪", blurb: "+3 FPS HP, +1% army HP", per: { fpsHp: 3, armyHp: 0.01 } },
  { key: "agi", name: "Agility", emoji: "🏃", blurb: "+1.5% FPS damage, +0.6% speed", per: { fpsDmg: 0.015, fpsSpeed: 0.006 } },
  { key: "int", name: "Intellect", emoji: "🧠", blurb: "+1.5% build, train & research speed", per: { buildTime: 0.015, trainTime: 0.015, researchTime: 0.015 } },
  { key: "cha", name: "Charisma", emoji: "🗣️", blurb: "+1.5% income & loot, +0.5% army attack", per: { income: 0.015, loot: 0.015, armyAtk: 0.005 } },
];
export const POINTS_PER_LEVEL = 3;
export const RESPEC_COST = 300;
export type Attrs = Record<AttrKey, number>;
export const attrPointsFree = (level: number, a: Attrs) => POINTS_PER_LEVEL * (level - 1) - (a.str + a.agi + a.int + a.cha - 4 * ATTR_BASE);

// ---------------------------------------------------------------- folding
export function sumMods(list: Mods[]): Mods {
  const out: Mods = {};
  for (const m of list) for (const [k, v] of Object.entries(m)) out[k as ModKey] = (out[k as ModKey] ?? 0) + (v ?? 0);
  return out;
}

export function toBonus(m: Mods, buffMult = 1): Bonus {
  const g = (k: ModKey) => m[k] ?? 0;
  const time = (k: ModKey) => Math.max(0.4, 1 - g(k)); // speed-ups cap at 60%
  return {
    fpsHp: g("fpsHp"),
    fpsDmg: 1 + g("fpsDmg"),
    fpsSpeed: Math.max(0.7, 1 + g("fpsSpeed")),
    headBonus: g("headBonus"),
    armyAtk: (1 + g("armyAtk")) * buffMult,
    armyHp: 1 + g("armyHp"),
    atkBy: { infantry: 1 + g("infantryAtk"), vehicle: 1 + g("vehicleAtk"), air: 1 + g("airAtk") },
    rocketAtk: 1 + g("rocketAtk"),
    vehicleHp: 1 + g("vehicleHp"),
    buildTime: time("buildTime"),
    trainTime: time("trainTime"),
    researchTime: time("researchTime"),
    income: 1 + g("income"),
    loot: 1 + g("loot"),
    turret: 1 + g("turret"),
    xp: 1 + g("xp"),
    losses: Math.max(0.5, 1 - g("losses")),
  };
}

export const NO_BONUS: Bonus = toBonus({});

export function heroMods(heroClass: string | null | undefined, a: Attrs): Mods[] {
  const out: Mods[] = [];
  const c = classOf(heroClass);
  if (c) out.push(c.mods);
  for (const at of ATTRS) {
    const n = a[at.key] - ATTR_BASE;
    if (n > 0) out.push(Object.fromEntries(Object.entries(at.per).map(([k, v]) => [k, (v ?? 0) * n])) as Mods);
  }
  return out;
}
