import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { notify } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { grant, lastKnownLocation, unlock } from "@/server/rewards";

const Schema = z.object({ action: z.enum(["join", "leave", "checkin"]) });

export const POST = route(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const { action } = await body(req, Schema);
  const ev = await prisma.event.findUnique({ where: { id }, include: { _count: { select: { participants: true } } } });
  if (!ev) throw new HttpError(404, "Event not found");
  const now = new Date();
  if (ev.endsAt < now) throw new HttpError(400, "Event is over");
  const me = await prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId: id, userId: u.id } } });

  if (action === "join") {
    if (me) return { message: "Already in" };
    if (ev._count.participants >= ev.maxPlayers) throw new HttpError(400, "Event is full");
    await prisma.eventParticipant.create({ data: { eventId: id, userId: u.id } });
    if (ev.creatorId !== u.id) notify(ev.creatorId, { kind: "event", title: "Squad growing", body: `${u.username} joined ${ev.title}` });
    return { message: "You're in! Be there on time." };
  }
  if (action === "leave") {
    if (!me) return { message: "Not joined" };
    if (ev.creatorId === u.id) throw new HttpError(400, "Hosts can't leave their own event");
    await prisma.eventParticipant.delete({ where: { id: me.id } });
    return { message: "Left event" };
  }

  // checkin
  if (!me) throw new HttpError(400, "Join the event first");
  if (me.checkedInAt) throw new HttpError(400, "Already checked in");
  if (now.getTime() < ev.startsAt.getTime() - 15 * 60_000) throw new HttpError(400, "Check-in opens 15 minutes before start");
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, ev) > ev.radiusM) throw new HttpError(400, "You need to be at the event location");
  await prisma.eventParticipant.update({ where: { id: me.id }, data: { checkedInAt: now } });
  // Group bonus: +10% per other player already checked in, capped at +100%.
  const others = await prisma.eventParticipant.findMany({ where: { eventId: id, checkedInAt: { not: null }, userId: { not: u.id } } });
  const mult = 1 + Math.min(1, others.length * 0.1);
  const xp = Math.round(ev.rewardXp * mult);
  await grant(u.id, { xp, coins: ev.rewardCoins });
  await unlock(u.id, "event_1");
  for (const o of others) notify(o.userId, { kind: "event", title: `${u.username} arrived`, body: ev.title });
  return { message: `Checked in! +${xp} XP (×${mult.toFixed(1)} squad bonus)` };
});
