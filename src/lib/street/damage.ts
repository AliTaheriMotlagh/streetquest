// Car damage in the open 3D city (pure — the client draws it, tests/street.test.ts holds it):
// how hard a crash was, what it costs a car, and what a car looks like at each health:
// fine → dented → smoking → black smoke → on fire (it blows up a few seconds later) →
// a burnt-out wreck. Bullets cost a car a little each; an explosion close by a lot (and
// sets off the cars around it). Every street car, police car and your own uses the same
// numbers.

/** A healthy car. */
export const CAR_HP = 100;
/** Impact speed (m/s straight into what was hit) below which a bump costs nothing. */
export const SCRAPE_MS = 3.5;
/** A car at 0 health burns this long, then explodes. */
export const BURN_S = 6;
/** An explosion's reach (m): cars and people inside it are hurt, less further out. */
export const BLAST_R = 9;

/**
 * Health lost in a crash at `into` m/s (the speed straight into the wall or car — a
 * glancing scrape barely counts). Disproportionately more the harder the hit: about 18 at
 * 36 km/h, 40 at 54 km/h, 70 at 72 km/h, a wreck at 90 km/h. `k` scales it (a bus
 * shrugs off what crumples a Pride).
 */
export function crashDamage(into: number, k = 1): number {
  const v = Math.abs(into) - SCRAPE_MS;
  if (!(v > 0)) return 0;
  return Math.min(CAR_HP * 1.5, 1.2 * v ** 1.45 * k);
}

/** How far in (m) the bodywork folds where it was hit. */
export const dentDepth = (into: number) => Math.max(0, Math.min(0.32, (Math.abs(into) - SCRAPE_MS) * 0.028));

/** A bullet's damage to a car (bodywork stops most of it). */
export const bulletDamage = (gunDamage: number) => gunDamage * 0.3;

/** What a blast does to a car `d` m away (sets nearby ones burning), and how hard it throws it (m/s). */
export function blastOnCar(d: number) {
  const k = Math.max(0, 1 - d / BLAST_R);
  return { damage: 160 * k * k + (k > 0 ? 8 : 0), push: 14 * k };
}

/** What a blast does to a person `d` m away: health lost (100 = a life) and how far they're thrown (m/s). */
export function blastOnPerson(d: number) {
  const k = Math.max(0, 1 - d / BLAST_R);
  return { damage: 190 * k * k, push: 11 * k };
}

export type CarLook = "ok" | "dented" | "smoking" | "black" | "burning" | "wrecked";

/** How a car looks at this health (`exploded`: what's left after the blast). */
export function carLook(hp: number, exploded = false): CarLook {
  if (exploded) return "wrecked";
  if (hp <= 0) return "burning";
  if (hp < 20) return "black";
  if (hp < 40) return "smoking";
  if (hp < 70) return "dented";
  return "ok";
}

/** How much of its top speed and pull a damaged engine still has (0–1). */
export function enginePower(hp: number) {
  if (hp <= 0) return 0.35;
  return 0.6 + 0.4 * Math.min(1, hp / 50);
}

/** A car's health a step later: hit for `dmg`; burning cars count down to the blast. */
export type CarHealth = { hp: number; burn: number; exploded: boolean };
export const freshCar = (): CarHealth => ({ hp: CAR_HP, burn: 0, exploded: false });

/** Damage a car; returns true when this hit set it on fire. */
export function hurtCar(c: CarHealth, dmg: number) {
  if (c.exploded || !(dmg > 0)) return false;
  const was = c.hp;
  c.hp = Math.max(0, c.hp - dmg);
  if (was > 0 && c.hp <= 0) {
    c.burn = BURN_S;
    return true;
  }
  return false;
}

/** Run a burning car's clock; true the moment it explodes. */
export function burnCar(c: CarHealth, dt: number) {
  if (c.exploded || c.hp > 0) return false;
  c.burn -= dt;
  if (c.burn > 0) return false;
  c.exploded = true;
  c.burn = 0;
  return true;
}
