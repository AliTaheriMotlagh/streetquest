// Buy lottery tickets (only while standing at the spot), or call off your own lottery.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { cancelLottery, drawDue } from "@/server/lottery";
import { lastKnownLocation, track } from "@/server/rewards";

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
  if (!l) throw new HttpError(404, "Lottery not found");
  if (l.status !== "OPEN" || l.drawAt <= new Date()) throw new HttpError(400, "This lottery has already been drawn");

  if (d.action === "buy") {
    const here = await lastKnownLocation(u.id);
    if (distanceM(here, l) > l.radiusM) throw new HttpError(400, `Go to ${l.name} to buy tickets (within ${l.radiusM} m)`);
    const cost = d.qty * l.ticketPrice;
    const mine = await prisma.$transaction(async (tx) => {
      // Lock the lottery row first: a draw running at the same moment either waits for
      // this purchase or has already flipped the status, and then nothing is charged.
      const open = await tx.lottery.updateMany({ where: { id, status: "OPEN", drawAt: { gt: new Date() } }, data: { pot: { increment: cost } } });
      if (!open.count) throw new HttpError(400, "This lottery has already been drawn");
      const paid = await tx.user.updateMany({ where: { id: u.id, coins: { gte: cost } }, data: { coins: { decrement: cost } } });
      if (!paid.count) throw new HttpError(400, "Not enough coins");
      const t = await tx.lotteryTicket.upsert({
        where: { lotteryId_userId: { lotteryId: id, userId: u.id } },
        create: { lotteryId: id, userId: u.id, qty: d.qty },
        update: { qty: { increment: d.qty } },
      });
      if (t.qty > l.maxTickets) throw new HttpError(400, `Max ${l.maxTickets} tickets per player — you can buy ${Math.max(0, l.maxTickets - (t.qty - d.qty))} more`);
      return t.qty;
    });
    await track("lottery_ticket", { userId: u.id });
    return { message: `🎟️ ${d.qty} ticket${d.qty > 1 ? "s" : ""} bought — you hold ${mine}. Good luck!` };
  }

  // cancel: the host can call it off as long as nobody else has bought in.
  if (l.hostId !== u.id) throw new HttpError(403, "Only the host can cancel");
  await cancelLottery(id, u.id);
  return { message: "Lottery cancelled" };
});
