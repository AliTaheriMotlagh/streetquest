// Bomb mode's round money (pure; tests/economy.test.ts): everyone starts with a little, earns it
// by kills, planting and rounds — a losing side earns more each round it keeps losing, so it can
// come back — and spends it in the freeze time before a round on a better gun. Dying loses what
// you bought: the next round starts you on the free kit (an SMG and a pistol). Money starts over
// when the sides swap at half time.
import type { WeaponKey } from "./weapons";

export const START_MONEY = 800;
export const MAX_MONEY = 16_000;
export const KILL_PAY = 300;
export const PLANT_PAY = 300;
export const WIN_PAY = 3250;
/** What a losing side gets: more for each round in a row it has lost. */
export const lossPay = (inARow: number) => Math.min(3400, 1400 + 500 * Math.max(0, inARow - 1));

/** The free kit every round starts with after you die. */
export const FREE_PRIMARY: WeaponKey = "smg";
export const FREE_SECONDARY: WeaponKey = "pistol";

export const PRICES: Record<WeaponKey, number> = { smg: 0, pistol: 0, deagle: 700, shotgun: 750, dmr: 2300, rifle: 2700, battle: 3100, sniper: 4750, lmg: 5200 };

/** Money after earning `n` (never past the cap). */
export const earn = (money: number, n: number) => Math.min(MAX_MONEY, Math.max(0, money) + n);

/** What switching to `want` costs: nothing for what you already hold, else its price. */
export const costOf = (holding: readonly WeaponKey[], want: WeaponKey) => (holding.includes(want) ? 0 : PRICES[want]);

/** A buy: the money left, or null when it can't be afforded. */
export function buy(money: number, holding: readonly WeaponKey[], want: WeaponKey): number | null {
  const c = costOf(holding, want);
  return c <= money ? money - c : null;
}

/** What a bot buys with what it has: the best of a few sensible guns it can afford. */
export function botBuy(money: number): WeaponKey {
  for (const w of ["rifle", "dmr", "shotgun"] as WeaponKey[]) if (PRICES[w] <= money) return w;
  return FREE_PRIMARY;
}
