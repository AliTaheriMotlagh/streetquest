// Bare hands in the open city (pure; tests/melee.test.ts). On foot outside a match the hero starts
// empty-handed: fire throws a punch (right, left, then a right hook that hits harder and knocks
// back further), and a gun is drawn on demand (the swap button / Q cycles fists → sidearm → SMG).
// People read the difference (lib/street/threat.ts: a drawn gun scares, fists don't). Matches keep
// guns. arena/combat.ts runs it, arena/avatar.ts and viewmodel.ts pose the arms from armDirs().
import type { WeaponKey, Zone } from "../arena/weapons";

/** Fists, or a gun from the loadout. */
export type Hand = "fists" | WeaponKey;

/** Reach of a punch from the eye (m): a step plus an arm. */
export const REACH_M = 1.7;
/** What a referee allows past REACH_M for lag: realtime positions (rewound) vs the coarse HTTP presence. */
export const REACH_SLACK_RT_M = 0.9;
export const REACH_SLACK_HTTP_M = 8;
/** Seconds from the press to the fist landing (the strike's moment in punchCurve). */
export const HIT_AT_S = 0.12;
/** Seconds a punch takes, guard to guard. */
export const PUNCH_S = 0.36;
/** Next punch no sooner than this after the last (s); the hook takes longer to recover. */
export const COOLDOWN_S = 0.34;
export const HOOK_COOLDOWN_S = 0.55;
/** Punches closer together than this chain into a combo (s). */
export const COMBO_GAP_S = 0.9;

export type Punch = { side: 1 | -1; hook: boolean; combo: number; at: number };
export type PunchState = { last: Punch | null };

/**
 * A punch thrown at `now` (s), or null while the last one recovers. Right, left, right hook; a pause
 * longer than COMBO_GAP_S starts over with the right.
 */
export function throwPunch(s: PunchState, now: number): Punch | null {
  const l = s.last;
  if (l && now - l.at < (l.hook ? HOOK_COOLDOWN_S : COOLDOWN_S) - 1e-9) return null;
  const combo = l && !l.hook && now - l.at < COMBO_GAP_S ? l.combo + 1 : 1;
  const p: Punch = { side: combo === 2 ? -1 : 1, hook: combo >= 3, combo, at: now };
  s.last = p;
  return p;
}

/** The soonest a referee accepts the next punch after this one (ms): the client's cooldown with a little give for jitter. */
export const punchGapMs = (hook: boolean) => (hook ? HOOK_COOLDOWN_S : COOLDOWN_S) * 1000 * 0.8;

/** Damage of a punch landing on a body part (100 HP a life): a head shot staggers, a hook hurts. */
export function punchDamage(zone: Zone, hook: boolean) {
  const base = zone === "head" ? 18 : zone === "legs" ? 8 : 12;
  return Math.round(base * (hook ? 1.6 : 1));
}

/**
 * How far out the punching arm is, 0 (guard) … 1 (full reach), `t` seconds into the punch: a short
 * pull back, a fast strike that peaks at HIT_AT_S, a held beat, then an eased return.
 */
export function punchCurve(t: number): number {
  if (!(t >= 0) || t >= PUNCH_S) return 0;
  if (t < 0.05) return -0.15 * (t / 0.05);
  if (t < HIT_AT_S) {
    const k = (t - 0.05) / (HIT_AT_S - 0.05);
    return -0.15 + 1.15 * (1 - (1 - k) * (1 - k));
  }
  if (t < 0.17) return 1;
  const k = (t - 0.17) / (PUNCH_S - 0.17);
  return 1 - k * k * (3 - 2 * k);
}

type V3 = [number, number, number];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix = (a: V3, b: V3, k: number): V3 => norm([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);

/**
 * Where an arm's bones point, in the body's own frame (x right, y up, −z forward), for `side`
 * (+1 right, −1 left): the boxer's guard (elbows down, fists by the chin), blended toward a straight
 * punch or, for a hook, a swing across the body, by `ext` (punchCurve; negative pulls back).
 */
export function armDirs(side: 1 | -1, ext: number, hook = false): { upper: V3; fore: V3 } {
  const s = side;
  const guard = { upper: norm([0.3 * s, -0.85, -0.42]), fore: norm([-0.28 * s, 0.72, -0.62]) };
  const strike = hook ? { upper: norm([0.72 * s, 0.12, -0.68]), fore: norm([-0.92 * s, 0.06, -0.38]) } : { upper: norm([-0.06 * s, 0.06, -1]), fore: norm([-0.1 * s, 0.04, -1]) };
  if (ext >= 0) return { upper: mix(guard.upper, strike.upper, Math.min(1, ext)), fore: mix(guard.fore, strike.fore, Math.min(1, ext)) };
  // Pulled back: the elbow tucks behind the body a little.
  const back = { upper: norm([0.3 * s, -0.8, 0.2]), fore: norm([-0.2 * s, 0.6, -0.8]) };
  return { upper: mix(guard.upper, back.upper, -ext), fore: mix(guard.fore, back.fore, -ext) };
}

/**
 * What the swap button gives next: in the open city fists come first, then the guns; in a match
 * (guns only) the next gun. A hand that's not on offer starts the cycle.
 */
export function nextHand(cur: Hand, loadout: WeaponKey[], inMatch: boolean): Hand {
  const ring: Hand[] = inMatch ? [...loadout] : ["fists", ...loadout];
  if (!ring.length) return cur;
  const i = ring.indexOf(cur);
  return ring[(i + 1) % ring.length];
}

/** The hand a body starts with on foot: fists in the city, the last gun in a match. */
export const startHand = (inMatch: boolean, gun: WeaponKey): Hand => (inMatch ? gun : "fists");
