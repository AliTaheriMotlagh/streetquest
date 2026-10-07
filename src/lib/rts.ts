// Strategy layer (Generals: Zero Hour style): factions, base buildings, units,
// power, supply income and auto-resolved battles. Pure — safe on client and server.
import { hashStr, rng } from "./geo";
import { NO_BONUS, type ArmorClass, type Bonus, type Mods } from "./hero";

// ---------------------------------------------------------------- factions
export type FactionKey = "coalition" | "dragon" | "insurgency";
export type FactionDef = {
  key: FactionKey;
  name: string;
  emoji: string;
  color: string;
  blurb: string;
  atk: number; // attack multiplier
  hp: number; // unit hp multiplier
  cost: number; // unit + building cost multiplier
  needsPower: boolean;
  loot: number; // siege loot multiplier
};

export const FACTIONS: FactionDef[] = [
  { key: "coalition", name: "Coalition", emoji: "🦅", color: "#38bdf8", blurb: "High-tech army. Hits hardest, costs the most. Air power.", atk: 1.2, hp: 1, cost: 1.1, needsPower: true, loot: 1 },
  { key: "dragon", name: "Dragon Army", emoji: "🐉", color: "#ff4d4d", blurb: "Hordes and heavy armor. Cheap, tough units. Power plants run hot.", atk: 1, hp: 1.2, cost: 0.9, needsPower: true, loot: 1 },
  { key: "insurgency", name: "Insurgency", emoji: "🦂", color: "#3dff8f", blurb: "Guerrillas. No power grid needed, cheap units, +30% raid loot.", atk: 0.9, hp: 0.95, cost: 0.8, needsPower: false, loot: 1.3 },
];
export const FACTION_BY_KEY = Object.fromEntries(FACTIONS.map((f) => [f.key, f])) as Record<FactionKey, FactionDef>;
export const factionOf = (key: string | null | undefined) => (key && key in FACTION_BY_KEY ? FACTION_BY_KEY[key as FactionKey] : null);

// ---------------------------------------------------------------- buildings
export type BuildingKey = "hq" | "power" | "supply" | "barracks" | "factory" | "airfield" | "turret" | "quarters" | "camp" | "builder" | "vault" | "walls";
export type BuildingDef = {
  key: BuildingKey;
  name: string;
  emoji: string;
  blurb: string;
  cost: number; // level-1 cost; scales with level
  minutes: number; // level-1 build time; scales with level
  power: number; // + produces, - consumes (per level)
  hqLevel: number; // command center level required
};

export const BUILDINGS: BuildingDef[] = [
  { key: "hq", name: "Command Center", emoji: "🏛️", blurb: "Heart of the base. Upgrading unlocks more buildings and higher levels.", cost: 400, minutes: 3, power: 5, hqLevel: 0 },
  { key: "power", name: "Power Plant", emoji: "⚡", blurb: "+10 power per level. Low power slows everything and weakens turrets.", cost: 150, minutes: 1, power: 10, hqLevel: 1 },
  { key: "supply", name: "Supply Center", emoji: "📦", blurb: "Trucks bring in supplies: +60 🪙/hour per level (stores up to 12 h).", cost: 200, minutes: 2, power: -2, hqLevel: 1 },
  { key: "barracks", name: "Barracks", emoji: "🪖", blurb: "Trains infantry. Level 2 unlocks Rocket Squads.", cost: 200, minutes: 2, power: -2, hqLevel: 1 },
  { key: "turret", name: "Defense Turret", emoji: "🗼", blurb: "Guards the base in sieges and spawns garrison bots in breaches.", cost: 250, minutes: 2, power: -3, hqLevel: 1 },
  { key: "quarters", name: "Quarters", emoji: "🛏️", blurb: "Your commander's home. Better rest and a mess hall for meals.", cost: 150, minutes: 1, power: -1, hqLevel: 1 },
  { key: "camp", name: "Army Camp", emoji: "⛺", blurb: "Housing for your troops: +20 housing space per level.", cost: 150, minutes: 1, power: 0, hqLevel: 1 },
  { key: "builder", name: "Builder's Hut", emoji: "🔨", blurb: "Each level adds a builder, so more constructions run at once.", cost: 300, minutes: 1, power: 0, hqLevel: 1 },
  { key: "vault", name: "Vault", emoji: "🏦", blurb: "Protects coins from raiders: 30% + 10% per level is untouchable.", cost: 250, minutes: 2, power: -1, hqLevel: 1 },
  { key: "walls", name: "Walls", emoji: "🧱", blurb: "+300 structure HP per level. Raiders have to chew through them.", cost: 120, minutes: 1, power: 0, hqLevel: 1 },
  { key: "factory", name: "War Factory", emoji: "🏭", blurb: "Builds tanks. Level 2 unlocks artillery.", cost: 500, minutes: 4, power: -4, hqLevel: 2 },
  { key: "airfield", name: "Airfield", emoji: "✈️", blurb: "Launches strike jets.", cost: 800, minutes: 6, power: -5, hqLevel: 3 },
];
export const BUILDING_BY_KEY = Object.fromEntries(BUILDINGS.map((b) => [b.key, b])) as Record<BuildingKey, BuildingDef>;
export const MAX_LEVEL = 5;

export const buildCost = (b: BuildingDef, level: number, f: FactionDef | null) => Math.round(b.cost * level ** 1.5 * (f?.cost ?? 1));
export const buildSeconds = (b: BuildingDef, level: number) => Math.round(b.minutes * 60 * level);

export type BuildingState = { type: string; level: number; readyAt: Date | string };
/** A building under construction/upgrade counts at its previous level until ready. */
export function effectiveLevel(b: BuildingState, now = Date.now()) {
  return new Date(b.readyAt).getTime() <= now ? b.level : b.level - 1;
}
export function levelOf(buildings: BuildingState[], key: BuildingKey, now = Date.now()) {
  const b = buildings.find((x) => x.type === key);
  return b ? effectiveLevel(b, now) : 0;
}

export function powerOf(buildings: BuildingState[], f: FactionDef | null, now = Date.now()) {
  let made = 0;
  let used = 0;
  for (const b of buildings) {
    const def = BUILDING_BY_KEY[b.type as BuildingKey];
    const lvl = effectiveLevel(b, now);
    if (!def || lvl <= 0) continue;
    const p = def.power * lvl * (def.key === "power" && f?.key === "dragon" ? 1.5 : 1);
    if (p > 0) made += p;
    else used -= p;
  }
  const ok = !f?.needsPower || made >= used;
  return { made: Math.round(made), used: Math.round(used), ok };
}

/** Low power (Generals rule): production takes 50% longer. */
export const slowdown = (powerOk: boolean) => (powerOk ? 1 : 1.5);

export const SUPPLY_PER_LEVEL_HOUR = 60;
export const SUPPLY_CAP_HOURS = 12;
export function pendingSupply(buildings: BuildingState[], lastCollectAt: Date | string, now = Date.now(), incomeMult = 1) {
  const lvl = levelOf(buildings, "supply", now);
  const hours = Math.min(SUPPLY_CAP_HOURS, Math.max(0, (now - new Date(lastCollectAt).getTime()) / 3_600_000));
  return Math.floor(lvl * SUPPLY_PER_LEVEL_HOUR * hours * incomeMult);
}

// ---------------------------------------------------------------- units
// Rock-paper-scissors: every unit has an armor class and a damage multiplier vs each class.
export type UnitKey = "ranger" | "rocket" | "tank" | "artillery" | "jet";
export type Target = ArmorClass | "structure";
export type UnitDef = {
  key: UnitKey;
  name: string;
  emoji: string;
  cls: ArmorClass;
  building: BuildingKey;
  buildingLevel: number;
  cost: number;
  atk: number;
  hp: number;
  seconds: number;
  housing: number; // Army Camp space (Clash-style)
  vs: Record<Target, number>;
  role: string;
};

export const UNITS: UnitDef[] = [
  { key: "ranger", name: "Ranger", emoji: "🪖", cls: "infantry", building: "barracks", buildingLevel: 1, cost: 50, atk: 4, hp: 12, seconds: 20, housing: 1, vs: { infantry: 1.4, vehicle: 0.4, air: 0.6, structure: 0.7 }, role: "Cheap. Shreds infantry." },
  { key: "rocket", name: "Rocket Squad", emoji: "🚀", cls: "infantry", building: "barracks", buildingLevel: 2, cost: 110, atk: 9, hp: 10, seconds: 35, housing: 2, vs: { infantry: 0.6, vehicle: 1.7, air: 1.5, structure: 1.1 }, role: "Tank & jet hunter." },
  { key: "tank", name: "Battle Tank", emoji: "🛡️", cls: "vehicle", building: "factory", buildingLevel: 1, cost: 280, atk: 16, hp: 45, seconds: 60, housing: 5, vs: { infantry: 1.3, vehicle: 1.1, air: 0.2, structure: 1 }, role: "Tough all-rounder. Can't hit air." },
  { key: "artillery", name: "Artillery", emoji: "💥", cls: "vehicle", building: "factory", buildingLevel: 2, cost: 420, atk: 28, hp: 20, seconds: 90, housing: 6, vs: { infantry: 1.3, vehicle: 0.9, air: 0.1, structure: 1.8 }, role: "Wrecks bases. Fragile." },
  { key: "jet", name: "Strike Jet", emoji: "✈️", cls: "air", building: "airfield", buildingLevel: 1, cost: 650, atk: 40, hp: 30, seconds: 120, housing: 8, vs: { infantry: 0.9, vehicle: 1.6, air: 1, structure: 1.2 }, role: "Kills armor. Fears rockets." },
];
export const UNIT_BY_KEY = Object.fromEntries(UNITS.map((u) => [u.key, u])) as Record<UnitKey, UnitDef>;
export const unitCost = (u: UnitDef, f: FactionDef | null) => Math.round(u.cost * (f?.cost ?? 1));
/** Turrets: anti-air and anti-armor leaning. */
const TURRET_VS: Record<ArmorClass, number> = { infantry: 1, vehicle: 1.2, air: 1.5 };

export type Army = Partial<Record<UnitKey, number>>;
export type Vets = Partial<Record<UnitKey, number>>;

// ---------------------------------------------------------------- veterancy (Generals-style)
export const VET_RANKS = [
  { min: 0, name: "Rookie", stars: "", mult: 1 },
  { min: 100, name: "Veteran", stars: "⭐", mult: 1.1 },
  { min: 300, name: "Elite", stars: "⭐⭐", mult: 1.2 },
  { min: 700, name: "Heroic", stars: "⭐⭐⭐", mult: 1.35 },
];
export const vetRank = (v = 0) => [...VET_RANKS].reverse().find((r) => v >= r.min)!;
export const VET_GAIN = { fought: 30, won: 40 };

// ---------------------------------------------------------------- research (tech tree)
export type ResearchKey = "drills" | "ap_rockets" | "composite" | "supply_lines" | "lasers" | "radar" | "afterburners" | "medics";
export type ResearchDef = { key: ResearchKey; name: string; emoji: string; building: BuildingKey; level: number; coins: number; scrap: number; minutes: number; blurb: string; mods: Mods };
export const RESEARCH: ResearchDef[] = [
  { key: "drills", name: "Combat Drills", emoji: "🎖️", building: "barracks", level: 1, coins: 300, scrap: 5, minutes: 3, blurb: "+15% infantry attack", mods: { infantryAtk: 0.15 } },
  { key: "ap_rockets", name: "AP Rockets", emoji: "🚀", building: "barracks", level: 2, coins: 450, scrap: 8, minutes: 5, blurb: "+30% Rocket Squad attack", mods: { rocketAtk: 0.3 } },
  { key: "composite", name: "Composite Armor", emoji: "🛡️", building: "factory", level: 1, coins: 600, scrap: 12, minutes: 6, blurb: "+25% vehicle health", mods: { vehicleHp: 0.25 } },
  { key: "supply_lines", name: "Supply Lines", emoji: "🚚", building: "supply", level: 2, coins: 500, scrap: 10, minutes: 5, blurb: "+25% supply & tribute income", mods: { income: 0.25 } },
  { key: "lasers", name: "Laser Turrets", emoji: "🔆", building: "turret", level: 2, coins: 700, scrap: 15, minutes: 6, blurb: "+40% turret power", mods: { turret: 0.4 } },
  { key: "radar", name: "Radar Uplink", emoji: "📡", building: "hq", level: 2, coins: 400, scrap: 6, minutes: 4, blurb: "See enemy garrisons on the map", mods: {} },
  { key: "afterburners", name: "Afterburners", emoji: "✈️", building: "airfield", level: 1, coins: 900, scrap: 20, minutes: 8, blurb: "+25% air attack", mods: { airAtk: 0.25 } },
  { key: "medics", name: "Field Medics", emoji: "⛑️", building: "quarters", level: 2, coins: 500, scrap: 10, minutes: 5, blurb: "-20% casualties in battle", mods: { losses: 0.2 } },
];
export const RESEARCH_BY_KEY = Object.fromEntries(RESEARCH.map((r) => [r.key, r])) as Record<ResearchKey, ResearchDef>;

// ---------------------------------------------------------------- army maths
function unitMult(u: UnitDef, f: FactionDef | null, b: Bonus, vet = 0) {
  const v = vetRank(vet).mult;
  const atk = u.atk * (f?.atk ?? 1) * b.armyAtk * b.atkBy[u.cls] * (u.key === "rocket" ? b.rocketAtk : 1) * v;
  const hp = u.hp * (f?.hp ?? 1) * b.armyHp * (u.cls === "vehicle" ? b.vehicleHp : 1) * v;
  return { atk, hp };
}

export function armyStats(army: Army, f: FactionDef | null, b: Bonus = NO_BONUS, vets: Vets = {}) {
  let atk = 0;
  let hp = 0;
  let count = 0;
  const hpBy: Record<ArmorClass, number> = { infantry: 0, vehicle: 0, air: 0 };
  for (const [k, q] of Object.entries(army)) {
    const u = UNIT_BY_KEY[k as UnitKey];
    if (!u || !q) continue;
    const m = unitMult(u, f, b, vets[u.key]);
    atk += m.atk * q;
    hp += m.hp * q;
    hpBy[u.cls] += m.hp * q;
    count += q;
  }
  return { atk: Math.round(atk), hp: Math.round(hp), count, hpBy };
}

/** Static defenses of a base: turrets + command center. */
export function baseDefense(buildings: BuildingState[], f: FactionDef | null, now = Date.now(), b: Bonus = NO_BONUS) {
  const turret = levelOf(buildings, "turret", now);
  const hq = levelOf(buildings, "hq", now);
  const { ok } = powerOf(buildings, f, now);
  const walls = levelOf(buildings, "walls", now);
  return { atk: Math.round((turret * 30 * (ok ? 1 : 0.5) + hq * 6) * b.turret), hp: turret * 150 + hq * 250 + walls * 300 };
}

// ---------------------------------------------------------------- battle auto-resolve
export type Side = { army: Army; faction: FactionDef | null; vets?: Vets; bonus?: Bonus; structures?: { atk: number; hp: number }; moodMult?: number };
export type BattleResult = {
  won: boolean;
  atkPower: number;
  defPower: number;
  rounds: { atk: number; def: number; atkHpLeft: number; defHpLeft: number }[];
  attackerLosses: Army;
  defenderLosses: Army;
  structureDamage: number;
};

function casualties(army: Army, fraction: number, rand: () => number): Army {
  const out: Army = {};
  for (const [k, q] of Object.entries(army)) {
    if (!q) continue;
    const exact = q * Math.max(0, Math.min(1, fraction));
    const lost = Math.min(q, Math.floor(exact) + (rand() < exact % 1 ? 1 : 0));
    if (lost) out[k as UnitKey] = lost;
  }
  return out;
}

/** Effective damage of `side` against an enemy whose HP is split as `targets` (shares sum to 1). */
function effectiveAtk(side: Side, targets: Record<Target, number>) {
  const b = side.bonus ?? NO_BONUS;
  let atk = 0;
  for (const [k, q] of Object.entries(side.army)) {
    const u = UNIT_BY_KEY[k as UnitKey];
    if (!u || !q) continue;
    const vs = (Object.keys(targets) as Target[]).reduce((s, t) => s + targets[t] * u.vs[t], 0);
    atk += unitMult(u, side.faction, b, side.vets?.[u.key]).atk * q * vs;
  }
  if (side.structures?.atk) {
    const unitShare = targets.infantry + targets.vehicle + targets.air || 1;
    atk += side.structures.atk * ((targets.infantry * TURRET_VS.infantry + targets.vehicle * TURRET_VS.vehicle + targets.air * TURRET_VS.air) / unitShare);
  }
  return atk * (side.moodMult ?? 1);
}

function shares(side: Side) {
  const s = armyStats(side.army, side.faction, side.bonus, side.vets);
  const total = s.hp + (side.structures?.hp ?? 0) || 1;
  return {
    hp: s.hp + (side.structures?.hp ?? 0),
    unitHp: s.hp,
    t: { infantry: s.hpBy.infantry / total, vehicle: s.hpBy.vehicle / total, air: s.hpBy.air / total, structure: (side.structures?.hp ?? 0) / total } as Record<Target, number>,
  };
}

/** Deterministic for a given seed, so battle logs can be replayed. Counters matter: see UnitDef.vs. */
export function resolveBattle(attacker: Side, defender: Side, seed: string): BattleResult {
  const rand = rng(hashStr(seed));
  const A = shares(attacker);
  const D = shares(defender);
  const atkPower = effectiveAtk(attacker, D.t);
  const defPower = effectiveAtk(defender, A.t) * 1.15; // defender's advantage
  let aLeft = A.hp;
  let dLeft = D.hp;
  const rounds: BattleResult["rounds"] = [];
  for (let i = 0; i < 6 && aLeft > 0 && dLeft > 0; i++) {
    const strength = (left: number, total: number) => 0.35 + 0.65 * (total ? left / total : 0); // weakened armies hit softer
    const hitA = Math.round(atkPower * strength(aLeft, A.hp) * (0.75 + rand() * 0.5));
    const hitD = Math.round(defPower * strength(dLeft, D.hp) * (0.75 + rand() * 0.5));
    dLeft = Math.max(0, dLeft - hitA);
    aLeft = Math.max(0, aLeft - hitD);
    rounds.push({ atk: hitA, def: hitD, atkHpLeft: aLeft, defHpLeft: dLeft });
  }
  // After 6 rounds without a wipe, whoever kept more of their strength holds the field.
  const won = dLeft <= 0 || (aLeft > 0 && dLeft / Math.max(1, D.hp) < aLeft / Math.max(1, A.hp));
  const dealt = D.hp - dLeft;
  const garrisonShare = D.hp ? D.unitHp / D.hp : 0;
  return {
    won,
    atkPower: Math.round(atkPower),
    defPower: Math.round(defPower),
    rounds,
    attackerLosses: casualties(attacker.army, (A.hp ? (A.hp - aLeft) / A.hp : 0) * (attacker.bonus ?? NO_BONUS).losses, rand),
    defenderLosses: casualties(defender.army, (D.unitHp ? (dealt * garrisonShare) / D.unitHp : 0) * (defender.bonus ?? NO_BONUS).losses, rand),
    structureDamage: Math.round(dealt * (1 - garrisonShare)),
  };
}

// ---------------------------------------------------------------- rules
export const BASE_MIN_SPACING_M = 250;
export const SIEGE_RANGE_M = 5000; // armies march from your base
export const BREACH_RANGE_M = 200; // FPS needs you physically there
export const SIEGE_COOLDOWN_MS = 30 * 60_000;
export const SHIELD_MS = 2 * 3600_000;
export const RELOCATE_COST = 500;
export const MAX_RESEARCH_AT_ONCE = 1;

// ---------------------------------------------------------------- Clash-style rules
export const housingOf = (army: Army) => Object.entries(army).reduce((s, [k, q]) => s + (UNIT_BY_KEY[k as UnitKey]?.housing ?? 0) * (q ?? 0), 0);
export const campCapacity = (buildings: BuildingState[], now = Date.now()) => 10 + 20 * levelOf(buildings, "camp", now);
export const builderCount = (buildings: BuildingState[], now = Date.now()) => 1 + levelOf(buildings, "builder", now);
/** Share of a defender's coins that raiders can never take. */
export const vaultProtection = (buildings: BuildingState[], now = Date.now()) => {
  const v = levelOf(buildings, "vault", now);
  return v ? Math.min(0.85, 0.3 + 0.1 * v) : 0.1;
};

/** Destruction % of a siege → stars: 50% = ★, field won = ★★, 100% = ★★★. */
export function siegeStars(won: boolean, structureDamage: number, structureHp: number) {
  const destruction = structureHp > 0 ? Math.min(100, Math.round((100 * structureDamage) / structureHp)) : won ? 100 : 0;
  const stars = (destruction >= 50 ? 1 : 0) + (won ? 1 : 0) + (destruction >= 100 ? 1 : 0);
  return { destruction, stars };
}

/** Trophy swing: beating a stronger player pays more. 0 stars costs the attacker. */
export function trophySwing(atk: number, def: number, stars: number) {
  const base = Math.max(5, Math.min(59, Math.round(30 + (def - atk) / 12)));
  return stars > 0 ? Math.round((base * stars) / 3) : -Math.round(base * 0.6);
}

export const LEAGUES = [
  { min: 0, name: "Bronze", emoji: "🥉", bonus: 0 },
  { min: 400, name: "Silver", emoji: "🥈", bonus: 0.1 },
  { min: 800, name: "Gold", emoji: "🥇", bonus: 0.2 },
  { min: 1400, name: "Crystal", emoji: "💠", bonus: 0.3 },
  { min: 2000, name: "Master", emoji: "🔷", bonus: 0.4 },
  { min: 2600, name: "Champion", emoji: "🏆", bonus: 0.5 },
  { min: 3200, name: "Legend", emoji: "👑", bonus: 0.6 },
];
export const leagueOf = (trophies: number) => [...LEAGUES].reverse().find((l) => trophies >= l.min)!;

/** Gems finish any timer: 1 gem per started minute left. */
export const rushCost = (msLeft: number) => Math.max(1, Math.ceil(msLeft / 60_000));
