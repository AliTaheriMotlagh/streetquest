// Bots for Street Arena matches, so a match is fun with two players (or one).
//
// They run along the street graph (nav.ts), only shoot what they can actually see (the
// arena's real buildings block their sight like anyone's), react after a human-ish delay,
// fire in bursts, miss more at range and against moving or crouching targets, and play the
// objective in Bomb Defusal: the carrier heads for a site and plants, defenders hold the
// sites and run to defuse. Difficulty scales reaction, accuracy and headshots.
import { BOMB_REACH_M, bombSide, SITE_R, type Difficulty } from "../src/lib/arena/modes";
import { shotGap, WEAPONS, type WeaponKey } from "../src/lib/arena/weapons";
import { F_CROUCH, F_FOOT, F_RELOAD, F_SPRINT } from "../src/lib/arena/protocol";
import type { Match } from "./match";
import type { Player } from "./player";

const SKILL: Record<Difficulty, { react: number; acc: number; head: number; see: number }> = {
  easy: { react: 950, acc: 0.12, head: 0.08, see: 55 },
  normal: { react: 600, acc: 0.2, head: 0.14, see: 70 },
  hard: { react: 340, acc: 0.3, head: 0.22, see: 90 },
};
const RUN = 5;
/** On the objective, enemies farther than this are ignored. */
const OBJECTIVE_IGNORE_M = 22;
const ENGAGE = 1.6;

export const BOT_NAMES = ["Kian", "Sara", "Arash", "Nika", "Dariush", "Mina", "Babak", "Leila", "Omid", "Yasmin", "Kaveh", "Parisa", "Reza", "Shirin", "Farhad", "Ava"];

export type Brain = { x: number; z: number; path: number[]; goalAt: number; target: Player | null; reactAt: number; nextShot: number; burst: number; thinkAt: number; strafe: number; strafeAt: number; post: number | null; crouch: boolean };

export const newBrain = (x: number, z: number): Brain => ({ x, z, path: [], goalAt: 0, target: null, reactAt: 0, nextShot: 0, burst: 0, thinkAt: 0, strafe: 1, strafeAt: 0, post: null, crouch: false });

export function tickBot(m: Match, b: Player, br: Brain, dt: number, now: number) {
  if (b.dead) {
    br.path = [];
    br.target = null;
    return;
  }
  const S = SKILL[m.difficulty];
  const F = m.frame;
  const w: WeaponKey = b.loadout[0];
  const W = WEAPONS[w];
  const frozen = m.phase !== "live";

  // -- think (4×/s): who can I see?
  if (now >= br.thinkAt) {
    br.thinkAt = now + 220 + Math.random() * 80;
    let best: Player | null = null, bd = Infinity;
    for (const p of m.players) {
      if (p === b || p.dead || !p.placed || !m.canHurt(b, p, now)) continue;
      const q = F.toXZ(p.lat, p.lng), d = Math.hypot(q.x - br.x, q.z - br.z);
      if (d > S.see || d >= bd) continue;
      if (!m.sight(b.ll, b.y + 1.5, p.ll, p.y + (p.crouch ? 1.0 : 1.4))) continue;
      (best = p), (bd = d);
    }
    if (best !== br.target) {
      br.target = best;
      br.reactAt = now + S.react * (0.7 + Math.random() * 0.6);
      br.burst = 0;
    }
  }

  // -- where to go
  if (!frozen && (!br.path.length || now > br.goalAt)) {
    br.goalAt = now + 4000 + Math.random() * 3000;
    const goal = pickGoal(m, b, br);
    if (goal != null) br.path = m.nav.path(m.nav.nearest(br.x, br.z).i, goal);
  }

  // -- the objective (bomb): plant / defuse when there, standing still meanwhile. An
  // enemy far off doesn't stop it (someone is nearly always in sight of a site); one close by does.
  const acting = b.actingUntil > 0;
  const threat = br.target && (() => {
    const q = F.toXZ(br.target.lat, br.target.lng);
    return Math.hypot(q.x - br.x, q.z - br.z) < OBJECTIVE_IGNORE_M;
  })();
  if (m.mode === "bomb" && m.phase === "live" && !acting && !threat) {
    const side = bombSide(b.team, m.round);
    const bomb = m.bomb;
    if (side === "attack" && b.carrying) {
      for (const s of m.sites) if (Math.hypot(s.x - br.x, s.z - br.z) < SITE_R * 0.6) m.act(b, true, now);
    } else if (side === "defend" && bomb?.state === "planted") {
      const q = F.toXZ(bomb.lat, bomb.lng);
      if (Math.hypot(q.x - br.x, q.z - br.z) < BOMB_REACH_M * 0.8) m.act(b, true, now);
    }
  }

  // -- move
  let mvx = 0, mvz = 0;
  const tgt = br.target;
  const engaging = !!tgt && now >= br.reactAt;
  if (!frozen && !acting) {
    if (engaging) {
      // Strafe side to side while shooting.
      if (now > br.strafeAt) (br.strafe = -br.strafe), (br.strafeAt = now + 600 + Math.random() * 900), (br.crouch = Math.random() < 0.2);
      const q = F.toXZ(tgt!.lat, tgt!.lng);
      const dx = q.x - br.x, dz = q.z - br.z, d = Math.hypot(dx, dz) || 1;
      const sx = (-dz / d) * br.strafe, sz = (dx / d) * br.strafe;
      const nx = br.x + sx * ENGAGE * dt, nz = br.z + sz * ENGAGE * dt;
      if (!m.index.inside(nx, nz, 0.5) && Math.hypot(nx, nz) < m.radius) (mvx = sx * ENGAGE), (mvz = sz * ENGAGE);
    } else {
      br.crouch = false;
      // The street graph's points are ~6 m apart: the last few metres to a bomb are walked straight.
      const goal = objective(m, b);
      const g = goal && F.toXZ(goal.lat, goal.lng);
      const gd = g ? Math.hypot(g.x - br.x, g.z - br.z) : Infinity;
      if (g && gd < 10) {
        if (gd > BOMB_REACH_M * 0.5) (mvx = ((g.x - br.x) / gd) * RUN * 0.6), (mvz = ((g.z - br.z) / gd) * RUN * 0.6);
      } else if (br.path.length) {
        const n = m.nav.nodes[br.path[0]];
        const dx = n.x - br.x, dz = n.z - br.z, d = Math.hypot(dx, dz);
        if (d < 1) br.path.shift();
        else (mvx = (dx / d) * RUN), (mvz = (dz / d) * RUN);
      }
    }
  }
  br.x += mvx * dt;
  br.z += mvz * dt;

  // -- aim and shoot
  let yaw = b.yaw, pitch = 0;
  if (tgt) {
    const q = F.toXZ(tgt.lat, tgt.lng);
    yaw = Math.atan2(-(q.x - br.x), -(q.z - br.z));
    pitch = Math.atan2(tgt.y + 1.2 - (b.y + 1.45), Math.hypot(q.x - br.x, q.z - br.z));
  } else if (mvx || mvz) yaw = Math.atan2(-mvx, -mvz);
  b.yaw += Math.atan2(Math.sin(yaw - b.yaw), Math.cos(yaw - b.yaw)) * Math.min(1, dt * 10);
  b.pitch = pitch;

  const ammo = b.ammo.get(w) ?? 0;
  if (ammo <= 0 && !b.reloading) m.reload(b, now);
  if (engaging && !frozen && !acting && !b.reloading && ammo > 0 && now >= br.nextShot && m.canHurt(b, tgt!, now)) {
    const q = F.toXZ(tgt!.lat, tgt!.lng);
    const dist = Math.hypot(q.x - br.x, q.z - br.z);
    const moving = Math.hypot(tgt!.vx, tgt!.vz) > 1.5;
    let p = S.acc * Math.max(0.15, 1 - dist / 90) * (moving ? 0.8 : 1) * (tgt!.crouch ? 0.85 : 1) * (mvx || mvz ? 0.85 : 1);
    if (w === "shotgun") p = dist < 12 ? 0.7 : 0.1;
    const hit = Math.random() < p;
    const zone = Math.random() < S.head ? "head" : Math.random() < 0.2 ? "legs" : "body";
    const miss = hit ? null : (() => {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.6;
      const ll = F.toLL(q.x + Math.cos(a) * r, q.z + Math.sin(a) * r);
      return { lat: ll.lat, lng: ll.lng, y: tgt!.y + 0.4 + Math.random() * 1.6 };
    })();
    m.botShot(b, tgt!, w, hit ? { zone } : null, miss, now);
    br.burst++;
    const gap = shotGap(W) * 1000;
    // Bursts of 4–8, then a breath.
    br.nextShot = now + (br.burst % (4 + Math.floor(Math.random() * 5)) === 0 ? 350 + Math.random() * 450 : gap * (1 + Math.random() * 0.35));
  }

  // -- publish
  const ll = F.toLL(br.x, br.z);
  b.vx = mvx;
  b.vz = mvz;
  b.flags = F_FOOT | (br.crouch || acting ? F_CROUCH : 0) | (b.reloading ? F_RELOAD : 0) | (!engaging && (mvx || mvz) ? F_SPRINT : 0);
  b.weapon = W.idx;
  b.moveTo(ll, 0, now);
}

/** A bomb this bot should reach exactly: a planted one to defuse, a dropped one to pick up. */
function objective(m: Match, b: Player) {
  const bomb = m.bomb;
  if (m.mode !== "bomb" || m.phase !== "live" || !bomb) return null;
  const side = bombSide(b.team, m.round);
  if (side === "defend" && bomb.state === "planted") return bomb;
  if (side === "attack" && bomb.state === "dropped") return bomb;
  return null;
}

/** Where a bot heads next: a node index on the street graph. */
function pickGoal(m: Match, b: Player, br: Brain): number | null {
  const F = m.frame;
  const nearestTo = (lat: number, lng: number) => {
    const q = F.toXZ(lat, lng);
    return m.nav.nearest(q.x, q.z).i;
  };
  if (m.mode === "bomb") {
    const side = bombSide(b.team, m.round);
    const bomb = m.bomb;
    if (side === "attack") {
      if (b.carrying) {
        br.post ??= Math.floor(Math.random() * m.sites.length);
        const s = m.sites[br.post];
        return m.nav.nearest(s.x, s.z).i;
      }
      if (bomb?.state === "dropped" || bomb?.state === "planted") return nearestTo(bomb.lat, bomb.lng);
      // Escort the carrier, or push a site.
      const carrier = [...m.players].find((p) => p.carrying);
      if (carrier && Math.random() < 0.6) return nearestTo(carrier.lat, carrier.lng);
      const s = m.sites[Math.floor(Math.random() * m.sites.length)];
      return m.nav.random(Math.random, (n) => Math.hypot(n.x - s.x, n.z - s.z) < 30).i;
    }
    if (bomb?.state === "planted") return nearestTo(bomb.lat, bomb.lng);
    // Defenders split evenly between the sites.
    br.post ??= Math.max(0, [...m.players].filter((p) => p.bot && bombSide(p.team, m.round) === "defend").indexOf(b)) % m.sites.length;
    const s = m.sites[br.post];
    return m.nav.random(Math.random, (n) => Math.hypot(n.x - s.x, n.z - s.z) < 25).i;
  }
  // Deathmatch: hunt the nearest enemy most of the time, roam otherwise.
  let best: Player | null = null, bd = Infinity;
  for (const p of m.players) {
    if (p === b || p.dead || !p.placed || (m.def.teams && p.team === b.team)) continue;
    const q = F.toXZ(p.lat, p.lng), d = Math.hypot(q.x - br.x, q.z - br.z);
    if (d < bd) (bd = d), (best = p);
  }
  if (best && Math.random() < 0.65) return nearestTo(best.lat, best.lng);
  return m.nav.random().i;
}
