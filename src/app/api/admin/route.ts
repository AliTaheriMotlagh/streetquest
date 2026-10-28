import { z } from "zod";
import { cancelLottery, drawDue } from "@/server/lottery";
import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { requireAdmin } from "@/server/auth";
import { isOnline, notify, onlineSince } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";
import { saveSettings, settingOverrides } from "@/server/settings";
import { GOAL_METRICS, S, SETTING_DEFS, settingDefault, settingType } from "@/lib/settings";
import { catalogOriginals, EDITABLE } from "@/lib/config";
import { decideCashout } from "@/server/money";
import { distanceM, offset } from "@/lib/geo";
import { randomBytes } from "node:crypto";
import { ITEMS } from "@/lib/catalog";
import { stripeReady } from "@/server/store";
import { pushReady, pushTo } from "@/server/push";
import { t } from "@/lib/i18n";

const day = 86_400_000;

export const GET = route(async (req) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const since7 = new Date(Date.now() - 7 * day);
  const since1 = new Date(Date.now() - day);

  const [users, signups7, claims24, deliveryStatus, upcomingEvents, pageViews7, bySource, byCampaign, metricsDaily] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gt: since7 } } }),
    prisma.claim.count({ where: { createdAt: { gt: since1 } } }),
    prisma.delivery.groupBy({ by: ["status"], _count: true }),
    prisma.event.count({ where: { endsAt: { gt: new Date() } } }),
    prisma.metric.count({ where: { name: "page_view", createdAt: { gt: since7 } } }),
    prisma.user.groupBy({ by: ["utmSource"], _count: true, orderBy: { _count: { utmSource: "desc" } }, take: 10 }),
    prisma.user.groupBy({ by: ["utmCampaign"], _count: true, where: { utmCampaign: { not: null } }, orderBy: { _count: { utmCampaign: "desc" } }, take: 10 }),
    prisma.metric.findMany({ where: { createdAt: { gt: since7 }, name: { in: ["page_view", "signup", "claim"] } }, select: { name: true, createdAt: true } }),
  ]);

  // 7-day funnel series, bucketed by UTC day.
  const series: Record<string, { page_view: number; signup: number; claim: number }> = {};
  for (let i = 6; i >= 0; i--) series[new Date(Date.now() - i * day).toISOString().slice(0, 10)] = { page_view: 0, signup: 0, claim: 0 };
  for (const m of metricsDaily) {
    const k = m.createdAt.toISOString().slice(0, 10);
    if (series[k]) series[k][m.name as "page_view"]++;
  }

  const since30 = new Date(Date.now() - 30 * day);
  const [overrides, paid30, paidAll, ads7, adsByCreative, adClicks] = await Promise.all([
    settingOverrides(),
    prisma.purchase.aggregate({ where: { status: "PAID", paidAt: { gt: since30 } }, _sum: { amountCents: true, gems: true }, _count: true }),
    prisma.purchase.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true }, _count: true }),
    prisma.adView.count({ where: { claimedAt: { not: null }, startedAt: { gt: since7 } } }),
    prisma.adView.groupBy({ by: ["creativeId"], where: { startedAt: { gt: since30 } }, _count: true }),
    prisma.adView.groupBy({ by: ["creativeId"], where: { startedAt: { gt: since30 }, clicked: true }, _count: true }),
  ]);
  const [drops, cashouts, tomanOut, tomanPaid, tomanPending, money24] = await Promise.all([
    prisma.moneyDrop.findMany({ where: { activeTo: { gt: new Date(Date.now() - 7 * day) } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.cashout.findMany({ orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 100, include: { user: { select: { username: true, toman: true, createdAt: true } } } }),
    prisma.user.aggregate({ _sum: { toman: true } }),
    prisma.cashout.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.cashout.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.claim.aggregate({ where: { createdAt: { gt: since1 }, toman: { gt: 0 } }, _sum: { toman: true }, _count: true }),
  ]);
  // A street drop is one batch of points: show it as one row.
  const batches = new Map<string, { batch: string; label: string; sponsor: string | null; points: { lat: number; lng: number }[]; amount: number; maxClaims: number | null; claims: number; paid: number; activeFrom: Date; activeTo: Date }>();
  for (const d of drops) {
    const b = batches.get(d.batch);
    if (b) {
      b.points.push({ lat: d.lat, lng: d.lng });
      b.claims += d.claims;
      b.paid += d.paid;
      b.maxClaims = b.maxClaims == null || d.maxClaims == null ? null : b.maxClaims + d.maxClaims;
    } else batches.set(d.batch, { batch: d.batch, label: d.label, sponsor: d.sponsor, points: [{ lat: d.lat, lng: d.lng }], amount: d.amount, maxClaims: d.maxClaims, claims: d.claims, paid: d.paid, activeFrom: d.activeFrom, activeTo: d.activeTo });
  }
  const recentPurchases = await prisma.purchase.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { username: true } } } });
  const clicksBy = new Map(adClicks.map((c) => [c.creativeId, c._count]));
  const pick = (list: { key: string }[], cat: keyof typeof EDITABLE) =>
    list.map((e) => ({ key: e.key, name: (e as { name?: string }).name ?? e.key, emoji: (e as { emoji?: string }).emoji ?? "", values: Object.fromEntries(EDITABLE[cat].map((f) => [f, (e as unknown as Record<string, unknown>)[f] ?? null])) }));

  const [userList, deliveries, notes, announcements, messages, rides, lotteries] = await Promise.all([
    prisma.user.findMany({
      where: q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, username: true, email: true, role: true, banned: true, xp: true, coins: true, gems: true, toman: true, createdAt: true, utmSource: true, lastSeenAt: true },
    }),
    prisma.delivery.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { sender: { select: { username: true } }, courier: { select: { username: true } } } }),
    prisma.geoNote.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { author: { select: { username: true } } } }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.message.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { author: { select: { username: true } } } }),
    prisma.ride.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { rider: { select: { username: true } }, driver: { select: { username: true } } } }),
    prisma.lottery.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { host: { select: { username: true } }, winner: { select: { username: true } }, _count: { select: { tickets: true } } } }),
  ]);

  return {
    stats: {
      users,
      online: await prisma.user.count({ where: { lastSeenAt: { gt: onlineSince() } } }),
      signups7,
      claims24,
      upcomingEvents,
      pageViews7,
      conversion7: pageViews7 ? Math.min(1, signups7 / pageViews7) : 0,
      deliveries: Object.fromEntries(deliveryStatus.map((d) => [d.status, d._count])),
    },
    bySource: bySource.map((s) => ({ source: s.utmSource ?? "organic", count: s._count })),
    byCampaign: byCampaign.map((s) => ({ campaign: s.utmCampaign, count: s._count })),
    series,
    users: userList.map((x) => ({ ...x, level: levelForXp(x.xp), online: isOnline(x.lastSeenAt) })),
    deliveries: deliveries.map(({ dropoffCode: _c, ...d }) => d),
    rides: rides.map(({ pin: _p, ...r }) => r),
    lotteries: lotteries.map(({ _count, ...l }) => ({ ...l, players: _count.tickets })),
    notes,
    announcements,
    messages,
    config: {
      defs: SETTING_DEFS.map((d) => ({ ...d, type: settingType(d.key), def: settingDefault(d.key) })),
      values: S,
      overrides,
      metrics: GOAL_METRICS,
      catalog: { items: pick(ITEMS, "items") },
      originals: catalogOriginals(),
    },
    money: {
      wallets: tomanOut._sum.toman ?? 0,
      paid: tomanPaid._sum.amount ?? 0,
      pending: tomanPending._sum.amount ?? 0,
      pendingCount: tomanPending._count,
      earned24: money24._sum.toman ?? 0,
      pickups24: money24._count,
      drops: [...batches.values()],
      cashouts: cashouts.map((c) => ({ id: c.id, user: c.user.username, wallet: c.user.toman, joined: c.user.createdAt, amount: c.amount, fullName: c.fullName, phone: c.phone, account: c.account, status: c.status, note: c.note, createdAt: c.createdAt, decidedAt: c.decidedAt })),
    },
    revenue: {
      stripe: stripeReady(),
      push: pushReady(),
      pushDevices: await prisma.pushSub.count(),
      last30: { cents: paid30._sum.amountCents ?? 0, gems: paid30._sum.gems ?? 0, count: paid30._count },
      allTime: { cents: paidAll._sum.amountCents ?? 0, count: paidAll._count },
      ads7,
      adsByCreative: adsByCreative.map((a) => ({ creativeId: a.creativeId, views: a._count, clicks: clicksBy.get(a.creativeId) ?? 0 })),
      purchases: recentPurchases.map((p) => ({ id: p.id, user: p.user.username, pack: p.pack, gems: p.gems, amountCents: p.amountCents, currency: p.currency, status: p.status, createdAt: p.createdAt })),
    },
  };
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ban"), userId: z.string(), banned: z.boolean() }),
  z.object({ action: z.literal("role"), userId: z.string(), role: z.enum(["PLAYER", "ADMIN"]) }),
  z.object({ action: z.literal("grant"), userId: z.string(), coins: z.number().int().min(-1e6).max(1e6), xp: z.number().int().min(0).max(1e6).default(0) }),
  z.object({
    action: z.literal("createAnnouncement"),
    title: z.string().min(1).max(100),
    body: z.string().max(500),
    ctaLabel: z.string().max(30).optional(),
    // Shown as a link to every player: only web links or in-app paths, never javascript: & co.
    ctaUrl: z.string().max(300).regex(/^(https?:\/\/|\/(?!\/))/, "must start with https:// or /").optional().or(z.literal("").transform(() => undefined)),
  }),
  z.object({ action: z.literal("toggleAnnouncement"), id: z.string(), active: z.boolean() }),
  z.object({ action: z.literal("deleteAnnouncement"), id: z.string() }),
  z.object({ action: z.literal("hideNote"), id: z.string(), hidden: z.boolean() }),
  z.object({ action: z.literal("deleteMessage"), id: z.string() }),
  z.object({ action: z.literal("cancelDelivery"), id: z.string() }),
  z.object({ action: z.literal("cancelRide"), id: z.string() }),
  z.object({ action: z.literal("cancelLottery"), id: z.string() }),
  z.object({ action: z.literal("drawLottery"), id: z.string() }),
  z.object({ action: z.literal("broadcast"), title: z.string().min(1).max(100), body: z.string().max(300).optional(), push: z.boolean().optional() }),
  z.object({ action: z.literal("saveSettings"), data: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("grantGems"), userId: z.string(), gems: z.number().int().min(-1e6).max(1e6) }),
  z.object({
    action: z.literal("dropMoney"),
    label: z.string().trim().min(2).max(80),
    sponsor: z.string().trim().max(60).optional(),
    // One point drops money on a spot; two or more lay a row of drops along the street between them.
    points: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(1).max(20),
    count: z.number().int().min(1).max(200),
    spreadM: z.number().min(0).max(2000).default(0),
    amount: z.number().int().min(100).max(100_000_000),
    maxClaims: z.number().int().min(1).max(1_000_000).optional(),
    activeFrom: z.coerce.date(),
    activeTo: z.coerce.date(),
  }),
  z.object({ action: z.literal("deleteDrop"), batch: z.string().max(40) }),
  z.object({ action: z.literal("cashout"), id: z.string().max(40), paid: z.boolean(), note: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("grantToman"), userId: z.string(), toman: z.number().int().min(-1e9).max(1e9) }),
]);

/** `count` spots spread evenly along a path (one point: scattered within `spreadM`). */
function layDrops(points: { lat: number; lng: number }[], count: number, spreadM: number) {
  if (points.length === 1) {
    if (count === 1 || !spreadM) return Array.from({ length: count }, () => points[0]);
    // A ring pattern around the spot so they don't stack.
    return Array.from({ length: count }, (_, i) => offset(points[0], spreadM * Math.sqrt((i + 0.5) / count), i * 137.5));
  }
  const legs = points.slice(1).map((p, i) => ({ a: points[i], b: p, len: distanceM(points[i], p) }));
  const total = legs.reduce((s, l) => s + l.len, 0) || 1;
  return Array.from({ length: count }, (_, i) => {
    let at = count === 1 ? total / 2 : (i * total) / (count - 1);
    for (const l of legs) {
      if (at <= l.len || l === legs[legs.length - 1]) {
        const f = l.len ? Math.min(1, at / l.len) : 0;
        return { lat: l.a.lat + (l.b.lat - l.a.lat) * f, lng: l.a.lng + (l.b.lng - l.a.lng) * f };
      }
      at -= l.len;
    }
    return points[0];
  });
}

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const d = await body(req, Action);
  switch (d.action) {
    case "saveSettings": {
      const saved = await saveSettings(d.data, admin.id);
      return { ok: true, saved: Object.keys(saved).length };
    }
    case "grantGems": {
      const target = await prisma.user.findUnique({ where: { id: d.userId }, select: { gems: true } });
      if (!target) throw new HttpError(404, t("Player not found"));
      const gems = Math.max(-target.gems, d.gems);
      await prisma.user.update({ where: { id: d.userId }, data: { gems: { increment: gems } } });
      if (gems > 0) await notify(d.userId, { kind: "reward", title: t("🎁 Gift from HQ"), body: `+${gems} 💎` });
      break;
    }
    case "dropMoney": {
      if (d.activeTo <= d.activeFrom) throw new HttpError(400, t("The end must be after the start"));
      const batch = randomBytes(6).toString("hex");
      const spots = layDrops(d.points, d.count, d.spreadM);
      // The budget is for the whole drop: shared out over its spots.
      const per = d.maxClaims ? Math.max(1, Math.ceil(d.maxClaims / spots.length)) : null;
      await prisma.moneyDrop.createMany({
        data: spots.map((p) => ({ batch, label: d.label, sponsor: d.sponsor || null, lat: p.lat, lng: p.lng, amount: d.amount, maxClaims: per, activeFrom: d.activeFrom, activeTo: d.activeTo })),
      });
      return { ok: true, batch, dropped: spots.length };
    }
    case "deleteDrop":
      // Ends it now (claims stay on record, so nobody can pick the same drop up again).
      await prisma.moneyDrop.updateMany({ where: { batch: d.batch }, data: { activeTo: new Date() } });
      break;
    case "cashout": {
      const c = await decideCashout(d.id, admin.id, d.paid, d.note);
      // Written in the player's language, not the admin's.
      await notify(c.userId, () =>
        d.paid
          ? { kind: "reward", link: "wallet", title: t("💸 Cash-out paid: {n} toman", { n: c.amount }), body: d.note ? t("Bank reference: {ref}", { ref: d.note }) : t("Check your bank account") }
          : { kind: "info", link: "wallet", title: t("Cash-out declined — {n} toman is back in your wallet", { n: c.amount }), body: d.note || t("Contact support if you have questions") },
      );
      break;
    }
    case "grantToman": {
      const target = await prisma.user.findUnique({ where: { id: d.userId }, select: { toman: true } });
      if (!target) throw new HttpError(404, t("Player not found"));
      const toman = Math.max(-target.toman, d.toman);
      await prisma.user.update({ where: { id: d.userId }, data: { toman: { increment: toman } } });
      if (toman > 0) await notify(d.userId, () => ({ kind: "reward", link: "wallet", title: t("🎁 Gift from HQ"), body: t("💵 +{n} toman", { n: toman }) }));
      break;
    }
    case "ban":
      if (d.userId === admin.id) throw new HttpError(400, t("You can't ban yourself"));
      await prisma.user.update({ where: { id: d.userId }, data: { banned: d.banned } });
      break;
    case "role":
      await prisma.user.update({ where: { id: d.userId }, data: { role: d.role } });
      break;
    case "grant":
      {
        // Negative gifts take coins away, but never below zero.
        const target = await prisma.user.findUnique({ where: { id: d.userId }, select: { coins: true } });
        if (!target) throw new HttpError(404, t("Player not found"));
        await grant(d.userId, { coins: Math.max(-target.coins, d.coins), xp: d.xp }, { raw: true });
      }
      await notify(d.userId, { kind: "reward", title: t("🎁 Gift from HQ"), body: t("{coins} coins, {xp} XP", { coins: d.coins, xp: d.xp }) });
      break;
    case "createAnnouncement": {
      const { action: _a, ...data } = d;
      await prisma.announcement.create({ data });
      break;
    }
    case "toggleAnnouncement":
      await prisma.announcement.update({ where: { id: d.id }, data: { active: d.active } });
      break;
    case "deleteAnnouncement":
      await prisma.announcement.delete({ where: { id: d.id } });
      break;
    case "hideNote":
      await prisma.geoNote.update({ where: { id: d.id }, data: { hidden: d.hidden } });
      break;
    case "deleteMessage":
      await prisma.message.delete({ where: { id: d.id } });
      break;
    case "cancelDelivery": {
      const del = await prisma.delivery.findUnique({ where: { id: d.id } });
      if (!del || del.status === "DELIVERED" || del.status === "CANCELLED") throw new HttpError(400, t("Can't cancel"));
      // Conditional: two admins (or an admin and the courier) racing must not refund twice.
      const moved = await prisma.delivery.updateMany({ where: { id: d.id, status: del.status }, data: { status: "CANCELLED" } });
      if (!moved.count) throw new HttpError(409, t("The delivery just changed — refresh"));
      await grant(del.senderId, { coins: del.reward }, { raw: true });
      await notify(del.senderId, { kind: "delivery", title: t("Delivery cancelled by admin"), body: t("Your coins were refunded") });
      if (del.courierId) await notify(del.courierId, { kind: "delivery", title: t("Delivery cancelled by admin"), body: del.title });
      break;
    }
    case "cancelRide": {
      const ride = await prisma.ride.findUnique({ where: { id: d.id } });
      if (!ride || ride.status === "DONE" || ride.status === "CANCELLED") throw new HttpError(400, t("Can't cancel"));
      const moved = await prisma.ride.updateMany({ where: { id: d.id, status: ride.status }, data: { status: "CANCELLED", endedAt: new Date() } });
      if (!moved.count) throw new HttpError(409, t("The ride just changed — refresh"));
      await grant(ride.riderId, { coins: ride.fare }, { raw: true });
      await notify(ride.riderId, { kind: "delivery", title: t("Ride cancelled by admin"), body: t("Your fare was refunded") });
      if (ride.driverId) await notify(ride.driverId, { kind: "delivery", title: t("Ride cancelled by admin"), body: t("To {place}", { place: ride.dropoffLabel }) });
      break;
    }
    case "cancelLottery":
      await cancelLottery(d.id);
      break;
    case "drawLottery":
      // Bring the draw forward to now; drawDue does the rest (and is safe against a racing draw).
      await prisma.lottery.updateMany({ where: { id: d.id, status: "OPEN" }, data: { drawAt: new Date() } });
      await drawDue({ id: d.id });
      break;
    case "broadcast":
    {
      // Everyone active in the last 15 minutes gets it on their next poll.
      const active = await prisma.user.findMany({ where: { lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } });
      await prisma.notification.createMany({ data: active.map((a) => ({ userId: a.id, kind: "info", title: d.title, body: d.body })) });
      // Optionally a phone notification to everyone who turned notifications on.
      if (d.push) {
        const subs = await prisma.pushSub.findMany({ distinct: ["userId"], select: { userId: true }, take: 20000 });
        for (let i = 0; i < subs.length; i += 50) await Promise.all(subs.slice(i, i + 50).map((s) => pushTo(s.userId, { title: d.title, body: d.body, kind: "info", tag: "broadcast" })));
        return { ok: true, pushed: subs.length };
      }
    }
      break;
  }
  return { ok: true };
});
