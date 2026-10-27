// "It's ready" alerts: timers that finished while you played (or were away), the daily
// drop, a full supply depot, a hungry commander. There are no background jobs, so the
// sync poll calls readyAlerts() every ~30 s; each alert has a key and is written once
// (dismissing one hides it — see /api/notifications — so its key keeps it from coming back).
import type { User } from "@prisma/client";
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { DIVIDEND_H, dividendCoins, rankOf } from "../lib/idle";
import { dayKey, DAILY_REWARD } from "../lib/progression";
import { BUILDING_BY_KEY, pendingSupply, RESEARCH_BY_KEY, SUPPLY_CAP_HOURS, SUPPLY_PER_LEVEL_HOUR, levelOf, UNIT_BY_KEY, type BuildingKey, type ResearchKey, type UnitKey } from "../lib/rts";
import { NEEDS } from "../lib/sims";
import { localeOf, type Notice } from "./hub";
import { withLocale } from "./i18n";
import { needsOf } from "./needs";

/** Timers that finished longer ago than this are old news (the Ready tray still shows them). */
const FRESH_MS = 6 * 3600_000;
/** A need below this sends one nudge a day. */
const NEED_LOW = 20;

type Alert = Notice & { key: string };

export async function readyAlerts(u: User) {
  const now = Date.now();
  const since = new Date(now - FRESH_MS);
  const [base, research, training, empire] = await Promise.all([
    prisma.base.findUnique({ where: { ownerId: u.id }, select: { lastCollectAt: true, buildings: { select: { id: true, type: true, level: true, readyAt: true } } } }),
    prisma.research.findMany({ where: { userId: u.id, readyAt: { gt: since, lte: new Date(now) } }, select: { key: true } }),
    prisma.trainOrder.findMany({ where: { userId: u.id, readyAt: { gt: since, lte: new Date(now) } }, select: { id: true, unitType: true, qty: true } }),
    prisma.empire.findUnique({ where: { userId: u.id }, select: { dividendAt: true, total: true } }),
  ]);
  const locale = await localeOf(u.id);
  const alerts = withLocale(locale, () => {
    const out: Alert[] = [];
    for (const b of base?.buildings ?? []) {
      const at = b.readyAt.getTime();
      const def = BUILDING_BY_KEY[b.type as BuildingKey];
      // Level 1 of the Command Center is there from the start: nothing to announce.
      if (!def || at <= since.getTime() || at > now || (b.type === "hq" && b.level === 1)) continue;
      out.push({
        key: `build:${b.id}:${b.level}`,
        kind: "reward",
        tag: "ready",
        link: "base",
        title: b.level === 1 ? t("{emoji} {name} is built", { emoji: def.emoji, name: t(def.name) }) : t("{emoji} {name} reached level {n}", { emoji: def.emoji, name: t(def.name), n: b.level }),
        body: t("Your builders are free for the next job"),
      });
    }
    for (const r of research) {
      const def = RESEARCH_BY_KEY[r.key as ResearchKey];
      if (def) out.push({ key: `research:${r.key}`, kind: "reward", tag: "ready", link: "base", title: t("{emoji} Research done: {name}", { emoji: def.emoji, name: t(def.name) }), body: t(def.blurb) });
    }
    for (const o of training) {
      const def = UNIT_BY_KEY[o.unitType as UnitKey];
      if (def) out.push({ key: `train:${o.id}`, kind: "reward", tag: "ready", link: "base", title: t("{emoji} {n}× {unit} ready for duty", { emoji: def.emoji, n: o.qty, unit: t(def.name) }), body: t("Deploy them from Base → Army") });
    }
    // The supply depot stops filling at its cap: say so once per fill.
    if (base && levelOf(base.buildings, "supply") > 0) {
      const fullAt = base.lastCollectAt.getTime() + SUPPLY_CAP_HOURS * 3600_000;
      if (fullAt <= now)
        out.push({
          key: `supplyfull:${base.lastCollectAt.getTime()}`,
          kind: "reward",
          tag: "ready",
          link: "base",
          title: t("📦 Supply depot is full"),
          body: t("{n} 🪙 waiting — collect so the trucks keep rolling", { n: pendingSupply(base.buildings, base.lastCollectAt, now) || levelOf(base.buildings, "supply") * SUPPLY_PER_LEVEL_HOUR * SUPPLY_CAP_HOURS }),
        });
    }
    if (empire?.dividendAt) {
      const readyAt = empire.dividendAt.getTime() + DIVIDEND_H * 3600_000;
      if (readyAt <= now && readyAt > since.getTime())
        out.push({ key: `dividend:${readyAt}`, kind: "reward", tag: "ready", link: "play", title: t("🏦 Empire dividend ready"), body: t("+{n} 🪙 for your commander — claim it in Play → Empire", { n: dividendCoins(rankOf(empire.total)) }) });
    }
    const today = dayKey(u.timezone);
    if (u.lastDailyKey !== today) {
      const r = DAILY_REWARD(u.streak + 1);
      out.push({ key: `daily:${today}`, kind: "reward", tag: "ready", link: "me", title: t("🎁 Daily reward is ready"), body: t("Day {n}: +{coins} 🪙 · +{xp} XP", { n: u.streak + 1, coins: r.coins, xp: r.xp }) });
    }
    const needs = needsOf(u);
    for (const n of NEEDS) {
      if (needs[n.key] < NEED_LOW) out.push({ key: `need:${n.key}:${today}`, kind: "info", link: "me:life", title: t("{emoji} {need} is running low", { emoji: n.emoji, need: t(n.name) }), body: t(n.how) });
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
