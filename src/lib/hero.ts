// Hero moves in the open 3D city (pure; tests/hero.test.ts) — getting about over the rooftops:
//  - the grapple line: fired up and ahead (where the camera looks) to the first wall within
//    reach, else to a point high over the street; you swing under it as a pendulum (forward on
//    the stick pumps the swing), and letting go flings you on with a little lift;
//  - wall running: hit a wall in the air (or sprint into one) and hold forward to run up it;
//    at the top you vault onto the roof; jump kicks you off it, away and up;
//  - gliding: jump again while falling to spread out and sail down slowly, forward (jump to stop);
//  - you land on what's under you — a roof or the street — and a hero takes no fall damage
//    (a hard landing is a roll: `landed` says how hard).
// The world is passed in (the city's collision): walls, the floor under a point, a ray.
// Metres, seconds; y is height over the street; forward is -z at yaw 0.

export type HeroWorld = {
  /** Pushed out of walls at height y (a body `tall` high): where it may stand, and the wall's normal if it hit one. */
  collide: (x: number, z: number, r: number, y: number, tall: number) => { x: number; z: number; hit: { nx: number; nz: number } | null };
  /** The top of whatever is under (x, z) at or below `y` (a roof, else the street: 0). */
  floor: (x: number, z: number, y: number) => number;
  /** Distance along a ray to the first wall or roof (Infinity: none within `max`). */
  ray: (o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, max: number) => number;
};
export type HeroBody = { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number };
export type HeroInput = {
  /** Stick: x right, z forward (-1…1), turned by `camYaw` (the way the camera looks). */
  mx: number;
  mz: number;
  camYaw: number;
  /** The camera's pitch (radians, up positive): a line fired while looking up goes higher. */
  camPitch: number;
  /** Jump held (this frame), and pressed this frame. */
  jump: boolean;
  jumpPressed: boolean;
  /** The grapple held (a line out while it's held). */
  grapple: boolean;
};
export type HeroMode = "ground" | "air" | "swing" | "wall" | "glide";
export type HeroState = { mode: HeroMode; anchor: { x: number; y: number; z: number; len: number } | null; wall: { nx: number; nz: number } | null; airT: number };
export type HeroEvent = { kind: "fire" | "release" | "wall" | "vault" | "kick" | "land"; hard?: number } | null;

export const HERO = {
  run: 7.5,
  gravity: 18,
  jump: 7,
  /** The line: how far it reaches, how high over the street it may hang when there's no wall. */
  reach: 70,
  skyHook: 34,
  /** Swing: pumping (m/s² along the swing), the yank when a line catches, the lift on letting go. */
  pump: 9,
  yank: 4,
  lift: 5,
  /** Wall running: speed up the wall, the kick off it. */
  climb: 8,
  kick: 9,
  /** Gliding: sink rate and forward speed. */
  glideSink: 3.2,
  glideFwd: 15,
  /** The fastest anything goes (m/s). */
  maxV: 45,
  r: 0.35,
  tall: 1.75,
} as const;

export const newHero = (): HeroState => ({ mode: "ground", anchor: null, wall: null, airT: 0 });

const fwd = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/**
 * Where a line fired now would catch: along the camera's yaw, tipped up 35–70° (more when
 * looking up), the first wall or roof within reach; over open streets, a point high ahead.
 */
export function aimLine(b: HeroBody, inp: Pick<HeroInput, "camYaw" | "camPitch">, w: HeroWorld): { x: number; y: number; z: number } {
  const up = Math.max(0.6, Math.min(1.2, 0.85 + inp.camPitch * 0.6));
  const f = fwd(inp.camYaw);
  const d = { x: f.x * Math.cos(up), y: Math.sin(up), z: f.z * Math.cos(up) };
  const o = { x: b.x, y: b.y + 1.5, z: b.z };
  const t = w.ray(o, d, HERO.reach);
  if (Number.isFinite(t) && t > 4) return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
  // No building in reach: a hook high in the sky ahead (an arcade line), never below you.
  return { x: b.x + f.x * 24, y: Math.max(b.y + 14, HERO.skyHook), z: b.z + f.z * 24 };
}

/** One step. Moves the body; returns what happened (for sounds and the camera), or null. */
export function stepHero(b: HeroBody, s: HeroState, inp: HeroInput, dt: number, w: HeroWorld): HeroEvent {
  let ev: HeroEvent = null;
  const cf = fwd(inp.camYaw), cr = { x: -cf.z, z: cf.x };
  const len = Math.min(1, Math.hypot(inp.mx, inp.mz));
  // The stick in the world (camera relative).
  const wx = (cf.x * inp.mz + cr.x * inp.mx) * (len ? 1 : 0), wz = (cf.z * inp.mz + cr.z * inp.mx) * (len ? 1 : 0);
  const floor = w.floor(b.x, b.z, b.y + 0.3);

  // The line: out when the grapple is pressed (and you're not on it yet), gone when it's let go.
  if (inp.grapple && !s.anchor) {
    const a = aimLine(b, inp, w);
    const L = Math.hypot(a.x - b.x, a.y - (b.y + 1.5), a.z - b.z);
    // Short enough that the bottom of the swing clears the street (and whatever roof you're on).
    s.anchor = { ...a, len: Math.max(6, Math.min(L * 0.92, a.y - floor - 3.5)) };
    s.mode = "swing";
    // The catch: a tug toward the anchor.
    b.vx += ((a.x - b.x) / L) * HERO.yank;
    b.vy += Math.max(0, ((a.y - b.y) / L) * HERO.yank);
    b.vz += ((a.z - b.z) / L) * HERO.yank;
    ev = { kind: "fire" };
  } else if (!inp.grapple && s.anchor) {
    s.anchor = null;
    s.mode = "air";
    b.vy += HERO.lift;
    ev = { kind: "release" };
  }

  if (s.mode === "swing" && s.anchor) {
    const a = s.anchor;
    // Gravity and the pump (forward along where you're swinging), then the line holds you to its length.
    b.vy -= HERO.gravity * dt;
    const sp = Math.hypot(b.vx, b.vz) || 1;
    const pump = Math.max(0, inp.mz) * HERO.pump;
    b.vx += ((b.vx / sp) * 0.6 + cf.x * 0.4) * pump * dt;
    b.vz += ((b.vz / sp) * 0.6 + cf.z * 0.4) * pump * dt;
    // Reel in a little while swinging (you rise into the arc); a line never goes slack.
    a.len = Math.max(6, Math.min(a.len - 2.5 * dt, Math.hypot(b.x - a.x, b.y + 1.5 - a.y, b.z - a.z)));
    let nx = b.x + b.vx * dt, ny = b.y + 1.5 + b.vy * dt, nz = b.z + b.vz * dt;
    const dx = nx - a.x, dy = ny - a.y, dz = nz - a.z, d = Math.hypot(dx, dy, dz);
    if (d > a.len) {
      const k = a.len / d;
      nx = a.x + dx * k;
      ny = a.y + dy * k;
      nz = a.z + dz * k;
      // Drop the velocity going out along the line.
      const ux = dx / d, uy = dy / d, uz = dz / d, out = b.vx * ux + b.vy * uy + b.vz * uz;
      if (out > 0) (b.vx -= out * ux), (b.vy -= out * uy), (b.vz -= out * uz);
    }
    if (move(b, nx, ny - 1.5, nz, w, s)) ev ??= { kind: "wall" };
  } else if (s.mode === "wall" && s.wall) {
    // On a wall: forward runs up it; jump kicks off; letting go of forward slides down.
    const into = -(wx * s.wall.nx + wz * s.wall.nz);
    if (into < -0.3) {
      // Pushing away: off the wall.
      b.vx = s.wall.nx * 3;
      b.vz = s.wall.nz * 3;
      s.mode = "air";
      s.wall = null;
    } else if (inp.jumpPressed) {
      b.vx = s.wall.nx * HERO.kick + cf.x * 3;
      b.vz = s.wall.nz * HERO.kick + cf.z * 3;
      b.vy = HERO.jump;
      s.mode = "air";
      s.wall = null;
      ev = { kind: "kick" };
    } else {
      b.vy = into > 0.3 ? HERO.climb : Math.max(b.vy - HERO.gravity * dt * 0.4, -3);
      b.vx = -s.wall.nx * 1.5;
      b.vz = -s.wall.nz * 1.5;
      const ny = b.y + b.vy * dt;
      // Still a wall in front at the new height? If not, you're at the top: over onto the roof.
      const probe = w.collide(b.x - s.wall.nx * 0.6, b.z - s.wall.nz * 0.6, HERO.r, ny, HERO.tall);
      if (!probe.hit && b.vy > 0) {
        b.x -= s.wall.nx * 1.2;
        b.z -= s.wall.nz * 1.2;
        b.y = Math.max(ny, w.floor(b.x, b.z, ny + 2));
        b.vy = 2;
        s.mode = "air";
        s.wall = null;
        ev = { kind: "vault" };
      } else {
        b.y = ny;
        if (b.y <= floor) (b.y = floor), (s.mode = "ground"), (s.wall = null);
      }
    }
  } else {
    // Ground, air, glide.
    const air = s.mode !== "ground";
    const top = HERO.run, k = 1 - Math.exp(-dt * (air ? 2.2 : 12));
    if (s.mode === "glide") {
      // Spread out: sail on the way you face, sinking slowly; steering turns.
      const gsp = HERO.glideFwd;
      b.vx += (cf.x * gsp + cr.x * inp.mx * 4 - b.vx) * Math.min(1, dt * 1.5);
      b.vz += (cf.z * gsp + cr.z * inp.mx * 4 - b.vz) * Math.min(1, dt * 1.5);
      b.vy += (-HERO.glideSink - b.vy) * Math.min(1, dt * 3);
      // Jump again: fold up and fall.
      if (inp.jumpPressed) s.mode = "air";
    } else {
      b.vx += (wx * top - b.vx) * (air ? Math.min(k, 0.02) + (len ? k * 0.3 : 0) : k);
      b.vz += (wz * top - b.vz) * (air ? Math.min(k, 0.02) + (len ? k * 0.3 : 0) : k);
      if (!air && inp.jumpPressed) (b.vy = HERO.jump), (s.mode = "air");
      else if (air) {
        b.vy -= HERO.gravity * dt;
        // Jump while falling (a phone has no "held"): spread out and glide.
        if (inp.jumpPressed && b.vy < -2 && s.airT > 0.35) s.mode = "glide";
      }
    }
    if (move(b, b.x + b.vx * dt, b.y + b.vy * dt, b.z + b.vz * dt, w, s)) ev ??= { kind: "wall" };
  }

  // Too fast is never fun: a cap on the whole speed.
  const v = Math.hypot(b.vx, b.vy, b.vz);
  if (v > HERO.maxV) (b.vx *= HERO.maxV / v), (b.vy *= HERO.maxV / v), (b.vz *= HERO.maxV / v);

  // Landing: on the roof or street under you.
  const under = w.floor(b.x, b.z, b.y + 0.3);
  if (s.mode !== "ground" && s.mode !== "wall" && !s.anchor && b.y <= under + 0.01 && b.vy <= 0) {
    const hard = -b.vy;
    b.y = under;
    b.vy = 0;
    s.mode = "ground";
    ev = { kind: "land", hard };
  } else if (s.mode === "ground" && b.y > under + 0.05) {
    // Ran off a roof's edge.
    s.mode = "air";
  } else if (s.mode === "ground") b.y = under;
  if (s.mode === "ground") s.airT = 0;
  else s.airT += dt;
  return ev;
}

/** Move to (x, y, z) through the walls: a wall met in the air (or running hard) starts a wall run (true then). */
function move(b: HeroBody, x: number, y: number, z: number, w: HeroWorld, s: HeroState): boolean {
  let onWall = false;
  const r = w.collide(x, z, HERO.r, y, HERO.tall);
  if (r.hit) {
    const into = b.vx * r.hit.nx + b.vz * r.hit.nz;
    if (into < 0) (b.vx -= into * r.hit.nx), (b.vz -= into * r.hit.nz);
    // In the air (not on a line): onto the wall.
    // Only moving into it (not stepping off a roof beside it).
    if (((s.mode === "air" || s.mode === "glide") && -into > 1.5) || (s.mode === "ground" && -into > 5)) {
      s.mode = "wall";
      s.wall = r.hit;
      s.anchor = null;
      onWall = true;
    }
  }
  b.x = r.x;
  b.z = r.z;
  // Never below what's under you (the landing check settles it on top).
  b.y = Math.max(y, w.floor(r.x, r.z, Math.max(y, b.y) + 0.3));
  return onWall;
}
