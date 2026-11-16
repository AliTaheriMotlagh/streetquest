// On foot in the 3D city: a capsule that jogs, sprints, crouches and jumps, pushed out of
// buildings and street furniture by the same collision world as the car. Pure maths.
//
// Speeds feel like a mobile shooter's: a jog by default (the stick's full throw), sprint
// past the edge of the stick or with Shift, slower while aiming, crouched or carrying a
// heavy gun.

export type FootBody = { x: number; z: number; y: number; vx: number; vz: number; vy: number; yaw: number; pitch: number; crouch: boolean; air: boolean; sprint: boolean };
export type FootInput = {
  /** Move stick: x right, z forward, each -1…1. */
  mx: number;
  mz: number;
  sprint: boolean;
  crouch: boolean;
  aim: boolean;
  jump: boolean;
  /**
   * Third person, nothing in the sights: the body turns to where it goes (faceYaw), so a
   * sprint may be in any direction. Otherwise (first person, aiming) only forward.
   */
  free?: boolean;
};
type Collide = (x: number, z: number, r: number, y: number, tall: number) => { x: number; z: number; hit: { nx: number; nz: number } | null };

export const FOOT_R = 0.35;
const JOG = 4.2;
const SPRINT = 6.4;
const CROUCH = 2.0;
const AIMING = 2.6;
const JUMP_V = 5.4;
const GRAVITY = 17;

export function newFoot(x: number, z: number, yaw: number): FootBody {
  return { x, z, y: 0, vx: 0, vz: 0, vy: 0, yaw, pitch: 0, crouch: false, air: false, sprint: false };
}

/** The highest thing you just step up onto (a kerb, a stair, a low wall's top), and how fast the body rises onto it / settles down off it (m/s). */
export const STEP_UP = 0.45;
const STEP_RISE = 3.2, STEP_DROP = 4.5;

/**
 * One step on foot. `floor` (optional): the top of whatever is under (x, z) at or below y — the
 * street, a kerb, a stair, a footbridge, a roof. With it the body steps up anything up to
 * STEP_UP (eased, not snapped), walks down steps the same way, and falls off anything higher.
 * Without it the ground is flat at 0.
 */
export function stepFoot(b: FootBody, inp: FootInput, dt: number, mobility: number, collide: Collide, floor?: (x: number, z: number, y: number) => number) {
  const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
  // Sprint only running forward-ish (any way when the body turns to where it goes), never while aiming or crouched.
  b.sprint = inp.sprint && (inp.free ? len > 0.5 : inp.mz > 0.5) && !inp.aim && !b.crouch && !b.air;
  if (inp.crouch !== b.crouch && !b.air) b.crouch = inp.crouch;
  const top = (b.sprint ? SPRINT : b.crouch ? CROUCH : inp.aim ? AIMING : JOG) * mobility;
  // Stick → world (forward is -z at yaw 0, right is +x).
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
  const n = len > 0.01 ? len / Math.hypot(inp.mx, inp.mz) : 0;
  const wx = (fx * inp.mz + rx * inp.mx) * n * top, wz = (fz * inp.mz + rz * inp.mx) * n * top;
  // Quick to start and stop on the ground, sluggish in the air.
  const k = 1 - Math.exp(-dt * (b.air ? 2 : 14));
  b.vx += (wx - b.vx) * k;
  b.vz += (wz - b.vz) * k;
  if (inp.jump && !b.air && !b.crouch) {
    b.vy = JUMP_V;
    b.air = true;
  }
  if (b.air) {
    b.vy -= GRAVITY * dt;
    b.y += b.vy * dt;
    const g = floor ? floor(b.x, b.z, b.y + 0.05 - Math.min(0, b.vy * dt)) : 0;
    if (b.y <= g) {
      b.y = g;
      b.vy = 0;
      b.air = false;
    }
  }
  // Walls start above what you can step onto (with a floor to step onto it). The collision world
  // already lets a body pass over anything up to 0.3 m under it (physics.ts collide), so lifting
  // the body's bottom by STEP_UP − 0.3 makes exactly the steps up to STEP_UP passable.
  const r = collide(b.x + b.vx * dt, b.z + b.vz * dt, FOOT_R, b.y + (floor && !b.air ? STEP_UP - 0.3 : 0), b.crouch ? 1.2 : 1.75);
  if (r.hit) {
    // Slide along the wall: drop the velocity going into it.
    const into = b.vx * r.hit.nx + b.vz * r.hit.nz;
    if (into < 0) (b.vx -= into * r.hit.nx), (b.vz -= into * r.hit.nz);
  }
  b.x = r.x;
  b.z = r.z;
  if (floor && !b.air) {
    const g = floor(b.x, b.z, b.y + STEP_UP);
    if (g > b.y + 0.005) b.y = Math.min(g, b.y + STEP_RISE * dt + (g - b.y) * 0.25);
    else if (g < b.y - STEP_UP) (b.air = true), (b.vy = 0);
    else if (g < b.y - 0.005) b.y = Math.max(g, b.y - STEP_DROP * dt);
  }
  return Math.hypot(b.vx, b.vz);
}

/** How fast the body turns to where it's going / squares up with the camera again (per second). */
const TURN_FREE = 11;
const TURN_SQUARE = 20;
/**
 * Which way the body faces in third person, GTA-style: walking, it turns to where it's
 * going (the camera stays yours to look around with); standing, it stays as it stopped;
 * `squared` — aiming, firing, lining up a throw, first person — it faces where the camera
 * looks, quickly, so the gun points down the sights. Returns the new facing (radians,
 * eased from `cur` by the shortest way round). Forward is -z at yaw 0.
 */
export function faceYaw(cur: number, camYaw: number, vx: number, vz: number, squared: boolean, dt: number): number {
  const moving = Math.hypot(vx, vz) > 0.6;
  if (!squared && !moving) return cur;
  const want = squared ? camYaw : Math.atan2(-vx, -vz);
  let d = (want - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-dt * (squared ? TURN_SQUARE : TURN_FREE)));
}
