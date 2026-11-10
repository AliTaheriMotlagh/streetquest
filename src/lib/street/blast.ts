// A car blowing up, as a plan the 3D client draws (drive/blast3d.ts) — pure, so the tests
// can hold it (tests/blast.test.ts):
//  - the fireball: a hot core that swells in a fraction of a second, lobes bursting out
//    of it a beat later, all rising, cooling from white-yellow through orange and red to
//    black smoke, and tearing apart as they go;
//  - the smoke column: black balls that keep rolling up for several seconds after;
//  - the car coming apart: bonnet, boot lid, a door or two, the bumper and a wheel thrown
//    up and out, tumbling, bouncing and lying on the road where they land.

/** One ball of fire or smoke: where it starts (relative to the blast), how it moves and grows, when. */
export type BallPlan = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r0: number;
  r1: number;
  delay: number;
  life: number;
  heat: number;
  smoke: number;
  seed: number;
};
export type PartKind = "bonnet" | "boot" | "door" | "bumper" | "wheel";
/** One piece thrown off the car: its size (m), how it's thrown (m/s, rad/s), whether it's painted (else black). */
export type PartPlan = {
  kind: PartKind;
  sx: number;
  sy: number;
  sz: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  painted: boolean;
};

/** How long the whole thing takes to clear (s): the last smoke ball fades by then. */
export const BLAST_CLEAR_S = 8;

/** The balls and pieces for one car blowing up (`lite`: fewer of each, for phones). */
export function planBlast(rand: () => number, lite = false): { balls: BallPlan[]; parts: PartPlan[] } {
  const r = (a: number, b: number) => a + rand() * (b - a);
  const balls: BallPlan[] = [];
  // The core: from the middle of the car, swelling fast.
  balls.push({
    x: 0,
    y: 0.9,
    z: 0,
    vx: 0,
    vy: 1.6,
    vz: 0,
    r0: 0.6,
    r1: 3.3,
    delay: 0,
    life: 1.9,
    heat: 1,
    smoke: 0,
    seed: rand(),
  });
  // Lobes bursting out of it.
  const lobes = lite ? 2 : 4;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r(-0.4, 0.4), out = r(1.0, 1.8);
    balls.push({
      x: Math.cos(a) * 0.5,
      y: r(0.6, 1.4),
      z: Math.sin(a) * 0.5,
      vx: Math.cos(a) * out,
      vy: r(1.8, 3.2),
      vz: Math.sin(a) * out,
      r0: 0.4,
      r1: r(1.7, 2.4),
      delay: r(0.03, 0.16),
      life: r(1.3, 1.8),
      heat: r(0.8, 1),
      smoke: 0,
      seed: rand(),
    });
  }
  // The column of black smoke rolling up after it.
  const column = lite ? 2 : 4;
  for (let i = 0; i < column; i++) {
    balls.push({
      x: r(-0.6, 0.6),
      y: 1.5 + i * 0.6,
      z: r(-0.6, 0.6),
      vx: r(-0.3, 0.3) + 0.25,
      vy: r(1.3, 2),
      vz: r(-0.3, 0.3),
      r0: 0.9,
      r1: r(2.6, 3.6),
      delay: 0.25 + i * 0.35,
      life: r(4.6, 6.2),
      heat: 0.25,
      smoke: 1,
      seed: rand(),
    });
  }
  const parts: PartPlan[] = [];
  const throwOut = (kind: PartKind, sx: number, sy: number, sz: number, x: number, y: number, z: number, up: number, out: number, painted: boolean) => {
    const a = Math.atan2(z || r(-1, 1), x || r(-1, 1)) + r(-0.6, 0.6), sp = out * r(0.7, 1.3);
    parts.push({
      kind,
      sx,
      sy,
      sz,
      x,
      y,
      z,
      vx: Math.cos(a) * sp,
      vy: up * r(0.75, 1.2),
      vz: Math.sin(a) * sp,
      wx: r(-9, 9),
      wy: r(-6, 6),
      wz: r(-9, 9),
      painted,
    });
  };
  // In the car's frame: the nose is at −z.
  throwOut("bonnet", 1.35, 0.05, 1.05, 0, 1.0, -1.3, 12, 3, true);
  if (!lite) throwOut("boot", 1.25, 0.05, 0.75, 0, 1.0, 1.6, 9, 3, true);
  throwOut("door", 0.06, 0.8, 1.05, 0.85, 0.75, -0.1, 6, 7, true);
  if (!lite) throwOut("door", 0.06, 0.8, 1.0, -0.85, 0.75, 0.7, 5, 6, true);
  throwOut("bumper", 1.6, 0.2, 0.16, 0, 0.45, -2.1, 5, 6, false);
  throwOut("wheel", 0.2, 0.58, 0.58, r(-1, 1) > 0 ? 0.8 : -0.8, 0.35, r(-1, 1) > 0 ? 1.3 : -1.3, 7, 6, false);
  return { balls, parts };
}

/**
 * A ball `t` s after the blast: where (relative), how big, and how far through its life
 * (0 … 1; null before it starts or after it's gone). It slows as it rises, and grows fast
 * then slowly.
 */
export function ballAt(b: BallPlan, t: number): { x: number; y: number; z: number; r: number; k: number } | null {
  const s = t - b.delay;
  if (s < 0 || s >= b.life) return null;
  const k = s / b.life;
  // Moving out and up, slowing: distance is v × τ(1 − e^(−s/τ)).
  const tau = b.smoke ? 2.4 : 0.9, go = tau * (1 - Math.exp(-s / tau));
  const grow = 1 - Math.exp(-s * (b.smoke ? 1.1 : 5.5));
  return {
    x: b.x + b.vx * go,
    y: b.y + b.vy * go + (b.smoke ? s * 0.5 : 0),
    z: b.z + b.vz * go,
    r: b.r0 + (b.r1 - b.r0) * grow,
    k,
  };
}

/** One step for a thrown piece (gravity, a bounce on the road, then lying flat): mutates `p`. `half`: half its thinnest side (how high it lies). */
export function stepPart(
  p: {
    y: number;
    vx: number;
    vy: number;
    vz: number;
    x: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    wx: number;
    wy: number;
    wz: number;
    rest: boolean;
    half: number;
  },
  dt: number,
) {
  if (p.rest) return;
  p.vy -= 9.8 * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.rx += p.wx * dt;
  p.ry += p.wy * dt;
  p.rz += p.wz * dt;
  if (p.y > p.half) return;
  p.y = p.half;
  if (Math.abs(p.vy) > 2) {
    // A clang and a bounce, losing most of it.
    p.vy = -p.vy * 0.32;
    p.vx *= 0.55;
    p.vz *= 0.55;
    p.wx *= 0.5;
    p.wz *= 0.5;
  } else {
    // Down: it lies flat on its broad face (the client turns it so), keeping which way it points.
    p.rest = true;
    p.vx = p.vy = p.vz = 0;
  }
}
