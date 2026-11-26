// The police helicopter (pure; tests/heli.test.ts): at HELI_STARS wanted stars one flies in from the edge of the city,
// circles over you at HELI_ALT and keeps the police told where you are while it can see you — from the air the
// streets are open, so only being under cover (a bridge, a tunnel, under a building's overhang: the caller says)
// hides you. When the stars drop below, it flies off and goes.

export const HELI_STARS = 4;
export const HELI_ALT = 45;
/** Its circle round you (m), how fast it flies (m/s), how far it spots you from (horizontal m). */
export const ORBIT_R = 38, HELI_SPEED = 28, HELI_SIGHT = 70;
/** It arrives from (and leaves to) this far out. */
export const HELI_FAR = 420;

export type Heli = { x: number; z: number; alt: number; yaw: number; angle: number; leaving: boolean };

/** A helicopter coming in from `HELI_FAR` m away, on the side `seed` picks. */
export function heliIn(me: { x: number; z: number }, seed: number): Heli {
  const a = (seed % 360) * (Math.PI / 180);
  return { x: me.x + Math.cos(a) * HELI_FAR, z: me.z + Math.sin(a) * HELI_FAR, alt: HELI_ALT + 20, yaw: 0, angle: a, leaving: false };
}

/**
 * One step: toward its next point on the circle round you (or away, leaving), easing down to its height, nose to where
 * it's flying. Returns false when a leaving helicopter is far enough to be gone.
 */
export function heliStep(h: Heli, me: { x: number; z: number }, dt: number): boolean {
  let tx: number, tz: number;
  if (h.leaving) {
    const ax = h.x - me.x, az = h.z - me.z, d = Math.hypot(ax, az) || 1;
    tx = h.x + (ax / d) * 100;
    tz = h.z + (az / d) * 100;
    if (d > HELI_FAR) return false;
  } else {
    h.angle += (HELI_SPEED / ORBIT_R) * dt * 0.35;
    tx = me.x + Math.cos(h.angle) * ORBIT_R;
    tz = me.z + Math.sin(h.angle) * ORBIT_R;
  }
  const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
  const move = Math.min(d, HELI_SPEED * dt);
  if (d > 1e-6) {
    h.x += (dx / d) * move;
    h.z += (dz / d) * move;
    // Forward is (−sin yaw, −cos yaw).
    h.yaw = Math.atan2(-dx, -dz);
  }
  h.alt += ((h.leaving ? HELI_ALT + 30 : HELI_ALT) - h.alt) * Math.min(1, dt * 0.8);
  return true;
}

/** Does it see you? Within its sight, not leaving, and you're not under cover. */
export const heliSees = (h: Heli | null, me: { x: number; z: number }, covered: boolean) =>
  !!h && !h.leaving && !covered && Math.hypot(h.x - me.x, h.z - me.z) <= HELI_SIGHT;
