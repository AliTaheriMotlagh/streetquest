// Car-against-car collisions in the open 3D city (pure — traffic.ts runs it every frame,
// tests/carPhysics.test.ts holds it). Every car is a flat oriented box on the ground plane
// with a mass, a velocity and a spin; two that overlap are pushed apart and exchange an
// impulse at the point where they touch, so momentum carries on down the line: you hit a
// car, it slides into the next one, which slides into the next, each a little slower,
// spun by where it was struck, and a bus barely notices a Pride.
//
// Same axes as the rest of the 3D city: yaw turns about +Y, a car's length runs along
// (sin yaw, cos yaw) and its forward is (−sin yaw, −cos yaw) (tileMesh.ts `box`).

/** A car as the collision sees it. `mass` Infinity: it doesn't move (a car that stays put). */
export type Rigid = { x: number; z: number; yaw: number; vx: number; vz: number; spin: number; mass: number; len: number; wid: number };

/** Where two boxes touch: the normal (from a to b), how deep they overlap, and the contact point. */
export type Contact = { nx: number; nz: number; depth: number; px: number; pz: number };

/** Bounciness of a car-to-car hit (crumpling bodywork keeps most of it). */
export const CAR_RESTITUTION = 0.22;
/** Sliding friction between the two bodies at the contact (tangential impulse vs normal). */
export const CAR_FRICTION = 0.35;
/** Steel, glass, seats and a driver: kg per m³ of a car's outside box (a Pride ≈ 1 t, a bus ≈ 11 t). */
const DENSITY = 110;

/** A car's mass (kg) from its outside size; at least a loaded motorbike. */
export const massOf = (d: { len: number; wid: number; hgt: number }) => Math.max(220, d.len * d.wid * d.hgt * DENSITY);

/** Moment of inertia about the vertical axis of a solid box this long and wide. */
const inertiaOf = (b: Rigid) => (b.mass * (b.len * b.len + b.wid * b.wid)) / 12;
const inv = (m: number) => (Number.isFinite(m) && m > 0 ? 1 / m : 0);

/** The box's axes: width (local x) and length (local z), as box() lays them out. */
function axes(b: Rigid) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return { wx: c, wz: -s, lx: s, lz: c };
}

function corners(b: Rigid): [number, number][] {
  const a = axes(b), hw = b.wid / 2, hl = b.len / 2;
  return [
    [-hw, -hl],
    [hw, -hl],
    [hw, hl],
    [-hw, hl],
  ].map(([u, v]) => [b.x + u * a.wx + v * a.lx, b.z + u * a.wz + v * a.lz]);
}

/** Half the box's extent along a unit direction. */
function reach(b: Rigid, dx: number, dz: number) {
  const a = axes(b);
  return (b.wid / 2) * Math.abs(a.wx * dx + a.wz * dz) + (b.len / 2) * Math.abs(a.lx * dx + a.lz * dz);
}

/** Can these two possibly touch (bounding circles)? */
export const near = (a: Rigid, b: Rigid) => Math.hypot(a.x - b.x, a.z - b.z) < (Math.hypot(a.len, a.wid) + Math.hypot(b.len, b.wid)) / 2;

/**
 * Separating-axis test of two oriented boxes: null when apart, else the axis of least
 * overlap (pointing from a to b), its depth, and a contact point — the corner of one box
 * pressed deepest into the other.
 */
export function contact(a: Rigid, b: Rigid): Contact | null {
  if (!near(a, b)) return null;
  const A = axes(a), B = axes(b);
  const dx = b.x - a.x, dz = b.z - a.z;
  let best: { nx: number; nz: number; depth: number; ofA: boolean } | null = null;
  for (const [ax, az, ofA] of [
    [A.wx, A.wz, true],
    [A.lx, A.lz, true],
    [B.wx, B.wz, false],
    [B.lx, B.lz, false],
  ] as [number, number, boolean][]) {
    const d = dx * ax + dz * az;
    const depth = reach(a, ax, az) + reach(b, ax, az) - Math.abs(d);
    if (depth <= 0) return null;
    if (!best || depth < best.depth) best = d >= 0 ? { nx: ax, nz: az, depth, ofA } : { nx: -ax, nz: -az, depth, ofA };
  }
  const n = best!;
  // The contact: the middle of every corner of one box that's inside the other (a corner
  // into a side, or two edges overlapping); failing that, the deepest corner.
  const inside = [...corners(b).filter((q) => holds(a, q, 0.02)), ...corners(a).filter((q) => holds(b, q, 0.02))];
  let px: number, pz: number;
  if (inside.length) {
    px = inside.reduce((s, q) => s + q[0], 0) / inside.length;
    pz = inside.reduce((s, q) => s + q[1], 0) / inside.length;
  } else {
    const pick = n.ofA ? corners(b) : corners(a), sign = n.ofA ? 1 : -1;
    let p = pick[0], low = Infinity;
    for (const q of pick) {
      const t = sign * (q[0] * n.nx + q[1] * n.nz);
      if (t < low) (low = t), (p = q);
    }
    (px = p[0]), (pz = p[1]);
  }
  return { nx: n.nx, nz: n.nz, depth: n.depth, px, pz };
}

/** Is this point inside the box (with `pad` m to spare)? */
function holds(b: Rigid, [x, z]: [number, number], pad: number) {
  const a = axes(b), dx = x - b.x, dz = z - b.z;
  return Math.abs(dx * a.wx + dz * a.wz) <= b.wid / 2 + pad && Math.abs(dx * a.lx + dz * a.lz) <= b.len / 2 + pad;
}

/** The velocity of a body's point at offset (rx, rz) from its centre (spin about +Y). */
const pointVel = (b: Rigid, rx: number, rz: number) => ({ x: b.vx + rz * b.spin, z: b.vz - rx * b.spin });
/** How a push along (nx, nz) at offset (rx, rz) turns the body (the 2D cross product, in this frame's sense). */
const cross = (rx: number, rz: number, nx: number, nz: number) => rz * nx - rx * nz;

/** What a hit did: the speed they met at (straight on), and each body's change of velocity. */
export type Hit = { closing: number; impulse: number; dva: number; dvb: number };

/**
 * Two touching cars: push them apart (by mass) and, when they're closing, exchange the
 * impulse that a crumpling, sliding hit gives — momentum is conserved, spin comes from
 * where the hit lands off the centre of mass. Mutates both bodies.
 */
export function resolve(a: Rigid, b: Rigid, c: Contact, e = CAR_RESTITUTION, mu = CAR_FRICTION): Hit {
  const ia = inv(a.mass), ib = inv(b.mass);
  const Ia = ia ? 1 / inertiaOf(a) : 0, Ib = ib ? 1 / inertiaOf(b) : 0;
  const out: Hit = { closing: 0, impulse: 0, dva: 0, dvb: 0 };
  if (!ia && !ib) return out;
  // Out of each other first (the lighter one moves more), with a little slop so they settle —
  // at most MAX_PUSH a frame: a fast car that sank deep in one frame comes out over a few,
  // instead of the other being flung metres in one (cars "teleporting" after a hit).
  const push = Math.min(MAX_PUSH, Math.max(0, c.depth - 0.01)) / (ia + ib);
  a.x -= c.nx * push * ia;
  a.z -= c.nz * push * ia;
  b.x += c.nx * push * ib;
  b.z += c.nz * push * ib;

  const rax = c.px - a.x, raz = c.pz - a.z, rbx = c.px - b.x, rbz = c.pz - b.z;
  const va = pointVel(a, rax, raz), vb = pointVel(b, rbx, rbz);
  const rvx = vb.x - va.x, rvz = vb.z - va.z;
  const vn = rvx * c.nx + rvz * c.nz;
  if (vn >= 0) return out; // already parting
  const can = cross(rax, raz, c.nx, c.nz), cbn = cross(rbx, rbz, c.nx, c.nz);
  const j = (-(1 + e) * vn) / (ia + ib + can * can * Ia + cbn * cbn * Ib);
  apply(a, -j * c.nx, -j * c.nz, rax, raz, ia, Ia);
  apply(b, j * c.nx, j * c.nz, rbx, rbz, ib, Ib);
  // Friction across the contact: the bodies scrape, and that spins them too.
  const tx = -c.nz, tz = c.nx;
  const vt = rvx * tx + rvz * tz;
  const cat = cross(rax, raz, tx, tz), cbt = cross(rbx, rbz, tx, tz);
  const jt = Math.max(-mu * j, Math.min(mu * j, -vt / (ia + ib + cat * cat * Ia + cbt * cbt * Ib)));
  apply(a, -jt * tx, -jt * tz, rax, raz, ia, Ia);
  apply(b, jt * tx, jt * tz, rbx, rbz, ib, Ib);
  sane(a);
  sane(b);
  return { closing: -vn, impulse: j, dva: j * ia, dvb: j * ib };
}

/** Most a body is moved out of an overlap in one frame (m). */
export const MAX_PUSH = 0.45;
/** Speed and spin a hit can leave a car with (m/s, rad/s): a pile-up never launches one. */
export const MAX_V = 40, MAX_SPIN = 5;
/** Caps a body's speed and spin, and puts anything that went non-finite back at rest. */
export function sane(b: Rigid) {
  if (!Number.isFinite(b.vx) || !Number.isFinite(b.vz)) b.vx = b.vz = 0;
  if (!Number.isFinite(b.spin)) b.spin = 0;
  const v = Math.hypot(b.vx, b.vz);
  if (v > MAX_V) (b.vx *= MAX_V / v), (b.vz *= MAX_V / v);
  b.spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, b.spin));
}

function apply(b: Rigid, jx: number, jz: number, rx: number, rz: number, im: number, iI: number) {
  b.vx += jx * im;
  b.vz += jz * im;
  b.spin += cross(rx, rz, jx, jz) * iI;
}

/**
 * The impact speed that `crashDamage` should read for one of the two: its own change of
 * velocity, doubled back to "as if into a wall" (two equal cars meeting at v both feel v;
 * a Pride hit by a bus feels nearly twice it, the bus hardly anything).
 */
export const felt = (dv: number) => dv * 2 / (1 + CAR_RESTITUTION);

/**
 * Where to draw a car that's been tipped over — thrown by a blast, lying on its roof. Its
 * model's origin is the road under its middle, so turning it there would swing the body
 * underground (a wreck on its roof would be buried, out of sight). The body turns about
 * its own middle instead, and is held up by whatever of it is lowest, so it rolls along
 * the road and comes to rest on it. `y`: how high the thrown car is (m), `roll` about its
 * length and `pitch` about its width (applied yaw · pitch · roll). Returns the origin in
 * the car's own frame before yaw: [across, up from the road, along].
 */
export function tumbleOrigin(d: { len: number; wid: number; hgt: number }, y: number, roll: number, pitch: number): [number, number, number] {
  const h = d.hgt / 2, cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Half the tipped box's height, corner to corner: its middle can't be nearer the road than this.
  const half = (d.wid / 2) * Math.abs(sr * cp) + h * Math.abs(cr * cp) + (d.len / 2) * Math.abs(sp);
  const mid = Math.max(y + h, half);
  return [h * sr, mid - h * cr * cp, -h * cr * sp];
}
