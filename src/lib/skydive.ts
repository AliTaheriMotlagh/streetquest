// Skydiving in the 3D city (pure; tests/skydive.test.ts) — out of the helicopter, or dropped high
// over where you are from the menu:
//  - freefall: you fall at a skydiver's speed (≈190 km/h belly down); gas tucks into a dive
//    (faster down and forward), brake spreads out (slower), steering turns. You pull the cord
//    yourself (the jump key / the big button); below AUTO_OPEN_M it opens by itself — late;
//  - the canopy opens with a jolt, then glides: gas to dive faster and further, brake to slow
//    down; near the ground, brake is the flare that turns a thump into a soft landing;
//  - a course on a dropped jump: rings to fly through on the way down and a target to land on.
//    The landing is graded (perfect / good / hard), and the jump scored: rings, how close to
//    the target, how soft — 1 to 5 stars, which is what the street-job reward pays on.
// Units: metres, seconds, m/s; `alt` is height above the city's ground (0), `floor` the surface
// under you (a roof's top).

export type SkyBody = { x: number; z: number; alt: number; vx: number; vz: number; vy: number; yaw: number; steer: number };
export type SkyControls = { gas: number; brake: number; steer: number; /** The cord pulled this frame. */ pull: boolean };
export type SkyPhase = "free" | "open";
export type SkyState = { phase: SkyPhase; t: number; openedAt: number; /** Opened by itself (too late to pull). */ auto: boolean; topSpeed: number };

/** Freefall: terminal speeds down (m/s) belly-to-earth, tucked into a dive, spread out. */
export const FALL = { belly: 53, dive: 70, spread: 42 } as const;
/** Forward drift in freefall (m/s): what tracking gives you, flat, tracking hard. */
export const TRACK = { idle: 9, max: 28, spread: 5 } as const;
/** Under the canopy (m/s): sink rate and glide, and what gas and brake add or take. */
export const CANOPY = { sink: 4.4, glide: 8, dive: 2, slow: 1.8 } as const;
/** The canopy opens by itself this high above what's under you (m): the last safe moment. */
export const AUTO_OPEN_M = 70;
/** It takes this long to open fully (s): the jolt. */
export const OPEN_S = 1.1;
/** Flare height (m): braking below this cuts the sink to a soft touchdown. */
export const FLARE_M = 9;
/** A jump from the menu starts this high over where you are (m). */
export const DROP_ALT = 900;
/** Rings on a course, and how wide each is (m, radius). */
export const RINGS = 6, RING_R = 11;

export const startSky = (): SkyState => ({ phase: "free", t: 0, openedAt: 0, auto: false, topSpeed: 0 });

const forward = (yaw: number) => ({ fx: -Math.sin(yaw), fz: -Math.cos(yaw) });
const toward = (v: number, want: number, k: number) => v + (want - v) * Math.min(1, k);

/** One step of a jump (height and velocity; the caller moves x, z). Returns what happened this step ("opened", "auto-opened" or null). */
export function stepSky(b: SkyBody, s: SkyState, c: SkyControls, dt: number, floor = 0): "opened" | "auto-opened" | null {
  s.t += dt;
  let event: "opened" | "auto-opened" | null = null;
  const agl = b.alt - floor;
  if (s.phase === "free" && (c.pull || agl < AUTO_OPEN_M) && s.t > 0.35) {
    s.phase = "open";
    s.openedAt = s.t;
    s.auto = !c.pull;
    event = c.pull ? "opened" : "auto-opened";
  }
  const { fx, fz } = forward(b.yaw);
  let vF = b.vx * fx + b.vz * fz;
  if (s.phase === "free") {
    const term = FALL.belly + (FALL.dive - FALL.belly) * c.gas - (FALL.belly - FALL.spread) * c.brake;
    // Gravity until the air holds you at terminal speed.
    b.vy = Math.max(-term, b.vy - 9.8 * dt);
    if (b.vy < -term) b.vy = toward(b.vy, -term, dt * 2);
    const want = c.brake > 0 ? TRACK.idle - (TRACK.idle - TRACK.spread) * c.brake : TRACK.idle + (TRACK.max - TRACK.idle) * c.gas;
    vF = toward(vF, want, dt * 0.8);
    b.steer = toward(b.steer, c.steer, dt * 4);
    b.yaw += b.steer * 1.5 * dt;
  } else {
    const k = Math.min(1, (s.t - s.openedAt) / OPEN_S);
    const flare = agl < FLARE_M ? c.brake : 0;
    const sink = CANOPY.sink + CANOPY.dive * c.gas - CANOPY.slow * c.brake * (flare ? 0 : 1) - 3.2 * flare;
    const glide = CANOPY.glide + 4 * c.gas - 4 * c.brake;
    // The jolt: the fall is caught hard while the canopy fills, then settles on the glide.
    b.vy = toward(b.vy, -Math.max(0.8, sink), dt * (1.2 + 4 * k));
    vF = toward(vF, glide, dt * (0.6 + 0.8 * k));
    b.steer = toward(b.steer, c.steer, dt * 3);
    b.yaw += b.steer * 1.1 * dt;
  }
  b.alt = Math.max(floor, b.alt + b.vy * dt);
  const n = forward(b.yaw);
  b.vx = n.fx * vF;
  b.vz = n.fz * vF;
  // (The caller moves x and z by vx, vz: the city's walls get their say first.)
  s.topSpeed = Math.max(s.topSpeed, Math.hypot(b.vx, b.vz, b.vy));
  return event;
}

/** Down: how it went (`vy` the sink at touchdown, `vF` the forward speed). Never opened is a crash. */
export type Landing = "perfect" | "good" | "hard" | "crash";
export function landingOf(s: SkyState, vy: number, vF: number): Landing {
  if (s.phase === "free") return "crash";
  if (vy > -2.6 && vF < 7) return "perfect";
  if (vy > -4.8) return "good";
  return "hard";
}
/** Health lost on landing (of 100). */
export const landingHurt = (l: Landing) => (l === "crash" ? 100 : l === "hard" ? 25 : 0);

export type Ring = { x: number; z: number; alt: number; yaw: number; hit: boolean };
export type Course = { rings: Ring[]; target: { x: number; z: number } };

/**
 * A course for a dropped jump from (x, z, alt) heading `yaw`: rings that bend gently along the
 * fall (the first well below the start, the last above where the canopy should open), and the
 * target to land on — `target`, a clear spot the city chose a few hundred metres ahead.
 */
export function courseFor(x: number, z: number, alt: number, yaw: number, target: { x: number; z: number }, seed = 1): Course {
  const rnd = (i: number) => Math.abs(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1;
  const rings: Ring[] = [];
  const top = alt - 90, bottom = AUTO_OPEN_M + 90;
  let cx = x, cz = z, cy = yaw;
  for (let i = 0; i < RINGS; i++) {
    const k = (i + 1) / (RINGS + 1);
    // Drift toward the target as you fall (tracking), with a bend left or right at each ring.
    cy += (rnd(i) - 0.5) * 0.7;
    const tx = x + (target.x - x) * k, tz = z + (target.z - z) * k;
    const f = forward(cy);
    cx = tx + f.fx * 25 * (rnd(i + 9) - 0.5);
    cz = tz + f.fz * 25 * (rnd(i + 9) - 0.5);
    rings.push({ x: cx, z: cz, alt: top - (top - bottom) * (i / (RINGS - 1)), yaw: cy, hit: false });
  }
  return { rings, target };
}

/** Marks the rings flown through since the last step (from `prev` to `now`): their count. */
export function passRings(course: Course, prev: { x: number; z: number; alt: number }, now: { x: number; z: number; alt: number }): number {
  let n = 0;
  for (const r of course.rings) {
    if (r.hit) continue;
    // Crossed the ring's height this step, within its radius there (falling: the ring lies flat).
    if ((prev.alt - r.alt) * (now.alt - r.alt) > 0 && Math.abs(now.alt - r.alt) > 0.01) continue;
    const k = prev.alt === now.alt ? 0 : (prev.alt - r.alt) / (prev.alt - now.alt);
    const px = prev.x + (now.x - prev.x) * k, pz = prev.z + (now.z - prev.z) * k;
    if (Math.hypot(px - r.x, pz - r.z) <= RING_R) (r.hit = true), n++;
  }
  return n;
}

/** The jump's score: rings, closeness to the target, the landing — and the stars (1–5) it earns. */
export function scoreJump(course: Course | null, landedAt: { x: number; z: number }, l: Landing): { points: number; rings: number; dist: number | null; stars: number } {
  const rings = course ? course.rings.filter((r) => r.hit).length : 0;
  const dist = course ? Math.hypot(landedAt.x - course.target.x, landedAt.z - course.target.z) : null;
  const near = dist == null ? 0 : dist <= 5 ? 400 : dist <= 15 ? 220 : dist <= 40 ? 90 : 0;
  const soft = l === "perfect" ? 150 : l === "good" ? 60 : 0;
  const points = l === "crash" ? 0 : rings * 60 + near + soft;
  const stars = l === "crash" ? 0 : Math.max(1, Math.min(5, Math.round(points / 180)));
  return { points, rings, dist: dist == null ? null : Math.round(dist), stars };
}
