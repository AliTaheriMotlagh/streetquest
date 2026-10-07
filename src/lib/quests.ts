// RPG quests: a story campaign that walks you through every system, plus three
// daily quests picked per player per day. Progress is driven by game events. Pure.
import type { Rarity } from "./catalog";
import { hashStr, rng } from "./geo";

export type QuestKind =
  | "collect" | "chest" | "derrick" | "train" | "build" | "research" | "siege_win" | "breach_win" | "kills"
  | "boss_dmg" | "eat" | "rest" | "socialize" | "outpost" | "power" | "run" | "class" | "base" | "equip" | "forge"
  | "arcade" | "duel_win" | "squad_run" | "tower" | "tower_down" | "raiders" | "squad" | "post";

export type Reward = { xp: number; coins: number; scrap?: number; gear?: Rarity };
export type QuestDef = { kind: QuestKind; target: number; title: string; desc: string; reward: Reward; lore?: string };

export const CAMPAIGN: QuestDef[] = [
  { kind: "collect", target: 3, title: "Boots on the Ground", desc: "Collect 3 items around the city", lore: "The city fell quiet after the Collapse. Supplies are scattered everywhere — start scavenging.", reward: { xp: 100, coins: 50 } },
  { kind: "class", target: 1, title: "Choose Your Path", desc: "Pick a hero class (Hero tab)", lore: "Every commander has a calling. Yours decides how you fight — and how you lead.", reward: { xp: 100, coins: 50, gear: "common" } },
  { kind: "base", target: 1, title: "Stake Your Claim", desc: "Plant your base (Base tab)", lore: "A commander without a base is just a drifter. Pick your ground.", reward: { xp: 150, coins: 100 } },
  { kind: "build", target: 2, title: "Breaking Ground", desc: "Construct 2 buildings or upgrades", lore: "Power, barracks, supplies. The dozers are waiting for orders.", reward: { xp: 150, coins: 120, scrap: 5 } },
  { kind: "train", target: 5, title: "Raise an Army", desc: "Train 5 units", lore: "Recruits are lining up at the gate. Make soldiers of them.", reward: { xp: 200, coins: 100 } },
  { kind: "equip", target: 1, title: "Gear Up", desc: "Equip a piece of gear (Hero → Gear)", lore: "Loot is only useful if you wear it.", reward: { xp: 120, coins: 60, scrap: 5 } },
  { kind: "derrick", target: 1, title: "Black Gold", desc: "Capture an oil derrick with your army", lore: "Militias sit on the city's oil. Take it from them.", reward: { xp: 250, coins: 150, gear: "rare" } },
  { kind: "research", target: 1, title: "The War Lab", desc: "Start a research project (Base → Research)", lore: "Scrap and coin buy better armor and sharper rockets.", reward: { xp: 250, coins: 100, scrap: 10 } },
  { kind: "outpost", target: 1, title: "Plant the Flag", desc: "Capture an outpost", lore: "Territory means tribute. Hold ground and the coins flow in.", reward: { xp: 300, coins: 200 } },
  { kind: "power", target: 1, title: "General's Orders", desc: "Use a General's Power", lore: "Rank has privileges — air drops, barrages, battle cries.", reward: { xp: 250, coins: 150 } },
  { kind: "siege_win", target: 1, title: "First Blood", desc: "Win a siege against another player", lore: "A rival commander has grown fat. Show them the cost of weakness.", reward: { xp: 400, coins: 250, gear: "epic" } },
  { kind: "kills", target: 5, title: "Boots and Bullets", desc: "Get 5 kills in first-person fights", lore: "Some battles have to be won up close.", reward: { xp: 400, coins: 200 } },
  { kind: "boss_dmg", target: 800, title: "Giant Slayer", desc: "Deal 800 damage to world bosses", lore: "The war machines roaming the city answer to no one. End them.", reward: { xp: 600, coins: 400, gear: "legendary" } },
];

const DAILY_POOL: QuestDef[] = [
  { kind: "collect", target: 6, title: "Scavenger", desc: "Collect 6 items", reward: { xp: 120, coins: 60 } },
  { kind: "chest", target: 2, title: "Safecracker", desc: "Open 2 chests", reward: { xp: 150, coins: 80, scrap: 3 } },
  { kind: "derrick", target: 1, title: "Oil Baron", desc: "Capture a derrick", reward: { xp: 200, coins: 120 } },
  { kind: "train", target: 8, title: "Drill Sergeant", desc: "Train 8 units", reward: { xp: 150, coins: 100 } },
  { kind: "build", target: 1, title: "Foreman", desc: "Construct or upgrade a building", reward: { xp: 120, coins: 80, scrap: 3 } },
  { kind: "kills", target: 3, title: "Sharpshooter", desc: "Get 3 FPS kills", reward: { xp: 200, coins: 100, gear: "rare" } },
  { kind: "boss_dmg", target: 300, title: "Monster Hunter", desc: "Deal 300 boss damage", reward: { xp: 200, coins: 120, scrap: 5 } },
  { kind: "eat", target: 2, title: "Well Fed", desc: "Eat 2 meals", reward: { xp: 80, coins: 40 } },
  { kind: "rest", target: 1, title: "Recharge", desc: "Rest at your base", reward: { xp: 80, coins: 40 } },
  { kind: "outpost", target: 1, title: "Expansionist", desc: "Capture an outpost", reward: { xp: 250, coins: 150 } },
  { kind: "power", target: 1, title: "By Order Of", desc: "Use a General's Power", reward: { xp: 120, coins: 80 } },
  { kind: "run", target: 1, title: "Wheelman", desc: "Finish a timed run", reward: { xp: 150, coins: 80 } },
  { kind: "siege_win", target: 1, title: "Conqueror", desc: "Win a siege", reward: { xp: 250, coins: 150, gear: "rare" } },
  { kind: "forge", target: 1, title: "Blacksmith", desc: "Upgrade gear at the forge", reward: { xp: 100, coins: 50, scrap: 4 } },
  { kind: "arcade", target: 2, title: "Range Day", desc: "Play 2 mini-games (range or bomb defuse)", reward: { xp: 120, coins: 70 } },
  { kind: "duel_win", target: 1, title: "Top Gun", desc: "Win a multiplayer mini-game", reward: { xp: 200, coins: 120, gear: "rare" } },
  { kind: "squad_run", target: 1, title: "Squad Goals", desc: "Finish a run with a squad", reward: { xp: 200, coins: 120 } },
  { kind: "tower", target: 1, title: "Fortify", desc: "Build or upgrade a tower", reward: { xp: 120, coins: 80, scrap: 3 } },
  { kind: "raiders", target: 8, title: "Hold the Line", desc: "Kill 8 raiders with towers, squads or airstrikes", reward: { xp: 200, coins: 150, scrap: 4 } },
  { kind: "tower_down", target: 1, title: "Demolition", desc: "Destroy an enemy tower", reward: { xp: 250, coins: 150, gear: "rare" } },
  { kind: "squad", target: 1, title: "Boots on the Map", desc: "Deploy a squad onto the map", reward: { xp: 100, coins: 60 } },
  { kind: "post", target: 1, title: "Leave Your Mark", desc: "Pin a message or photo somewhere", reward: { xp: 80, coins: 40 } },
];

export function dailyQuests(userId: string, day: string): (QuestDef & { key: string })[] {
  const rand = rng(hashStr(`daily|${userId}|${day}`));
  const pool = [...DAILY_POOL];
  const out: (QuestDef & { key: string })[] = [];
  for (let i = 0; i < 3; i++) out.push({ ...pool.splice(Math.floor(rand() * pool.length), 1)[0], key: `d:${day}:${i}` });
  return out;
}

export const campaignKey = (step: number) => `c:${step}`;
/** Steps that complete from state rather than events (e.g. you already have a class). */
export const STATE_KINDS: QuestKind[] = ["class", "base", "equip"];
