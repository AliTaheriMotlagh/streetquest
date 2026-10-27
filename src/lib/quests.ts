// Quests: a short campaign that teaches the money game, plus three daily quests
// picked per player per day. Progress is driven by game events. Pure.
import { msg } from "./i18n";
import type { Rarity } from "./catalog";
import { hashStr, rng } from "./geo";

export type QuestKind = "money" | "place" | "run" | "post" | "empire" | "steps" | "gps_game";

export type Reward = { xp: number; coins: number; scrap?: number; gear?: Rarity };
export type QuestDef = { kind: QuestKind; target: number; title: string; desc: string; reward: Reward; lore?: string };

export const CAMPAIGN: QuestDef[] = [
  { kind: "money", target: 1, title: msg("First Find"), desc: msg("Pick up money on the map"), lore: msg("There's money lying around the city. Walk up to a 💵 and it's yours."), reward: { xp: 60, coins: 40 } },
  { kind: "money", target: 5, title: msg("Pocket Money"), desc: msg("Pick up money 5 times"), lore: msg("New money appears around you every 20 minutes. Keep moving."), reward: { xp: 100, coins: 60 } },
  { kind: "place", target: 1, title: msg("Open for Business"), desc: msg("Do a mission at a store"), lore: msg("Every store on the map has a job for you — a check-in or a delivery."), reward: { xp: 120, coins: 80 } },
  { kind: "run", target: 1, title: msg("Special Delivery"), desc: msg("Deliver an order from a store"), lore: msg("Pick the order up at the store and get it to the address before time runs out."), reward: { xp: 200, coins: 120 } },
  { kind: "money", target: 25, title: msg("Street Smart"), desc: msg("Pick up money 25 times"), lore: msg("Admins drop extra money on busy streets — watch for the gold ones."), reward: { xp: 250, coins: 150 } },
  { kind: "place", target: 10, title: msg("Local Hero"), desc: msg("Do 10 store missions"), lore: msg("The shopkeepers know your face now."), reward: { xp: 300, coins: 200 } },
  { kind: "steps", target: 10_000, title: msg("Ten Thousand Steps"), desc: msg("Walk 10,000 steps"), lore: msg("Every step takes you closer to the next pickup."), reward: { xp: 400, coins: 250 } },
  { kind: "money", target: 100, title: msg("Cash Machine"), desc: msg("Pick up money 100 times"), lore: msg("At 1,000,000 toman you can cash out to your bank card."), reward: { xp: 600, coins: 400 } },
];

const DAILY_POOL: QuestDef[] = [
  { kind: "money", target: 5, title: msg("Money Run"), desc: msg("Pick up money 5 times"), reward: { xp: 100, coins: 60 } },
  { kind: "money", target: 12, title: msg("Money Marathon"), desc: msg("Pick up money 12 times"), reward: { xp: 200, coins: 120 } },
  { kind: "place", target: 2, title: msg("Shop Hopper"), desc: msg("Do 2 store missions"), reward: { xp: 120, coins: 80 } },
  { kind: "place", target: 5, title: msg("Main Street"), desc: msg("Do 5 store missions"), reward: { xp: 220, coins: 140 } },
  { kind: "run", target: 1, title: msg("Courier"), desc: msg("Deliver an order from a store"), reward: { xp: 150, coins: 100 } },
  { kind: "post", target: 1, title: msg("Leave Your Mark"), desc: msg("Pin a message or photo somewhere"), reward: { xp: 80, coins: 40 } },
  { kind: "empire", target: 10, title: msg("Tycoon"), desc: msg("Make 10 buys in your Street Empire"), reward: { xp: 120, coins: 80 } },
  { kind: "steps", target: 4000, title: msg("Daily Walk"), desc: msg("Walk 4,000 steps"), reward: { xp: 200, coins: 120 } },
  { kind: "gps_game", target: 1, title: msg("Explorer"), desc: msg("Win a GPS game"), reward: { xp: 150, coins: 100 } },
];

export function dailyQuests(userId: string, day: string): (QuestDef & { key: string })[] {
  const rand = rng(hashStr(`daily|${userId}|${day}`));
  const pool = [...DAILY_POOL];
  const out: (QuestDef & { key: string })[] = [];
  for (let i = 0; i < 3; i++) out.push({ ...pool.splice(Math.floor(rand() * pool.length), 1)[0], key: `d:${day}:${i}` });
  return out;
}

export const campaignKey = (step: number) => `c:${step}`;

