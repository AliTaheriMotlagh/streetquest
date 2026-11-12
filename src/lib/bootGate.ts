// The 3D city's loading screen: when it may let you play, and how far along it is.
// You start once the streets round you are drawn and your car stands on one — not in an empty
// world that fills in while you drive. A slow connection never traps you: after `PLAY_ANYWAY_MS`
// a "Play now" button shows, and after `GIVE_UP_MS` the game starts by itself. Pure.
import { msg } from "@/lib/i18n";

/** Tiles this close (m, to the tile's edge) must be drawn before you start. */
export const BOOT_NEAR_M = 150;
/** The screen stays at least this long (no flash of a loader on a warm start). */
export const BOOT_MIN_MS = 700;
/** From here the player may skip the wait. */
export const PLAY_ANYWAY_MS = 9_000;
/** From here the game starts by itself, drawn or not. */
export const GIVE_UP_MS = 30_000;

export type BootIn = {
  /** Tiles within BOOT_NEAR_M, and how many of them have a mesh in the scene. */
  near: number;
  drawn: number;
  /** …and how many of those are the real map (not the stand-in village). */
  real: number;
  /** The car stands on a street. */
  placed: boolean;
  elapsedMs: number;
};
export type BootStage = "map" | "streets" | "car" | "ready";
export const BOOT_STAGES: Record<BootStage, string> = {
  map: msg("Fetching the real map…"),
  streets: msg("Building the streets around you…"),
  car: msg("Putting your car on the street…"),
  ready: msg("Ready"),
};
export type BootOut = { pct: number; stage: BootStage; done: boolean; canSkip: boolean };

export function bootProgress(b: BootIn): BootOut {
  const near = Math.max(1, b.near);
  // Drawing counts most; the real map over the stand-in a little more; standing on a street the rest.
  const pct = Math.round(Math.min(1, (b.drawn / near) * 0.6 + (b.real / near) * 0.25 + (b.placed ? 0.15 : 0)) * 100);
  const allDrawn = b.near > 0 && b.drawn >= b.near;
  const stage: BootStage = !b.drawn ? "map" : !allDrawn ? "streets" : !b.placed ? "car" : "ready";
  const done = (stage === "ready" && b.elapsedMs >= BOOT_MIN_MS) || b.elapsedMs >= GIVE_UP_MS;
  return { pct: done ? 100 : Math.min(99, pct), stage, done, canSkip: !done && b.elapsedMs >= PLAY_ANYWAY_MS };
}
