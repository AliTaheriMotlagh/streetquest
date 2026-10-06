// Life-sim layer (The Sims style): your commander has needs that drain in real
// time. Mood (their average) scales XP and combat HP. Pure — client and server.

export type NeedKey = "hunger" | "energy" | "social" | "fun";
export type Needs = Record<NeedKey, number>;

export const NEEDS: { key: NeedKey; name: string; emoji: string; perHour: number; color: string; how: string }[] = [
  { key: "hunger", name: "Hunger", emoji: "🍔", perHour: 6, color: "#ffd23f", how: "Eat food you find on the streets, or the mess hall at your Quarters." },
  { key: "energy", name: "Energy", emoji: "⚡", perHour: 4, color: "#22e3ff", how: "Rest at your own base. Better Quarters, better sleep." },
  { key: "social", name: "Social", emoji: "💬", perHour: 5, color: "#ff2e88", how: "Hang out with players nearby, chat, fight alongside your crew." },
  { key: "fun", name: "Fun", emoji: "🎮", perHour: 6, color: "#3dff8f", how: "Arcades, chests, firefights and boss raids." },
];

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Needs right now, from the stored snapshot taken at `at`. */
export function currentNeeds(stored: Needs, at: Date | string, now = Date.now()): Needs {
  const h = Math.max(0, (now - new Date(at).getTime()) / 3_600_000);
  const out = {} as Needs;
  for (const n of NEEDS) out[n.key] = clamp(stored[n.key] - n.perHour * h);
  return out;
}

export function addNeeds(base: Needs, delta: Partial<Needs>): Needs {
  const out = { ...base };
  for (const [k, v] of Object.entries(delta)) out[k as NeedKey] = clamp(out[k as NeedKey] + (v ?? 0));
  return out;
}

export type Mood = { score: number; label: string; emoji: string; xpMult: number; hpMult: number };
export function moodOf(n: Needs): Mood {
  const score = Math.round((n.hunger + n.energy + n.social + n.fun) / 4);
  const starving = n.hunger < 10 || n.energy < 10;
  if (score >= 75 && !starving) return { score, label: "Inspired", emoji: "🤩", xpMult: 1.25, hpMult: 1.1 };
  if (score >= 45 && !starving) return { score, label: "Fine", emoji: "🙂", xpMult: 1, hpMult: 1 };
  if (score >= 25) return { score, label: "Tense", emoji: "😟", xpMult: 0.9, hpMult: 0.9 };
  return { score, label: "Miserable", emoji: "😫", xpMult: 0.75, hpMult: 0.8 };
}

export const REST_COOLDOWN_MS = 30 * 60_000;
export const SOCIAL_COOLDOWN_MS = 10 * 60_000;
export const MESS_HALL_COST = 15;
export const AT_BASE_M = 80;
