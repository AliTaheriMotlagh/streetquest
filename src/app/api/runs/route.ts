import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { checkClaimAchievements, grant, lastKnownLocation } from "@/server/rewards";
import { bumpNeeds } from "@/server/needs";

const Schema = z.object({ runId: z.string(), action: z.enum(["complete", "abandon"]) });

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const run = await prisma.missionRun.findFirst({ where: { id: d.runId, userId: u.id, status: "ACTIVE" } });
  if (!run) throw new HttpError(404, "No active run");

  if (d.action === "abandon") {
    await prisma.missionRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
    return { message: "Run abandoned" };
  }
  if (run.deadline < new Date()) {
    await prisma.missionRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
    throw new HttpError(400, "Too slow! The run failed.");
  }
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, { lat: run.targetLat, lng: run.targetLng }) > INTERACT_RADIUS_M + 10) throw new HttpError(400, "You're not at the target yet");

  await prisma.missionRun.update({ where: { id: run.id }, data: { status: "DONE" } });
  const secondsLeft = Math.round((run.deadline.getTime() - Date.now()) / 1000);
  const speedBonus = Math.round(run.rewardCoins * Math.min(0.5, secondsLeft / 600));
  await grant(u.id, { xp: run.rewardXp, coins: run.rewardCoins + speedBonus });
  await bumpNeeds(u.id, { energy: -10, hunger: -8, fun: 10 });
  await checkClaimAchievements(u.id, "day");
  return { message: `${run.title} complete! +${run.rewardCoins + speedBonus} coins`, xp: run.rewardXp };
});
