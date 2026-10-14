// Buy lottery tickets (only while standing at the spot), or call off your own lottery.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { cancelLottery, drawDue } from "@/server/lottery";
import { lastKnownLocation, track } from "@/server/rewards";
import { t as tr } from "@/lib/i18n"; // `t` is the target in this file

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), qty: z.number().int().min(1).max(100) }),
  z.object({ action: z.literal("cancel") }),
]);

export const POST = actionRoute(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const d = await body(req, Schema);
  await drawDue({ id });
  const l = await prisma.lottery.findUnique({ where: { id } });
  if (!l) throw new HttpError(404, tr("Lottery not found"));
  if (l.status !== "OPEN" || l.drawAt <= new Date()) throw new HttpError(400, tr("This lottery has already been drawn"));

  if (d.action === "buy") {
    const here = await lastKnownLocation(u.id);
    if (distanceM(here, l) > l.radiusM) throw new HttpError(400, tr("Go to {name} to buy tickets (within {m} m)", { name: l.name, m: l.radiusM }));
    const cost = d.qty * l.ticketPrice;
    const mine = await prisma.$transaction(async (tx) => {
      // Lock the lottery row first: a draw running at the same moment either waits for
      // this purchase or has already flipped the status, and then nothing is charged.
      const open = await tx.lottery.updateMany({ where: { id, status: "OPEN", drawAt: { gt: new Date() } }, data: { pot: { increment: cost } } });
      if (!open.count) throw new HttpError(400, tr("This lottery has already been drawn"));
      const paid = await tx.user.updateMany({ where: { id: u.id, coins: { gte: cost } }, data: { coins: { decrement: cost } } });
      if (!paid.count) throw new HttpError(400, tr("Not enough coins"));
      const t = await tx.lotteryTicket.upsert({
        where: { lotteryId_userId: { lotteryId: id, userId: u.id } },
        create: { lotteryId: id, userId: u.id, qty: d.qty },
        update: { qty: { increment: d.qty } },
      });
      if (t.qty > l.maxTickets) throw new HttpError(400, tr("Max {max} tickets per player — you can buy {n} more", { max: l.maxTickets, n: Math.max(0, l.maxTickets - (t.qty - d.qty)) }));
      return t.qty;
    });
    await track("lottery_ticket", { userId: u.id });
    return { message: tr("🎟️ {n, plural, one {# ticket} other {# tickets}} bought — you hold {mine}. Good luck!", { n: d.qty, mine }) };
  }

  // cancel: the host can call it off as long as nobody else has bought in.
  if (l.hostId !== u.id) throw new HttpError(403, tr("Only the host can cancel"));
  await cancelLottery(id, u.id);
  return { message: tr("Lottery cancelled") };
});
