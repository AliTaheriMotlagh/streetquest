// Walking into a store (pure; tests/walkIn.test.ts): no button — on foot, you go in by walking at its door, the way
// you'd go into a shop in an open-world game. In when you're close, moving (not just standing there) and heading at
// the door; after you come out, that store only lets you in again once you've stepped away from it (no bounce).
/** How close to the storefront's door point counts (m): the façade's collision keeps you ~1–2 m off its line. */
export const WALK_IN_M = 3.4;
/** Stepping this far away re-arms a store you just left. */
export const REARM_M = 7;

export type WalkInState = { left: string | null };

/** Should this step take you in? `v` is your velocity (m/s); the heading must be within ~40° of the door. */
export function walksIn(p: { x: number; z: number; vx: number; vz: number }, door: { id: string; x: number; z: number }, st: WalkInState): boolean {
  const dx = door.x - p.x, dz = door.z - p.z, d = Math.hypot(dx, dz);
  if (st.left === door.id) {
    if (d > REARM_M) st.left = null;
    return false;
  }
  const speed = Math.hypot(p.vx, p.vz);
  if (d > WALK_IN_M || speed < 0.6) return false;
  if (d < 0.4) return true;
  return (p.vx * dx + p.vz * dz) / (speed * d) > 0.75;
}
