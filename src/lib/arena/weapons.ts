// Street Arena guns. Pure — the client fires them, the server referees them with the same
// numbers (fire rate, magazine, reload, damage by range and body part), so one table
// balances both sides.
//
// Damage falls off linearly from `near` to `far` metres down to `minDamage`. Zones: head
// ×headMult, legs ×0.75. 100 HP per life. Spread is the cone half-angle in radians: hip
// fire, aiming down sights, and extra bloom per shot that recovers over time.
import { msg } from "../i18n";

export type WeaponKey = "pistol" | "smg" | "rifle" | "sniper" | "shotgun";
export type Zone = "head" | "body" | "legs";

export type WeaponDef = {
  key: WeaponKey;
  name: string;
  /** Index in snapshots (u8). */
  idx: number;
  damage: number;
  minDamage: number;
  near: number;
  far: number;
  /** Max range a hit can register at (m). */
  range: number;
  headMult: number;
  /** Rounds per minute. */
  rpm: number;
  auto: boolean;
  mag: number;
  reloadS: number;
  /** Spread (rad): hip, aiming, per-shot bloom, and while moving. */
  hip: number;
  ads: number;
  bloom: number;
  move: number;
  /** Camera kick per shot (rad up) and sideways wobble. */
  kick: number;
  wobble: number;
  /** Pellets per shot (shotgun). */
  pellets: number;
  /** Field of view while aiming (degrees). */
  adsFov: number;
  /** Walk speed multiplier while carrying it. */
  mobility: number;
  /** Shot loudness/timbre for the synthesized sound. */
  sound: { body: number; crack: number; tail: number };
};

const W = (d: Omit<WeaponDef, "pellets" | "minDamage"> & { pellets?: number; minDamage?: number }): WeaponDef => ({ pellets: 1, minDamage: Math.round(d.damage * 0.6), ...d });

export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  pistol: W({ key: "pistol", name: msg("P9 pistol"), idx: 0, damage: 28, near: 12, far: 40, range: 90, headMult: 2.2, rpm: 380, auto: false, mag: 12, reloadS: 1.4, hip: 0.018, ads: 0.006, bloom: 0.012, move: 0.012, kick: 0.025, wobble: 0.006, adsFov: 55, mobility: 1.05, sound: { body: 0.55, crack: 0.7, tail: 0.25 } }),
  smg: W({ key: "smg", name: msg("Vex SMG"), idx: 1, damage: 21, near: 10, far: 32, range: 80, headMult: 1.6, rpm: 820, auto: true, mag: 32, reloadS: 2.0, hip: 0.028, ads: 0.012, bloom: 0.004, move: 0.008, kick: 0.012, wobble: 0.01, adsFov: 55, mobility: 1.0, sound: { body: 0.45, crack: 0.55, tail: 0.2 } }),
  rifle: W({ key: "rifle", name: msg("AR-7 rifle"), idx: 2, damage: 29, near: 25, far: 70, range: 160, headMult: 2.0, rpm: 620, auto: true, mag: 30, reloadS: 2.3, hip: 0.032, ads: 0.004, bloom: 0.005, move: 0.02, kick: 0.016, wobble: 0.008, adsFov: 45, mobility: 0.94, sound: { body: 0.75, crack: 0.8, tail: 0.4 } }),
  sniper: W({ key: "sniper", name: msg("Longshot sniper"), idx: 3, damage: 95, minDamage: 80, near: 60, far: 200, range: 400, headMult: 2.5, rpm: 48, auto: false, mag: 5, reloadS: 3.0, hip: 0.09, ads: 0.0004, bloom: 0.02, move: 0.06, kick: 0.07, wobble: 0.004, adsFov: 18, mobility: 0.86, sound: { body: 1, crack: 1, tail: 0.8 } }),
  shotgun: W({ key: "shotgun", name: msg("Breacher shotgun"), idx: 4, damage: 15, minDamage: 4, near: 6, far: 20, range: 35, headMult: 1.5, rpm: 75, auto: false, mag: 6, reloadS: 2.8, hip: 0.075, ads: 0.06, bloom: 0, move: 0.01, kick: 0.06, wobble: 0.01, pellets: 9, adsFov: 58, mobility: 0.95, sound: { body: 1, crack: 0.6, tail: 0.6 } }),
};

export const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponKey[];
export const WEAPON_BY_IDX: WeaponKey[] = WEAPON_KEYS.slice().sort((a, b) => WEAPONS[a].idx - WEAPONS[b].idx);
export const isWeapon = (k: unknown): k is WeaponKey => typeof k === "string" && k in WEAPONS;
/** Primaries you can pick for a match; everyone also carries the pistol. */
export const PRIMARIES: WeaponKey[] = ["rifle", "smg", "shotgun", "sniper"];

export const MAX_HP = 100;

/** Damage of one bullet (one pellet) at a distance, to a body part. */
export function damageAt(w: WeaponDef, dist: number, zone: Zone) {
  const k = dist <= w.near ? 0 : dist >= w.far ? 1 : (dist - w.near) / (w.far - w.near);
  const base = w.damage + (w.minDamage - w.damage) * k;
  const mult = zone === "head" ? w.headMult : zone === "legs" ? 0.75 : 1;
  return Math.max(1, Math.round(base * mult));
}

/** Seconds between shots. */
export const shotGap = (w: WeaponDef) => 60 / w.rpm;
