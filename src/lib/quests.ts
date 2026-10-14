// RPG quests: a story campaign that walks you through every system, plus three
// daily quests picked per player per day. Progress is driven by game events. Pure.
import { msg } from "./i18n";
import type { Rarity } from "./catalog";
import { hashStr, rng } from "./geo";

export type QuestKind =
  | "collect" | "chest" | "derrick" | "train" | "build" | "research" | "siege_win" | "breach_win" | "kills"
  | "boss_dmg" | "eat" | "rest" | "socialize" | "outpost" | "power" | "run" | "class" | "base" | "equip" | "forge"
  | "arcade" | "duel_win" | "squad_run" | "tower" | "tower_down" | "raiders" | "squad" | "post";

export type Reward = { xp: number; coins: number; scrap?: number; gear?: Rarity };
export type QuestDef = { kind: QuestKind; target: number; title: string; desc: string; reward: Reward; lore?: string };

export const CAMPAIGN: QuestDef[] = [
  { kind: "collect", target: 3, title: msg("Boots on the Ground"), desc: msg("Collect 3 items around the city"), lore: msg("The city fell quiet after the Collapse. Supplies are scattered everywhere — start scavenging."), reward: { xp: 100, coins: 50 } },
  { kind: "class", target: 1, title: msg("Choose Your Path"), desc: msg("Pick a hero class (Hero tab)"), lore: msg("Every commander has a calling. Yours decides how you fight — and how you lead."), reward: { xp: 100, coins: 50, gear: "common" } },
  { kind: "base", target: 1, title: msg("Stake Your Claim"), desc: msg("Plant your base (Base tab)"), lore: msg("A commander without a base is just a drifter. Pick your ground."), reward: { xp: 150, coins: 100 } },
  { kind: "build", target: 2, title: msg("Breaking Ground"), desc: msg("Construct 2 buildings or upgrades"), lore: msg("Power, barracks, supplies. The dozers are waiting for orders."), reward: { xp: 150, coins: 120, scrap: 5 } },
  { kind: "train", target: 5, title: msg("Raise an Army"), desc: msg("Train 5 units"), lore: msg("Recruits are lining up at the gate. Make soldiers of them."), reward: { xp: 200, coins: 100 } },
  { kind: "equip", target: 1, title: msg("Gear Up"), desc: msg("Equip a piece of gear (Hero → Gear)"), lore: msg("Loot is only useful if you wear it."), reward: { xp: 120, coins: 60, scrap: 5 } },
  { kind: "derrick", target: 1, title: msg("Black Gold"), desc: msg("Capture an oil derrick with your army"), lore: msg("Militias sit on the city's oil. Take it from them."), reward: { xp: 250, coins: 150, gear: "rare" } },
  { kind: "research", target: 1, title: msg("The War Lab"), desc: msg("Start a research project (Base → Research)"), lore: msg("Scrap and coin buy better armor and sharper rockets."), reward: { xp: 250, coins: 100, scrap: 10 } },
  { kind: "outpost", target: 1, title: msg("Plant the Flag"), desc: msg("Capture an outpost"), lore: msg("Territory means tribute. Hold ground and the coins flow in."), reward: { xp: 300, coins: 200 } },
  { kind: "power", target: 1, title: msg("General's Orders"), desc: msg("Use a General's Power"), lore: msg("Rank has privileges — air drops, barrages, battle cries."), reward: { xp: 250, coins: 150 } },
  { kind: "siege_win", target: 1, title: msg("First Blood"), desc: msg("Win a siege against another player"), lore: msg("A rival commander has grown fat. Show them the cost of weakness."), reward: { xp: 400, coins: 250, gear: "epic" } },
  { kind: "kills", target: 5, title: msg("Boots and Bullets"), desc: msg("Get 5 kills in first-person fights"), lore: msg("Some battles have to be won up close."), reward: { xp: 400, coins: 200 } },
  { kind: "boss_dmg", target: 800, title: msg("Giant Slayer"), desc: msg("Deal 800 damage to world bosses"), lore: msg("The war machines roaming the city answer to no one. End them."), reward: { xp: 600, coins: 400, gear: "legendary" } },
];

const DAILY_POOL: QuestDef[] = [
  { kind: "collect", target: 6, title: msg("Scavenger"), desc: msg("Collect 6 items"), reward: { xp: 120, coins: 60 } },
  { kind: "chest", target: 2, title: msg("Safecracker"), desc: msg("Open 2 chests"), reward: { xp: 150, coins: 80, scrap: 3 } },
  { kind: "derrick", target: 1, title: msg("Oil Baron"), desc: msg("Capture a derrick"), reward: { xp: 200, coins: 120 } },
  { kind: "train", target: 8, title: msg("Drill Sergeant"), desc: msg("Train 8 units"), reward: { xp: 150, coins: 100 } },
  { kind: "build", target: 1, title: msg("Foreman"), desc: msg("Construct or upgrade a building"), reward: { xp: 120, coins: 80, scrap: 3 } },
  { kind: "kills", target: 3, title: msg("Sharpshooter"), desc: msg("Get 3 FPS kills"), reward: { xp: 200, coins: 100, gear: "rare" } },
  { kind: "boss_dmg", target: 300, title: msg("Monster Hunter"), desc: msg("Deal 300 boss damage"), reward: { xp: 200, coins: 120, scrap: 5 } },
  { kind: "eat", target: 2, title: msg("Well Fed"), desc: msg("Eat 2 meals"), reward: { xp: 80, coins: 40 } },
  { kind: "rest", target: 1, title: msg("Recharge"), desc: msg("Rest at your base"), reward: { xp: 80, coins: 40 } },
  { kind: "outpost", target: 1, title: msg("Expansionist"), desc: msg("Capture an outpost"), reward: { xp: 250, coins: 150 } },
  { kind: "power", target: 1, title: msg("By Order Of"), desc: msg("Use a General's Power"), reward: { xp: 120, coins: 80 } },
  { kind: "run", target: 1, title: msg("Wheelman"), desc: msg("Finish a timed run"), reward: { xp: 150, coins: 80 } },
  { kind: "siege_win", target: 1, title: msg("Conqueror"), desc: msg("Win a siege"), reward: { xp: 250, coins: 150, gear: "rare" } },
  { kind: "forge", target: 1, title: msg("Blacksmith"), desc: msg("Upgrade gear at the forge"), reward: { xp: 100, coins: 50, scrap: 4 } },
  { kind: "arcade", target: 2, title: msg("Range Day"), desc: msg("Play 2 mini-games (range or bomb defuse)"), reward: { xp: 120, coins: 70 } },
  { kind: "duel_win", target: 1, title: msg("Top Gun"), desc: msg("Win a multiplayer mini-game"), reward: { xp: 200, coins: 120, gear: "rare" } },
  { kind: "squad_run", target: 1, title: msg("Squad Goals"), desc: msg("Finish a run with a squad"), reward: { xp: 200, coins: 120 } },
  { kind: "tower", target: 1, title: msg("Fortify"), desc: msg("Build or upgrade a tower"), reward: { xp: 120, coins: 80, scrap: 3 } },
  { kind: "raiders", target: 8, title: msg("Hold the Line"), desc: msg("Kill 8 raiders with towers, squads or airstrikes"), reward: { xp: 200, coins: 150, scrap: 4 } },
  { kind: "tower_down", target: 1, title: msg("Demolition"), desc: msg("Destroy an enemy tower"), reward: { xp: 250, coins: 150, gear: "rare" } },
  { kind: "squad", target: 1, title: msg("Boots on the Map"), desc: msg("Deploy a squad onto the map"), reward: { xp: 100, coins: 60 } },
  { kind: "post", target: 1, title: msg("Leave Your Mark"), desc: msg("Pin a message or photo somewhere"), reward: { xp: 80, coins: 40 } },
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
