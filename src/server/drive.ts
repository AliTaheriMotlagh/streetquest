// The 3D city together: where everyone's vehicle is, and party games between friends.
//
// Presence: each driver POSTs /api/drive a few times a second with their position,
// heading, altitude and vehicle (DriveState). The answer is everyone else worth drawing.
// Who sees whom follows the map's privacy rules:
//  - party members and friends: exact, always;
//  - strangers: only drivers on a *virtual* position (play from home / test mode), and
//    only once they've driven 300 m away from where their drive began — which is
//    usually home;
//  - players following their real GPS never broadcast here at all (they still appear,
//    privacy-fuzzed, in the world list).
//
// Parties: a host and up to 7 friends. The host starts a round (lib/party); the server
// referees it from the same position stream — checkpoints passed, coins grabbed, who's
// IT — and pays out when it ends. State lives in one JSON column guarded by an
// optimistic version, so two players' updates landing together can't erase each other.
// Everything advances lazily on requests (no background jobs, serverless-friendly).
import type { DriveParty, DrivePartyMember, DriveState, Prisma, User } from "@prisma/client";
import { prisma } from "../lib/db";
import { bbox, distanceM, type LatLng } from "../lib/geo";
import { t } from "../lib/i18n";
import {
  CHECKPOINT_M, checkPoints, COIN_M, COUNTDOWN_MS, gridSpot, isPartyCode, newPartyCode, PARTY_GAMES, PARTY_IDLE_MS, PARTY_MAX, PARTY_REWARDS_PER_DAY,
  partyPrize, standings, TAG_COOLDOWN_MS, TAG_M, type PartyGame, type PartyState, type PartyView,
} from "../lib/party";
import { levelForXp } from "../lib/progression";
import { S } from "../lib/settings";
import { allowedVehicle, isPaint, VEHICLES, type VehicleKey } from "../lib/vehicles";
import { notify } from "./hub";
import { HttpError } from "./http";
import { grant } from "./rewards";
import { areFriends, friendIds } from "./rooms";
import { canSimulate } from "./session";

/** A driver who hasn't reported for this long has parked (closed the 3D city). */
const FRESH_MS = 8_000;
/** Strangers see you once you're this far from where your drive started. */
const PRIVATE_START_M = 300;
const VIEW_M = 1500;
/** A gap this long between reports starts a new drive (and a new private start point). */
const NEW_DRIVE_MS = 10 * 60_000;
/** Round state is kept this long after the start for late warps. */
const WARP_WINDOW_MS = 20_000;

export type DriveReport = {
  lat?: number;
  lng?: number;
  alt: number;
  yaw: number;
  speed: number;
  vehicle: string;
  color?: string;
  sim?: boolean;
  /** Viewers following real GPS: where to look (nothing is stored). */
  here?: LatLng;
};

export type OtherDriver = {
  id: string;
  name: string;
  avatar: string;
  level: number;
  vehicle: VehicleKey;
  color: string;
  lat: number;
  lng: number;
  alt: number;
  yaw: number;
  speed: number;
  /** Server time of this sample, for interpolation. */
  at: number;
  friend: boolean;
  party: boolean;
};

const isVirtual = (u: User, sim?: boolean) => u.remotePlay || (!!sim && canSimulate(u.role));

// Friends change rarely; presence asks a few times a second.
const friendCache = new Map<string, { at: number; ids: Set<string> }>();
async function friendsOf(userId: string) {
  const hit = friendCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const ids = new Set(await friendIds(userId));
  if (friendCache.size > 5000) friendCache.clear();
  friendCache.set(userId, { at: Date.now(), ids });
  return ids;
}

/** Local metres between a point and the segment a→b (the last ~250 ms of driving). */
function segDist(p: LatLng, a: LatLng, b: LatLng) {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180), ky = 110_540;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const k = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + dx * k, ay + dy * k);
}

// ---------------------------------------------------------------- presence
export async function report(u: User, d: DriveReport) {
  const now = Date.now();
  const level = levelForXp(u.xp);
  const prev = await prisma.driveState.findUnique({ where: { userId: u.id } });
  let vehicle = allowedVehicle(d.vehicle, level);
  let here: LatLng;
  let rejected = false;
  let party: PartyWithMembers | null = null;
  const partyId = prev?.partyId ?? (prev ? null : (await prisma.drivePartyMember.findFirst({ where: { userId: u.id }, orderBy: { joinedAt: "desc" } }))?.partyId ?? null);
  if (partyId) party = await loadParty(partyId);
  if (party && !party.members.some((m) => m.userId === u.id)) party = null;
  // Rounds of a ground-only game are driven on wheels.
  if (party?.status === "LIVE" && PARTY_GAMES[party.game as PartyGame]?.groundOnly && VEHICLES[vehicle].flies) vehicle = "car";

  if (d.lat != null && d.lng != null) {
    if (!isVirtual(u, d.sim)) throw new HttpError(403, t("Switch to Play from home to drive the 3D city"));
    here = { lat: d.lat, lng: d.lng };
    const fresh = prev && now - prev.updatedAt.getTime() < NEW_DRIVE_MS;
    // No teleporting past the fastest vehicle (+ slack for a hiccup in the stream).
    if (fresh) {
      const dt = Math.max(0.2, (now - prev.updatedAt.getTime()) / 1000);
      const maxMps = (S.driveSpeedKmh * Math.max(VEHICLES[vehicle].speed, VEHICLES[prev.vehicle as VehicleKey]?.speed ?? 1)) / 3.6;
      if (distanceM(prev, here) > maxMps * dt * 1.6 + 25) {
        rejected = true;
        here = { lat: prev.lat, lng: prev.lng };
      }
    }
    const data = {
      name: u.username, avatar: u.avatar, level, lat: here.lat, lng: here.lng,
      alt: Math.max(0, Math.min(VEHICLES[vehicle].ceiling ?? 0, d.alt)), yaw: d.yaw, speed: d.speed, vehicle, color: isPaint(d.color) ? d.color : "#d7263d", virtual: true,
      ...(fresh ? {} : { startLat: here.lat, startLng: here.lng }),
      partyId: party?.id ?? null,
    };
    await prisma.driveState.upsert({ where: { userId: u.id }, create: { userId: u.id, startLat: here.lat, startLng: here.lng, ...data }, update: data });
    if (party?.status === "LIVE" && !rejected && fresh) party = await playStep(party, u.id, prev, here, vehicle);
  } else {
    if (!d.here) throw new HttpError(400, t("lat/lng required"));
    here = d.here;
  }
  if (party) party = await tickParty(party);

  const others = await othersAround(u.id, here, party);
  return { serverTime: Date.now(), vehicle, rejected, others, party: party ? partyView(party, u.id, others) : null };
}

async function othersAround(userId: string, here: LatLng, party: PartyWithMembers | null): Promise<OtherDriver[]> {
  const box = bbox(here, VIEW_M);
  const since = new Date(Date.now() - FRESH_MS);
  const members = new Set(party?.members.map((m) => m.userId) ?? []);
  const rows = await prisma.driveState.findMany({
    where: {
      userId: { not: userId },
      updatedAt: { gt: since },
      OR: [{ lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } }, ...(party ? [{ partyId: party.id }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
  const friends = await friendsOf(userId);
  return rows
    .filter((r) => members.has(r.userId) || friends.has(r.userId) || (r.virtual && distanceM({ lat: r.startLat, lng: r.startLng }, r) > PRIVATE_START_M))
    .map((r) => ({
      id: r.userId, name: r.name, avatar: r.avatar, level: r.level, vehicle: allowedVehicle(r.vehicle, 99), color: r.color,
      lat: r.lat, lng: r.lng, alt: r.alt, yaw: r.yaw, speed: r.speed, at: r.updatedAt.getTime(), friend: friends.has(r.userId), party: members.has(r.userId),
    }));
}

/** Leaving the 3D city: stop showing this player's vehicle right away. */
export async function park(userId: string) {
  await prisma.driveState.updateMany({ where: { userId }, data: { updatedAt: new Date(0) } });
}

// ---------------------------------------------------------------- parties
type PartyWithMembers = DriveParty & { members: DrivePartyMember[] };

const loadParty = (id: string) => prisma.driveParty.findUnique({ where: { id }, include: { members: { orderBy: { joinedAt: "asc" } } } });
const stateOf = (p: DriveParty) => (p.state as PartyState | null) ?? null;

export async function myParty(userId: string) {
  const m = await prisma.drivePartyMember.findFirst({ where: { userId }, orderBy: { joinedAt: "desc" } });
  return m ? loadParty(m.partyId) : null;
}

function assertCanParty(u: User, sim?: boolean) {
  if (!isVirtual(u, sim)) throw new HttpError(403, t("Party games are for Play from home — switch it on to join your friends"));
}

export async function createParty(u: User, sim?: boolean) {
  assertCanParty(u, sim);
  await leaveParty(u.id);
  for (let i = 0; i < 5; i++) {
    const party = await prisma.driveParty
      .create({ data: { code: newPartyCode(), hostId: u.id, members: { create: { userId: u.id, name: u.username, avatar: u.avatar } } }, include: { members: true } })
      .catch(() => null); // code taken: try another
    if (party) {
      await prisma.driveState.updateMany({ where: { userId: u.id }, data: { partyId: party.id } });
      return party;
    }
  }
  throw new HttpError(503, t("Couldn't open a party — try again"));
}

export async function joinParty(u: User, code: string, sim?: boolean) {
  assertCanParty(u, sim);
  const c = code.trim().toUpperCase();
  if (!isPartyCode(c)) throw new HttpError(400, t("Party codes are 6 letters and numbers"));
  const party = await prisma.driveParty.findUnique({ where: { code: c }, include: { members: true } });
  if (!party) throw new HttpError(404, t("No party with that code"));
  if (party.members.some((m) => m.userId === u.id)) return party;
  if (party.members.length >= PARTY_MAX) throw new HttpError(409, t("That party is full"));
  await leaveParty(u.id);
  await prisma.drivePartyMember.create({ data: { partyId: party.id, userId: u.id, name: u.username, avatar: u.avatar } });
  await prisma.driveState.updateMany({ where: { userId: u.id }, data: { partyId: party.id } });
  await notify(party.hostId, () => ({ kind: "social", title: t("{avatar} {name} joined your party", { avatar: u.avatar, name: u.username }) }));
  return (await loadParty(party.id))!;
}

export async function leaveParty(userId: string) {
  const mine = await prisma.drivePartyMember.findMany({ where: { userId } });
  for (const m of mine) {
    await prisma.drivePartyMember.deleteMany({ where: { id: m.id } });
    const p = await loadParty(m.partyId);
    if (!p) continue;
    if (!p.members.length) await prisma.driveParty.deleteMany({ where: { id: p.id } });
    else if (p.hostId === userId) await prisma.driveParty.update({ where: { id: p.id }, data: { hostId: p.members[0].userId } });
  }
  await prisma.driveState.updateMany({ where: { userId }, data: { partyId: null } });
}

export async function inviteToParty(u: User, partyId: string, friendId: string) {
  const p = await loadParty(partyId);
  if (!p || !p.members.some((m) => m.userId === u.id)) throw new HttpError(403, t("You're not in this party"));
  if (!(await areFriends(u.id, friendId))) throw new HttpError(403, t("You can only invite friends"));
  if (!p.invited.includes(friendId)) await prisma.driveParty.update({ where: { id: p.id }, data: { invited: { push: friendId } } });
  await notify(friendId, () => ({
    kind: "social",
    title: t("🎉 {name} invited you to a party in the 3D city", { name: u.username }),
    body: t("Open the 3D city, tap 🎉 and enter code {code} — or accept the invite there.", { code: p.code }),
  }));
}

/** Parties friends invited me to that are still around. */
export async function invitesFor(userId: string) {
  const rows = await prisma.driveParty.findMany({
    where: { invited: { has: userId }, updatedAt: { gt: new Date(Date.now() - 3600_000) } },
    include: { members: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  return rows.filter((p) => !p.members.some((m) => m.userId === userId)).map((p) => ({ id: p.id, code: p.code, host: p.members.find((m) => m.userId === p.hostId)?.name ?? "", players: p.members.length, game: p.game }));
}

export async function startRound(u: User, partyId: string, game: PartyGame, start: LatLng & { yaw: number }, points?: LatLng[]) {
  const p = await loadParty(partyId);
  if (!p || !p.members.some((m) => m.userId === u.id)) throw new HttpError(403, t("You're not in this party"));
  if (p.hostId !== u.id) throw new HttpError(403, t("Only the host can start a round"));
  if (p.status === "LIVE") throw new HttpError(409, t("A round is already running"));
  const def = PARTY_GAMES[game];
  if (p.members.length < def.min) throw new HttpError(400, t("{game} needs at least {n} players", { game: t(def.name), n: def.min }));
  const me = await prisma.driveState.findUnique({ where: { userId: u.id } });
  if (!me || Date.now() - me.updatedAt.getTime() > FRESH_MS || distanceM(me, start) > 150) throw new HttpError(400, t("Start the round from where your car is"));
  const bad = checkPoints(game, start, points);
  if (bad) throw new HttpError(400, t(bad));

  const prevRound = stateOf(p)?.round ?? 0;
  const ids = p.members.map((m) => m.userId);
  const state: PartyState = {
    game,
    round: prevRound + 1,
    start,
    ids,
    progress: {},
    finished: {},
    ...(game === "race" ? { cps: points } : {}),
    ...(game === "coins" ? { coins: points, taken: {} } : {}),
    // No tag in the first moments: everyone gets to pull away from the grid.
    ...(game === "tag" ? { it: ids[Math.floor(Math.random() * ids.length)], itSince: Date.now() + COUNTDOWN_MS, itMs: {}, lastTagAt: Date.now() + COUNTDOWN_MS } : {}),
  };
  const startsAt = new Date(Date.now() + COUNTDOWN_MS);
  const ok = await prisma.driveParty.updateMany({
    where: { id: p.id, version: p.version, status: { not: "LIVE" } },
    data: { game, status: "LIVE", state: state as unknown as Prisma.InputJsonValue, version: { increment: 1 }, startsAt, endsAt: new Date(startsAt.getTime() + def.seconds * 1000) },
  });
  if (!ok.count) throw new HttpError(409, t("A round is already running"));
  await prisma.drivePartyMember.updateMany({ where: { partyId: p.id }, data: { score: 0, place: null, reward: null } });
  // Everyone lines up on the start grid: their game position moves there too, so the
  // play-from-home speed check doesn't refuse the next report.
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, remotePlay: true, role: true } });
  for (const x of users) {
    const spot = gridSpot(start, ids.indexOf(x.id));
    await prisma.driveState.updateMany({ where: { userId: x.id }, data: { lat: spot.lat, lng: spot.lng, alt: 0, yaw: spot.yaw, speed: 0 } });
    if (x.remotePlay || canSimulate(x.role)) await prisma.user.update({ where: { id: x.id }, data: { lastLat: spot.lat, lastLng: spot.lng, locAt: new Date() } });
  }
  for (const id of ids)
    if (id !== u.id) await notify(id, () => ({ kind: "event", title: t("{emoji} {game} is starting!", { emoji: def.emoji, game: t(def.name) }) }));
  return (await loadParty(p.id))!;
}

/** Apply one player's move to the running round. Retries on a concurrent write. */
async function playStep(p: PartyWithMembers, userId: string, from: DriveState, to: LatLng, vehicle: VehicleKey): Promise<PartyWithMembers> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = stateOf(p);
    const now = Date.now();
    if (!s || p.status !== "LIVE" || !p.startsAt || now < p.startsAt.getTime() || !s.ids.includes(userId)) return p;
    if (PARTY_GAMES[s.game].groundOnly && VEHICLES[vehicle].flies) return p;
    const next: PartyState = JSON.parse(JSON.stringify(s));
    let changed = false;
    if (s.game === "race" && s.cps && next.finished[userId] == null) {
      const i = next.progress[userId] ?? 0;
      if (i < s.cps.length && segDist(s.cps[i], from, to) <= CHECKPOINT_M) {
        next.progress[userId] = i + 1;
        if (i + 1 === s.cps.length) next.finished[userId] = now - p.startsAt.getTime();
        changed = true;
      }
    } else if (s.game === "coins" && s.coins) {
      s.coins.forEach((c, i) => {
        if (next.taken![i] || segDist(c, from, to) > COIN_M) return;
        next.taken![i] = userId;
        next.progress[userId] = (next.progress[userId] ?? 0) + 1;
        changed = true;
      });
    } else if (s.game === "tag" && s.it && now - (s.lastTagAt ?? 0) > TAG_COOLDOWN_MS) {
      const fresh = await prisma.driveState.findMany({ where: { userId: { in: s.ids.filter((id) => id !== userId) }, updatedAt: { gt: new Date(now - 3000) } } });
      const touching = fresh.filter((o) => !VEHICLES[o.vehicle as VehicleKey]?.flies && segDist(o, from, to) <= TAG_M);
      const newIt = s.it === userId ? touching[0]?.userId : touching.some((o) => o.userId === s.it) ? userId : undefined;
      if (newIt) {
        next.itMs![s.it] = (next.itMs![s.it] ?? 0) + Math.max(0, now - Math.max(s.itSince ?? now, p.startsAt.getTime()));
        next.it = newIt;
        next.itSince = now;
        next.lastTagAt = now;
        changed = true;
      }
    }
    if (!changed) return p;
    const ok = await prisma.driveParty.updateMany({ where: { id: p.id, version: p.version }, data: { state: next as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
    const fresh = await loadParty(p.id);
    if (!fresh) return p;
    if (ok.count) return fresh;
    p = fresh; // someone else wrote first: replay this move on their state
  }
  return p;
}

/** End a finished round (pay out once), drop players who left. Safe from any request. */
async function tickParty(p: PartyWithMembers): Promise<PartyWithMembers> {
  const now = Date.now();
  const s = stateOf(p);
  if (p.status === "LIVE" && s && p.startsAt && p.endsAt) {
    const done =
      now >= p.endsAt.getTime() ||
      (s.game === "race" && s.ids.every((id) => s.finished[id] != null || !p.members.some((m) => m.userId === id))) ||
      (s.game === "coins" && !!s.coins && Object.keys(s.taken ?? {}).length >= s.coins.length);
    if (done) await endRound(p, s);
    return (await loadParty(p.id)) ?? p;
  }
  if (p.status !== "LIVE" && now - p.updatedAt.getTime() > 30_000) {
    const states = await prisma.driveState.findMany({ where: { userId: { in: p.members.map((m) => m.userId) } }, select: { userId: true, updatedAt: true } });
    const seen = new Map(states.map((x) => [x.userId, x.updatedAt.getTime()]));
    for (const m of p.members) if (now - (seen.get(m.userId) ?? m.joinedAt.getTime()) > PARTY_IDLE_MS) await leaveParty(m.userId);
    return (await loadParty(p.id)) ?? p;
  }
  return p;
}

async function endRound(p: PartyWithMembers, s: PartyState) {
  // Only the request that flips LIVE → ENDED pays out.
  const ok = await prisma.driveParty.updateMany({ where: { id: p.id, version: p.version, status: "LIVE" }, data: { status: "ENDED", version: { increment: 1 }, endsAt: new Date() } });
  if (!ok.count) return;
  const players = s.ids.filter((id) => p.members.some((m) => m.userId === id));
  const table = standings(s, players, p.startsAt!.getTime());
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  for (const row of table) {
    const paid = await prisma.drivePartyMember.count({ where: { userId: row.userId, rewardedAt: { gte: dayStart } } });
    const prize = paid < PARTY_REWARDS_PER_DAY ? partyPrize(s.game, row.place, table.length, row.score) : null;
    if (prize) await grant(row.userId, { coins: prize.coins, xp: prize.xp });
    const medal = row.place === 1 ? "🥇" : row.place === 2 ? "🥈" : row.place === 3 ? "🥉" : `#${row.place}`;
    await prisma.drivePartyMember.updateMany({
      where: { partyId: p.id, userId: row.userId },
      data: { score: row.score, place: row.place, reward: prize ? `${medal} +${prize.coins}🪙 +${prize.xp} XP` : medal, ...(prize ? { rewardedAt: new Date() } : {}) },
    });
  }
}

function partyView(p: PartyWithMembers, userId: string, others: OtherDriver[]): PartyView {
  const s = stateOf(p);
  const seen = new Map(others.map((o) => [o.id, o]));
  const startsAt = p.startsAt?.getTime() ?? null;
  const idx = s?.ids.indexOf(userId) ?? -1;
  const warp = s && startsAt && idx >= 0 && p.status === "LIVE" && Date.now() < startsAt + WARP_WINDOW_MS ? { ...gridSpot(s.start, idx), round: s.round } : null;
  return {
    id: p.id,
    code: p.code,
    hostId: p.hostId,
    game: (p.game as PartyGame) ?? "race",
    status: p.status as PartyView["status"],
    startsAt,
    endsAt: p.endsAt?.getTime() ?? null,
    members: p.members.map((m) => ({
      userId: m.userId, name: m.name, avatar: m.avatar, vehicle: seen.get(m.userId)?.vehicle ?? null, score: m.score, place: m.place, reward: m.reward,
      online: m.userId === userId || seen.has(m.userId),
    })),
    state: s,
    warp,
  };
}

export async function partyViewFor(userId: string) {
  const p = await myParty(userId);
  if (!p) return null;
  const ticked = await tickParty(p);
  const states = await prisma.driveState.findMany({ where: { userId: { in: ticked.members.map((m) => m.userId) }, updatedAt: { gt: new Date(Date.now() - FRESH_MS) } } });
  return partyView(ticked, userId, states.map((r) => ({ id: r.userId, vehicle: r.vehicle }) as OtherDriver));
}
