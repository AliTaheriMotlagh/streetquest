// Slow motion and boosts, GTA style. Pure: the meters, how the world's clock eases, and the
// rules for when each may run. The drive feeds it real frame time and scales the simulation
// step by `scale`. Never used in arena matches (everyone's clock must agree).

export const FOCUS_SCALE = 0.3; // driving: world time while focused
export const DEADEYE_SCALE = 0.35; // on foot, aiming
export const NITRO_THRUST = 2.1; // accel multiplier
export const NITRO_TOP = 1.22; // top speed multiplier (the server's speed check allows 1.6x plus slack)

const FOCUS_DRAIN = 1 / 6; // per second (a full meter lasts 6 s)
const FOCUS_REFILL = 1 / 24;
const NITRO_DRAIN = 1 / 4;
const NITRO_REFILL = 1 / 14;
const REFILL_DELAY = 1.2; // seconds after use before the meter recharges
const UNLOCK_AT = 0.25; // an emptied meter stays off until it has recovered this much (no flicker at 0)
const EASE_IN = 14; // 1/s rates: quick into slow motion, a bit gentler out of it
const EASE_OUT = 7;

export type Abilities = { focus: number; nitro: number; scale: number; focusOn: boolean; nitroOn: boolean; focusLock: boolean; nitroLock: boolean; focusIdle: number; nitroIdle: number };
export const newAbilities = (): Abilities => ({ focus: 1, nitro: 1, scale: 1, focusOn: false, nitroOn: false, focusLock: false, nitroLock: false, focusIdle: 0, nitroIdle: 0 });

export type AbilityIn = {
  /** Real (unscaled) seconds of this frame. */
  dt: number;
  /** False in arena matches, or when something else owns the clock. */
  enabled: boolean;
  /** In a ground vehicle (focus + nitro) vs. on foot (dead-eye) vs. flying (nothing). */
  mode: "car" | "foot" | "air";
  focusHold: boolean;
  nitroHold: boolean;
  /** On foot: sights up. */
  aiming: boolean;
  /** Is the vehicle actually going somewhere (nitro on a parked car is a waste)? */
  moving?: boolean;
};

export function stepAbilities(a: Abilities, i: AbilityIn): Abilities {
  const dt = Math.min(0.1, Math.max(0, i.dt));
  const on = i.enabled && i.mode !== "air";
  a.focusOn = on && i.focusHold && (i.mode === "car" || i.aiming) && !a.focusLock && a.focus > 0;
  a.nitroOn = on && i.mode === "car" && i.nitroHold && !a.nitroLock && a.nitro > 0 && i.moving !== false;

  if (a.focusOn) a.focus = Math.max(0, a.focus - (FOCUS_DRAIN * dt) / (i.mode === "foot" ? 1.4 : 1));
  if (a.nitroOn) a.nitro = Math.max(0, a.nitro - NITRO_DRAIN * dt);
  a.focusIdle = a.focusOn ? 0 : a.focusIdle + dt;
  a.nitroIdle = a.nitroOn ? 0 : a.nitroIdle + dt;
  if (!a.focusOn && a.focusIdle > REFILL_DELAY) a.focus = Math.min(1, a.focus + FOCUS_REFILL * dt);
  if (!a.nitroOn && a.nitroIdle > REFILL_DELAY) a.nitro = Math.min(1, a.nitro + NITRO_REFILL * dt);
  if (a.focus <= 0) a.focusLock = true;
  else if (a.focusLock && a.focus >= UNLOCK_AT) a.focusLock = false;
  if (a.nitro <= 0) a.nitroLock = true;
  else if (a.nitroLock && a.nitro >= UNLOCK_AT) a.nitroLock = false;

  const target = a.focusOn ? (i.mode === "foot" ? DEADEYE_SCALE : FOCUS_SCALE) : 1;
  a.scale += (target - a.scale) * (1 - Math.exp(-dt * (target < a.scale ? EASE_IN : EASE_OUT)));
  if (Math.abs(a.scale - target) < 0.002) a.scale = target;
  return a;
}

/** 0 at full speed … 1 deep in slow motion (drives grip, steering and the screen look). */
export const focusDepth = (scale: number) => Math.max(0, Math.min(1, (1 - scale) / (1 - FOCUS_SCALE)));

/** Steering reacts in real time: the smoothing rate is multiplied by 1/scale (capped). */
export const steerCompensation = (scale: number) => Math.min(4, 1 / Math.max(0.2, scale));
