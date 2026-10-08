// Everything on the map around the player, in one call.
import { prisma } from "@/lib/db";
import { bbox, dayPhase, distanceM, solarHour } from "@/lib/geo";
import { spawnsAround } from "@/lib/spawns";
import { S } from "@/lib/settings";
import { bossesAround } from "@/lib/bosses";
import { effectiveLevel, factionOf, levelOf, type Army } from "@/lib/rts";
import { squadIcon } from "@/lib/td";
import { resolveWaves, scheduleWaves, settleSquads } from "@/server/td";
import { resolveStrikes } from "@/server/superweapons";
import { CAPTURE_SECONDS } from "@/lib/flags";
import { outpostsAround } from "@/lib/outposts";
import { researchDone } from "@/server/hero";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { isOnline, onlineSince } from "@/server/hub";
import { HttpError, route } from "@/server/http";
import { friendIds } from "@/server/rooms";

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  // Number(null) is 0: a missing param would quietly load the map at 0,0.
  const here = { lat: Number(sp.get("lat") ?? NaN), lng: Number(sp.get("lng") ?? NaN) };
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng) || Math.abs(here.lat) > 90 || Math.abs(here.lng) > 180) throw new HttpError(400, "lat/lng required");
  const now = new Date();

  const spawns = spawnsAround(here);
  const claimed = new Set(
    (await prisma.claim.findMany({ where: { userId: u.id, spawnId: { in: spawns.map((s) => s.id) } }, select: { spawnId: true } })).map(
      (c) => c.spawnId,
    ),
  );

  const near = bbox(here, 1500);
  const wide = bbox(here, S.viewRadiusKm * 1000);
  const inBox = (b: ReturnType<typeof bbox>, prefix = "") => ({
    [`${prefix}lat`]: { gte: b.minLat, lte: b.maxLat },
    [`${prefix}lng`]: { gte: b.minLng, lte: b.maxLng },
  });

  // Lazy settlement: squads that arrived, raider waves that finished.
  await settleSquads({ near: here });
  await resolveStrikes({ near: here });
  const bosses = bossesAround(here);
  const sites = outpostsAround(here);
  const [missions, notes, events, deliveries, friends, nearbyUsers, bases, bossStates, outpostRows, research] = await Promise.all([
    prisma.adminMission.findMany({ where: { ...inBox(near), activeFrom: { lte: now }, activeTo: { gte: now } } }),
    prisma.geoNote.findMany({
      where: { ...inBox(near), hidden: false, expiresAt: { gt: now } },
      // never load photo bytes here — they're served separately to players on the spot
      select: { id: true, authorId: true, lat: true, lng: true, radiusM: true, body: true, photoType: true, likes: true, createdAt: true, expiresAt: true, author: { select: { username: true, avatar: true } } },
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
      select: { id: true, username: true, avatar: true, xp: true, lastLat: true, lastLng: true, remotePlay: true },
      take: 200,
    }),
    prisma.base.findMany({
      where: { lat: { gte: wide.minLat, lte: wide.maxLat }, lng: { gte: wide.minLng, lte: wide.maxLng } },
      include: { buildings: true, owner: { select: { id: true, username: true, avatar: true, faction: true, lastSeenAt: true } } },
      take: 150,
    }),
    prisma.bossState.findMany({ where: { bossId: { in: bosses.map((b) => b.id) } } }),
    prisma.outpost.findMany({ where: { id: { in: sites.map((s) => s.id) } }, include: { owner: { select: { id: true, username: true, faction: true } } } }),
    researchDone(u.id),
  ]);
  const opBy = new Map(outpostRows.map((o) => [o.id, o]));
  const nearBases = bases.filter((b) => distanceM(here, b) < 2000);
  await scheduleWaves(nearBases);
  await resolveWaves(nearBases.map((b) => b.id));
  const sq = bbox(here, 5000);
  const strikes = await prisma.superstrike.findMany({
    where: { ...inBox(wide), OR: [{ resolvedAt: null }, { hazardUntil: { gt: now } }, { resolvedAt: { gt: new Date(Date.now() - 20_000) } }] },
    include: { owner: { select: { username: true } } },
    take: 20,
  });
  const [flags, bounties] = await Promise.all([
    prisma.flag.findMany({ where: inBox(bbox(here, 3000)), include: { owner: { select: { username: true, avatar: true, faction: true } } }, take: 100 }),
    prisma.bounty.groupBy({ by: ["targetId"], where: { claimedAt: null, targetId: { in: nearbyUsers.map((x) => x.id) } }, _sum: { amount: true } }),
  ]);
  const wanted = new Map(bounties.map((b) => [b.targetId, b._sum.amount ?? 0]));
  const [towers, squads, waves, pings, lobbies] = await Promise.all([
    prisma.tower.findMany({ where: inBox(bbox(here, 3000)), include: { owner: { select: { username: true, faction: true } } }, take: 300 }),
    prisma.squad.findMany({
      where: { OR: [{ ownerId: u.id }, { toLat: { gte: sq.minLat, lte: sq.maxLat }, toLng: { gte: sq.minLng, lte: sq.maxLng } }, { fromLat: { gte: sq.minLat, lte: sq.maxLat }, fromLng: { gte: sq.minLng, lte: sq.maxLng } }] },
      include: { owner: { select: { username: true, faction: true } } },
      take: 200,
    }),
    prisma.wave.findMany({
      where: { baseId: { in: bases.map((b) => b.id) }, OR: [{ resolvedAt: null }, { resolvedAt: { gt: new Date(Date.now() - 3 * 60_000) } }] },
      orderBy: { startAt: "asc" },
    }),
    prisma.ping.findMany({ where: { ...inBox(wide), expiresAt: { gt: now }, userId: { in: [u.id, ...friends] } }, include: { user: { select: { username: true, avatar: true } } }, take: 50 }),
    prisma.lobby.findMany({ where: { ...inBox(near), status: "OPEN", openUntil: { gt: now } }, include: { _count: { select: { players: true } } } }),
  ]);
  const lobbyBy = new Map(lobbies.map((l) => [l.spawnId, { id: l.id, kind: l.kind, players: l._count.players, openUntil: l.openUntil.getTime() }]));
  const radar = research.includes("radar");
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
      return { id: x.id, username: x.username, avatar: x.avatar, level: levelForXp(x.xp), friend, bounty: wanted.get(x.id) ?? 0, home: x.remotePlay, lat: x.lat + r(x.id), lng: x.lng + r(x.id + "x") };
    });

  return {
    serverTime: now.getTime(),
    phase: dayPhase(here),
    solarHour: solarHour(here),
    spawns: spawns.map((s) => ({ ...s, claimed: claimed.has(s.id), lobby: lobbyBy.get(s.id) ?? null })),
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
        hasPhoto: !!n.photoType,
        likes: n.likes,
        mine: n.authorId === u.id,
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
      buildings: b.buildings.map((x) => ({ type: x.type, level: effectiveLevel(x), building: x.readyAt > now })).filter((x) => x.level > 0 || x.building),
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
    towers: towers.map((t) => ({
      id: t.id,
      type: t.type,
      level: t.level,
      lat: t.lat,
      lng: t.lng,
      hp: t.hp,
      kills: t.kills,
      readyAt: t.readyAt.getTime(),
      ownerId: t.ownerId,
      owner: t.owner.username,
      faction: t.owner.faction,
      mine: t.ownerId === u.id,
      friend: friendSet.has(t.ownerId),
    })),
    squads: squads.map((q) => ({
      id: q.id,
      ownerId: q.ownerId,
      owner: q.owner.username,
      faction: q.owner.faction,
      mine: q.ownerId === u.id,
      friend: friendSet.has(q.ownerId),
      // Enemy squad composition is fog-of-war unless you have radar.
      units: q.ownerId === u.id || friendSet.has(q.ownerId) || radar ? (q.units as Army) : null,
      size: Object.values(q.units as Army).reduce((a, n) => a + (n ?? 0), 0),
      icon: squadIcon(q.units as Army),
      fromLat: q.fromLat,
      fromLng: q.fromLng,
      toLat: q.toLat,
      toLng: q.toLng,
      departAt: q.departAt.getTime(),
      arriveAt: q.arriveAt.getTime(),
      order: q.order,
      status: q.status,
      targetKind: q.ownerId === u.id ? q.targetKind : null,
      targetId: q.ownerId === u.id ? q.targetId : null,
    })),
    waves: waves.map((w) => {
      const b = bases.find((x) => x.id === w.baseId)!;
      return { id: w.id, baseId: w.baseId, ownerId: b.ownerId, baseLat: b.lat, baseLng: b.lng, seed: w.seed, hq: w.hq, boost: w.boost, startAt: w.startAt.getTime(), endAt: w.endAt.getTime(), strikes: w.strikes, result: w.result, resolved: !!w.resolvedAt };
    }),
    flags: flags.map((f) => ({
      id: f.id,
      name: f.name,
      lat: f.lat,
      lng: f.lng,
      owner: f.owner.username,
      ownerAvatar: f.owner.avatar,
      faction: f.owner.faction,
      mine: f.ownerId === u.id,
      friend: friendSet.has(f.ownerId),
      heldSince: f.heldSince.getTime(),
      captures: f.captures,
      capture: f.captureStartedAt ? { by: f.captureName, mine: f.captureById === u.id, endsAt: f.captureStartedAt.getTime() + CAPTURE_SECONDS * 1000 } : null,
      shielded: !!f.shieldUntil && f.shieldUntil > now,
    })),
    strikes: strikes.map((x) => ({ id: x.id, kind: x.kind, lat: x.lat, lng: x.lng, radius: x.radius, launchAt: x.launchAt.getTime(), impactAt: x.impactAt.getTime(), hazardUntil: x.hazardUntil?.getTime() ?? null, resolved: !!x.resolvedAt, mine: x.ownerId === u.id, owner: x.owner.username })),
    pings: pings.map((p) => ({ id: p.id, kind: p.kind, lat: p.lat, lng: p.lng, expiresAt: p.expiresAt.getTime(), mine: p.userId === u.id, by: p.user.username, avatar: p.user.avatar })),
    outposts: sites.map((s) => {
      const o = opBy.get(s.id);
      const mine = o?.ownerId === u.id;
      const garrison = (o?.garrison as Army | undefined) ?? {};
      const size = Object.values(garrison).reduce((a, q) => a + (q ?? 0), 0);
      return {
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        owner: o?.owner ? { id: o.owner.id, username: o.owner.username, faction: o.owner.faction } : null,
        mine,
        shielded: !!o?.shieldUntil && o.shieldUntil > now,
        // Your own garrisons are always visible; Radar Uplink reveals everyone else's.
        garrison: mine || radar ? garrison : null,
        garrisonSize: o?.ownerId ? (mine || radar ? String(size) : size === 0 ? "empty?" : size < 10 ? "light" : size < 30 ? "medium" : "heavy") : null,
        guard: o?.ownerId ? null : s.guard,
      };
    }),
  };
});
