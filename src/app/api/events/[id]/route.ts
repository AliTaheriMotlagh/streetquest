import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { notify } from "@/server/hub";
import { body, HttpError, actionRoute } from "@/server/http";
import { grant, lastKnownLocation, unlock } from "@/server/rewards";
import { t } from "@/lib/i18n";

const Schema = z.object({ action: z.enum(["join", "leave", "checkin"]) });

export const POST = actionRoute(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const { action } = await body(req, Schema);
  const ev = await prisma.event.findUnique({ where: { id }, include: { _count: { select: { participants: true } } } });
  if (!ev) throw new HttpError(404, t("Event not found"));
  const now = new Date();
  if (ev.endsAt < now) throw new HttpError(400, t("Event is over"));
  const me = await prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId: id, userId: u.id } } });

  if (action === "join") {
    if (me) return { message: t("Already in") };
    if (ev._count.participants >= ev.maxPlayers) throw new HttpError(400, t("Event is full"));
    await prisma.eventParticipant.create({ data: { eventId: id, userId: u.id } });
    if (ev.creatorId !== u.id) await notify(ev.creatorId, () => ({ kind: "event", title: t("Squad growing"), body: t("{name} joined {event}", { name: u.username, event: ev.title }) }));
    return { message: t("You're in! Be there on time.") };
  }
  if (action === "leave") {
    if (!me) return { message: t("Not joined") };
    if (ev.creatorId === u.id) throw new HttpError(400, t("Hosts can't leave their own event"));
    await prisma.eventParticipant.delete({ where: { id: me.id } });
    return { message: t("Left event") };
  }

  // checkin
  if (!me) throw new HttpError(400, t("Join the event first"));
  if (me.checkedInAt) throw new HttpError(400, t("Already checked in"));
  if (now.getTime() < ev.startsAt.getTime() - 15 * 60_000) throw new HttpError(400, t("Check-in opens 15 minutes before start"));
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, ev) > ev.radiusM) throw new HttpError(400, t("You need to be at the event location"));
  await prisma.eventParticipant.update({ where: { id: me.id }, data: { checkedInAt: now } });
  // Group bonus: +10% per other player already checked in, capped at +100%.
  const others = await prisma.eventParticipant.findMany({ where: { eventId: id, checkedInAt: { not: null }, userId: { not: u.id } } });
  const mult = 1 + Math.min(1, others.length * 0.1);
  const xp = Math.round(ev.rewardXp * mult);
  await grant(u.id, { xp, coins: ev.rewardCoins });
  await unlock(u.id, "event_1");
  for (const o of others) await notify(o.userId, () => ({ kind: "event", title: t("{name} arrived", { name: u.username }), body: ev.title }));
  return { message: t("Checked in! +{xp} XP (×{mult} squad bonus)", { xp, mult: Math.round(mult * 10) / 10 }) };
});
