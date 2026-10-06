// Strategy layer (Generals: Zero Hour style): factions, base buildings, units,
// power, supply income and auto-resolved battles. Pure — safe on client and server.
import { hashStr, rng } from "./geo";

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
export type BuildingKey = "hq" | "power" | "supply" | "barracks" | "factory" | "airfield" | "turret" | "quarters";
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
export function pendingSupply(buildings: BuildingState[], lastCollectAt: Date | string, now = Date.now()) {
  const lvl = levelOf(buildings, "supply", now);
  const hours = Math.min(SUPPLY_CAP_HOURS, Math.max(0, (now - new Date(lastCollectAt).getTime()) / 3_600_000));
  return Math.floor(lvl * SUPPLY_PER_LEVEL_HOUR * hours);
}

// ---------------------------------------------------------------- units
export type UnitKey = "ranger" | "rocket" | "tank" | "artillery" | "jet";
export type UnitDef = {
  key: UnitKey;
  name: string;
  emoji: string;
  building: BuildingKey;
  buildingLevel: number;
  cost: number;
  atk: number;
  hp: number;
  seconds: number;
  siege: number; // multiplier vs structures
};

export const UNITS: UnitDef[] = [
  { key: "ranger", name: "Ranger", emoji: "🪖", building: "barracks", buildingLevel: 1, cost: 50, atk: 4, hp: 12, seconds: 20, siege: 0.8 },
  { key: "rocket", name: "Rocket Squad", emoji: "🚀", building: "barracks", buildingLevel: 2, cost: 110, atk: 9, hp: 10, seconds: 35, siege: 1.2 },
  { key: "tank", name: "Battle Tank", emoji: "🛡️", building: "factory", buildingLevel: 1, cost: 280, atk: 16, hp: 45, seconds: 60, siege: 1 },
  { key: "artillery", name: "Artillery", emoji: "💥", building: "factory", buildingLevel: 2, cost: 420, atk: 28, hp: 20, seconds: 90, siege: 1.6 },
  { key: "jet", name: "Strike Jet", emoji: "✈️", building: "airfield", buildingLevel: 1, cost: 650, atk: 40, hp: 30, seconds: 120, siege: 1.3 },
];
export const UNIT_BY_KEY = Object.fromEntries(UNITS.map((u) => [u.key, u])) as Record<UnitKey, UnitDef>;
export const unitCost = (u: UnitDef, f: FactionDef | null) => Math.round(u.cost * (f?.cost ?? 1));

export type Army = Partial<Record<UnitKey, number>>;

export function armyStats(army: Army, f: FactionDef | null, vsStructures = false) {
  let atk = 0;
  let hp = 0;
  let count = 0;
  for (const [k, q] of Object.entries(army)) {
    const u = UNIT_BY_KEY[k as UnitKey];
    if (!u || !q) continue;
    atk += u.atk * q * (vsStructures ? u.siege : 1);
    hp += u.hp * q;
    count += q;
  }
  return { atk: Math.round(atk * (f?.atk ?? 1)), hp: Math.round(hp * (f?.hp ?? 1)), count };
}

/** Static defenses of a base: turrets + command center. */
export function baseDefense(buildings: BuildingState[], f: FactionDef | null, now = Date.now()) {
  const turret = levelOf(buildings, "turret", now);
  const hq = levelOf(buildings, "hq", now);
  const { ok } = powerOf(buildings, f, now);
  return { atk: Math.round(turret * 30 * (ok ? 1 : 0.5) + hq * 6), hp: turret * 150 + hq * 250 };
}

// ---------------------------------------------------------------- battle auto-resolve
export type Side = { army: Army; faction: FactionDef | null; structures?: { atk: number; hp: number }; moodMult?: number };
export type BattleResult = {
  won: boolean;
  rounds: { atk: number; def: number; atkHpLeft: number; defHpLeft: number }[];
  attackerLosses: Army;
  defenderLosses: Army;
  structureDamage: number;
};

function casualties(army: Army, fraction: number, rand: () => number): Army {
  const out: Army = {};
  for (const [k, q] of Object.entries(army)) {
    if (!q) continue;
    const exact = q * Math.min(1, fraction);
    const lost = Math.min(q, Math.floor(exact) + (rand() < exact % 1 ? 1 : 0));
    if (lost) out[k as UnitKey] = lost;
  }
  return out;
}

/** Deterministic for a given seed, so battle logs can be replayed. */
export function resolveBattle(attacker: Side, defender: Side, seed: string): BattleResult {
  const rand = rng(hashStr(seed));
  const a = armyStats(attacker.army, attacker.faction, true);
  const d = armyStats(defender.army, defender.faction);
  const atkPower = a.atk * (attacker.moodMult ?? 1);
  const defPower = (d.atk * 1.15 + (defender.structures?.atk ?? 0)) * (defender.moodMult ?? 1); // defender's advantage
  const atkHp = a.hp;
  const defHp = d.hp + (defender.structures?.hp ?? 0);
  let aLeft = atkHp;
  let dLeft = defHp;
  const rounds: BattleResult["rounds"] = [];
  for (let i = 0; i < 6 && aLeft > 0 && dLeft > 0; i++) {
    const strength = (left: number, total: number) => 0.35 + 0.65 * (total ? left / total : 0); // weakened armies hit softer
    const hitA = Math.round(atkPower * strength(aLeft, atkHp) * (0.75 + rand() * 0.5));
    const hitD = Math.round(defPower * strength(dLeft, defHp) * (0.75 + rand() * 0.5));
    dLeft = Math.max(0, dLeft - hitA);
    aLeft = Math.max(0, aLeft - hitD);
    rounds.push({ atk: hitA, def: hitD, atkHpLeft: aLeft, defHpLeft: dLeft });
  }
  // After 6 rounds without a wipe, whoever kept more of their strength holds the field.
  const won = dLeft <= 0 || (aLeft > 0 && dLeft / Math.max(1, defHp) < aLeft / Math.max(1, atkHp));
  const dealt = defHp - dLeft;
  // Garrison soaks damage first, then structures.
  const garrisonShare = defHp ? d.hp / defHp : 0;
  return {
    won,
    rounds,
    attackerLosses: casualties(attacker.army, atkHp ? (atkHp - aLeft) / atkHp : 0, rand),
    defenderLosses: casualties(defender.army, d.hp ? (dealt * garrisonShare) / d.hp : 0, rand),
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
