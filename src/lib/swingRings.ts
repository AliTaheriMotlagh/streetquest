// Sky Rings: a hero course over the rooftops (pure; tests/swingRings.test.ts). Started from the
// 3D menu with hero moves on: a line of upright gold rings strung ahead of you between the
// buildings, each higher or lower than the last, to swing, zip and glide through in order
// against the clock. Only the next ring counts (the 3D view marks it); the time and the rings
// earn 0–5 stars, which is what the "swing" street job pays on (lib/street/jobs.ts).
// Metres, seconds; y is height over the street; forward is -z at yaw 0 (as in lib/hero.ts).

export type SwingRing = { x: number; y: number; z: number; /** The way through it (radians, as a heading). */ yaw: number; hit: boolean };
export type SwingCourse = { rings: SwingRing[]; t: number; next: number; done: boolean };

/** Rings on a course, their radius (m), the gap between them (m), and the height band they hang in. */
export const SWING_RINGS = 8, SWING_RING_R = 4.5, SWING_GAP = { min: 28, max: 40 } as const, SWING_Y = { min: 12, max: 36 } as const;
/** Par time (s): all rings this fast is five stars. The course is over after SWING_LIMIT_S. */
export const SWING_PAR_S = 70, SWING_LIMIT_S = 150;

/** A small seeded random (the same seed draws the same course, for tests and replays). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A course starting ahead of (x, z) the way `yaw` faces: the heading wanders a little ring to
 * ring, the height walks up and down inside SWING_Y. `roofAt` (optional) lifts a ring that
 * would sit inside a building to clear its roof.
 */
export function swingCourse(x: number, z: number, yaw: number, seed = 1, roofAt?: (x: number, z: number) => number): SwingCourse {
  const r = rng(seed);
  const rings: SwingRing[] = [];
  let h = yaw, px = x, pz = z, y = 18;
  for (let i = 0; i < SWING_RINGS; i++) {
    h += (r() - 0.5) * 0.9;
    const gap = SWING_GAP.min + r() * (SWING_GAP.max - SWING_GAP.min);
    px += -Math.sin(h) * gap;
    pz += -Math.cos(h) * gap;
    y = Math.max(SWING_Y.min, Math.min(SWING_Y.max, y + (r() - 0.45) * 12));
    const roof = roofAt ? roofAt(px, pz) : 0;
    rings.push({ x: px, y: Math.min(SWING_Y.max + 30, Math.max(y, roof + SWING_RING_R + 3)), z: pz, yaw: h, hit: false });
  }
  return { rings, t: 0, next: 0, done: false };
}

/**
 * Moved from `prev` to `now` (body centres): through the next ring? Crossing its plane inside
 * the radius, either way round. Returns the ring passed (its index) or -1.
 */
export function passSwing(c: SwingCourse, prev: { x: number; y: number; z: number }, now: { x: number; y: number; z: number }): number {
  if (c.done) return -1;
  const ring = c.rings[c.next];
  if (!ring) return -1;
  const nx = -Math.sin(ring.yaw), nz = -Math.cos(ring.yaw);
  const d0 = (prev.x - ring.x) * nx + (prev.z - ring.z) * nz, d1 = (now.x - ring.x) * nx + (now.z - ring.z) * nz;
  if (d0 * d1 > 0 || d0 === d1) return -1;
  const k = d0 / (d0 - d1);
  const ix = prev.x + (now.x - prev.x) * k, iy = prev.y + (now.y - prev.y) * k, iz = prev.z + (now.z - prev.z) * k;
  if (Math.hypot(ix - ring.x, iy - ring.y, iz - ring.z) > SWING_RING_R) return -1;
  ring.hit = true;
  const i = c.next++;
  if (c.next >= c.rings.length) c.done = true;
  return i;
}

/** The clock: true when time's up (the course ends with what you've got). */
export function tickSwing(c: SwingCourse, dt: number): boolean {
  if (c.done) return false;
  c.t += dt;
  if (c.t >= SWING_LIMIT_S) {
    c.done = true;
    return true;
  }
  return false;
}

/** Rings through, the time, and the stars: all of them under par is 5, slower 4 or 3, part of it 1–2. */
export function scoreSwing(c: SwingCourse): { rings: number; secs: number; stars: number } {
  const rings = c.rings.filter((r) => r.hit).length, all = rings === c.rings.length;
  const stars = all ? (c.t <= SWING_PAR_S ? 5 : c.t <= SWING_PAR_S * 1.5 ? 4 : 3) : rings >= c.rings.length / 2 ? 2 : rings > 0 ? 1 : 0;
  return { rings, secs: Math.round(c.t * 10) / 10, stars };
}
