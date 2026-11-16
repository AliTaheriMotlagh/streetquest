// Walking up and down a slope (pure; tests/walkSlope.test.ts) — a footbridge ramp, a sloping street, a flight of
// stairs. The gait's clips are keyed on flat ground, so on a slope the feet would sink into a climb and float over
// a descent. Instead the body tips into the slope about the hips (arena/avatar.ts): the legs then swing in the
// ground's own plane, so each foot meets it; the spine bends back against most of that tip, leaving the torso
// leaning into a climb and sitting back a little going down, as people do.

/** Steeper than this (rad, ~20°) is stairs or a wall's edge: the body takes no more than this. */
export const SLOPE_MAX = 0.35;
/** How quickly the lean follows the ground (1/s): stairs and kerbs blur into one even slope. */
const EASE = 6;

/**
 * The slope under the body along where it faces (rad, + = uphill ahead), eased from `prev`: the ground `rise` m over
 * `run` m (ahead minus behind). Only while walking on the ground — standing, in the air or flying, it eases back to 0.
 */
export function easeSlope(prev: number, rise: number, run: number, dt: number, walking: boolean): number {
  const want = walking && run > 0 && Number.isFinite(rise) ? Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, Math.atan2(rise, run))) : 0;
  return prev + (want - prev) * (1 - Math.exp(-dt * EASE));
}

/**
 * How the body takes slope `a` (rad): `tilt` — the whole body tipped forward about the hips (the legs' plane follows
 * the ground); `spine` — bent back against it, so the torso ends up leaning `tilt + spine` (forward into a climb, a
 * little back on the way down); `shift` — the hips moved forward (× hip height) so the feet stay under the body.
 */
export function slopePose(a: number): { tilt: number; spine: number; shift: number } {
  const s = Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, a));
  const tilt = s * 0.85, torso = s > 0 ? s * 0.45 : s * 0.3;
  return { tilt, spine: torso - tilt, shift: Math.sin(tilt) };
}
