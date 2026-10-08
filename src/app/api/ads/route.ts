// Rewarded sponsor spots: start → watch adSeconds → claim gems + coins.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, actionRoute } from "@/server/http";
import { claimAd, clickAd, startAd } from "@/server/ads";
import { grant, track } from "@/server/rewards";
import { trackStat } from "@/server/goals";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("claim"), viewId: z.string().max(40) }),
  z.object({ action: z.literal("click"), viewId: z.string().max(40) }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "start") return startAd(u.id);
  if (d.action === "click") {
    await clickAd(u.id, d.viewId);
    return { ok: true };
  }
  const r = await claimAd(u.id, d.viewId);
  await grant(u.id, { gems: r.gems, coins: r.coins }, { raw: true });
  await track("ad_watched", { userId: u.id });
  await trackStat(u.id, "ads", 1, u.faction);
  return { message: `📺 Thanks for watching! +${r.gems} 💎${r.coins ? ` +${r.coins} 🪙` : ""}` };
});
