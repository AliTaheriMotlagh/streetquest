// The player's sheet: quests (claim rewards here) and a lifetime record.
import { z } from "zod";
import { S } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { body, route, actionRoute } from "@/server/http";
import { claimQuest, questView } from "@/server/quests";
import { grant } from "@/server/rewards";
import { t } from "@/lib/i18n";

export const GET = route(async () => {
  const u = await requireUser();
  const [counters, money, places, earned, achievements, cashedOut] = await Promise.all([
    prisma.goalCounter.findMany({ where: { scope: "user", scopeId: u.id, period: "all" } }),
    prisma.claim.count({ where: { userId: u.id, kind: "money" } }),
    prisma.claim.count({ where: { userId: u.id, kind: "place", toman: { gt: 0 } } }),
    prisma.claim.aggregate({ where: { userId: u.id }, _sum: { toman: true } }),
    prisma.userAchievement.count({ where: { userId: u.id } }),
    prisma.cashout.aggregate({ where: { userId: u.id, status: "PAID" }, _sum: { amount: true } }),
  ]);
  const c = Object.fromEntries(counters.map((x) => [x.metric, Math.floor(x.value)]));
  return {
    level: levelForXp(u.xp),
    coins: u.coins,
    gems: u.gems,
    toman: u.toman,
    quests: await questView(u.id),
    campaignStep: u.campaignStep,
    stats: {
      walkedM: Math.round(u.walkedM),
      money,
      places,
      earned: earned._sum.toman ?? 0,
      cashedOut: cashedOut._sum.amount ?? 0,
      achievements,
      gpsGames: c.gps_game ?? 0,
      story: u.storyChapter,
      streak: u.streak,
      memberDays: Math.max(1, Math.ceil((Date.now() - u.createdAt.getTime()) / 86_400_000)),
    },
  };
});

const Schema = z.object({ action: z.literal("claimQuest"), key: z.string().max(40) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const q = await claimQuest(u.id, d.key);
  const gems = q.campaign ? S.questGemsCampaign : S.questGemsDaily;
  await grant(u.id, { xp: q.reward.xp, coins: q.reward.coins, gems });
  return { message: t("📜 {title}: +{coins} 🪙 +{gems} 💎", { title: t(q.title), coins: q.reward.coins, gems }) };
});
