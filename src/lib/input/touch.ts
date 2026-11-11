// Touch controls on foot: the maths of a floating stick, drag-to-look with acceleration, and
// the arc the action buttons sit on. Pure (no DOM) so it's tested; components/arena/CombatPad.tsx
// only wires pointers to it.

export const STICK_R = 56; // px of thumb travel for full speed
/** Past this fraction of the radius the stick sprints (the "edge" of the stick). */
export const SPRINT_AT = 1.08;

export type Stick = { ox: number; oy: number };

/**
 * A stick anchored where the thumb came down. Past 1.3x the radius the anchor follows the
 * thumb, so there's never a dead stretch when you turn round. Returns x right / y forward
 * (both -1…1), whether it's at the sprint edge, and the (possibly moved) anchor.
 */
export function stickMove(s: Stick, px: number, py: number, r = STICK_R) {
  let dx = px - s.ox, dy = py - s.oy;
  const d = Math.hypot(dx, dy);
  if (d > r * 1.3) {
    s.ox += (dx / d) * (d - r * 1.3);
    s.oy += (dy / d) * (d - r * 1.3);
    dx = px - s.ox;
    dy = py - s.oy;
  }
  const m = Math.hypot(dx, dy);
  // A small dead centre so a resting thumb doesn't creep.
  const k = m < r * 0.12 ? 0 : Math.min(1, m / r);
  const ang = Math.atan2(dy, dx);
  const x = Math.cos(ang) * k, y = -Math.sin(ang) * k;
  return { x, y, mag: k, sprint: m > r * SPRINT_AT && y > 0.55, dx, dy, knobX: Math.cos(ang) * k * r, knobY: Math.sin(ang) * k * r };
}

/** The look sensitivity setting, clamped to what the slider offers. */
export const clampSens = (v: number) => (Number.isFinite(v) ? Math.max(0.4, Math.min(2.5, v)) : 1);

/**
 * Drag-to-look gain: slow, precise drags keep the base sensitivity, fast flicks turn up to
 * ~2.2x further (a swipe across the screen turns you round; a nudge lines up a head shot).
 * `speed` is pixels per millisecond.
 */
export function lookGain(speed: number, sens = 1) {
  const accel = 1 + Math.min(1.2, Math.max(0, speed - 0.25) * 1.1);
  return clampSens(sens) * accel;
}

/**
 * Centres of n buttons along an arc around the thumb (angles in degrees, 0 = right, 90 = up,
 * counter-clockwise). Mirrored for left-handed play. Offsets in px from the arc's centre.
 */
export function arc(n: number, radius: number, from = 100, to = 190, mirror = false) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    out.push({ x: Math.cos(a) * radius * (mirror ? -1 : 1), y: -Math.sin(a) * radius });
  }
  return out;
}

export type FootAction = "fire" | "aim" | "jump" | "crouch" | "reload" | "car";
/** Which buttons the arc shows right now (the car only when one is close). */
export function footActions(o: { nearCar: boolean; inMatch: boolean }): FootAction[] {
  const list: FootAction[] = ["aim", "jump", "crouch", "reload"];
  if (o.nearCar && !o.inMatch) list.push("car");
  return list;
}
