// Levels, titles and achievements. Pure — safe on client and server.

export const levelForXp = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
export const xpForLevel = (level: number) => 100 * (level - 1) ** 2;

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, from, to, pct: (xp - from) / (to - from) };
}

const TITLES: [number, string][] = [
  [1, "Rookie"],
  [5, "Hustler"],
  [10, "Runner"],
  [15, "Enforcer"],
  [20, "Kingpin"],
  [30, "Street Legend"],
];
export function titleForLevel(level: number) {
  return [...TITLES].reverse().find(([l]) => level >= l)![1];
}

export type AchievementDef = { key: string; name: string; emoji: string; desc: string; xp: number };

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_claim", name: "First Score", emoji: "🎯", desc: "Collect your first spawn", xp: 50 },
  { key: "collector_25", name: "Collector", emoji: "🎒", desc: "Collect 25 spawns", xp: 200 },
  { key: "collector_250", name: "Hoarder", emoji: "🏦", desc: "Collect 250 spawns", xp: 1000 },
  { key: "chest_10", name: "Safecracker", emoji: "🔓", desc: "Crack 10 chests", xp: 300 },
  { key: "runner_5", name: "Wheelman", emoji: "🏁", desc: "Finish 5 timed runs", xp: 300 },
  { key: "night_owl", name: "Night Owl", emoji: "🦉", desc: "Collect something at night", xp: 100 },
  { key: "explorer_10", name: "Explorer", emoji: "🗺️", desc: "Collect in 10 different areas", xp: 400 },
  { key: "courier_1", name: "Courier", emoji: "📦", desc: "Deliver a real package", xp: 300 },
  { key: "courier_10", name: "Logistics Boss", emoji: "🚚", desc: "Deliver 10 real packages", xp: 1500 },
  { key: "social_5", name: "Crew", emoji: "🤝", desc: "Have 5 friends", xp: 200 },
  { key: "event_1", name: "Showed Up", emoji: "🎉", desc: "Check in at an event", xp: 150 },
  { key: "streak_7", name: "Dedicated", emoji: "🔥", desc: "7-day login streak", xp: 500 },
  { key: "note_1", name: "Graffiti", emoji: "📍", desc: "Leave a message at a location", xp: 50 },
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

export const DAILY_REWARD = (streak: number) => ({ coins: 25 + Math.min(streak, 7) * 10, xp: 30 + Math.min(streak, 7) * 10 });
