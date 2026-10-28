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

export function stepFoot(b: FootBody, inp: FootInput, dt: number, mobility: number, collide: Collide) {
  const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
  // Sprint only running forward-ish, never while aiming or crouched.
  b.sprint = inp.sprint && inp.mz > 0.5 && !inp.aim && !b.crouch && !b.air;
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
    if (b.y <= 0) {
      b.y = 0;
      b.vy = 0;
      b.air = false;
    }
  }
  const r = collide(b.x + b.vx * dt, b.z + b.vz * dt, FOOT_R, b.y, b.crouch ? 1.2 : 1.75);
  if (r.hit) {
    // Slide along the wall: drop the velocity going into it.
    const into = b.vx * r.hit.nx + b.vz * r.hit.nz;
    if (into < 0) (b.vx -= into * r.hit.nx), (b.vz -= into * r.hit.nz);
  }
  b.x = r.x;
  b.z = r.z;
  return Math.hypot(b.vx, b.vz);
}
