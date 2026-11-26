// Street jobs in the open 3D city (lib/street/jobs.ts): the client plays them — a thief
// caught, the police lost — and claims the reward here. The server can't see the chase
// (street life is local to each player), so it only limits what it pays: one of a kind
// per few minutes (the claim's key is unique per window) and a few a day. `{ setback }` reports an arrest or a
// knock-out: the fine the admin set (0 by default: none).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { JOBS_PER_DAY, jobClaimKey, jobReward, STREET_JOB_KINDS } from "@/lib/street/jobs";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";
import { setbackFine } from "@/lib/street/setback";
import { S } from "@/lib/settings";

const Schema = z.object({ job: z.enum(STREET_JOB_KINDS), stars: z.number().int().min(0).max(5).default(0) });
/** A setback (lib/street/setback.ts): the fine the admin set, if any, never more than the player has. */
const Setback = z.object({ setback: z.enum(["busted", "down"]), stars: z.number().int().min(0).max(5).default(0) });

export const POST = route(
  async (req) => {
    const u = await requireUser();
    const raw = await req.clone().json().catch(() => ({}));
    if (raw && typeof raw === "object" && "setback" in raw) {
      const d = Setback.parse(raw);
      const me = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { coins: true } });
      const fine = setbackFine(d.setback, d.stars, me.coins, S);
      // Only what's there is taken (a concurrent spend can't push the balance below zero).
      if (fine > 0) await prisma.user.updateMany({ where: { id: u.id, coins: { gte: fine } }, data: { coins: { decrement: fine } } });
      return { ok: true, fine };
    }
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
