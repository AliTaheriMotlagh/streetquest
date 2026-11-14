// Hero moves in the open 3D city (pure; tests/hero.test.ts) — getting about over the rooftops:
//  - the grapple line: fired up and ahead (where the camera looks) to the first wall within
//    reach, else to a point high over the street; you swing under it as a pendulum (forward on
//    the stick pumps the swing), and letting go flings you on with a little lift;
//  - wall running: hit a wall in the air (or sprint into one) and hold forward to run up it;
//    at the top you vault onto the roof; jump kicks you off it, away and up;
//  - gliding: jump again while falling to spread out and sail down slowly, forward (jump to stop);
//  - you land on what's under you — a roof or the street — and a hero takes no fall damage
//    (a hard landing is a roll: `landed` says how hard);
//  - a tap on the hook (let go within ZIP_TAP_S) on a line that caught a wall is a zip: you're
//    pulled straight to that point and perch on the roof's edge (or pop off the wall);
//  - crouch in the air dives head first (fast down; a line fired out of a dive keeps the speed);
//  - letting go on the upswing at speed is a perfect release: an extra fling and a flip;
//  - every line fired before you touch the ground adds to the chain, and the chain pumps harder.
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
  /** Crouch pressed this frame: in the air, a dive. */
  dive?: boolean;
};
export type HeroMode = "ground" | "air" | "swing" | "wall" | "glide" | "dive" | "zip";
export type HeroAnchor = { x: number; y: number; z: number; len: number; /** Caught on a building (a zip can go there), not the sky. */ wall: boolean };
export type HeroState = {
  mode: HeroMode;
  anchor: HeroAnchor | null;
  wall: { nx: number; nz: number } | null;
  airT: number;
  /** Seconds the line has been out (a short hold is a tap: a zip). */
  lineT: number;
  /** Where a zip pulls you. */
  zip: { x: number; y: number; z: number } | null;
  /** Lines fired since you last stood on something: the chain (the HUD shows it). */
  chain: number;
  /** The best chain this time in the air. */
  best: number;
};
export type HeroEvent = { kind: "fire" | "release" | "wall" | "vault" | "kick" | "land" | "zip" | "perch" | "dive" | "perfect"; hard?: number } | null;

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
  /** Diving: the speed down it reaches. */
  dive: 34,
  /** Zip: how fast the line pulls you, and how short a hold is a tap (s). */
  zip: 32,
  /** Perfect release: at least this fast, on the way up; the extra fling. */
  perfectV: 13,
  perfectBoost: 6,
  /** Each line in a chain pumps this much harder, up to chainMax times as hard. */
  chainK: 0.08,
  chainMax: 1.6,
  /** The fastest anything goes (m/s). */
  maxV: 45,
  r: 0.35,
  tall: 1.75,
} as const;

export const newHero = (): HeroState => ({ mode: "ground", anchor: null, wall: null, airT: 0, lineT: 0, zip: null, chain: 0, best: 0 });
/** A hold of the hook shorter than this (s) is a tap: a zip to where the line caught. */
export const ZIP_TAP_S = 0.22;
/** How much harder a chain of `n` lines pumps. */
export const chainPump = (n: number) => Math.min(HERO.chainMax, 1 + Math.max(0, n - 1) * HERO.chainK);

const fwd = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/**
 * Where a line fired now would catch: along the camera's yaw, tipped up 35–70° (more when
 * looking up), the first wall or roof within reach; over open streets, a point high ahead.
 */
export function aimLine(b: HeroBody, inp: Pick<HeroInput, "camYaw" | "camPitch">, w: HeroWorld): { x: number; y: number; z: number; wall: boolean } {
  const up = Math.max(0.6, Math.min(1.2, 0.85 + inp.camPitch * 0.6));
  const f = fwd(inp.camYaw);
  const d = { x: f.x * Math.cos(up), y: Math.sin(up), z: f.z * Math.cos(up) };
  const o = { x: b.x, y: b.y + 1.5, z: b.z };
  const t = w.ray(o, d, HERO.reach);
  if (Number.isFinite(t) && t > 4) return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, wall: true };
  // No building in reach: a hook high in the sky ahead (an arcade line), never below you.
  return { x: b.x + f.x * 24, y: Math.max(b.y + 14, HERO.skyHook), z: b.z + f.z * 24, wall: false };
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
  if (inp.grapple && !s.anchor && s.mode !== "zip") {
    const a = aimLine(b, inp, w);
    const L = Math.hypot(a.x - b.x, a.y - (b.y + 1.5), a.z - b.z);
    // Short enough that the bottom of the swing clears the street (and whatever roof you're on).
    s.anchor = { ...a, len: Math.max(6, Math.min(L * 0.92, a.y - floor - 3.5)) };
    // Out of a dive the speed carries into the swing (the fall turns into the arc).
    const diving = s.mode === "dive";
    s.mode = "swing";
    s.lineT = 0;
    s.chain++;
    s.best = Math.max(s.best, s.chain);
    // The catch: a tug toward the anchor.
    b.vx += ((a.x - b.x) / L) * HERO.yank;
    b.vy += Math.max(0, ((a.y - b.y) / L) * HERO.yank);
    b.vz += ((a.z - b.z) / L) * HERO.yank;
    if (diving) {
      // Turn the drop forward: what you fell with goes along the way you look.
      const down = Math.max(0, -b.vy) * 0.7;
      b.vx += cf.x * down;
      b.vz += cf.z * down;
    }
    ev = { kind: "fire" };
  } else if (!inp.grapple && s.anchor) {
    const a = s.anchor;
    s.anchor = null;
    if (s.lineT < ZIP_TAP_S && a.wall) {
      // A tap: zip to where it caught.
      s.mode = "zip";
      s.zip = { x: a.x, y: a.y, z: a.z };
      ev = { kind: "zip" };
    } else {
      s.mode = "air";
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      // On the way up, below the anchor and fast: a perfect release.
      if (sp >= HERO.perfectV && b.vy > 1 && b.y + 1.5 < a.y) {
        const h = Math.hypot(b.vx, b.vz) || 1;
        b.vx += (b.vx / h) * HERO.perfectBoost;
        b.vz += (b.vz / h) * HERO.perfectBoost;
        b.vy += HERO.lift + HERO.perfectBoost * 0.5;
        ev = { kind: "perfect" };
      } else {
        b.vy += HERO.lift;
        ev = { kind: "release" };
      }
    }
  }
  if (s.anchor) s.lineT += dt;

  // Crouch in the air: dive head first (not on a line, a wall or a zip).
  if (inp.dive && (s.mode === "air" || s.mode === "glide")) {
    s.mode = "dive";
    b.vy = Math.min(b.vy, -8);
    ev ??= { kind: "dive" };
  }

  if (s.mode === "swing" && s.anchor) {
    const a = s.anchor;
    // Gravity and the pump (forward along where you're swinging), then the line holds you to its length.
    b.vy -= HERO.gravity * dt;
    const sp = Math.hypot(b.vx, b.vz) || 1;
    const pump = Math.max(0, inp.mz) * HERO.pump * chainPump(s.chain);
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
  } else if (s.mode === "zip" && s.zip) {
    // Pulled straight along the line; at the end, up over the edge onto the roof (or off the wall).
    const z = s.zip, dx = z.x - b.x, dy = z.y - (b.y + 1.2), dz = z.z - b.z, d = Math.hypot(dx, dy, dz);
    const step = HERO.zip * dt;
    if (d <= Math.max(1.2, step)) {
      // Just past the point, into the building: a roof within reach of the hands there?
      const h = Math.hypot(dx, dz) || 1, ux = dx / h, uz = dz / h;
      const roof = w.floor(z.x + ux * 0.8, z.z + uz * 0.8, z.y + 2.5);
      s.zip = null;
      b.vx = b.vz = b.vy = 0;
      if (roof > 0 && roof >= z.y - 2.5) {
        // Over the parapet: stand on the roof, just inside its edge.
        b.x = z.x + ux * 0.8;
        b.z = z.z + uz * 0.8;
        b.y = roof;
        s.mode = "ground";
        ev = { kind: "perch" };
      } else {
        // Halfway up a wall: grab it (forward runs on up, jump kicks off).
        b.y = Math.max(b.y, z.y - 1.2);
        s.mode = "wall";
        s.wall = { nx: -ux, nz: -uz };
        ev = { kind: "wall" };
      }
    } else {
      b.vx = (dx / d) * HERO.zip;
      b.vy = (dy / d) * HERO.zip;
      b.vz = (dz / d) * HERO.zip;
      const r = w.collide(b.x + b.vx * dt, b.z + b.vz * dt, HERO.r, b.y + b.vy * dt, HERO.tall);
      b.x = r.x;
      b.z = r.z;
      b.y = Math.max(b.y + b.vy * dt, w.floor(r.x, r.z, b.y + 0.3));
      // Stopped short by the wall itself (the point is on its face): that's the end of the line.
      if (r.hit && Math.hypot(r.x - z.x, r.z - z.z) < 1.5) z.y = Math.min(z.y, b.y + 1.2), (z.x = r.x), (z.z = r.z);
    }
  } else if (s.mode === "dive") {
    // Head first: down to diving speed, the way you look; steering turns a little.
    b.vy += (-HERO.dive - b.vy) * Math.min(1, dt * 2.2);
    b.vx += (cf.x * 10 + cr.x * inp.mx * 5 - b.vx) * Math.min(1, dt * 1.2);
    b.vz += (cf.z * 10 + cr.z * inp.mx * 5 - b.vz) * Math.min(1, dt * 1.2);
    if (inp.jumpPressed) s.mode = "glide";
    if (move(b, b.x + b.vx * dt, b.y + b.vy * dt, b.z + b.vz * dt, w, s)) ev ??= { kind: "wall" };
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
  if (s.mode !== "ground" && s.mode !== "wall" && s.mode !== "zip" && !s.anchor && b.y <= under + 0.01 && b.vy <= 0) {
    const hard = -b.vy;
    b.y = under;
    b.vy = 0;
    s.mode = "ground";
    ev = { kind: "land", hard };
  } else if (s.mode === "ground" && b.y > under + 0.05) {
    // Ran off a roof's edge.
    s.mode = "air";
  } else if (s.mode === "ground") b.y = under;
  if (s.mode === "ground") (s.airT = 0), (s.chain = 0);
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
    if (((s.mode === "air" || s.mode === "glide" || s.mode === "dive") && -into > 1.5) || (s.mode === "ground" && -into > 5)) {
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
