// General's Powers (Zero Hour's promotion tree as an RPG skill tree): each hero level
// gives one Command Point; spend them to unlock and rank up active abilities.
import { msg, t } from "./i18n";

export type PowerKey = "supply_drop" | "spy_drone" | "adrenaline" | "paradrop" | "repair" | "barrage" | "battle_cry";
export type PowerTarget = "none" | "enemy" | "any";
export type PowerDef = { key: PowerKey; name: string; emoji: string; tier: 1 | 2 | 3; level: number; cooldownMin: number; target: PowerTarget; desc: (rank: number) => string };

export const POWERS: PowerDef[] = [
  { key: "supply_drop", name: msg("Supply Drop"), emoji: "📦", tier: 1, level: 2, cooldownMin: 120, target: "none", desc: (r) => t("Cargo plane drops {n} 🪙", { n: 150 * r }) },
  { key: "spy_drone", name: msg("Spy Drone"), emoji: "🛰️", tier: 1, level: 2, cooldownMin: 30, target: "enemy", desc: (r) => t("Reveal a base or outpost's army and defenses · cooldown {n} min", { n: Math.round(30 / r) }) },
  { key: "adrenaline", name: msg("Adrenaline"), emoji: "💉", tier: 1, level: 2, cooldownMin: 120, target: "none", desc: (r) => t("Energy +{e}, Hunger +{h}", { e: 25 * r, h: 15 * r }) },
  { key: "paradrop", name: msg("Paradrop"), emoji: "🪂", tier: 2, level: 5, cooldownMin: 180, target: "none", desc: (r) => t("{n} veteran Rangers land at your base", { n: 3 * r }) },
  { key: "repair", name: msg("Emergency Repair"), emoji: "🔧", tier: 2, level: 5, cooldownMin: 60, target: "none", desc: (r) => t("Repair {n} base integrity", { n: 250 * r }) },
  { key: "barrage", name: msg("Artillery Barrage"), emoji: "💥", tier: 3, level: 8, cooldownMin: 120, target: "enemy", desc: (r) => t("Shell a target in range: {boss} boss damage, −{base} base integrity, or {pct}% of a garrison", { boss: 400 * r, base: 150 * r, pct: 20 * r }) },
  { key: "battle_cry", name: msg("Battle Cry"), emoji: "📯", tier: 3, level: 8, cooldownMin: 240, target: "none", desc: (r) => t("+{n}% army attack for 1 hour", { n: 10 * r }) },
];
export const POWER_BY_KEY = Object.fromEntries(POWERS.map((p) => [p.key, p])) as Record<PowerKey, PowerDef>;
export const MAX_POWER_RANK = 3;
export const cooldownMs = (p: PowerDef, rank: number) => (p.key === "spy_drone" ? p.cooldownMin / Math.max(1, rank) : p.cooldownMin) * 60_000;
export const commandPoints = (level: number, spent: number) => Math.max(0, level - 1 - spent);
