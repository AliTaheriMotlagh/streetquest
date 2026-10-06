// Everything on the map around the player, in one call.
import { prisma } from "@/lib/db";
import { bbox, dayPhase, distanceM, solarHour } from "@/lib/geo";
import { spawnsAround } from "@/lib/spawns";
import { bossesAround } from "@/lib/bosses";
import { factionOf, levelOf } from "@/lib/rts";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { isOnline, onlineSince } from "@/server/hub";
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

  const bosses = bossesAround(here);
  const [missions, notes, events, deliveries, friends, nearbyUsers, bases, bossStates] = await Promise.all([
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
    prisma.user.findMany({
      where: { id: { not: u.id }, banned: false, lastSeenAt: { gt: onlineSince() }, lastLat: { gte: wide.minLat, lte: wide.maxLat }, lastLng: { gte: wide.minLng, lte: wide.maxLng } },
      select: { id: true, username: true, avatar: true, xp: true, lastLat: true, lastLng: true },
      take: 200,
    }),
    prisma.base.findMany({
      where: { lat: { gte: wide.minLat, lte: wide.maxLat }, lng: { gte: wide.minLng, lte: wide.maxLng } },
      include: { buildings: true, owner: { select: { id: true, username: true, avatar: true, faction: true, lastSeenAt: true } } },
      take: 150,
    }),
    prisma.bossState.findMany({ where: { bossId: { in: bosses.map((b) => b.id) } } }),
  ]);
  const liveMatches = await prisma.match.findMany({
    where: { status: "LIVE", endsAt: { gt: now }, targetId: { in: [...bases.map((b) => b.id), ...bosses.map((b) => b.id)] } },
    select: { id: true, targetId: true },
  });
  const liveBy = new Map(liveMatches.map((m) => [m.targetId, m.id]));
  const bossBy = new Map(bossStates.map((s) => [s.bossId, s]));
  const missionClaims = new Set(
    (await prisma.claim.findMany({ where: { userId: u.id, spawnId: { in: missions.map((m) => `m:${m.id}`) } } })).map((c) => c.spawnId),
  );

  // Notes unlock only when the *server-trusted* position (from /api/loc) is inside their radius.
  const trusted = u.lastLat != null && u.lastLng != null && u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 120_000 ? { lat: u.lastLat, lng: u.lastLng } : null;

  const friendSet = new Set(friends);
  const players = nearbyUsers
    .map((x) => ({ ...x, lat: x.lastLat!, lng: x.lastLng! }))
    .filter((x) => distanceM(here, x) < 3000)
    .slice(0, 100)
    .map((x) => {
      const friend = friendSet.has(x.id);
      // Strangers are shown with ~150m of fuzz for privacy.
      const fuzz = friend ? 0 : 0.0013;
      const r = (s: string) => ((parseInt(s.slice(-4), 36) % 1000) / 1000 - 0.5) * 2 * fuzz;
      return { id: x.id, username: x.username, avatar: x.avatar, level: levelForXp(x.xp), friend, lat: x.lat + r(x.id), lng: x.lng + r(x.id + "x") };
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
    bases: bases.map((b) => ({
      id: b.id,
      name: b.name,
      lat: b.lat,
      lng: b.lng,
      hp: b.hp,
      mine: b.ownerId === u.id,
      friend: friendSet.has(b.ownerId),
      shielded: !!b.shieldUntil && b.shieldUntil > now,
      hq: levelOf(b.buildings, "hq"),
      turrets: levelOf(b.buildings, "turret"),
      owner: { id: b.owner.id, username: b.owner.username, avatar: b.owner.avatar, online: isOnline(b.owner.lastSeenAt) },
      faction: factionOf(b.owner.faction)?.key ?? null,
      liveMatch: liveBy.get(b.id) ?? null,
    })),
    bosses: bosses
      .map((b) => {
        const st = bossBy.get(b.id);
        return { id: b.id, lat: b.lat, lng: b.lng, expiresAt: b.expiresAt, def: b.def, maxHp: b.maxHp, hp: Math.max(0, b.maxHp - (st?.damage ?? 0)), defeated: !!st?.defeatedAt, liveMatch: liveBy.get(b.id) ?? null };
      })
      .filter((b) => !b.defeated),
    onlineNearby: nearbyUsers.length,
  };
});
