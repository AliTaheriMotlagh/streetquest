// Collect a spawn / crack a chest / play an arcade / start a run / grab an admin mission drop.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cellKey, cellOf, dayPhase, distanceM } from "@/lib/geo";
import { INTERACT_RADIUS_M, resolveSpawn } from "@/lib/spawns";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { checkClaimAchievements, grant, itemLabel, lastKnownLocation, track } from "@/server/rewards";
import { assertNotDowned } from "@/server/td";
import { questEvent } from "@/server/quests";

const Schema = z.object({ spawnId: z.string().max(80), score: z.number().min(0).max(1000).optional() });

async function recordClaim(userId: string, spawnId: string, kind: string, cell: string) {
  try {
    await prisma.claim.create({ data: { userId, spawnId, kind, cell } });
  } catch {
    throw new HttpError(409, "Already collected");
  }
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const { spawnId } = await body(req, Schema);
  await assertNotDowned(u);
  const here = await lastKnownLocation(u.id);
  const reach = INTERACT_RADIUS_M + S.claimSlack;

  // Admin-placed mission drop
  if (spawnId.startsWith("m:")) {
    const m = await prisma.adminMission.findUnique({ where: { id: spawnId.slice(2) } });
    const now = new Date();
    if (!m || m.activeFrom > now || m.activeTo < now) throw new HttpError(404, "Mission is not active");
    if (distanceM(here, m) > reach) throw new HttpError(400, "Get closer to the mission spot");
    const { cx, cy } = cellOf(m);
    await recordClaim(u.id, spawnId, "mission", cellKey(cx, cy));
    await grant(u.id, { xp: m.rewardXp, coins: m.rewardCoins, items: { [m.itemKey]: 1 } });
    await checkClaimAchievements(u.id, dayPhase(m));
    await questEvent(u.id, "collect");
    await track("claim", { userId: u.id, campaign: m.sponsor ?? "admin_mission" });
    return { message: `Mission complete: ${itemLabel(m.itemKey)}`, xp: m.rewardXp, coins: m.rewardCoins };
  }

  const s = resolveSpawn(spawnId);
  if (!s) throw new HttpError(410, "This spawn has expired");
  if (distanceM(here, s) > reach) throw new HttpError(400, `Get within ${INTERACT_RADIUS_M} m to interact`);

  if (s.kind === "derrick") throw new HttpError(400, "Derricks are guarded — capture it with your army");

  if (s.kind === "run") {
    const active = await prisma.missionRun.findFirst({ where: { userId: u.id, status: "ACTIVE" } });
    if (active) throw new HttpError(400, "Finish or abandon your current run first");
    await recordClaim(u.id, s.id, s.kind, s.cell);
    const run = await prisma.missionRun.create({
      data: {
        userId: u.id,
        spawnId: s.id,
        title: s.run!.title,
        targetLat: s.run!.target.lat,
        targetLng: s.run!.target.lng,
        deadline: new Date(Date.now() + s.run!.timeLimitS * 1000),
        rewardXp: s.rewardXp,
        rewardCoins: s.rewardCoins,
      },
    });
    return { message: `Run started: ${s.run!.title}. GO!`, run };
  }

  // Chests and arcades are played as (multiplayer) mini-games through /api/lobby.
  if (s.kind === "chest" || s.kind === "arcade") throw new HttpError(400, "Play the mini-game to win this one");
  await recordClaim(u.id, s.id, s.kind, s.cell);

  const coins = s.rewardCoins;
  const items: Record<string, number> = {};
  if (s.kind === "item" && s.item) items[s.item.key] = 1;

  await grant(u.id, { xp: s.rewardXp, coins, items });
  await questEvent(u.id, "collect");
  await checkClaimAchievements(u.id, s.phase);
  await track("claim", { userId: u.id });
  const loot = Object.keys(items).map(itemLabel).join(", ");
  return {
    message: [loot, coins ? `${coins} coins` : ""].filter(Boolean).join(" + ") || "Collected",
    xp: s.rewardXp,
    coins,
    golden: s.goldenHour,
  };
});
