// Street jobs in the open 3D city (lib/street/jobs.ts): the client plays them — a thief
// caught, the police lost — and claims the reward here. The server can't see the chase
// (street life is local to each player), so it only limits what it pays: one of a kind
// per few minutes (the claim's key is unique per window) and a few a day.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { JOBS_PER_DAY, jobClaimKey, jobReward, STREET_JOB_KINDS } from "@/lib/street/jobs";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";

const Schema = z.object({ job: z.enum(STREET_JOB_KINDS), stars: z.number().int().min(0).max(5).default(0) });

export const POST = route(
  async (req) => {
    const u = await requireUser();
    const { job, stars } = await body(req, Schema);
    const now = Date.now();
    const today = await prisma.claim.count({ where: { userId: u.id, kind: "street", createdAt: { gte: new Date(now - 24 * 3600_000) } } });
    if (today >= JOBS_PER_DAY) throw new HttpError(429, t("That's enough street jobs for today — come back tomorrow"));
    try {
      await prisma.claim.create({ data: { userId: u.id, spawnId: jobClaimKey(job, now), kind: "street", cell: job } });
    } catch {
      throw new HttpError(429, t("You just did one of these — give it a few minutes"));
    }
    // What it really paid (the admin's multipliers, less from home), for the toast.
    const before = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { xp: true, coins: true } });
    const after = await grant(u.id, jobReward(job, stars));
    return { ok: true, reward: { xp: after.xp - before.xp, coins: after.coins - before.coins } };
  },
  { exclusive: true },
);
