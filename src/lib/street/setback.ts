// What happens after a setback in the open city (pure; tests/setback.test.ts): arrested, you're let go outside the
// nearest police station; knocked out, you come to outside the nearest hospital or clinic — when one is in reach
// (else where you fell, as before). A fine for each can be set in Admin → Game settings (0 = none, the default:
// the game doesn't take money unless the admin decides it should); it's never more than you have.
import type { CivicKind } from "../storeKinds";

export type Setback = "busted" | "down";
export const SETBACK_PLACES: Record<Setback, CivicKind[]> = { busted: ["police"], down: ["hospital", "clinic"] };
/** Only a place this close counts (m): farther, you stay where it happened. */
export const SETBACK_REACH_M = 1500;
/** Where you're set down: this far out in front of its door, toward where you were. */
const OUT_M = 6;

/** The nearest place of the kinds wanted within reach, or null. */
export function setbackPlace<T extends { x: number; z: number; kind: CivicKind | null }>(kind: Setback, places: T[], from: { x: number; z: number }, reach = SETBACK_REACH_M): T | null {
  const want = SETBACK_PLACES[kind];
  let best: T | null = null, bd = reach;
  for (const p of places) {
    if (!p.kind || !want.includes(p.kind)) continue;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d <= bd) (bd = d), (best = p);
  }
  return best;
}

/** The spot outside a place, toward `from` (facing the place). */
export function outside(place: { x: number; z: number }, from: { x: number; z: number }): { x: number; z: number; yaw: number } {
  const dx = from.x - place.x, dz = from.z - place.z, d = Math.hypot(dx, dz) || 1;
  const x = place.x + (dx / d) * OUT_M, z = place.z + (dz / d) * OUT_M;
  // Facing the door: forward is (−sin yaw, −cos yaw) in the drive's frame.
  return { x, z, yaw: Math.atan2(dx / d, dz / d) };
}

/** The fine in coins: per star when arrested, the bill when knocked out; never more than you have. */
export function setbackFine(kind: Setback, stars: number, coins: number, s: { bustFinePerStar: number; hospitalBill: number }): number {
  const fine = kind === "busted" ? Math.max(1, stars) * s.bustFinePerStar : s.hospitalBill;
  return Math.max(0, Math.min(Math.floor(coins), Math.round(fine)));
}
