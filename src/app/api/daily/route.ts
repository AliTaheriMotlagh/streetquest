// Daily login streak. "Day" is measured in the player's own timezone.
import { prisma } from "@/lib/db";
import { DAILY_REWARD, dayKey } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { HttpError, actionRoute } from "@/server/http";
import { grant, unlock } from "@/server/rewards";
import { t } from "@/lib/i18n";

export const POST = actionRoute(async () => {
  const u = await requireUser();
  const today = dayKey(u.timezone);
  if (u.lastDailyKey === today) throw new HttpError(400, t("Already claimed today — come back tomorrow"));
  const yesterday = dayKey(u.timezone, new Date(Date.now() - 86_400_000));
  const streak = u.lastDailyKey === yesterday ? u.streak + 1 : 1;
  const res = await prisma.user.updateMany({ where: { id: u.id, lastDailyKey: u.lastDailyKey }, data: { lastDailyKey: today, streak } });
  if (!res.count) throw new HttpError(409, t("Already claimed"));
  const r = DAILY_REWARD(streak);
  await grant(u.id, r);
  if (streak >= 7) await unlock(u.id, "streak_7");
  return { message: `${t("🎁 Day {n} streak! +{coins} coins, +{xp} XP", { n: streak, coins: r.coins, xp: r.xp })}${r.gems ? `, +${r.gems} 💎` : ""}` };
});
