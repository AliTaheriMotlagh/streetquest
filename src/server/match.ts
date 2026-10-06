// Live FPS matches over plain HTTP polling (works on serverless hosts).
// Each client POSTs its own position + the hits it scored ~7x/s and gets the
// whole match back. The server owns HP, kills, the objective and the outcome.
// One human client is the "host" and simulates bots/boss movement; if it goes
// quiet, the next human to poll takes over.
import type { Match, MatchPlayer, User } from "@prisma/client";
import { ARENA_HALF, buildArena, CAPTURE_SECONDS, MATCH_SECONDS, MAX_HIT_DMG, RIFLE, type ArenaKind } from "../lib/arena";
import { resolveBoss } from "../lib/bosses";
import { prisma } from "../lib/db";
import { distanceM } from "../lib/geo";
import { BREACH_RANGE_M, factionOf, levelOf, SHIELD_MS } from "../lib/rts";
import { armyOf, loadBase } from "./army";
import { bossHp, damageBoss } from "./boss";
import { isOnline, notify, onlineSince } from "./hub";
import { HttpError } from "./http";
import { moodOfUser, bumpNeeds } from "./needs";
import { areFriends } from "./rooms";
import { grant, lastKnownLocation } from "./rewards";

const STALE_MS = 15_000; // a human who hasn't polled this long counts as gone
const HOST_STALE_MS = 4_000;

export type Tick = {
  x: number;
  z: number;
  yaw: number;
  inZone?: boolean;
  hits?: { key: string; dmg: number }[];
  bots?: { key: string; x: number; z: number; yaw: number }[];
  botHits?: { from: string; key: string; dmg: number }[];
};

const isBotKey = (k: string) => k.startsWith("bot:") || k === "boss";
const alive = (p: MatchPlayer, now = Date.now()) => p.hp > 0 && (isBotKey(p.key) || now - p.updatedAt.getTime() < STALE_MS);

async function pushFeed(matchId: string, text: string) {
  const entry = JSON.stringify([{ t: Date.now(), text }]);
  await prisma.$executeRaw`UPDATE "Match" SET feed = feed || ${entry}::jsonb WHERE id = ${matchId}`;
}

// ---------------------------------------------------------------- open / join
export async function openMatch(u: User, kind: ArenaKind, targetId: string) {
  const here = await lastKnownLocation(u.id);
  const live = await prisma.match.findFirst({ where: { targetId, status: "LIVE", endsAt: { gt: new Date() } } });

  if (kind === "breach") {
    const base = await loadBase({ id: targetId });
    if (!base) throw new HttpError(404, "Base not found");
    if (distanceM(here, base) > BREACH_RANGE_M) throw new HttpError(400, `Get within ${BREACH_RANGE_M} m of the base to breach it`);
    const defending = base.ownerId === u.id || (await areFriends(base.ownerId, u.id));
    if (live) return join(live, u, defending ? "D" : "A");
    if (defending) throw new HttpError(400, "No attack on this base right now");
    if (base.shieldUntil && base.shieldUntil > new Date()) throw new HttpError(400, "This base is under a cease-fire shield");

    // The FPS layer only kicks in when other humans are around; otherwise it's a siege.
    const near = await prisma.user.count({
      where: { id: { notIn: [u.id] }, banned: false, lastSeenAt: { gt: onlineSince() }, lastLat: { gte: base.lat - 0.014, lte: base.lat + 0.014 }, lastLng: { gte: base.lng - 0.02, lte: base.lng + 0.02 } },
    });
    if (!isOnline(base.owner.lastSeenAt) && near === 0) throw new HttpError(400, "Nobody is online near this base — siege it with your army instead");

    const army = await armyOf(base.ownerId);
    const bots = Math.min(6, Math.max(2, 1 + levelOf(base.buildings, "turret") + Math.floor((army.ranger ?? 0) / 4) + (army.tank ?? 0)));
    const m = await createMatch("breach", targetId, bots, []);
    await notify(base.ownerId, { kind: "event", title: `⚔️ ${u.username} is breaching ${base.name}!`, body: "Get there and defend it — or let the garrison hold." });
    const others = await prisma.user.findMany({
      where: { id: { notIn: [u.id, base.ownerId] }, lastSeenAt: { gt: onlineSince() }, lastLat: { gte: base.lat - 0.014, lte: base.lat + 0.014 }, lastLng: { gte: base.lng - 0.02, lte: base.lng + 0.02 } },
      select: { id: true },
      take: 30,
    });
    for (const o of others) await notify(o.id, { kind: "event", title: `🔫 Firefight at ${base.name}`, body: "A breach just started nearby. Tap the base on the map to join." });
    return join(m, u, "A");
  }

  const boss = resolveBoss(targetId);
  if (!boss) throw new HttpError(410, "The boss has moved on");
  if (distanceM(here, boss) > BREACH_RANGE_M) throw new HttpError(400, `Get within ${BREACH_RANGE_M} m of the boss to raid it`);
  const { hp, defeated } = await bossHp(boss);
  if (defeated) throw new HttpError(400, "Already defeated");
  if (live) return join(live, u, "A");
  const m = await createMatch("raid", targetId, boss.def.key === "vex" ? 5 : 3, [{ key: "boss", name: `${boss.def.emoji} ${boss.def.name}`, hp, maxHp: boss.maxHp }]);
  return join(m, u, "A");
}

async function createMatch(kind: ArenaKind, targetId: string, bots: number, extra: { key: string; name: string; hp: number; maxHp: number }[]) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const arena = buildArena(seed, kind);
  const m = await prisma.match.create({ data: { kind, targetId, seed, endsAt: new Date(Date.now() + MATCH_SECONDS * 1000) } });
  const spawns = arena.spawnD;
  const rows = [
    ...extra.map((e) => ({ ...e, team: "D", ...spawns[0] })),
    ...Array.from({ length: bots }, (_, i) => {
      const s = spawns[(i + extra.length) % spawns.length];
      return { key: `bot:${i}`, name: kind === "raid" ? `Guard ${i + 1}` : `Garrison ${i + 1}`, hp: 70, maxHp: 70, team: "D", x: s.x + (i % 2) * 1.5, z: s.z };
    }),
  ];
  await prisma.matchPlayer.createMany({ data: rows.map((r) => ({ matchId: m.id, ...r })) });
  return m;
}

async function join(m: Match, u: User, team: "A" | "D") {
  const existing = await prisma.matchPlayer.findUnique({ where: { matchId_key: { matchId: m.id, key: u.id } } });
  if (!existing) {
    const arena = buildArena(m.seed, m.kind as ArenaKind);
    const n = await prisma.matchPlayer.count({ where: { matchId: m.id, team, userId: { not: null } } });
    const s = (team === "A" ? arena.spawnA : arena.spawnD)[n % 8];
    const maxHp = Math.round(100 * moodOfUser(u).hpMult);
    await prisma.matchPlayer.create({ data: { matchId: m.id, key: u.id, userId: u.id, team, name: `${u.avatar} ${u.username}`, x: s.x, z: s.z, yaw: team === "A" ? 0 : Math.PI, hp: maxHp, maxHp } });
    await pushFeed(m.id, `${u.username} joined ${team === "A" ? "the assault" : "the defense"}`);
  }
  return { matchId: m.id };
}

// ---------------------------------------------------------------- tick
async function hit(m: Match, from: MatchPlayer, key: string, dmg: number) {
  const target = await prisma.matchPlayer.findUnique({ where: { matchId_key: { matchId: m.id, key } } });
  if (!target || target.team === from.team || target.hp <= 0) return;

  if (key === "boss") {
    const boss = resolveBoss(m.targetId);
    if (!boss || !from.userId) return;
    const r = await damageBoss(boss, from.userId, dmg);
    await prisma.matchPlayer.update({ where: { id: target.id }, data: { hp: r.hp } });
    await prisma.matchPlayer.update({ where: { id: from.id }, data: { damage: { increment: dmg }, ...(r.hp <= 0 ? { kills: { increment: 1 } } : {}) } });
    if (r.hp <= 0) await pushFeed(m.id, `${from.name} landed the final blow on ${target.name}!`);
    return;
  }
  const after = await prisma.matchPlayer.update({ where: { id: target.id, hp: { gt: 0 } }, data: { hp: { decrement: dmg } } }).catch(() => null);
  if (!after) return;
  const killed = after.hp <= 0;
  if (killed) await prisma.matchPlayer.update({ where: { id: target.id }, data: { hp: 0 } });
  await prisma.matchPlayer.update({ where: { id: from.id }, data: { damage: { increment: dmg }, ...(killed ? { kills: { increment: 1 } } : {}) } });
  if (killed) await pushFeed(m.id, `${from.name} ✖ ${target.name}`);
}

export async function tick(u: User, matchId: string, t: Tick | null) {
  let m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m) throw new HttpError(404, "Match not found");
  const me = await prisma.matchPlayer.findUnique({ where: { matchId_key: { matchId, key: u.id } } });
  if (!me) throw new HttpError(403, "You're not in this match");
  const now = Date.now();

  if (t && m.status === "LIVE") {
    const dt = Math.min(2, (now - me.updatedAt.getTime()) / 1000);
    const lim = ARENA_HALF;
    let { x, z } = me;
    // Movement sanity: ignore teleports faster than a sprint.
    if (me.hp > 0 && Math.hypot(t.x - me.x, t.z - me.z) <= dt * 9 + 1.5) {
      x = Math.max(-lim, Math.min(lim, t.x));
      z = Math.max(-lim, Math.min(lim, t.z));
    }
    await prisma.matchPlayer.update({ where: { id: me.id }, data: { x, z, yaw: t.yaw, updatedAt: new Date(now) } });

    // Host election: the first human to poll after the host goes quiet takes over.
    const host = m.hostKey ? await prisma.matchPlayer.findUnique({ where: { matchId_key: { matchId, key: m.hostKey } } }) : null;
    if (!host || now - host.updatedAt.getTime() > HOST_STALE_MS) {
      await prisma.match.updateMany({ where: { id: matchId, hostKey: m.hostKey }, data: { hostKey: me.key } });
      m = { ...m, hostKey: me.key };
    }

    if (me.hp > 0) {
      // Objective: attackers standing on the capture zone in front of the Command Center.
      const arena = buildArena(m.seed, m.kind as ArenaKind);
      if (m.kind === "breach" && me.team === "A" && t.inZone && arena.zone && Math.hypot(x - arena.zone.x, z - arena.zone.z) <= arena.zone.r + 0.5) {
        await prisma.match.update({ where: { id: matchId }, data: { capture: { increment: Math.min(0.5, dt) } } });
      }
      // Rate-limit hits to what the rifle can physically fire since the last poll.
      const maxHits = Math.max(1, Math.min(8, Math.ceil((dt * 1000) / RIFLE.intervalMs)));
      for (const h of (t.hits ?? []).slice(0, maxHits)) await hit(m, me, h.key, Math.min(MAX_HIT_DMG, Math.max(0, h.dmg)));
    }

    if (m.hostKey === me.key) {
      const npcs = await prisma.matchPlayer.findMany({ where: { matchId, userId: null } });
      const byKey = new Map(npcs.map((p) => [p.key, p]));
      const boss = m.kind === "raid" ? resolveBoss(m.targetId) : null;
      for (const b of (t.bots ?? []).slice(0, 12)) {
        const row = byKey.get(b.key);
        if (row && row.hp > 0) await prisma.matchPlayer.update({ where: { id: row.id }, data: { x: Math.max(-lim, Math.min(lim, b.x)), z: Math.max(-lim, Math.min(lim, b.z)), yaw: b.yaw } });
      }
      for (const h of (t.botHits ?? []).slice(0, 10)) {
        const from = byKey.get(h.from);
        if (!from || from.hp <= 0) continue;
        const cap = from.key === "boss" ? (boss?.def.dmg ?? 15) * 2 : 15;
        await hit(m, from, h.key, Math.min(cap, Math.max(0, h.dmg)));
      }
    }
    m = await maybeFinish(matchId);
  } else if (m.status === "LIVE") {
    m = await maybeFinish(matchId);
  }
  return view(m, me.key);
}

// ---------------------------------------------------------------- outcome
async function maybeFinish(matchId: string): Promise<Match> {
  const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  if (m.status !== "LIVE") return m;
  const players = await prisma.matchPlayer.findMany({ where: { matchId } });
  const now = Date.now();
  const up = (team: string) => players.filter((p) => p.team === team && alive(p, now)).length;
  const anyHumanA = players.some((p) => p.team === "A" && p.userId);

  let winner: "A" | "D" | null = null;
  if (m.kind === "breach" && m.capture >= CAPTURE_SECONDS) winner = "A";
  else if (m.kind === "raid" && players.find((p) => p.key === "boss")!.hp <= 0) winner = "A";
  else if (m.kind === "breach" && up("D") === 0) winner = "A";
  else if (anyHumanA && up("A") === 0) winner = "D";
  else if (m.endsAt.getTime() <= now) winner = "D";
  if (!winner) return m;

  const res = await prisma.match.updateMany({ where: { id: matchId, status: "LIVE" }, data: { status: "ENDED", winner } });
  if (res.count) await payout(m, winner, players);
  return prisma.match.findUniqueOrThrow({ where: { id: matchId } });
}

async function payout(m: Match, winner: "A" | "D", players: MatchPlayer[]) {
  const humans = players.filter((p) => p.userId);
  const crowd = humans.length >= 2;
  let lootEach = 0;
  let baseName = "";

  if (m.kind === "breach") {
    const base = await loadBase({ id: m.targetId });
    if (base) {
      baseName = base.name;
      if (winner === "A") {
        const attackers = humans.filter((p) => p.team === "A");
        const f = factionOf((await prisma.user.findUnique({ where: { id: attackers[0]?.userId ?? "" }, select: { faction: true } }))?.faction);
        const loot = Math.min(600, Math.floor(base.owner.coins * 0.15 * (f?.loot ?? 1)));
        const took = await prisma.user.updateMany({ where: { id: base.ownerId, coins: { gte: loot } }, data: { coins: { decrement: loot } } });
        lootEach = took.count && attackers.length ? Math.floor(loot / attackers.length) : 0;
        await prisma.base.update({ where: { id: base.id }, data: { hp: Math.max(0, base.hp - 300), shieldUntil: new Date(Date.now() + SHIELD_MS) } });
        await notify(base.ownerId, { kind: "event", title: `💥 ${base.name} was breached`, body: `Lost ${loot} 🪙. Cease-fire shield is up for 2 h.` });
      } else {
        await notify(base.ownerId, { kind: "reward", title: `🛡️ ${base.name} held!`, body: "Your defenders repelled the breach." });
      }
    }
  }
  const boss = m.kind === "raid" ? resolveBoss(m.targetId) : null;

  for (const p of humans) {
    const won = p.team === winner;
    await grant(p.userId!, { xp: 80 + p.kills * 40 + Math.round(p.damage / 10) + (won ? 150 : 0), coins: (won ? 50 : 10) + (p.team === "A" ? lootEach : 0) });
    await bumpNeeds(p.userId!, { fun: 30, ...(crowd ? { social: 12 } : {}), energy: -8 });
    if (p.team === "A") {
      await prisma.battle.create({
        data: {
          attackerId: p.userId!,
          kind: m.kind,
          targetId: m.targetId,
          targetName: boss ? boss.def.name : baseName,
          won,
          loot: lootEach,
          log: { kills: p.kills, damage: p.damage, matchId: m.id },
        },
      });
    }
  }
}

async function view(m: Match, meKey: string) {
  const players = await prisma.matchPlayer.findMany({ where: { matchId: m.id } });
  const now = Date.now();
  const feed = (m.feed as { t: number; text: string }[]).slice(-6);
  const boss = m.kind === "raid" ? resolveBoss(m.targetId) : null;
  return {
    id: m.id,
    kind: m.kind as ArenaKind,
    seed: m.seed,
    status: m.status,
    winner: m.winner,
    capture: m.capture,
    captureNeeded: CAPTURE_SECONDS,
    endsAt: m.endsAt.getTime(),
    serverTime: now,
    host: m.hostKey === meKey,
    me: meKey,
    boss: boss && { key: boss.def.key, name: boss.def.name, emoji: boss.def.emoji, color: boss.def.color, dmg: boss.def.dmg, speed: boss.def.speed },
    feed,
    players: players.map((p) => ({
      key: p.key,
      name: p.name,
      team: p.team,
      bot: !p.userId,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      hp: p.hp,
      maxHp: p.maxHp,
      kills: p.kills,
      gone: !!p.userId && now - p.updatedAt.getTime() > STALE_MS,
    })),
  };
}
export type MatchView = Awaited<ReturnType<typeof view>>;
