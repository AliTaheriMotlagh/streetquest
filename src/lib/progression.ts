// Levels, titles and achievements. Pure — safe on client and server.
import { msg, t } from "./i18n";
import { S } from "./settings";

export const levelForXp = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
export const xpForLevel = (level: number) => 100 * (level - 1) ** 2;

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, from, to, pct: (xp - from) / (to - from) };
}

const TITLES: [number, string][] = [
  [1, msg("Rookie")],
  [5, msg("Hustler")],
  [10, msg("Runner")],
  [15, msg("Enforcer")],
  [20, msg("Kingpin")],
  [30, msg("Street Legend")],
];
/** The rank name for a level, in the reader's language. */
export function titleForLevel(level: number) {
  return t([...TITLES].reverse().find(([l]) => level >= l)![1]);
}

export type AchievementDef = { key: string; name: string; emoji: string; desc: string; xp: number };

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_claim", name: msg("First Score"), emoji: "🎯", desc: msg("Collect your first spawn"), xp: 50 },
  { key: "collector_25", name: msg("Collector"), emoji: "🎒", desc: msg("Collect 25 spawns"), xp: 200 },
  { key: "collector_250", name: msg("Hoarder"), emoji: "🏦", desc: msg("Collect 250 spawns"), xp: 1000 },
  { key: "chest_10", name: msg("Safecracker"), emoji: "🔓", desc: msg("Crack 10 chests"), xp: 300 },
  { key: "runner_5", name: msg("Wheelman"), emoji: "🏁", desc: msg("Finish 5 timed runs"), xp: 300 },
  { key: "night_owl", name: msg("Night Owl"), emoji: "🦉", desc: msg("Collect something at night"), xp: 100 },
  { key: "explorer_10", name: msg("Explorer"), emoji: "🗺️", desc: msg("Collect in 10 different areas"), xp: 400 },
  { key: "courier_1", name: msg("Courier"), emoji: "📦", desc: msg("Deliver a real package"), xp: 300 },
  { key: "courier_10", name: msg("Logistics Boss"), emoji: "🚚", desc: msg("Deliver 10 real packages"), xp: 1500 },
  { key: "driver_1", name: msg("Wheelman"), emoji: "🚕", desc: msg("Give a player a ride"), xp: 300 },
  { key: "driver_10", name: msg("Road King"), emoji: "🚖", desc: msg("Give 10 rides"), xp: 1500 },
  { key: "jackpot_1", name: msg("Jackpot"), emoji: "🎰", desc: msg("Win a lottery"), xp: 250 },
  { key: "social_5", name: msg("Crew"), emoji: "🤝", desc: msg("Have 5 friends"), xp: 200 },
  { key: "event_1", name: msg("Showed Up"), emoji: "🎉", desc: msg("Check in at an event"), xp: 150 },
  { key: "streak_7", name: msg("Dedicated"), emoji: "🔥", desc: msg("7-day login streak"), xp: 500 },
  { key: "note_1", name: msg("Graffiti"), emoji: "📍", desc: msg("Leave a message at a location"), xp: 50 },
  { key: "photo_1", name: msg("Street Photographer"), emoji: "📸", desc: msg("Pin a photo to a real place"), xp: 100 },
  { key: "liked_10", name: msg("Local Legend"), emoji: "❤️", desc: msg("Get 10 likes on one post"), xp: 400 },
  { key: "flag_plant", name: msg("Claim Staker"), emoji: "🚩", desc: msg("Plant a flag"), xp: 100 },
  { key: "flag_capture", name: msg("Flag Thief"), emoji: "🏴", desc: msg("Capture a rival's flag"), xp: 300 },
  { key: "bounty_hunter", name: msg("Bounty Hunter"), emoji: "💀", desc: msg("Collect a bounty"), xp: 400 },
  { key: "first_blood", name: msg("First Blood"), emoji: "🔫", desc: msg("Down a rival commander in the street"), xp: 250 },
  { key: "tower_builder", name: msg("Fortifier"), emoji: "🗼", desc: msg("Build your first tower"), xp: 100 },
  { key: "wave_clear", name: msg("Hold the Line"), emoji: "🛡️", desc: msg("Stop a raider wave without a single leak"), xp: 400 },
  { key: "duel_champ", name: msg("Top Gun"), emoji: "🏆", desc: msg("Win a street race"), xp: 200 },
  { key: "superweapon", name: msg("Doomsday"), emoji: "☢️", desc: msg("Fire your faction's superweapon"), xp: 500 },
  { key: "shopkeeper", name: msg("Shopkeeper"), emoji: "🏪", desc: msg("Open your own shop"), xp: 150 },
  { key: "first_sale", name: msg("First Sale"), emoji: "🤝", desc: msg("Hand over your first order"), xp: 200 },
];
export const ACHIEVEMENT_BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a])) as Record<
  string,
  AchievementDef
>;

/** "YYYY-MM-DD" for `at` in an IANA timezone — used for daily resets per player. */
export function dayKey(timezone: string, at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export const DAILY_REWARD = (streak: number) => {
  const d = Math.min(streak, S.dailyStreakCap);
  return { coins: S.dailyCoinsBase + d * S.dailyCoinsStep, xp: S.dailyXpBase + d * S.dailyXpStep, gems: S.dailyGems * (streak >= 7 ? 2 : 1) };
};
