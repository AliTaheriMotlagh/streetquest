// Street Arena medals: the banner when you pull off something worth shouting about —
// a double or triple kill, a run of kills without dying, first blood, a headshot. Pure:
// combat.ts counts, this decides; the rarest thing that just happened wins the banner.
import { msg } from "../i18n";

/** Kills this close together (ms) chain into a multi-kill. */
export const MULTI_KILL_MS = 4000;

export type Medal = { key: string; text: string; big: boolean };
export type KillRun = { multi: number; streak: number; lastAt: number };

/** The run after one more kill at `now` (a kill more than MULTI_KILL_MS after the last starts a new chain). */
export const nextRun = (r: KillRun, now: number): KillRun => ({ multi: now - r.lastAt <= MULTI_KILL_MS ? r.multi + 1 : 1, streak: r.streak + 1, lastAt: now });
export const NO_RUN: KillRun = { multi: 0, streak: 0, lastAt: -Infinity };

export function medalFor(o: { multi: number; streak: number; head: boolean; firstBlood: boolean }): Medal | null {
  if (o.multi >= 4) return { key: "rampage", text: msg("RAMPAGE!"), big: true };
  if (o.multi === 3) return { key: "triple", text: msg("TRIPLE KILL!"), big: true };
  if (o.streak >= 10 && o.streak % 5 === 0) return { key: "unstoppable", text: msg("UNSTOPPABLE · {n} in a row"), big: true };
  if (o.streak === 5) return { key: "spree", text: msg("KILLING SPREE · 5 in a row"), big: true };
  if (o.multi === 2) return { key: "double", text: msg("DOUBLE KILL!"), big: false };
  if (o.firstBlood) return { key: "first", text: msg("FIRST BLOOD"), big: false };
  if (o.head) return { key: "head", text: msg("HEADSHOT"), big: false };
  return null;
}
