// Squad-run lobbies at run spawns: a race or a co-op run, started together. State
// advances lazily whenever a member polls (no background jobs).
import type { Lobby, LobbyPlayer, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM } from "../lib/geo";
import { COUNTDOWN_MS, isLobbyKind, LOBBY_INFO, LOBBY_MAX_PLAYERS, type LobbyKind } from "../lib/lobbies";
import { INTERACT_RADIUS_M, resolveSpawn, type Spawn } from "../lib/spawns";
import { S } from "../lib/settings";
import { HttpError } from "./http";
import { asUser, notify, onlineSince } from "./hub";
import { t } from "../lib/i18n";
import { questEvent } from "./quests";
import { lastKnownLocation, unlock } from "./rewards";
import { assertNotDowned } from "./td";

type Full = Lobby & { players: LobbyPlayer[] };

const kindFor = (s: Spawn, mode?: "race" | "coop"): LobbyKind | null => (s.kind === "run" ? (mode ?? "race") : null);

export async function loadLobby(id: string) {
  return prisma.lobby.findUnique({ where: { id }, include: { players: { orderBy: { joinedAt: "asc" } } } });
}

// ---------------------------------------------------------------- open / join / leave
export async function openOrJoin(u: User, spawnId: string, mode?: "race" | "coop") {
  const s = resolveSpawn(spawnId);
  if (!s) throw new HttpError(410, t("This spawn has expired"));
  const kind = kindFor(s, mode);
  if (!kind) throw new HttpError(400, t("Nothing to play here"));
  await assertNotDowned(u);
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, s) > INTERACT_RADIUS_M + S.claimSlack) throw new HttpError(400, t("Get within {m} m to join", { m: INTERACT_RADIUS_M }));
  if (await prisma.claim.findUnique({ where: { userId_spawnId: { userId: u.id, spawnId } } })) throw new HttpError(409, t("You already did this one"));
  if (await prisma.missionRun.findFirst({ where: { userId: u.id, status: "ACTIVE" } })) throw new HttpError(400, t("Finish or abandon your current run first"));

  // Already in a lobby here that hasn't finished? Just rejoin it.
  const mine = await prisma.lobbyPlayer.findFirst({ where: { userId: u.id, lobby: { spawnId, status: { in: ["OPEN", "LIVE"] } } } });
  if (mine) return mine.lobbyId;

  const open = await prisma.lobby.findFirst({ where: { spawnId, status: "OPEN", openUntil: { gt: new Date() } }, include: { players: true }, orderBy: { createdAt: "asc" } });
  if (open && open.players.length < LOBBY_MAX_PLAYERS) {
    await prisma.lobbyPlayer.create({ data: { lobbyId: open.id, userId: u.id, name: u.username, avatar: u.avatar } }).catch(() => {});
    await notify(open.hostId, () => ({ kind: "social", title: t("{avatar} {name} joined your {game}", { avatar: u.avatar, name: u.username, game: t(LOBBY_INFO[open.kind as LobbyKind].name) }) }));
    return open.id;
  }

  // Each new lobby pings nearby players, so hosting is rate-limited.
  const recentHost = await prisma.lobby.findFirst({ where: { hostId: u.id, createdAt: { gt: new Date(Date.now() - 15_000) } } });
  if (recentHost) throw new HttpError(429, t("You just opened a game — give it a few seconds"));
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
  for (const n of near)
    await notify(n.id, () => ({ kind: "event", title: t("{emoji} {name} opened a {game} nearby", { emoji: info.emoji, name: u.username, game: t(info.name) }), body: t("Tap the {icon} on the map within {s}s to join", { icon: "🏁", s: Math.round(info.openMs / 1000) }) }));
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
}

/** Advance a lobby's state machine. Safe to call from any request. */
export async function tick(l: Full) {
  const now = Date.now();
  // Lobbies of the retired arcade/chest mini-games: close them.
  if (!isLobbyKind(l.kind) && l.status !== "ENDED") await prisma.lobby.updateMany({ where: { id: l.id }, data: { status: "ENDED" } });
  else if (l.status === "OPEN" && l.openUntil.getTime() <= now) await start(l);
  else if (l.status === "LIVE" && l.endsAt) {
    const active = await prisma.missionRun.count({ where: { lobbyId: l.id, status: "ACTIVE" } });
    if (!active || l.endsAt.getTime() + 60_000 <= now) await prisma.lobby.updateMany({ where: { id: l.id, status: "LIVE" }, data: { status: "ENDED" } });
  }
  return (await loadLobby(l.id))!;
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
    return { mult: 1 + pct / 100, label: t("🤝 squad +{n}%", { n: pct }) };
  }
  const place = (await prisma.missionRun.count({ where: { lobbyId, status: "DONE" } })) + 1;
  await prisma.lobbyPlayer.updateMany({ where: { lobbyId, userId }, data: { finishedAt: new Date(), place } });
  const mult = place === 1 ? 1.5 : place === 2 ? 1.25 : 1;
  if (place === 1) {
    await questEvent(userId, "duel_win");
    await unlock(userId, "duel_champ");
  }
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`;
  return { mult, label: mult > 1 ? t("{medal} place +{n}%", { medal, n: Math.round((mult - 1) * 100) }) : t("{medal} place", { medal }), place };
}
