import { cookies } from "next/headers";
import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { getLocale, LOCALE_COOKIE, LOCALES, t } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { DAILY_REWARD, dayKey, levelProgress, titleForLevel } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { canSimulate } from "@/server/session";
import { questView } from "@/server/quests";
import { body, HttpError, route } from "@/server/http";
import { settingOverrides } from "@/server/settings";
import { goalsReady } from "@/server/goals";
import { S } from "@/lib/settings";
import { ipLocation } from "@/server/geoip";
import { DIVIDEND_H, rankOf } from "@/lib/idle";

export const GET = route(async (req) => {
  const u = await requireUser();
  const [inventory, achievements, runs, pendingFriends, cashout] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { userId: u.id, qty: { gt: 0 } } }),
    prisma.userAchievement.findMany({ where: { userId: u.id } }),
    prisma.missionRun.findMany({ where: { userId: u.id, status: "ACTIVE" } }),
    prisma.friendship.count({ where: { addresseeId: u.id, status: "PENDING" } }),
    prisma.cashout.findFirst({ where: { userId: u.id, status: "PENDING" }, select: { amount: true } }),
  ]);
  const [settings, goals, gpsGame, shop, empire] = await Promise.all([
    settingOverrides(),
    goalsReady(u),
    prisma.gpsGame.findFirst({ where: { userId: u.id, status: "ACTIVE", endsAt: { gt: new Date() } }, select: { id: true, kind: true } }),
    prisma.shop.findUnique({ where: { ownerId: u.id }, select: { id: true, name: true, expiresAt: true, _count: { select: { orders: { where: { status: "PENDING" } } } } } }),
    prisma.empire.findUnique({ where: { userId: u.id }, select: { dividendAt: true, total: true, rankClaimed: true } }),
  ]);
  // Notifications and pushes are written in the language the player last used.
  const locale = getLocale();
  if (u.locale !== locale) await prisma.user.update({ where: { id: u.id }, data: { locale } });
  const quests = await questView(u.id);
  const prog = levelProgress(u.xp);
  const today = dayKey(u.timezone);
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    role: u.role,
    xp: u.xp,
    coins: u.coins,
    toman: u.toman,
    /** Toman waiting in a cash-out request (already out of the wallet). */
    cashoutPending: cashout?.amount ?? 0,
    timezone: u.timezone,
    level: prog.level,
    levelPct: prog.pct,
    nextLevelXp: prog.to,
    title: titleForLevel(prog.level),
    streak: u.streak,
    dailyAvailable: u.lastDailyKey !== today,
    dailyReward: DAILY_REWARD(u.streak + 1),
    referralCode: u.referralCode,
    canSimulate: canSimulate(u.role),
    inventory: inventory.map((i) => ({ key: i.itemKey, qty: i.qty, def: ITEM_BY_KEY[i.itemKey] })).filter((i) => i.def),
    achievements: achievements.map((a) => a.key),
    activeRun: runs[0] ?? null,
    pendingFriends,
    gems: u.gems,
    quest: quests[0] ? { title: quests[0].title, desc: quests[0].desc, progress: quests[0].progress, target: quests[0].target, done: quests[0].done, campaign: quests[0].campaign } : null,
    questsReady: quests.filter((q) => q.done && !q.claimed).length,
    settings,
    remotePlay: u.remotePlay,
    lastPos: u.lastLat != null && u.lastLng != null ? { lat: u.lastLat, lng: u.lastLng } : null,
    // Where the connection comes from (city-level): a starting point for players whose
    // device can't locate itself, e.g. desktop browsers.
    ipPos: u.lastLat == null ? ipLocation(req) : null,
    goalsReady: goals,
    walkedM: Math.round(u.walkedM),
    storyChapter: u.storyChapter,
    gpsGame,
    // The Market badge: orders waiting to be handed over, a shop about to close.
    shop: shop && { id: shop.id, name: shop.name, expiresAt: shop.expiresAt.getTime(), pending: shop._count.orders },
    // The Ready tray: a dividend to claim (0 = right away), an empire rank reward waiting.
    empire: empire && { rank: rankOf(empire.total), dividendAt: empire.dividendAt ? empire.dividendAt.getTime() + DIVIDEND_H * 3600_000 : 0, rankUp: rankOf(empire.total) > empire.rankClaimed },
  };
});

const Patch = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only").optional(),
  avatar: z.string().min(1).max(8).optional(),
  timezone: z.string().max(64).optional(),
  remotePlay: z.boolean().optional(),
  locale: z.enum(LOCALES).optional(),
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Patch);
  if (d.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: d.timezone });
    } catch {
      delete d.timezone;
    }
  }
  if (d.remotePlay !== undefined && d.remotePlay !== u.remotePlay) {
    if (d.remotePlay && !S.remoteEnabled) throw new HttpError(400, t("Play from home is switched off right now"));
    const active = await prisma.gpsGame.count({ where: { userId: u.id, status: "ACTIVE", kind: "sprint" } });
    if (active) throw new HttpError(400, t("Finish your sprint first"));
    // Back to GPS: forget the couch position so the next real fix is accepted wherever you are.
    if (!d.remotePlay) Object.assign(d, { lastLat: null, lastLng: null });
  }
  if (d.username && d.username !== u.username && (await prisma.user.findUnique({ where: { username: d.username } }))) throw new HttpError(409, t("That callsign is taken"));
  if (d.locale) (await cookies()).set(LOCALE_COOKIE, d.locale, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  await prisma.user.update({ where: { id: u.id }, data: d });
  return { ok: true };
});
