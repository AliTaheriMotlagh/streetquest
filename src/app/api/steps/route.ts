// Steps: GET today's count, the week and the lifetime total; POST what the phone's
// motion sensor counted since its last report (capped server-side, see server/steps).
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { addMotionSteps, stepsToday, stepWeek } from "@/server/steps";
import { prisma } from "@/lib/db";

export const GET = route(async () => {
  const u = await requireUser();
  const [today, week] = await Promise.all([stepsToday(u), stepWeek(u)]);
  return { today, week, total: u.stepsTotal };
});

const Schema = z.object({ steps: z.number().int().min(0).max(100_000) });

export const POST = route(
  async (req) => {
    const u = await requireUser();
    const { steps } = await body(req, Schema);
    const r = await addMotionSteps(u, steps);
    const total = (await prisma.user.findUnique({ where: { id: u.id }, select: { stepsTotal: true } }))?.stepsTotal ?? 0;
    return { ...r, total };
  },
  { exclusive: true },
);
