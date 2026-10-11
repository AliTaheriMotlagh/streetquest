// Lotteries: host one at a real place, list the ones you're in.
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  LOTTERY_MAX_HOSTED,
  LOTTERY_MAX_LEAD_MS,
  LOTTERY_MAX_PRICE,
  LOTTERY_MAX_TICKETS,
  LOTTERY_MIN_LEAD_MS,
  LOTTERY_MIN_PRICE,
  LOTTERY_RADIUS_M,
} from "@/lib/lottery";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { drawDue, lotteryView } from "@/server/lottery";
import { track } from "@/server/rewards";

export const GET = route(async () => {
  const u = await requireUser();
  await drawDue({ userId: u.id });
  const rows = await prisma.lottery.findMany({
    where: { OR: [{ hostId: u.id }, { tickets: { some: { userId: u.id } } }], createdAt: { gt: new Date(Date.now() - 14 * 86_400_000) } },
    include: {
      host: { select: { username: true } },
      winner: { select: { username: true } },
      tickets: { select: { userId: true, qty: true } },
    },
    orderBy: { drawAt: "desc" },
    take: 30,
  });
  return { lotteries: rows.map((l) => lotteryView(l, u.id)) };
});

const Schema = z.object({
  name: z.string().trim().min(3).max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ticketPrice: z.number().int().min(LOTTERY_MIN_PRICE).max(LOTTERY_MAX_PRICE),
  maxTickets: z.number().int().min(1).max(LOTTERY_MAX_TICKETS).default(10),
  drawAt: z.coerce.date(),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const lead = d.drawAt.getTime() - Date.now();
  if (lead < LOTTERY_MIN_LEAD_MS) throw new HttpError(400, "Set the draw at least 10 minutes from now");
  if (lead > LOTTERY_MAX_LEAD_MS) throw new HttpError(400, "The draw can be at most 7 days away");
  const admin = u.role === "ADMIN";
  if (!admin && (await prisma.lottery.count({ where: { hostId: u.id, status: "OPEN" } })) >= LOTTERY_MAX_HOSTED)
    throw new HttpError(400, `You can host at most ${LOTTERY_MAX_HOSTED} open lotteries`);
  const lottery = await prisma.lottery.create({ data: { ...d, radiusM: LOTTERY_RADIUS_M, hostId: u.id, official: admin } });
  await track("lottery_created", { userId: u.id });
  return { message: `🎰 ${lottery.name} is live — players buy tickets at the spot`, lottery };
});
