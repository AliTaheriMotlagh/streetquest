import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/reach";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { checkClaimAchievements, grant, lastKnownLocation } from "@/server/rewards";
import { questEvent } from "@/server/quests";
import { t } from "@/lib/i18n";
import { finishPlaceRun } from "@/server/places";

const Schema = z.object({ runId: z.string(), action: z.enum(["complete", "abandon"]) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const run = await prisma.missionRun.findFirst({ where: { id: d.runId, userId: u.id, status: "ACTIVE" } });
  if (!run) throw new HttpError(404, t("No active run"));

  if (d.action === "abandon") {
    await prisma.missionRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
    return { message: t("Run abandoned") };
  }
  if (run.deadline < new Date()) {
    await prisma.missionRun.update({ where: { id: run.id }, data: { status: "FAILED" } });
    throw new HttpError(400, t("Too slow! The run failed."));
  }
  const here = await lastKnownLocation(u.id);
  if (distanceM(here, { lat: run.targetLat, lng: run.targetLng }) > INTERACT_RADIUS_M + S.claimSlack) throw new HttpError(400, t("You're not at the target yet"));

  const done = await prisma.missionRun.updateMany({ where: { id: run.id, status: "ACTIVE" }, data: { status: "DONE" } });
  if (!done.count) throw new HttpError(409, t("Run already finished"));
  const secondsLeft = Math.round((run.deadline.getTime() - Date.now()) / 1000);
  const speedBonus = Math.round(run.rewardCoins * Math.min(0.5, secondsLeft / 600));
  const coins = run.rewardCoins + speedBonus;
  const xp = run.rewardXp;
  await grant(u.id, { xp, coins });
  await questEvent(u.id, "run");
  await checkClaimAchievements(u.id, "day");
  // A delivery from a real place: the toman, what you carried, and a post in the feed.
  const paid = run.spawnId.startsWith("p:") ? await finishPlaceRun(u, run) : null;
  return { message: [t("{title} — delivered!", { title: t(run.title) }), coins ? t("+{n} 🪙", { n: coins }) : "", paid ?? ""].filter(Boolean).join(" · "), xp };
});
