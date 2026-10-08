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
