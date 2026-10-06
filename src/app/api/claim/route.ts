// Collect a spawn / crack a chest / play an arcade / start a run / grab an admin mission drop.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cellKey, cellOf, dayPhase, distanceM } from "@/lib/geo";
import { INTERACT_RADIUS_M, resolveSpawn } from "@/lib/spawns";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { checkClaimAchievements, grant, itemLabel, lastKnownLocation, track } from "@/server/rewards";
import { bumpNeeds } from "@/server/needs";

const Schema = z.object({ spawnId: z.string().max(80), score: z.number().min(0).max(1000).optional() });

async function recordClaim(userId: string, spawnId: string, kind: string, cell: string) {
  try {
    await prisma.claim.create({ data: { userId, spawnId, kind, cell } });
  } catch {
    throw new HttpError(409, "Already collected");
  }
}

export const POST = route(async (req) => {
  const u = await requireUser();
  const { spawnId, score = 0 } = await body(req, Schema);
  const here = await lastKnownLocation(u.id);
  const reach = INTERACT_RADIUS_M + 10;

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

  if (s.kind === "chest" && score < 1) throw new HttpError(400, "The lock held. Try again.");
  await recordClaim(u.id, s.id, s.kind, s.cell);

  let coins = s.rewardCoins;
  const items: Record<string, number> = {};
  if (s.kind === "item" && s.item) items[s.item.key] = 1;
  if (s.kind === "chest" && s.item) items[s.item.key] = 1 + (score >= 3 ? 1 : 0); // perfect pick = double loot
  if (s.kind === "arcade") coins = Math.min(80, Math.round(score * 2));

  await grant(u.id, { xp: s.rewardXp, coins, items });
  if (s.kind === "chest" || s.kind === "arcade") await bumpNeeds(u.id, { fun: 12 });
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
