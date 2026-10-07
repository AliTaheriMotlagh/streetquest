// Polled every few seconds by the game: new notifications + unread chat count.
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const since = new Date(Number(sp.get("since")) || Date.now() - 60_000);
  const now = new Date();

  const [notifications, events] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id, createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, take: 20 }),
    prisma.eventParticipant.findMany({ where: { userId: u.id }, select: { eventId: true } }),
  ]);
  // Private rooms only (DMs + my events) count toward the unread badge.
  const unread = await prisma.message.count({
    where: {
      createdAt: { gt: since },
      authorId: { not: u.id },
      OR: [{ room: { startsWith: "dm:", contains: u.id } }, { room: { in: events.map((e) => `event:${e.eventId}`) } }],
    },
  });
  // Keep presence fresh even when the player is standing still with GPS idle.
  if (!u.lastSeenAt || now.getTime() - u.lastSeenAt.getTime() > 30_000) await prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: now } });
  const inbox = await prisma.notification.count({ where: { userId: u.id, readAt: null } });
  return { now: now.getTime(), notifications, unread, inbox };
});
