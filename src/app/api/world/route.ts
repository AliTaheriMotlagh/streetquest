// Everything on the map around the player, in one call. The map shows money and store
// missions — the nearest S.mapMaxItems of them, admin drops and featured businesses
// first — every real place around (spots: restaurants, cafés, shops, parks… within
// S.mapPlacesRadiusM, tap for the menu) and other players. The rest feeds the panels
// (jobs, market…).
import { prisma } from "@/lib/db";
import { bbox, dayPhase, distanceM, solarHour, type LatLng } from "@/lib/geo";
import { S } from "@/lib/settings";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { onlineSince } from "@/server/hub";
import { HttpError, route } from "@/server/http";
import { friendIds } from "@/server/rooms";
import { fuzzed } from "@/server/presence";
import { drawDue, lotteryView } from "@/server/lottery";
import { RIDE_REQUEST_TTL_MS } from "@/lib/rides";
import { LOTTERY_SHOW_DRAWN_MS } from "@/lib/lottery";
import { shopsInBox } from "@/server/shops";
import { t } from "@/lib/i18n";
import { missionsAround } from "@/server/places";
import { placesNear } from "@/server/city";
import { bizAround } from "@/server/business";
import { moneyFor } from "@/server/money";
import { tierAmount } from "@/lib/money";
import { placeToman } from "@/lib/places";

/** An anchor further than this from the player is stale: rank from the player instead. */
const ANCHOR_MAX_M = 400;

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  // Number(null) is 0: a missing param would quietly load the map at 0,0.
  const here = { lat: Number(sp.get("lat") ?? NaN), lng: Number(sp.get("lng") ?? NaN) };
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng) || Math.abs(here.lat) > 90 || Math.abs(here.lng) > 180) throw new HttpError(400, t("lat/lng required"));
  // What's "nearest" is measured from an anchor the client keeps still while the player
  // walks around one spot (?alat&alng), so the chosen few don't reshuffle — and markers don't
  // vanish — on every refresh. Ignored when it's far from the player.
  const anchor = { lat: Number(sp.get("alat") ?? NaN), lng: Number(sp.get("alng") ?? NaN) };
  const from = Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng) && distanceM(here, anchor) <= ANCHOR_MAX_M ? anchor : here;
  const now = new Date();

  const near = bbox(here, 1500);
  const wide = bbox(here, S.viewRadiusKm * 1000);
  const inBox = (b: ReturnType<typeof bbox>) => ({ lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } });

  await drawDue({ near: wide });
  const [real, money, businesses, notes, events, deliveries, friends, nearbyUsers, rides, lotteries, shops, around] = await Promise.all([
    missionsAround(here),
    moneyFor(u, here),
    bizAround(here, u.id),
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
    prisma.ride.findMany({
      where: { status: "REQUESTED", riderId: { not: u.id }, createdAt: { gt: new Date(Date.now() - RIDE_REQUEST_TTL_MS) }, pickupLat: { gte: wide.minLat, lte: wide.maxLat }, pickupLng: { gte: wide.minLng, lte: wide.maxLng } },
      include: { rider: { select: { username: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.lottery.findMany({
      where: { ...inBox(wide), OR: [{ status: "OPEN" }, { drawnAt: { gt: new Date(Date.now() - LOTTERY_SHOW_DRAWN_MS) } }] },
      include: { host: { select: { username: true } }, winner: { select: { username: true } }, tickets: { select: { userId: true, qty: true } } },
      orderBy: { drawAt: "asc" },
      take: 30,
    }),
    shopsInBox(wide, u.id),
    S.mapPlacesRadiusM > 0 && S.mapMaxPlaces > 0 ? placesNear(here, S.mapPlacesRadiusM, Math.round(S.mapMaxPlaces)) : Promise.resolve([]),
  ]);
  const placeDone = new Set((await prisma.claim.findMany({ where: { userId: u.id, spawnId: { in: real.missions.map((m) => m.id) } }, select: { spawnId: true } })).map((c) => c.spawnId));

  // ---- what the map shows: the nearest few things to pick up or do
  // A business that claimed an OpenStreetMap place stands in for it on the map.
  const claimedOsm = new Set(businesses.map((b) => b.osmId).filter(Boolean));
  const openBiz = businesses.filter((b) => b.mine || b.campaigns.some((c) => !c.visited));
  const places = real.missions.filter((m) => !claimedOsm.has(m.place.id) && !placeDone.has(m.id)).map((m) => ({ ...m, done: false, toman: placeToman(m.kind, u.remotePlay) }));
  type Item = { kind: "money" | "place" | "biz"; id: string; at: LatLng; worth?: number };
  // Bigger money is worth walking further for: 4× the toman counts as half the distance.
  const dist = (x: Item) => distanceM(from, x.at) / Math.sqrt(Math.max(1, x.worth ?? 1));
  const first: Item[] = [...money.priority.map((m) => ({ kind: "money" as const, id: m.id, at: m })), ...openBiz.filter((b) => b.featured || b.mine).map((b) => ({ kind: "biz" as const, id: b.id, at: b }))];
  const rest: Item[] = [
    ...money.rest.map((m) => ({ kind: "money" as const, id: m.id, at: m, worth: tierAmount(m.tier) / Math.max(1, S.moneyGps) })),
    ...places.map((m) => ({ kind: "place" as const, id: m.id, at: m.place })),
    ...openBiz.filter((b) => !b.featured && !b.mine).map((b) => ({ kind: "biz" as const, id: b.id, at: b })),
  ].sort((a, b) => dist(a) - dist(b));
  const shown = [...first, ...rest].slice(0, Math.max(1, Math.round(S.mapMaxItems)));
  const pick = (kind: Item["kind"]) => new Set(shown.filter((x) => x.kind === kind).map((x) => x.id));
  const [moneyIds, placeIds, bizIds] = [pick("money"), pick("place"), pick("biz")];

  // Notes unlock only when the *server-trusted* position (from /api/loc) is inside their radius.
  const trusted = u.lastLat != null && u.lastLng != null && u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 120_000 ? { lat: u.lastLat, lng: u.lastLng } : null;

  const friendSet = new Set(friends);
  const players = nearbyUsers
    .map((x) => ({ ...x, lat: x.lastLat!, lng: x.lastLng! }))
    .filter((x) => distanceM(here, x) < 3000)
    .slice(0, 100)
    .map((x) => {
      const friend = friendSet.has(x.id);
      // Strangers are shown 60–150 m off for privacy; players right next to you come
      // exact (and live) with your own /api/loc reports instead.
      const at = friend ? { lat: x.lat, lng: x.lng } : fuzzed(x.id, x);
      return { id: x.id, username: x.username, avatar: x.avatar, level: levelForXp(x.xp), friend, home: x.remotePlay, lat: at.lat, lng: at.lng };
    });

  return {
    serverTime: now.getTime(),
    phase: dayPhase(here),
    solarHour: solarHour(here),
    money: [...money.priority, ...money.rest].filter((m) => moneyIds.has(m.id)),
    places: places.filter((m) => placeIds.has(m.id)),
    // Every other real place around: a plain sign (a business that claimed one stands in for it).
    spots: around.filter((p) => !claimedOsm.has(p.id)).map(({ id, name, cat, lat, lng }) => ({ id, name, cat, lat, lng })),
    businesses: businesses.filter((b) => bizIds.has(b.id)),
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
    rides: rides.map(({ pin: _p, ...r }) => ({ ...r, distanceM: Math.round(distanceM(here, { lat: r.pickupLat, lng: r.pickupLng })) })),
    lotteries: lotteries.map((l) => lotteryView(l, u.id)),
    shops,
    players,
    onlineNearby: nearbyUsers.length,
  };
});
