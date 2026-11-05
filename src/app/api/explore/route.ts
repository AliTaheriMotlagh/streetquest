// Explore mode and visiting friends (lib/explore.ts).
//   GET  ?lat&lng       real places and players around any spot on the map — no need to be
//                       there (strangers stay fuzzed, friends exact; nothing to pick up)
//   GET  ?friend=<id>   where an online friend is right now (friends see each other exactly)
//   POST {friend}       play from home: jump next to an online friend (once every
//                       S.friendTravelMin minutes); walking players visit by exploring instead
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bbox, distanceM, offset } from "@/lib/geo";
import { S } from "@/lib/settings";
import { levelForXp } from "@/lib/progression";
import { t } from "@/lib/i18n";
import { EXPLORE_MAX_PLACES, EXPLORE_PLACES_RADIUS_M, FRIEND_LAND_M, travelWaitMin } from "@/lib/explore";
import { requireUser } from "@/server/auth";
import { onlineSince } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { placesNear } from "@/server/city";
import { fuzzed } from "@/server/presence";
import { areFriends, friendIds } from "@/server/rooms";

const num = z.coerce.number().finite();
const Query = z.union([z.object({ friend: z.string().min(1).max(40) }), z.object({ lat: num.min(-90).max(90), lng: num.min(-180).max(180) })]);

/** An online friend's spot, or a 404 that doesn't say whether they exist. */
async function friendSpot(me: string, id: string) {
  const f = id !== me && (await areFriends(me, id)) ? await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, avatar: true, lastLat: true, lastLng: true, lastSeenAt: true, remotePlay: true, banned: true } }) : null;
  if (!f || f.banned || f.lastLat == null || f.lastLng == null || !f.lastSeenAt || f.lastSeenAt < onlineSince()) throw new HttpError(404, t("That friend isn't online right now"));
  return { id: f.id, username: f.username, avatar: f.avatar, home: f.remotePlay, at: { lat: f.lastLat, lng: f.lastLng } };
}

export const GET = route(async (req) => {
  const u = await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if ("friend" in q) return friendSpot(u.id, q.friend);
  const here = { lat: q.lat, lng: q.lng };
  const box = bbox(here, 3000);
  const [spots, friends, rows] = await Promise.all([
    placesNear(here, EXPLORE_PLACES_RADIUS_M, EXPLORE_MAX_PLACES).catch(() => []),
    friendIds(u.id),
    prisma.user.findMany({
      where: { id: { not: u.id }, banned: false, lastSeenAt: { gt: onlineSince() }, lastLat: { gte: box.minLat, lte: box.maxLat }, lastLng: { gte: box.minLng, lte: box.maxLng } },
      select: { id: true, username: true, avatar: true, xp: true, lastLat: true, lastLng: true, remotePlay: true },
      take: 100,
    }),
  ]);
  const fs = new Set(friends);
  return {
    spots: spots.map(({ id, name, cat, lat, lng }) => ({ id, name, cat, lat, lng })),
    // Like the world list: strangers 60–150 m off for privacy (you aren't really there), friends exact.
    players: rows.map((x) => {
      const friend = fs.has(x.id);
      const real = { lat: x.lastLat!, lng: x.lastLng! };
      const at = friend ? real : fuzzed(x.id, real);
      return { id: x.id, username: x.username, avatar: x.avatar, level: levelForXp(x.xp), friend, home: x.remotePlay, lat: at.lat, lng: at.lng };
    }),
  };
});

const Travel = z.object({ friend: z.string().min(1).max(40) });
const travelKey = (id: string) => `travel:friend:${id}`;

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Travel);
  if (!S.remoteEnabled || S.friendTravelMin <= 0) throw new HttpError(403, t("Travelling to friends is off right now"));
  if (!u.remotePlay) throw new HttpError(409, t("Only from home: on GPS, walk there — or explore the map to look around them"));
  const f = await friendSpot(u.id, d.friend);
  // When this player last jumped (kept in ExtCache: a timestamp, no new table for one number).
  const row = await prisma.extCache.findUnique({ where: { key: travelKey(u.id) } });
  const wait = travelWaitMin(row?.fetchedAt.getTime() ?? null, S.friendTravelMin);
  if (wait > 0) throw new HttpError(429, t("You can travel to a friend again in {n} min", { n: wait }));
  // Beside them, in a direction of our own (stable per pair), so two arrivals don't stack.
  const bearing = [...`${u.id}${f.id}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const at = offset(f.at, FRIEND_LAND_M, bearing);
  const now = new Date();
  await prisma.$transaction([
    // locAt now: the next /api/loc measures travel speed from here, not from where we were.
    prisma.user.update({ where: { id: u.id }, data: { lastLat: at.lat, lastLng: at.lng, lastSeenAt: now, locAt: now, locSim: false } }),
    prisma.extCache.upsert({ where: { key: travelKey(u.id) }, create: { key: travelKey(u.id), data: { to: f.id } }, update: { data: { to: f.id }, fetchedAt: now } }),
  ]);
  return { ok: true, at, friend: { id: f.id, username: f.username }, distM: Math.round(u.lastLat != null && u.lastLng != null ? distanceM({ lat: u.lastLat, lng: u.lastLng }, at) : 0), message: t("🚀 You're next to {name}", { name: f.username }) };
});
