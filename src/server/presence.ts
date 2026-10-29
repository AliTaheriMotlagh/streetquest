// Where other players appear on your map.
//
//  - Strangers further away are shown 60–150 m off their real spot. The offset is keyed
//    with a server secret and changes daily, so it can't be undone from the user id the
//    client receives (the old offset was computed from the id alone).
//  - Players physically near you (real GPS on your side) are sent back exact and live
//    with every /api/loc report: two people in the same car see each other together.
import { createHash } from "node:crypto";
import { prisma } from "../lib/db";
import { bbox, distanceM, offset, type LatLng } from "../lib/geo";
import { levelForXp } from "../lib/progression";
import { serverKey } from "./session";
import { onlineSince } from "./hub";
import { friendIds } from "./rooms";

/** Closer than this, privacy fuzz is pointless: you can see each other. */
export const NEAR_EXACT_M = 120;
const NEAR_FRESH_MS = 30_000;
const FUZZ_MIN_M = 60;
const FUZZ_MAX_M = 150;

const KEY = serverKey("presence-fuzz");

/** A stable-for-the-day, unguessable offset for one player. */
export function fuzzed(id: string, p: LatLng, now = Date.now()): LatLng {
  const day = Math.floor(now / 86_400_000);
  const h = createHash("sha256").update(`${KEY}|${id}|${day}`).digest();
  const u1 = h.readUInt32BE(0) / 2 ** 32;
  const u2 = h.readUInt32BE(4) / 2 ** 32;
  return offset(p, FUZZ_MIN_M + u1 * (FUZZ_MAX_M - FUZZ_MIN_M), u2 * 360);
}

/** Everyone actively reporting within NEAR_EXACT_M of `here`, exact. */
export async function nearbyLive(userId: string, here: LatLng) {
  const box = bbox(here, NEAR_EXACT_M);
  const rows = await prisma.user.findMany({
    where: {
      id: { not: userId },
      banned: false,
      lastSeenAt: { gt: new Date(Date.now() - NEAR_FRESH_MS) },
      lastLat: { gte: box.minLat, lte: box.maxLat },
      lastLng: { gte: box.minLng, lte: box.maxLng },
    },
    select: { id: true, username: true, avatar: true, xp: true, lastLat: true, lastLng: true, locAt: true, lastSeenAt: true, remotePlay: true },
    take: 20,
  });
  return rows
    .filter((r) => r.lastLat != null && r.lastLng != null && distanceM(here, { lat: r.lastLat, lng: r.lastLng }) <= NEAR_EXACT_M)
    .map((r) => ({
      id: r.id,
      username: r.username,
      avatar: r.avatar,
      level: levelForXp(r.xp),
      home: r.remotePlay,
      lat: r.lastLat!,
      lng: r.lastLng!,
      // When this position was taken (accepted), for extrapolation on the client.
      at: (r.locAt ?? r.lastSeenAt ?? new Date()).getTime(),
    }));
}

// ---------------------------------------------------------------- who's online
/** The "Online now" list reaches this far for players who aren't your friends. */
export const ONLINE_LIST_M = 5000;
/** Strangers' distances come in steps this big (and from their fuzzed spot), friends' in 100 m. */
const STRANGER_STEP_M = 250;
const FRIEND_STEP_M = 100;
let counted = { at: 0, n: 0 };

/** Players online right now, counted at most every 30 s (every world poll shows it). */
export async function onlineCount() {
  if (Date.now() - counted.at < 30_000) return counted.n;
  const n = await prisma.user.count({ where: { banned: false, lastSeenAt: { gt: onlineSince() } } });
  counted = { at: Date.now(), n };
  return n;
}

export type OnlinePlayer = { id: string; username: string; avatar: string; level: number; friend: boolean; home: boolean; distM: number | null };

/**
 * Who's online, for the "Online now" list: friends anywhere first, then players within
 * ONLINE_LIST_M of where the server last saw you, nearest first. Never a position. A
 * stranger's distance is measured to their fuzzed spot and rounded to 250 m, so moving
 * around (test mode teleports) can't triangulate where they really are.
 */
export async function onlineAround(userId: string, here: LatLng | null): Promise<{ total: number; players: OnlinePlayer[] }> {
  const friends = new Set(await friendIds(userId));
  const box = here ? bbox(here, ONLINE_LIST_M) : null;
  const rows = await prisma.user.findMany({
    where: {
      id: { not: userId },
      banned: false,
      lastSeenAt: { gt: onlineSince() },
      OR: [{ id: { in: [...friends] } }, ...(box ? [{ lastLat: { gte: box.minLat, lte: box.maxLat }, lastLng: { gte: box.minLng, lte: box.maxLng } }] : [])],
    },
    select: { id: true, username: true, avatar: true, xp: true, lastLat: true, lastLng: true, remotePlay: true },
    take: 300,
  });
  const players = rows
    .map((r) => {
      const friend = friends.has(r.id);
      const at = r.lastLat != null && r.lastLng != null ? { lat: r.lastLat, lng: r.lastLng } : null;
      const step = friend ? FRIEND_STEP_M : STRANGER_STEP_M;
      const d = here && at ? distanceM(here, friend ? at : fuzzed(r.id, at)) : null;
      return { id: r.id, username: r.username, avatar: r.avatar, level: levelForXp(r.xp), friend, home: r.remotePlay, distM: d == null ? null : Math.max(step, Math.round(d / step) * step) };
    })
    .filter((p) => p.friend || (p.distM != null && p.distM <= ONLINE_LIST_M))
    .sort((a, b) => Number(b.friend) - Number(a.friend) || (a.distM ?? Infinity) - (b.distM ?? Infinity))
    .slice(0, 60);
  return { total: await onlineCount(), players };
}
