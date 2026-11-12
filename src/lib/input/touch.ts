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
 * (both -1…1), whether it's at the sprint edge (any way: arena/foot.ts decides whether a
 * sideways push may sprint — it may when the body turns to where it goes), and the
 * (possibly moved) anchor.
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
  return { x, y, mag: k, sprint: m > r * SPRINT_AT, dx, dy, knobX: Math.cos(ang) * k * r, knobY: Math.sin(ang) * k * r };
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
export type FootSlot = Exclude<FootAction, "fire"> | "swap";
/** A round action button's size (px): every one clears its neighbours by this much. */
export const FOOT_BTN = 52;
/** How far below the fire button's centre a button may sit and still be whole on the screen (the fire button is 80 px up from the bottom edge). */
export const FOOT_BELOW_MAX = 44;
/** [ring radius px, angle°] of each button round the fire button: what the thumb uses most is nearest. */
const FOOT_RING: Record<FootSlot, [number, number]> = {
  reload: [112, 92],
  crouch: [112, 124],
  jump: [112, 156],
  aim: [112, 188],
  swap: [180, 122],
  car: [180, 150],
};
/**
 * Where the on-foot buttons sit, in px from the fire button's centre (x right, y down): two
 * rings under the right thumb, so none of them leaves the screen or covers another on a
 * narrow phone (one ring of six pushed "car" off the bottom edge and "aim" under the grenades).
 * Mirrored for left-handed play.
 */
export function footLayout(mirror = false): Record<FootSlot, { x: number; y: number }> {
  const out = {} as Record<FootSlot, { x: number; y: number }>;
  for (const k of Object.keys(FOOT_RING) as FootSlot[]) {
    const [r, deg] = FOOT_RING[k], a = (deg * Math.PI) / 180;
    out[k] = { x: Math.cos(a) * r * (mirror ? -1 : 1), y: -Math.sin(a) * r };
  }
  return out;
}
/** Which buttons the arc shows right now (the car only when one is close). */
export function footActions(o: { nearCar: boolean; inMatch: boolean }): FootAction[] {
  const list: FootAction[] = ["aim", "jump", "crouch", "reload"];
  if (o.nearCar && !o.inMatch) list.push("car");
  return list;
}
