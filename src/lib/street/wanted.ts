// Wanted level in the open 3D city (pure — the client runs it, tests/street.test.ts holds it).
// Crimes somebody sees raise the heat; heat is stars (1–5); stars decide how hard the
// police come: how many patrol cars, whether they ram you, whether officers get out and
// shoot. Out of every officer's sight for long enough, they lose you; stopped beside an
// officer for a moment, you're arrested.

export type Crime = "shots" | "hitPerson" | "killPerson" | "carjack" | "explosion" | "rammedCop" | "hitCop" | "killCop";

/** Heat a crime adds when a passer-by sees it (an officer seeing it counts double). */
export const HEAT: Record<Crime, number> = { shots: 2, hitPerson: 3, killPerson: 6, carjack: 2.5, explosion: 7, rammedCop: 4, hitCop: 9, killCop: 16 };
/** Heat at which each star lights (index = stars). */
export const STAR_HEAT = [0, 2, 8, 18, 32, 50] as const;
export const MAX_STARS = 5;
const MAX_HEAT = 70;
/** Seconds stopped beside an officer before the cuffs go on. */
export const CUFF_S = 2.2;

export type Wanted = {
  heat: number;
  stars: number;
  /** Seconds since an officer last saw you. */
  unseen: number;
  /** Seconds you've stood (or sat in a stopped car) beside an officer. */
  cuff: number;
};

export const calm = (): Wanted => ({ heat: 0, stars: 0, unseen: 0, cuff: 0 });

export function starsFor(heat: number) {
  let s = 0;
  for (let i = 1; i <= MAX_STARS; i++) if (heat >= STAR_HEAT[i]) s = i;
  return s;
}

/** Who saw it: nobody, a passer-by, or an officer. */
export type Witness = 0 | 1 | 2;

/** A crime. Stars only ever go up from one; nobody seeing it means nothing happens. Returns the stars now. */
export function report(w: Wanted, crime: Crime, seen: Witness) {
  if (!seen) return w.stars;
  w.heat = Math.min(MAX_HEAT, w.heat + HEAT[crime] * (seen === 2 ? 2 : 1));
  w.stars = Math.max(w.stars, starsFor(w.heat));
  if (seen === 2) w.unseen = 0;
  return w.stars;
}

/** How long out of every officer's sight (s) until they give up: longer the more stars. */
export const loseAfter = (stars: number) => 6 + stars * 4;

export type Outcome = "lost" | "busted" | null;

/**
 * Run the clocks for `dt` s. `seen`: an officer sees you now. `cuffable`: one is right
 * beside you while you're (nearly) still. Returns what just happened, if anything.
 */
export function tickWanted(w: Wanted, dt: number, seen: boolean, cuffable: boolean): Outcome {
  if (!w.stars) {
    w.heat = Math.max(0, w.heat - dt * 0.5);
    w.unseen = w.cuff = 0;
    return null;
  }
  w.unseen = seen ? 0 : w.unseen + dt;
  w.cuff = cuffable ? w.cuff + dt : Math.max(0, w.cuff - dt * 2);
  if (w.cuff >= CUFF_S) {
    Object.assign(w, calm());
    return "busted";
  }
  if (w.unseen >= loseAfter(w.stars)) {
    Object.assign(w, calm());
    return "lost";
  }
  return null;
}

export type Response = {
  /** Patrol cars after you at once. */
  cars: number;
  /** They drive into you to stop you. */
  ram: boolean;
  /** Officers on foot fire at you when you're on foot. */
  shoot: boolean;
  /** …and at your car too. */
  shootCars: boolean;
};

/** How the police come for you at this many stars. */
export function response(stars: number): Response {
  const s = Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  return { cars: [0, 1, 2, 3, 4, 5][s], ram: s >= 2, shoot: s >= 2, shootCars: s >= 3 };
}
