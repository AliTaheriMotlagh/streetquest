// World operation, faction goal and personal milestones.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route, actionRoute } from "@/server/http";
import { claimGoal, goalsView } from "@/server/goals";
import { grant } from "@/server/rewards";

export const GET = route(async () => goalsView(await requireUser()));

const Schema = z.object({ key: z.string().max(120) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const { key } = await body(req, Schema);
  const { reward, title } = await claimGoal(u, key);
  await grant(u.id, { xp: reward.xp, coins: reward.coins, gems: reward.gems });
  return { message: `🏆 ${title}: ${[reward.xp && `+${reward.xp} XP`, reward.coins && `+${reward.coins} 🪙`, reward.gems && `+${reward.gems} 💎`].filter(Boolean).join(" ")}` };
});
