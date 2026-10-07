// King of the hill + bounties. Pure — safe on client and server.
import { S } from "./settings";

export let FLAG_COST = S.flagCost;
export let FLAG_INCOME_HOUR = S.flagIncomeHour;
export const FLAG_CAP_HOURS = 12;
export let FLAG_RADIUS_M = S.flagRadius; // stand this close to capture or defend
export let CAPTURE_SECONDS = S.flagCaptureSeconds;
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

/** Re-read the live admin settings (called by lib/config applyConfig). */
export function syncSettings() {
  FLAG_COST = S.flagCost;
  FLAG_INCOME_HOUR = S.flagIncomeHour;
  FLAG_RADIUS_M = S.flagRadius;
  CAPTURE_SECONDS = S.flagCaptureSeconds;
}
