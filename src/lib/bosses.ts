// World bosses: deterministic per ~1.3 km region and 2-hour window (like spawns),
// so everyone sees the same boss. Only the damage dealt is stored (BossState).
import { cellKey, hashStr, rng, type LatLng } from "./geo";

export const BOSS_DEG = 0.012;
export const BOSS_WINDOW_MS = 2 * 3600_000;

export type BossDef = { key: string; name: string; emoji: string; hp: number; dmg: number; speed: number; color: string; blurb: string };
export const BOSS_DEFS: BossDef[] = [
  { key: "colossus", name: "Iron Colossus", emoji: "🤖", hp: 6000, dmg: 16, speed: 2.2, color: "#9ca3af", blurb: "A walking siege engine. Slow, armored, relentless." },
  { key: "scorpion", name: "Scorpion King", emoji: "🦂", hp: 4500, dmg: 12, speed: 4, color: "#3dff8f", blurb: "Desert warlord. Fast and venomous." },
  { key: "dragon", name: "Red Dragon Mech", emoji: "🐉", hp: 8000, dmg: 20, speed: 2.8, color: "#ff4d4d", blurb: "Flamethrower mech. Bring a crew." },
  { key: "vex", name: "General Vex", emoji: "💀", hp: 5000, dmg: 14, speed: 3.2, color: "#b26bff", blurb: "Rogue general with an elite guard." },
];

export type Boss = { id: string; def: BossDef; lat: number; lng: number; expiresAt: number; maxHp: number };

const windowOf = (now = Date.now()) => Math.floor(now / BOSS_WINDOW_MS);

function bossFor(rx: number, ry: number, w: number): Boss | null {
  const rand = rng(hashStr(`boss|${w}|${rx}_${ry}`));
  if (rand() > 0.55) return null;
  const def = BOSS_DEFS[Math.floor(rand() * BOSS_DEFS.length)];
  const lat = (ry + 0.15 + rand() * 0.7) * BOSS_DEG;
  const lng = (rx + 0.15 + rand() * 0.7) * BOSS_DEG;
  return { id: `boss.${w}.${cellKey(rx, ry)}`, def, lat, lng, expiresAt: (w + 1) * BOSS_WINDOW_MS, maxHp: def.hp };
}

export function bossesAround(p: LatLng, now = Date.now()): Boss[] {
  const rx = Math.floor(p.lng / BOSS_DEG);
  const ry = Math.floor(p.lat / BOSS_DEG);
  const w = windowOf(now);
  const out: Boss[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const b = bossFor(rx + dx, ry + dy, w);
    if (b) out.push(b);
  }
  return out;
}

/** Rebuild a boss from its id; only the current window is fightable. */
export function resolveBoss(id: string, now = Date.now()): Boss | null {
  const m = /^boss\.(\d+)\.(-?\d+)_(-?\d+)$/.exec(id);
  if (!m || Number(m[1]) !== windowOf(now)) return null;
  const b = bossFor(Number(m[2]), Number(m[3]), Number(m[1]));
  return b?.id === id ? b : null;
}

export const BOSS_BOMBARD_COOLDOWN_MS = 10 * 60_000;
export const bossReward = (damage: number, topDamager: boolean): { xp: number; coins: number; items: Record<string, number> } => ({
  xp: 200 + Math.min(1500, Math.round(damage / 4)),
  coins: 100 + Math.min(800, Math.round(damage / 8)),
  items: topDamager ? { crown: 1 } : damage >= 400 ? { diamond: 1 } : {},
});
