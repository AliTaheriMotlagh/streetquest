import { z } from "zod";
import { prisma } from "@/lib/db";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { levelForXp } from "@/lib/progression";
import { requireAdmin } from "@/server/auth";
import { isOnline, notify, onlineSince } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";
import { saveSettings, settingOverrides } from "@/server/settings";
import { GOAL_METRICS, S, SETTING_DEFS, settingDefault, settingType } from "@/lib/settings";
import { catalogOriginals, EDITABLE } from "@/lib/config";
import { BUILDINGS, RESEARCH, UNITS } from "@/lib/rts";
import { TOWERS } from "@/lib/td";
import { ITEMS } from "@/lib/catalog";
import { stripeReady } from "@/server/store";
import { pushReady, pushTo } from "@/server/push";

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
  const recentPurchases = await prisma.purchase.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { username: true } } } });
  const clicksBy = new Map(adClicks.map((c) => [c.creativeId, c._count]));
  const pick = (list: { key: string }[], cat: keyof typeof EDITABLE) =>
    list.map((e) => ({ key: e.key, name: (e as { name?: string }).name ?? e.key, emoji: (e as { emoji?: string }).emoji ?? "", values: Object.fromEntries(EDITABLE[cat].map((f) => [f, (e as unknown as Record<string, unknown>)[f] ?? null])) }));

  const [userList, deliveries, notes, missions, announcements, messages] = await Promise.all([
    prisma.user.findMany({
      where: q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, username: true, email: true, role: true, banned: true, xp: true, coins: true, gems: true, createdAt: true, utmSource: true, lastSeenAt: true },
    }),
    prisma.delivery.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { sender: { select: { username: true } }, courier: { select: { username: true } } } }),
    prisma.geoNote.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { author: { select: { username: true } } } }),
    prisma.adminMission.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.message.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { author: { select: { username: true } } } }),
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
    notes,
    missions,
    announcements,
    messages,
    items: Object.values(ITEM_BY_KEY).map((i) => ({ key: i.key, label: `${i.emoji} ${i.name}` })),
    config: {
      defs: SETTING_DEFS.map((d) => ({ ...d, type: settingType(d.key), def: settingDefault(d.key) })),
      values: S,
      overrides,
      metrics: GOAL_METRICS,
      catalog: { units: pick(UNITS, "units"), buildings: pick(BUILDINGS, "buildings"), towers: pick(TOWERS, "towers"), items: pick(ITEMS, "items"), research: pick(RESEARCH, "research") },
      originals: catalogOriginals(),
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
    action: z.literal("createMission"),
    title: z.string().min(2).max(80),
    description: z.string().max(500).default(""),
    lat: z.number(),
    lng: z.number(),
    itemKey: z.string(),
    rewardXp: z.number().int().min(0).max(100_000),
    rewardCoins: z.number().int().min(0).max(100_000),
    activeFrom: z.coerce.date(),
    activeTo: z.coerce.date(),
    sponsor: z.string().max(60).optional(),
  }),
  z.object({ action: z.literal("deleteMission"), id: z.string() }),
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
  z.object({ action: z.literal("broadcast"), title: z.string().min(1).max(100), body: z.string().max(300).optional(), push: z.boolean().optional() }),
  z.object({ action: z.literal("saveSettings"), data: z.record(z.unknown()) }),
  z.object({ action: z.literal("grantGems"), userId: z.string(), gems: z.number().int().min(-1e6).max(1e6) }),
]);

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
      if (!target) throw new HttpError(404, "Player not found");
      const gems = Math.max(-target.gems, d.gems);
      await prisma.user.update({ where: { id: d.userId }, data: { gems: { increment: gems } } });
      if (gems > 0) await notify(d.userId, { kind: "reward", title: "🎁 Gift from HQ", body: `+${gems} 💎` });
      break;
    }
    case "ban":
      if (d.userId === admin.id) throw new HttpError(400, "You can't ban yourself");
      await prisma.user.update({ where: { id: d.userId }, data: { banned: d.banned } });
      break;
    case "role":
      await prisma.user.update({ where: { id: d.userId }, data: { role: d.role } });
      break;
    case "grant":
      {
        // Negative gifts take coins away, but never below zero.
        const target = await prisma.user.findUnique({ where: { id: d.userId }, select: { coins: true } });
        if (!target) throw new HttpError(404, "Player not found");
        await grant(d.userId, { coins: Math.max(-target.coins, d.coins), xp: d.xp }, { raw: true });
      }
      await notify(d.userId, { kind: "reward", title: "🎁 Gift from HQ", body: `${d.coins} coins, ${d.xp} XP` });
      break;
    case "createMission": {
      const { action: _a, ...data } = d;
      if (!ITEM_BY_KEY[data.itemKey]) throw new HttpError(400, "Unknown item");
      await prisma.adminMission.create({ data });
      break;
    }
    case "deleteMission":
      await prisma.adminMission.delete({ where: { id: d.id } });
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
      if (!del || del.status === "DELIVERED" || del.status === "CANCELLED") throw new HttpError(400, "Can't cancel");
      // Conditional: two admins (or an admin and the courier) racing must not refund twice.
      const moved = await prisma.delivery.updateMany({ where: { id: d.id, status: del.status }, data: { status: "CANCELLED" } });
      if (!moved.count) throw new HttpError(409, "The delivery just changed — refresh");
      await grant(del.senderId, { coins: del.reward }, { raw: true });
      await notify(del.senderId, { kind: "delivery", title: "Delivery cancelled by admin", body: "Your coins were refunded" });
      if (del.courierId) await notify(del.courierId, { kind: "delivery", title: "Delivery cancelled by admin", body: del.title });
      break;
    }
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
