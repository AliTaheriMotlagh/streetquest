// Lotteries at real places: players buy tickets while standing there, and at the draw
// time one random ticket takes the whole pot. Pure — client and server.

export const LOTTERY_MIN_PRICE = 5;
export const LOTTERY_MAX_PRICE = 10_000;
export const LOTTERY_MIN_LEAD_MS = 10 * 60_000; // draw at least 10 min after it's posted
export const LOTTERY_MAX_LEAD_MS = 7 * 86_400_000;
export const LOTTERY_RADIUS_M = 60;
export const LOTTERY_MAX_TICKETS = 100; // per player, upper bound a host can choose
export const LOTTERY_MAX_HOSTED = 2; // open lotteries a non-admin player can host at once
/** Drawn lotteries stay on the map this long so people can see who won. */
export const LOTTERY_SHOW_DRAWN_MS = 60 * 60_000;

/** Your chance of winning, 0–1. */
export const winChance = (mine: number, total: number) => (total > 0 ? mine / total : 0);

/**
 * Pick the winner, weighted by tickets. `roll` is a uniform integer in [0, total).
 * Kept pure so it's easy to test; the server feeds it crypto randomness.
 */
export function pickWinner<T extends { qty: number }>(entries: T[], roll: number): T | null {
  let acc = 0;
  for (const e of entries) {
    acc += e.qty;
    if (roll < acc) return e;
  }
  return null;
}
