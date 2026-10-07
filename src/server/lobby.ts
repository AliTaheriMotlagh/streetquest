// Multiplayer lobbies at shared spawns. Arcades (Shooting Range) and chests (Bomb
// Defuse) are played head-to-head on the same seed; runs become squad races or
// co-op runs. State advances lazily whenever a member polls (no background jobs).
import type { Lobby, LobbyPlayer, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM } from "../lib/geo";
import { COUNTDOWN_MS, DEFUSE_MAX, defuseRoundsOf, LOBBY_INFO, LOBBY_MAX_PLAYERS, rangeMaxScore, type LobbyKind } from "../lib/minigames";
import { INTERACT_RADIUS_M, resolveSpawn, type Spawn } from "../lib/spawns";
import { maybeGear } from "./hero";
import { HttpError } from "./http";
import { notify, onlineSince } from "./hub";
import { bumpNeeds } from "./needs";
import { questEvent } from "./quests";
import { checkClaimAchievements, grant, itemLabel, lastKnownLocation, track } from "./rewards";
import { assertNotDowned } from "./td";

const GRACE_MS = 8_000; // slow phones still get their score in
type Full = Lobby & { players: LobbyPlayer[] };

const kindFor = (s: Spawn, mode?: "race" | "coop"): LobbyKind | null => (s.kind === "arcade" ? "range" : s.kind === "chest" ? "defuse" : s.kind === "run" ? (mode ?? "race") : null);
const isRun = (k: string) => k === "race" || k === "coop";

export async function loadLobby(id: string) {
  return prisma.lobby.findUnique({ where: { id }, include: { players: { orderBy: { joinedAt: "asc" } } } });
}

// ---------------------------------------------------------------- open / join / leave
export async function openOrJoin(u: User, spawnId: string, mode?: "race" | "coop") {
  const s = resolveSpawn(spawnId);
  if (!s) throw new HttpError(410, "This spawn has expired");
  const kind = kindFor(s, mode);
  if (!kind) throw new HttpError(400, "Nothing to play here");
  await assertNotDowned(u);
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, s) > INTERACT_RADIUS_M + 10) throw new HttpError(400, `Get within ${INTERACT_RADIUS_M} m to join`);
  if (await prisma.claim.findUnique({ where: { userId_spawnId: { userId: u.id, spawnId } } })) throw new HttpError(409, "You already did this one");
  if (isRun(kind) && (await prisma.missionRun.findFirst({ where: { userId: u.id, status: "ACTIVE" } }))) throw new HttpError(400, "Finish or abandon your current run first");

  // Already in a lobby here that hasn't finished? Just rejoin it.
  const mine = await prisma.lobbyPlayer.findFirst({ where: { userId: u.id, lobby: { spawnId, status: { in: ["OPEN", "LIVE"] } } } });
  if (mine) return mine.lobbyId;

  const open = await prisma.lobby.findFirst({ where: { spawnId, status: "OPEN", openUntil: { gt: new Date() } }, include: { players: true }, orderBy: { createdAt: "asc" } });
  if (open && open.players.length < LOBBY_MAX_PLAYERS) {
    await prisma.lobbyPlayer.create({ data: { lobbyId: open.id, userId: u.id, name: u.username, avatar: u.avatar } }).catch(() => {});
    await notify(open.hostId, { kind: "social", title: `${u.avatar} ${u.username} joined your ${LOBBY_INFO[open.kind as LobbyKind].name}` });
    return open.id;
  }

  const info = LOBBY_INFO[kind];
  const lobby = await prisma.lobby.create({
    data: {
      kind,
      spawnId,
      seed: Math.floor(Math.random() * 2 ** 31),
      hostId: u.id,
      lat: s.lat,
      lng: s.lng,
      openUntil: new Date(Date.now() + info.openMs),
      players: { create: { userId: u.id, name: u.username, avatar: u.avatar } },
    },
  });
  // Ping everyone online close by — that's the multiplayer hook.
  const near = await prisma.user.findMany({
    where: { id: { not: u.id }, banned: false, lastSeenAt: { gt: onlineSince() }, lastLat: { gte: s.lat - 0.0035, lte: s.lat + 0.0035 }, lastLng: { gte: s.lng - 0.005, lte: s.lng + 0.005 } },
    select: { id: true },
    take: 30,
  });
  for (const n of near) await notify(n.id, { kind: "event", title: `${info.emoji} ${u.username} opened a ${info.name} nearby`, body: `Tap the ${s.kind === "run" ? "🏁" : s.kind === "chest" ? "🧰" : "🕹️"} on the map within ${Math.round(info.openMs / 1000)}s to join` });
  return lobby.id;
}

export async function leave(u: User, lobbyId: string) {
  const l = await loadLobby(lobbyId);
  if (!l || l.status !== "OPEN") return;
  await prisma.lobbyPlayer.deleteMany({ where: { lobbyId, userId: u.id } });
  const rest = l.players.filter((p) => p.userId !== u.id);
  if (!rest.length) await prisma.lobby.deleteMany({ where: { id: lobbyId, status: "OPEN" } });
  else if (l.hostId === u.id) await prisma.lobby.update({ where: { id: lobbyId }, data: { hostId: rest[0].userId } });
}

// ---------------------------------------------------------------- start
export async function start(l: Full) {
  const info = LOBBY_INFO[l.kind as LobbyKind];
  const startsAt = new Date(Date.now() + COUNTDOWN_MS);
  if (isRun(l.kind)) {
    const s = resolveSpawn(l.spawnId);
    if (!s?.run) {
      await prisma.lobby.updateMany({ where: { id: l.id, status: "OPEN" }, data: { status: "ENDED" } });
      return;
    }
    const deadline = new Date(startsAt.getTime() + s.run.timeLimitS * 1000);
    const ok = await prisma.lobby.updateMany({ where: { id: l.id, status: "OPEN" }, data: { status: "LIVE", startsAt, endsAt: deadline } });
    if (!ok.count) return;
    for (const p of l.players) {
      if (await prisma.missionRun.findFirst({ where: { userId: p.userId, status: "ACTIVE" } })) continue;
      const claimed = await prisma.claim.create({ data: { userId: p.userId, spawnId: s.id, kind: "run", cell: s.cell } }).catch(() => null);
      if (!claimed) continue;
      await prisma.missionRun.create({
        data: { userId: p.userId, spawnId: s.id, lobbyId: l.id, title: `${info.emoji} ${s.run.title}`, targetLat: s.run.target.lat, targetLng: s.run.target.lng, deadline, rewardXp: s.rewardXp, rewardCoins: s.rewardCoins },
      });
    }
    return;
  }
  await prisma.lobby.updateMany({ where: { id: l.id, status: "OPEN" }, data: { status: "LIVE", startsAt, endsAt: new Date(startsAt.getTime() + info.playMs + GRACE_MS) } });
}

/** Advance a lobby's state machine. Safe to call from any request. */
export async function tick(l: Full) {
  const now = Date.now();
  if (l.status === "OPEN" && l.openUntil.getTime() <= now) await start(l);
  else if (l.status === "LIVE" && l.endsAt && !isRun(l.kind) && (l.endsAt.getTime() <= now || l.players.every((p) => p.score != null))) await finish(l);
  else if (l.status === "LIVE" && isRun(l.kind) && l.endsAt) {
    const active = await prisma.missionRun.count({ where: { lobbyId: l.id, status: "ACTIVE" } });
    if (!active || l.endsAt.getTime() + 60_000 <= now) await prisma.lobby.updateMany({ where: { id: l.id, status: "LIVE" }, data: { status: "ENDED" } });
  }
  return (await loadLobby(l.id))!;
}

// ---------------------------------------------------------------- scores + payout
export async function submitScore(u: User, l: Full, score: number) {
  if (isRun(l.kind)) throw new HttpError(400, "Runs finish at the target");
  if (l.status !== "LIVE" || !l.startsAt) throw new HttpError(400, "The game isn't running");
  if (Date.now() < l.startsAt.getTime() - 500) throw new HttpError(400, "Wait for the countdown");
  const cap = l.kind === "range" ? rangeMaxScore(l.seed) : DEFUSE_MAX;
  const clean = Math.max(-500, Math.min(cap, Math.round(score)));
  const res = await prisma.lobbyPlayer.updateMany({ where: { lobbyId: l.id, userId: u.id, score: null }, data: { score: clean, finishedAt: new Date() } });
  if (!res.count) throw new HttpError(409, "Score already in");
  return tick((await loadLobby(l.id))!);
}

async function finish(l: Full) {
  const ok = await prisma.lobby.updateMany({ where: { id: l.id, status: "LIVE" }, data: { status: "ENDED" } });
  if (!ok.count) return;
  const s = resolveSpawn(l.spawnId) ?? null;
  const ranked = l.players.filter((p) => p.score != null).sort((a, b) => b.score! - a.score! || a.finishedAt!.getTime() - b.finishedAt!.getTime());
  const n = l.players.length;
  for (const [i, p] of ranked.entries()) {
    const place = i + 1;
    const reward = s ? await payMini(p.userId, s, l.kind as LobbyKind, p.score!, place, n) : "The spawn expired";
    await prisma.lobbyPlayer.update({ where: { id: p.id }, data: { place, reward } });
  }
  for (const p of l.players.filter((x) => x.score == null)) await prisma.lobbyPlayer.update({ where: { id: p.id }, data: { reward: "Didn't finish" } });
}

async function payMini(userId: string, s: Spawn, kind: LobbyKind, score: number, place: number, players: number): Promise<string> {
  const duel = players >= 2;
  const won = duel && place === 1;
  await questEvent(userId, "arcade");
  if (duel) await bumpNeeds(userId, { fun: 15, social: 8 });
  else await bumpNeeds(userId, { fun: 12 });

  if (kind === "defuse") {
    const rounds = defuseRoundsOf(score);
    if (rounds < 1) return "💥 BOOM — the crate stayed shut. Try again!";
    if (!(await prisma.claim.create({ data: { userId, spawnId: s.id, kind: s.kind, cell: s.cell } }).catch(() => null))) return "Already opened";
    const items: Record<string, number> = s.item ? { [s.item.key]: 1 + (rounds >= 3 ? 1 : 0) } : {};
    const coins = s.rewardCoins + (won ? 25 * (players - 1) : 0);
    await grant(userId, { xp: s.rewardXp + (won ? 50 : 0), coins, items });
    await questEvent(userId, "collect");
    await questEvent(userId, "chest");
    if (won) await questEvent(userId, "duel_win");
    await maybeGear(userId, (rounds >= 3 ? 0.4 : 0.2) + (won ? 0.3 : 0), { source: "a supply crate" });
    await checkClaimAchievements(userId, s.phase);
    await track("claim", { userId });
    return [`${rounds >= 3 ? "Flawless! " : ""}${Object.keys(items).map(itemLabel).join(", ")}`, `+${coins} 🪙`, won ? "🏆 winner bonus" : ""].filter(Boolean).join(" · ");
  }

  // Shooting range
  if (!(await prisma.claim.create({ data: { userId, spawnId: s.id, kind: s.kind, cell: s.cell } }).catch(() => null))) return "Already played";
  const coins = Math.max(0, Math.min(90, Math.round(score / 4))) + (won ? 20 * (players - 1) : 0);
  await grant(userId, { xp: s.rewardXp + (won ? 50 : 0), coins });
  await questEvent(userId, "collect");
  if (won) await questEvent(userId, "duel_win");
  await checkClaimAchievements(userId, s.phase);
  await track("claim", { userId });
  return `+${coins} 🪙${won ? " · 🏆 winner bonus" : ""}`;
}

/** Bonus multiplier for a squad run finisher. */
export async function runBonus(lobbyId: string, userId: string) {
  const l = await loadLobby(lobbyId);
  if (!l) return { mult: 1, label: "" };
  const n = await prisma.missionRun.count({ where: { lobbyId } });
  if (n < 2) return { mult: 1, label: "" };
  if (l.kind === "coop") {
    const pct = Math.min(80, 20 * (n - 1));
    await prisma.lobbyPlayer.updateMany({ where: { lobbyId, userId }, data: { finishedAt: new Date() } });
    return { mult: 1 + pct / 100, label: `🤝 squad +${pct}%` };
  }
  const place = (await prisma.missionRun.count({ where: { lobbyId, status: "DONE" } })) + 1;
  await prisma.lobbyPlayer.updateMany({ where: { lobbyId, userId }, data: { finishedAt: new Date(), place } });
  const mult = place === 1 ? 1.5 : place === 2 ? 1.25 : 1;
  return { mult, label: `${place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`} place${mult > 1 ? ` +${Math.round((mult - 1) * 100)}%` : ""}`, place };
}
