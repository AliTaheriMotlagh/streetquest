// Street Arena matches between real players without the realtime server (the game on
// Vercel alone). The match runs in its host's browser — the same hub as realtime/ — and
// everyone else links to it through here, a few polls a second (lib/arena/relay):
//
//  - host poll: "I'm alive (phase, players), here's my trail, my snapshots of everyone and
//    what the referee told each player" → "here's what the players did, and where they all are";
//  - player poll: "here's my trail and what I did" → "here's what the referee told me, the
//    host's snapshots, and where everyone is".
//
// Moves go one hop (each poll writes the poller's trail, every poll reads everyone's);
// referee messages wait in ArenaMsg until the recipient acknowledges them. Who may join:
// the host's party from anywhere (they're spawned in the arena), anyone else from close
// by — the same rule as the realtime server's lobbies. The host reports the result;
// matches with at least two people pay like the realtime server's (server/arenaPay.ts).
import type { Prisma, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { bbox, distanceM, type LatLng } from "../lib/geo";
import { t } from "../lib/i18n";
import { isMode, JOIN_MARGIN_M, MAX_PLAYERS, MODES, RADII, type LobbyView, type ModeKey, type Phase } from "../lib/arena/modes";
import { DOWN_MAX, HOST_GONE_MS, PEER_GONE_MS, UP_MAX, isRoomId, packTrail, unpackTrail } from "../lib/arena/relay";
import { payArena, type ArenaRow } from "./arenaPay";
import { HttpError } from "./http";
import { isVirtual } from "./drive";
import { notify } from "./hub";

/** Rooms nobody has heard from in this long are deleted. */
const ROOM_CLEANUP_MS = 5 * 60_000;
/** Matches nearby are listed out to this far (like the realtime server's lobbies). */
const LIST_M = 3000;
/** A paid match has run at least this long (ARENA_PAID_MIN_S; the e2e tests set 0). */
const PAID_MIN_MS = Math.max(0, Number(process.env.ARENA_PAID_MIN_S ?? 60)) * 1000;
const PHASES: Phase[] = ["lobby", "warmup", "live", "roundEnd", "ended"];

const gone = () => new HttpError(410, t("That match is over"));
const fresh = (at: Date, now = Date.now()) => now - at.getTime() < HOST_GONE_MS;
const trailJson = (raw: unknown) => packTrail(unpackTrail(raw)) as unknown as Prisma.InputJsonValue;

async function myPartyId(userId: string) {
  return (await prisma.drivePartyMember.findFirst({ where: { userId }, orderBy: { joinedAt: "desc" }, select: { partyId: true } }))?.partyId ?? null;
}

// ---------------------------------------------------------------- rooms
export type OpenRoom = { id: string; mode: string; radius: number; lat: number; lng: number; bots: number; anchor: LatLng; color?: string; party?: boolean; sim?: boolean };

/** The host made a match in their browser: list it, and (for their party) tell the members. */
export async function openRoom(u: User, level: number, o: OpenRoom) {
  if (!isVirtual(u, o.sim)) throw new HttpError(403, t("Switch to Play from home to fight in Street Arena"));
  if (!isRoomId(o.id) || !isMode(o.mode) || !RADII.includes(o.radius as (typeof RADII)[number])) throw new HttpError(400, "bad match");
  const me = await prisma.driveState.findUnique({ where: { userId: u.id }, select: { lat: true, lng: true } });
  if (!me) throw new HttpError(400, t("Open the 3D city first"));
  if (distanceM(me, o) > 2000) throw new HttpError(400, t("Start the match from where you are"));
  const party = o.party ? await prisma.driveParty.findFirst({ where: { members: { some: { userId: u.id } } }, orderBy: { updatedAt: "desc" } }) : null;
  if (o.party && party && party.hostId !== u.id) throw new HttpError(403, t("Only the host can start a round"));
  // One room per host; old rooms nobody runs any more go too.
  await prisma.arenaRoom.deleteMany({ where: { OR: [{ hostId: u.id }, { hostAt: { lt: new Date(Date.now() - ROOM_CLEANUP_MS) } }] } });
  await prisma.arenaRoom.create({
    data: {
      id: o.id, hostId: u.id, hostName: u.username, partyId: party?.id ?? null, mode: o.mode, radius: o.radius, lat: o.lat, lng: o.lng, bots: Math.max(0, Math.min(10, Math.round(o.bots))), joined: [u.id],
      peers: { create: { userId: u.id, name: u.username, avatar: u.avatar, level, color: o.color ?? "#d7263d", anchorLat: o.anchor.lat, anchorLng: o.anchor.lng } },
    },
  });
  if (party) {
    await prisma.driveParty.update({ where: { id: party.id }, data: { arena: o.id, arenaKind: "relay", arenaMode: o.mode, arenaAt: new Date() } });
    // Members already in the 3D city are pulled in; the others hear about it.
    const members = await prisma.drivePartyMember.findMany({ where: { partyId: party.id, userId: { not: u.id } }, select: { userId: true } });
    const def = MODES[o.mode as ModeKey];
    for (const m of members)
      await notify(m.userId, () => ({ kind: "event", link: "play", title: t("{emoji} {name} started {mode} for the party — open the 3D city to join", { emoji: def.emoji, name: u.username, mode: t(def.name) }) }));
  }
  return { id: o.id, party: party?.id ?? null };
}

/** The host's match is over (or they closed the 3D city). */
export async function closeRoom(userId: string, id: string) {
  await prisma.arenaRoom.deleteMany({ where: { id, hostId: userId } });
  await prisma.driveParty.updateMany({ where: { arena: id }, data: { arena: null, arenaKind: null, arenaMode: null, arenaAt: null } });
}

/** Relay matches I could join: around me, and my party's wherever it is. */
export async function listRooms(userId: string, here: LatLng): Promise<(LobbyView & { kind: "relay"; party: boolean })[]> {
  const now = Date.now();
  const box = bbox(here, LIST_M);
  const partyId = await myPartyId(userId);
  const rows = await prisma.arenaRoom.findMany({
    where: {
      hostId: { not: userId },
      hostAt: { gt: new Date(now - HOST_GONE_MS) },
      phase: { not: "ended" },
      OR: [{ lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } }, ...(partyId ? [{ partyId }] : [])],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows
    .map((r) => ({
      id: r.id, kind: "relay" as const, party: !!partyId && r.partyId === partyId, mode: r.mode as ModeKey, hostName: r.hostName, lat: r.lat, lng: r.lng, radius: r.radius,
      players: r.humans, bots: r.bots, max: MAX_PLAYERS, phase: (PHASES.includes(r.phase as Phase) ? r.phase : "lobby") as Phase, dist: Math.round(distanceM(here, r)),
    }))
    .sort((a, b) => Number(b.party) - Number(a.party) || a.dist - b.dist);
}

/** Step into someone's match (my browser then polls it as a player). */
export async function joinRoom(u: User, level: number, id: string, anchor: LatLng, color?: string, sim?: boolean) {
  if (!isVirtual(u, sim)) throw new HttpError(403, t("Switch to Play from home to fight in Street Arena"));
  const room = await prisma.arenaRoom.findUnique({ where: { id: String(id) }, include: { peers: { select: { userId: true, seenAt: true } } } });
  if (!room || !fresh(room.hostAt) || room.phase === "ended") {
    // A party pointing at a match that's gone: forget it.
    await prisma.driveParty.updateMany({ where: { arena: String(id) }, data: { arena: null, arenaKind: null, arenaMode: null, arenaAt: null } });
    throw gone();
  }
  if (room.hostId === u.id) throw new HttpError(409, t("That was already done"));
  const already = room.peers.some((p) => p.userId === u.id);
  const live = room.peers.filter((p) => Date.now() - p.seenAt.getTime() < PEER_GONE_MS).length;
  if (!already && live >= MAX_PLAYERS) throw new HttpError(409, t("This match is full"));
  const partyId = room.partyId ? await myPartyId(u.id) : null;
  if (!partyId || partyId !== room.partyId) {
    const me = await prisma.driveState.findUnique({ where: { userId: u.id }, select: { lat: true, lng: true } });
    if (!me || distanceM(me, room) > room.radius + JOIN_MARGIN_M) throw new HttpError(403, t("Drive closer to join — you need to be within {m} m", { m: room.radius + JOIN_MARGIN_M }));
  }
  // One match at a time: leave any other I was in.
  const others = await prisma.arenaPeer.findMany({ where: { userId: u.id, roomId: { not: room.id } }, select: { roomId: true } });
  for (const o of others) await leaveRoom(u.id, o.roomId);
  await prisma.arenaPeer.upsert({
    where: { roomId_userId: { roomId: room.id, userId: u.id } },
    create: { roomId: room.id, userId: u.id, name: u.username, avatar: u.avatar, level, color: color ?? "#d7263d", anchorLat: anchor.lat, anchorLng: anchor.lng },
    update: { seenAt: new Date(), joinedAt: new Date(), anchorLat: anchor.lat, anchorLng: anchor.lng, trail: [] },
  });
  // A rejoin starts clean: nothing left over from last time.
  await prisma.arenaMsg.deleteMany({ where: { roomId: room.id, OR: [{ to: u.id }, { from: u.id }] } });
  if (!room.joined.includes(u.id)) await prisma.arenaRoom.update({ where: { id: room.id }, data: { joined: { push: u.id } } });
  return { id: room.id, mode: room.mode, radius: room.radius, lat: room.lat, lng: room.lng, hostName: room.hostName, clock: room.clock };
}

export async function leaveRoom(userId: string, id: string) {
  const room = await prisma.arenaRoom.findUnique({ where: { id }, select: { hostId: true } });
  if (!room) return;
  if (room.hostId === userId) return closeRoom(userId, id);
  await prisma.arenaPeer.deleteMany({ where: { roomId: id, userId } });
  await prisma.arenaMsg.deleteMany({ where: { roomId: id, OR: [{ to: userId }, { from: userId }] } });
}

// ---------------------------------------------------------------- polls
type PeerOut = { userId: string; name: string; avatar: string; level: number; color: string; anchor: LatLng; trail: unknown; seenAt: number; joinedAt: number };
const peerOut = (p: { userId: string; name: string; avatar: string; level: number; color: string; anchorLat: number; anchorLng: number; trail: Prisma.JsonValue; seenAt: Date; joinedAt: Date }): PeerOut => ({
  userId: p.userId, name: p.name, avatar: p.avatar, level: p.level, color: p.color, anchor: { lat: p.anchorLat, lng: p.anchorLng }, trail: p.trail, seenAt: p.seenAt.getTime(), joinedAt: p.joinedAt.getTime(),
});

export type HostPoll = { id: string; ack: number; out: { to: string; body: string[] }[]; trail: unknown; snap?: string; phase: string; humans: number; bots: number; clock: number; sweep?: boolean };

export async function hostPoll(userId: string, b: HostPoll) {
  const now = Date.now();
  const phase = PHASES.includes(b.phase as Phase) ? b.phase : "lobby";
  const n = await prisma.arenaRoom.updateMany({
    where: { id: b.id, hostId: userId },
    data: { hostAt: new Date(now), phase, humans: Math.max(1, Math.min(MAX_PLAYERS, Math.round(b.humans))), bots: Math.max(0, Math.min(16, Math.round(b.bots))), clock: Number.isFinite(b.clock) ? b.clock : 0, ...(b.snap != null ? { snap: b.snap.slice(0, 40_000) } : {}) },
  });
  if (!n.count) throw gone();
  await prisma.arenaPeer.updateMany({ where: { roomId: b.id, userId }, data: { trail: trailJson(b.trail), seenAt: new Date(now) } });
  if (b.sweep) {
    const stale = await prisma.arenaPeer.findMany({ where: { roomId: b.id, userId: { not: userId }, seenAt: { lt: new Date(now - PEER_GONE_MS) } }, select: { userId: true } });
    for (const s of stale) await leaveRoom(s.userId, b.id);
  }
  const out = b.out.filter((o) => o.to && o.body.length).slice(0, MAX_PLAYERS);
  if (out.length) await prisma.arenaMsg.createMany({ data: out.map((o) => ({ roomId: b.id, to: o.to, from: userId, body: o.body.slice(-DOWN_MAX) })) });
  if (b.ack > 0) await prisma.arenaMsg.deleteMany({ where: { roomId: b.id, to: "", id: { lte: b.ack } } });
  const [msgs, peers] = await Promise.all([
    prisma.arenaMsg.findMany({ where: { roomId: b.id, to: "", id: { gt: Math.max(0, b.ack) } }, orderBy: { id: "asc" }, take: 200, select: { id: true, from: true, body: true } }),
    prisma.arenaPeer.findMany({ where: { roomId: b.id } }),
  ]);
  return { now: Date.now(), msgs, peers: peers.map(peerOut) };
}

export type GuestPoll = { id: string; ack: number; up: unknown[]; trail: unknown };

export async function guestPoll(userId: string, b: GuestPoll) {
  const now = Date.now();
  const n = await prisma.arenaPeer.updateMany({ where: { roomId: b.id, userId }, data: { trail: trailJson(b.trail), seenAt: new Date(now) } });
  if (!n.count) throw gone();
  if (b.up.length) await prisma.arenaMsg.create({ data: { roomId: b.id, to: "", from: userId, body: b.up.slice(0, UP_MAX) as Prisma.InputJsonValue } });
  if (b.ack > 0) await prisma.arenaMsg.deleteMany({ where: { roomId: b.id, to: userId, id: { lte: b.ack } } });
  const [room, msgs, peers] = await Promise.all([
    prisma.arenaRoom.findUnique({ where: { id: b.id }, select: { hostAt: true, clock: true, snap: true, phase: true, lat: true, lng: true } }),
    prisma.arenaMsg.findMany({ where: { roomId: b.id, to: userId, id: { gt: Math.max(0, b.ack) } }, orderBy: { id: "asc" }, take: 60, select: { id: true, body: true } }),
    prisma.arenaPeer.findMany({ where: { roomId: b.id, userId: { not: userId } }, select: { userId: true, trail: true } }),
  ]);
  if (!room || !fresh(room.hostAt, now)) {
    await prisma.arenaPeer.deleteMany({ where: { roomId: b.id, userId } });
    throw new HttpError(410, t("The host left — the match is over"));
  }
  return { now: Date.now(), clock: room.clock, snap: room.snap, origin: { lat: room.lat, lng: room.lng }, msgs, peers };
}

/** The host's hub finished the match: pay everyone who really played in it (once). */
export async function roomResult(userId: string, id: string, mode: string, players: number, results: ArenaRow[]) {
  const room = await prisma.arenaRoom.findUnique({ where: { id } });
  if (!room || room.hostId !== userId || !isMode(mode) || room.mode !== mode) throw gone();
  const rows = results.filter((r) => room.joined.includes(r.userId));
  const humans = new Set(rows.map((r) => r.userId));
  // Practice (just the host and bots) or a match that was over in a blink pays nothing.
  if (humans.size < 2 || Date.now() - room.createdAt.getTime() < PAID_MIN_MS) return { rewards: {} as Record<string, { xp: number; coins: number } | null>, practice: true };
  const first = await prisma.arenaRoom.updateMany({ where: { id, paid: false }, data: { paid: true } });
  if (!first.count) return { rewards: {}, practice: false };
  return { rewards: await payArena(`relay:${id}:${room.createdAt.getTime()}`, mode, Math.max(players, humans.size), rows), practice: false };
}
