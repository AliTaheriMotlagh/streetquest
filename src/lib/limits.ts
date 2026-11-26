// How often a player may do the things that reach other players (pure; tests/limits.test.ts): new listings and
// ads (reports have their own cap in server/moderation.ts). A sliding window per player — server/limits.ts counts the player's recent ones (Metric rows
// "rl:<key>") and refuses with 429 and when to try again. The guest sign-up guard (per network) works the same.
import { msg } from "./i18n";

export type LimitKey = "listing" | "ad";
const HOUR = 3600_000;
export const LIMITS: Record<LimitKey, { max: number; windowMs: number; text: string }> = {
  listing: { max: 30, windowMs: HOUR, text: msg("That's a lot of new products at once — try again in {n} min") },
  ad: { max: 10, windowMs: 24 * HOUR, text: msg("That's enough new ads for today — try again in {n} min") },
};

/** Minutes until one more is allowed, given the times of the recent ones (0: allowed now). */
export function waitMinutes(times: number[], max: number, windowMs: number, now = Date.now()): number {
  const inWindow = times.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (inWindow.length < max) return 0;
  // The oldest that must drop out of the window first.
  const frees = inWindow[inWindow.length - max] + windowMs;
  return Math.max(1, Math.ceil((frees - now) / 60_000));
}
