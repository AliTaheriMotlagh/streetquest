// Lottery draws. No background jobs: a lottery whose draw time has passed is drawn by
// whichever request looks at it first (the map, the lottery list, the daily cron).
import { randomInt } from "node:crypto";
import { prisma } from "../lib/db";
import { pickWinner } from "../lib/lottery";
import { notify } from "./hub";
import { unlock } from "./rewards";
import { HttpError } from "./http";

type Where = { id?: string; near?: { minLat: number; maxLat: number; minLng: number; maxLng: number }; userId?: string };

/** Draw every lottery matching `where` whose time has come. */
export async function drawDue(where: Where = {}) {
  const due = await prisma.lottery.findMany({
    where: {
      status: "OPEN",
      drawAt: { lte: new Date() },
      ...(where.id ? { id: where.id } : {}),
      ...(where.near ? { lat: { gte: where.near.minLat, lte: where.near.maxLat }, lng: { gte: where.near.minLng, lte: where.near.maxLng } } : {}),
      ...(where.userId ? { OR: [{ hostId: where.userId }, { tickets: { some: { userId: where.userId } } }] } : {}),
    },
    select: { id: true },
    take: 50,
  });
  for (const l of due) await drawOne(l.id).catch((e) => console.error("lottery draw failed", l.id, e));
}

async function drawOne(id: string) {
  // One transaction: flipping the status first takes the row lock, so a ticket purchase
  // racing the draw either lands before it (and is counted) or sees DRAWN and rolls back.
  const res = await prisma.$transaction(async (tx) => {
    const flipped = await tx.lottery.updateMany({ where: { id, status: "OPEN", drawAt: { lte: new Date() } }, data: { status: "DRAWN", drawnAt: new Date() } });
    if (!flipped.count) return null; // someone else drew it
    const lottery = await tx.lottery.findUniqueOrThrow({ where: { id } });
    const tickets = await tx.lotteryTicket.findMany({ where: { lotteryId: id, qty: { gt: 0 } }, orderBy: { id: "asc" } });
    const total = tickets.reduce((a, t) => a + t.qty, 0);
    // A lottery needs at least two players — otherwise everyone gets their coins back.
    if (tickets.length < 2) {
      await tx.lottery.update({ where: { id }, data: { status: "REFUNDED" } });
      for (const t of tickets) await tx.user.update({ where: { id: t.userId }, data: { coins: { increment: t.qty * lottery.ticketPrice } } });
      return { lottery, tickets, winner: null, total };
    }
    const winner = pickWinner(tickets, randomInt(total))!;
    await tx.lottery.update({ where: { id }, data: { winnerId: winner.userId } });
    await tx.user.update({ where: { id: winner.userId }, data: { coins: { increment: lottery.pot } } });
    return { lottery, tickets, winner, total };
  });
  if (!res) return;

  const { lottery, tickets, winner, total } = res;
  if (!winner) {
    for (const t of tickets)
      await notify(t.userId, { kind: "reward", title: `🎰 ${lottery.name}: not enough players`, body: `Draw called off — ${t.qty * lottery.ticketPrice} coins refunded` });
    return;
  }
  const w = await prisma.user.findUnique({ where: { id: winner.userId }, select: { username: true } });
  await unlock(winner.userId, "jackpot_1");
  for (const t of tickets) {
    if (t.userId === winner.userId)
      await notify(t.userId, { kind: "reward", title: `🎰 JACKPOT! You won ${lottery.pot} coins`, body: `${lottery.name} — your ${t.qty} of ${total} tickets came up` });
    else await notify(t.userId, { kind: "info", title: `🎰 ${lottery.name} drawn`, body: `${w?.username ?? "Someone"} won the ${lottery.pot}-coin pot. Better luck next time!` });
  }
}

/**
 * Call a lottery off and refund every ticket. A host (`byHost`) may only do this while
 * nobody else has bought in; admins can always.
 */
export async function cancelLottery(id: string, byHost?: string) {
  const res = await prisma.$transaction(async (tx) => {
    const flipped = await tx.lottery.updateMany({ where: { id, status: "OPEN", ...(byHost ? { hostId: byHost } : {}) }, data: { status: "REFUNDED", drawnAt: new Date() } });
    if (!flipped.count) throw new HttpError(409, "Lottery changed — refresh");
    const lottery = await tx.lottery.findUniqueOrThrow({ where: { id } });
    const tickets = await tx.lotteryTicket.findMany({ where: { lotteryId: id, qty: { gt: 0 } } });
    if (byHost && tickets.some((t) => t.userId !== byHost)) throw new HttpError(400, "Players already bought tickets — the draw has to happen");
    for (const t of tickets) await tx.user.update({ where: { id: t.userId }, data: { coins: { increment: t.qty * lottery.ticketPrice } } });
    return { lottery, tickets };
  });
  for (const t of res.tickets)
    if (t.userId !== byHost) await notify(t.userId, { kind: "info", title: `🎰 ${res.lottery.name} cancelled`, body: `${t.qty * res.lottery.ticketPrice} coins refunded` });
}

/** The client's view of a lottery (who holds which tickets stays private). */
export function lotteryView(
  l: { id: string; name: string; lat: number; lng: number; radiusM: number; ticketPrice: number; maxTickets: number; drawAt: Date; pot: number; status: string; official: boolean; hostId: string; winnerId: string | null; host: { username: string }; winner: { username: string } | null; tickets: { userId: string; qty: number }[] },
  userId: string,
) {
  const { tickets, hostId, winnerId, ...rest } = l;
  return {
    ...rest,
    drawAt: l.drawAt.getTime(),
    host: l.host.username,
    winner: l.winner?.username ?? null,
    players: tickets.filter((t) => t.qty > 0).length,
    totalTickets: tickets.reduce((a, t) => a + t.qty, 0),
    myTickets: tickets.find((t) => t.userId === userId)?.qty ?? 0,
    mine: hostId === userId,
    won: !!winnerId && winnerId === userId,
  };
}
