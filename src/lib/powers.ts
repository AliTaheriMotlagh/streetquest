// General's Powers (Zero Hour's promotion tree as an RPG skill tree): each hero level
// gives one Command Point; spend them to unlock and rank up active abilities.

export type PowerKey = "supply_drop" | "spy_drone" | "adrenaline" | "paradrop" | "repair" | "barrage" | "battle_cry";
export type PowerTarget = "none" | "enemy" | "any";
export type PowerDef = { key: PowerKey; name: string; emoji: string; tier: 1 | 2 | 3; level: number; cooldownMin: number; target: PowerTarget; desc: (rank: number) => string };

export const POWERS: PowerDef[] = [
  { key: "supply_drop", name: "Supply Drop", emoji: "📦", tier: 1, level: 2, cooldownMin: 120, target: "none", desc: (r) => `Cargo plane drops ${150 * r} 🪙` },
  { key: "spy_drone", name: "Spy Drone", emoji: "🛰️", tier: 1, level: 2, cooldownMin: 30, target: "enemy", desc: (r) => `Reveal a base or outpost's army and defenses · cooldown ${Math.round(30 / r)} min` },
  { key: "adrenaline", name: "Adrenaline", emoji: "💉", tier: 1, level: 2, cooldownMin: 120, target: "none", desc: (r) => `Energy +${25 * r}, Hunger +${15 * r}` },
  { key: "paradrop", name: "Paradrop", emoji: "🪂", tier: 2, level: 5, cooldownMin: 180, target: "none", desc: (r) => `${3 * r} veteran Rangers land at your base` },
  { key: "repair", name: "Emergency Repair", emoji: "🔧", tier: 2, level: 5, cooldownMin: 60, target: "none", desc: (r) => `Repair ${250 * r} base integrity` },
  { key: "barrage", name: "Artillery Barrage", emoji: "💥", tier: 3, level: 8, cooldownMin: 120, target: "enemy", desc: (r) => `Shell a target in range: ${400 * r} boss damage, −${150 * r} base integrity, or ${20 * r}% of a garrison` },
  { key: "battle_cry", name: "Battle Cry", emoji: "📯", tier: 3, level: 8, cooldownMin: 240, target: "none", desc: (r) => `+${10 * r}% army attack for 1 hour` },
];
export const POWER_BY_KEY = Object.fromEntries(POWERS.map((p) => [p.key, p])) as Record<PowerKey, PowerDef>;
export const MAX_POWER_RANK = 3;
export const cooldownMs = (p: PowerDef, rank: number) => (p.key === "spy_drone" ? p.cooldownMin / Math.max(1, rank) : p.cooldownMin) * 60_000;
export const commandPoints = (level: number, spent: number) => Math.max(0, level - 1 - spent);
