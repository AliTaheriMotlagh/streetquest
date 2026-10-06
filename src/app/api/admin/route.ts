import { z } from "zod";
import { prisma } from "@/lib/db";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { levelForXp } from "@/lib/progression";
import { requireAdmin } from "@/server/auth";
import { hub, notify } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";

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

  const [userList, deliveries, notes, missions, announcements, messages] = await Promise.all([
    prisma.user.findMany({
      where: q ? { OR: [{ username: { contains: q } }, { email: { contains: q } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, username: true, email: true, role: true, banned: true, xp: true, coins: true, createdAt: true, utmSource: true, lastSeenAt: true },
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
      online: [...hub.presence.values()].filter((p) => p.sockets > 0).length,
      signups7,
      claims24,
      upcomingEvents,
      pageViews7,
      conversion7: pageViews7 ? signups7 / pageViews7 : 0,
      deliveries: Object.fromEntries(deliveryStatus.map((d) => [d.status, d._count])),
    },
    bySource: bySource.map((s) => ({ source: s.utmSource ?? "organic", count: s._count })),
    byCampaign: byCampaign.map((s) => ({ campaign: s.utmCampaign, count: s._count })),
    series,
    users: userList.map((x) => ({ ...x, level: levelForXp(x.xp), online: (hub.presence.get(x.id)?.sockets ?? 0) > 0 })),
    deliveries: deliveries.map(({ dropoffCode: _c, ...d }) => d),
    notes,
    missions,
    announcements,
    messages,
    items: Object.values(ITEM_BY_KEY).map((i) => ({ key: i.key, label: `${i.emoji} ${i.name}` })),
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
  z.object({ action: z.literal("createAnnouncement"), title: z.string().min(1).max(100), body: z.string().max(500), ctaLabel: z.string().max(30).optional(), ctaUrl: z.string().max(300).optional() }),
  z.object({ action: z.literal("toggleAnnouncement"), id: z.string(), active: z.boolean() }),
  z.object({ action: z.literal("deleteAnnouncement"), id: z.string() }),
  z.object({ action: z.literal("hideNote"), id: z.string(), hidden: z.boolean() }),
  z.object({ action: z.literal("deleteMessage"), id: z.string() }),
  z.object({ action: z.literal("cancelDelivery"), id: z.string() }),
  z.object({ action: z.literal("broadcast"), title: z.string().min(1).max(100), body: z.string().max(300).optional() }),
]);

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const d = await body(req, Action);
  switch (d.action) {
    case "ban":
      if (d.userId === admin.id) throw new HttpError(400, "You can't ban yourself");
      await prisma.user.update({ where: { id: d.userId }, data: { banned: d.banned } });
      if (d.banned) hub.io?.in(`user:${d.userId}`).disconnectSockets(true);
      break;
    case "role":
      await prisma.user.update({ where: { id: d.userId }, data: { role: d.role } });
      break;
    case "grant":
      await grant(d.userId, { coins: d.coins, xp: d.xp });
      notify(d.userId, { kind: "reward", title: "🎁 Gift from HQ", body: `${d.coins} coins, ${d.xp} XP` });
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
      await prisma.delivery.update({ where: { id: d.id }, data: { status: "CANCELLED" } });
      await grant(del.senderId, { coins: del.reward });
      notify(del.senderId, { kind: "delivery", title: "Delivery cancelled by admin", body: "Your coins were refunded" });
      if (del.courierId) notify(del.courierId, { kind: "delivery", title: "Delivery cancelled by admin", body: del.title });
      break;
    }
    case "broadcast":
      hub.io?.emit("notify", { kind: "info", title: d.title, body: d.body });
      break;
  }
  return { ok: true };
});
