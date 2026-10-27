// Polled every few seconds by the game: new notifications, unread chat count, incoming calls.
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { RING_MS } from "@/server/calls";
import { readyAlerts } from "@/server/alerts";

/** When this server instance last checked each player's timers (keys stop repeats across instances). */
const alertsAt = new Map<string, number>();
const ALERTS_EVERY_MS = 30_000;

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const since = new Date(Number(sp.get("since")) || Date.now() - 60_000);
  const now = new Date();
  // Every ~30 s per player: turn finished timers into notifications first, so they arrive in
  // this very poll. (Its own clock: GPS pings keep lastSeenAt fresh while walking.)
  if (now.getTime() - (alertsAt.get(u.id) ?? 0) > ALERTS_EVERY_MS) {
    if (alertsAt.size > 20_000) alertsAt.clear();
    alertsAt.set(u.id, now.getTime());
    await readyAlerts(u).catch(() => 0);
  }

  const [notifications, events] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id, createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true, kind: true, tag: true, title: true, body: true, link: true } }),
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
  const inbox = await prisma.notification.count({ where: { userId: u.id, readAt: null, hiddenAt: null } });
  // A crew member ringing this player right now.
  const ring = await prisma.call.findFirst({
    where: { calleeId: u.id, status: "RINGING", createdAt: { gt: new Date(now.getTime() - RING_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, video: true, caller: { select: { id: true, username: true, avatar: true } } },
  });
  return { now: now.getTime(), notifications, unread, inbox, call: ring && { id: ring.id, video: ring.video, peer: ring.caller } };
});
