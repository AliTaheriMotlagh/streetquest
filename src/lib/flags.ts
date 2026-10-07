// King of the hill + bounties. Pure — safe on client and server.

export const FLAG_COST = 300;
export const FLAG_INCOME_HOUR = 30;
export const FLAG_CAP_HOURS = 12;
export const FLAG_RADIUS_M = 30; // stand this close to capture or defend
export const CAPTURE_SECONDS = 60;
export const FLAG_SPACING_M = 150;
export const MAX_FLAGS = 3;
export const FLAG_SHIELD_MS = 5 * 60_000; // a fresh capture can't be flipped straight back
export const CAPTURE_BONUS = 100;

export function flagTribute(collectedAt: Date | string | number, now = Date.now(), mult = 1) {
  const hours = Math.min(FLAG_CAP_HOURS, Math.max(0, (now - new Date(collectedAt).getTime()) / 3_600_000));
  return Math.floor(hours * FLAG_INCOME_HOUR * mult);
}

export const BOUNTY_MIN = 50;
export const BOUNTY_MAX = 5000;
export const BOUNTY_DAYS = 7; // unclaimed bounties are refunded after this
