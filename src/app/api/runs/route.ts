import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { INTERACT_RADIUS_M } from "@/lib/spawns";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { checkClaimAchievements, grant, lastKnownLocation } from "@/server/rewards";
import { bumpNeeds } from "@/server/needs";
import { questEvent } from "@/server/quests";
import { runBonus } from "@/server/lobby";

const Schema = z.object({ runId: z.string(), action: z.enum(["complete", "abandon"]) });

export const POST = actionRoute(async (req) => {
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
  if (distanceM(here, { lat: run.targetLat, lng: run.targetLng }) > INTERACT_RADIUS_M + S.claimSlack) throw new HttpError(400, "You're not at the target yet");

  // Squad runs: race placement / co-op team bonus (computed before this run counts as done).
  const squad = run.lobbyId ? await runBonus(run.lobbyId, u.id) : { mult: 1, label: "" };
  const done = await prisma.missionRun.updateMany({ where: { id: run.id, status: "ACTIVE" }, data: { status: "DONE" } });
  if (!done.count) throw new HttpError(409, "Run already finished");
  const secondsLeft = Math.round((run.deadline.getTime() - Date.now()) / 1000);
  const speedBonus = Math.round(run.rewardCoins * Math.min(0.5, secondsLeft / 600));
  const coins = Math.round((run.rewardCoins + speedBonus) * squad.mult);
  const xp = Math.round(run.rewardXp * squad.mult);
  await grant(u.id, { xp, coins });
  await bumpNeeds(u.id, { energy: -10, hunger: -8, fun: 10, ...(squad.label ? { social: 15 } : {}) });
  await questEvent(u.id, "run");
  if (squad.label) await questEvent(u.id, "squad_run");
  await checkClaimAchievements(u.id, "day");
  return { message: `${run.title} complete! +${coins} coins${squad.label ? ` · ${squad.label}` : ""}`, xp };
});
