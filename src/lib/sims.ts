// Life-sim layer (The Sims style): your commander has needs that drain in real
// time. Mood (their average) scales XP, combat HP and Street Empire income. Pure —
// client and server.
import { msg } from "./i18n";
import { S } from "./settings";

export type NeedKey = "hunger" | "energy" | "social" | "fun";
export type Needs = Record<NeedKey, number>;

// Drain rates, the floor, sleep and the mood bonus are admin settings (Life sim group).
export const NEEDS: { key: NeedKey; name: string; emoji: string; perHour: number; color: string; how: string }[] = [
  { key: "hunger", name: msg("Hunger"), emoji: "🍔", get perHour() { return S.hungerPerHour; }, color: "#f0c05a", how: msg("Eat food you find on the streets, check in at a restaurant, or the mess hall at your Quarters.") },
  { key: "energy", name: msg("Energy"), emoji: "⚡", get perHour() { return S.energyPerHour; }, color: "#63b3f2", how: msg("Rest at your base, grab a coffee at a café — or just sleep: a long break refills it.") },
  { key: "social", name: msg("Social"), emoji: "💬", get perHour() { return S.socialPerHour; }, color: "#ee7fae", how: msg("Hang out with players nearby, check in at cafés, bars and parks, or chat with your crew.") },
  { key: "fun", name: msg("Fun"), emoji: "🎮", get perHour() { return S.funPerHour; }, color: "#5bd38c", how: msg("Your empire, chests, firefights and boss raids.") },
];

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Needs right now, from the stored snapshot taken at `at`. Time alone drains them down
 * to the floor and no further; a break of sleepHours or more counts as a night's sleep.
 */
export function currentNeeds(stored: Needs, at: Date | string, now = Date.now()): Needs {
  const h = Math.max(0, (now - new Date(at).getTime()) / 3_600_000);
  const out = {} as Needs;
  for (const n of NEEDS) {
    const v = stored[n.key];
    out[n.key] = v <= S.needsFloor ? clamp(v) : clamp(Math.max(S.needsFloor, v - n.perHour * h));
  }
  if (S.sleepHours > 0 && h >= S.sleepHours) out.energy = Math.max(out.energy, clamp(S.sleepEnergy));
  return out;
}

export function addNeeds(base: Needs, delta: Partial<Needs>): Needs {
  const out = { ...base };
  for (const [k, v] of Object.entries(delta)) out[k as NeedKey] = clamp(out[k as NeedKey] + (v ?? 0));
  return out;
}

/** xpMult also scales your army's punch; empireMult scales Street Empire income. */
export type Mood = { score: number; label: string; emoji: string; xpMult: number; hpMult: number; empireMult: number };
export function moodOf(n: Needs): Mood {
  const score = Math.round((n.hunger + n.energy + n.social + n.fun) / 4);
  const starving = n.hunger < 10 || n.energy < 10;
  const bonus = S.moodEmpireBonus;
  if (score >= 80 && !starving) return { score, label: msg("Inspired"), emoji: "🤩", xpMult: 1.25, hpMult: 1.1, empireMult: 1 + bonus };
  if (score >= 60 && !starving) return { score, label: msg("Happy"), emoji: "😄", xpMult: 1.1, hpMult: 1.05, empireMult: 1 + bonus / 2 };
  if (score >= 40 && !starving) return { score, label: msg("Fine"), emoji: "🙂", xpMult: 1, hpMult: 1, empireMult: 1 };
  if (score >= 25) return { score, label: msg("Tense"), emoji: "😟", xpMult: 0.95, hpMult: 0.95, empireMult: 1 };
  return { score, label: msg("Miserable"), emoji: "😫", xpMult: 0.85, hpMult: 0.9, empireMult: 1 };
}

export let REST_COOLDOWN_MS = S.restCooldownMin * 60_000;
export const SOCIAL_COOLDOWN_MS = 10 * 60_000;
export let MESS_HALL_COST = S.messHallCost;
export const AT_BASE_M = 80;

/** Re-read the live admin settings (called by lib/config applyConfig). */
export function syncSettings() {
  REST_COOLDOWN_MS = S.restCooldownMin * 60_000;
  MESS_HALL_COST = S.messHallCost;
}
