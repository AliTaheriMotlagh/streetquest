// "It's ready" alerts: an empire dividend that came due while you played (or were
// away) and the daily drop. There are no background jobs, so the
// sync poll calls readyAlerts() every ~30 s; each alert has a key and is written once
// (dismissing one hides it — see /api/notifications — so its key keeps it from coming back).
import type { User } from "@prisma/client";
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { DIVIDEND_H, dividendCoins, rankOf } from "../lib/idle";
import { dayKey, DAILY_REWARD } from "../lib/progression";
import { localeOf, type Notice } from "./hub";
import { withLocale } from "./i18n";

/** Timers that finished longer ago than this are old news (the Ready tray still shows them). */
const FRESH_MS = 6 * 3600_000;

type Alert = Notice & { key: string };

export async function readyAlerts(u: User) {
  const now = Date.now();
  const since = new Date(now - FRESH_MS);
  const empire = await prisma.empire.findUnique({ where: { userId: u.id }, select: { dividendAt: true, total: true } });
  const locale = await localeOf(u.id);
  const alerts = withLocale(locale, () => {
    const out: Alert[] = [];
    if (empire?.dividendAt) {
      const readyAt = empire.dividendAt.getTime() + DIVIDEND_H * 3600_000;
      if (readyAt <= now && readyAt > since.getTime())
        out.push({ key: `dividend:${readyAt}`, kind: "reward", tag: "ready", link: "play", title: t("🏦 Empire dividend ready"), body: t("+{n} 🪙 — claim it in Play → Empire", { n: dividendCoins(rankOf(empire.total)) }) });
    }
    const today = dayKey(u.timezone);
    if (u.lastDailyKey !== today) {
      const r = DAILY_REWARD(u.streak + 1);
      out.push({ key: `daily:${today}`, kind: "reward", tag: "ready", link: "me", title: t("🎁 Daily reward is ready"), body: t("Day {n}: +{coins} 🪙 · +{xp} XP", { n: u.streak + 1, coins: r.coins, xp: r.xp }) });
    }
    return out;
  });
  if (!alerts.length) return 0;
  const sent = new Set((await prisma.notification.findMany({ where: { userId: u.id, key: { in: alerts.map((a) => a.key) } }, select: { key: true } })).map((n) => n.key));
  const fresh = alerts.filter((a) => !sent.has(a.key));
  if (!fresh.length) return 0;
  const r = await prisma.notification.createMany({
    data: fresh.map((a) => ({ userId: u.id, key: a.key, kind: a.kind ?? "info", tag: a.tag, link: a.link, title: a.title, body: a.body })),
  });
  return r.count;
}
