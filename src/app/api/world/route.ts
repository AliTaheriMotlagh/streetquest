// Everything on the map around the player, in one call.
import { prisma } from "@/lib/db";
import { bbox, dayPhase, distanceM, solarHour } from "@/lib/geo";
import { spawnsAround } from "@/lib/spawns";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { requireUser } from "@/server/auth";
import { hub } from "@/server/hub";
import { HttpError, route } from "@/server/http";
import { friendIds } from "@/server/rooms";

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const here = { lat: Number(sp.get("lat")), lng: Number(sp.get("lng")) };
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng)) throw new HttpError(400, "lat/lng required");
  const now = new Date();

  const spawns = spawnsAround(here);
  const claimed = new Set(
    (await prisma.claim.findMany({ where: { userId: u.id, spawnId: { in: spawns.map((s) => s.id) } }, select: { spawnId: true } })).map(
      (c) => c.spawnId,
    ),
  );

  const near = bbox(here, 1500);
  const wide = bbox(here, 8000);
  const inBox = (b: ReturnType<typeof bbox>, prefix = "") => ({
    [`${prefix}lat`]: { gte: b.minLat, lte: b.maxLat },
    [`${prefix}lng`]: { gte: b.minLng, lte: b.maxLng },
  });

  const [missions, notes, events, deliveries, friends] = await Promise.all([
    prisma.adminMission.findMany({ where: { ...inBox(near), activeFrom: { lte: now }, activeTo: { gte: now } } }),
    prisma.geoNote.findMany({
      where: { ...inBox(near), hidden: false, expiresAt: { gt: now } },
      include: { author: { select: { username: true, avatar: true } } },
      take: 100,
    }),
    prisma.event.findMany({
      where: { ...inBox(wide), endsAt: { gt: now }, OR: [{ isPublic: true }, { participants: { some: { userId: u.id } } }] },
      include: { _count: { select: { participants: true } } },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
    prisma.delivery.findMany({
      where: { status: "OPEN", pickupLat: { gte: wide.minLat, lte: wide.maxLat }, pickupLng: { gte: wide.minLng, lte: wide.maxLng } },
      include: { sender: { select: { username: true } } },
      take: 50,
    }),
    friendIds(u.id),
  ]);
  const missionClaims = new Set(
    (await prisma.claim.findMany({ where: { userId: u.id, spawnId: { in: missions.map((m) => `m:${m.id}`) } } })).map((c) => c.spawnId),
  );

  // Notes unlock only when the *server-trusted* position is inside their radius.
  const p = hub.presence.get(u.id);
  const trusted = p && Date.now() - p.at < 120_000 ? p : null;

  const friendSet = new Set(friends);
  const players = [...hub.presence.values()]
    .filter((x) => x.userId !== u.id && x.sockets > 0 && x.at && Date.now() - x.at < 300_000 && distanceM(here, x) < 3000)
    .slice(0, 100)
    .map((x) => {
      const friend = friendSet.has(x.userId);
      // Strangers are shown with ~150m of fuzz for privacy.
      const fuzz = friend ? 0 : 0.0013;
      const r = (s: string) => ((parseInt(s.slice(-4), 36) % 1000) / 1000 - 0.5) * 2 * fuzz;
      return { id: x.userId, username: x.username, avatar: x.avatar, level: x.level, friend, lat: x.lat + r(x.userId), lng: x.lng + r(x.userId + "x") };
    });

  return {
    serverTime: now.getTime(),
    phase: dayPhase(here),
    solarHour: solarHour(here),
    spawns: spawns.map((s) => ({ ...s, claimed: claimed.has(s.id) })),
    missions: missions.map((m) => ({ ...m, item: ITEM_BY_KEY[m.itemKey], claimed: missionClaims.has(`m:${m.id}`) })),
    notes: notes.map((n) => {
      const unlocked = n.authorId === u.id || (trusted ? distanceM(trusted, n) <= n.radiusM : false);
      return {
        id: n.id,
        lat: n.lat,
        lng: n.lng,
        radiusM: n.radiusM,
        author: n.author,
        createdAt: n.createdAt,
        expiresAt: n.expiresAt,
        unlocked,
        body: unlocked ? n.body : null,
      };
    }),
    events: events.map((e) => ({ ...e, participants: e._count.participants })),
    deliveries: deliveries
      .filter((d) => d.senderId !== u.id)
      .map(({ dropoffCode: _c, ...d }) => ({ ...d, distanceM: Math.round(distanceM(here, { lat: d.pickupLat, lng: d.pickupLng })) })),
    players,
  };
});
