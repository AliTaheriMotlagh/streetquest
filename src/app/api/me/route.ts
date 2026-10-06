import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { DAILY_REWARD, dayKey, levelProgress, titleForLevel } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { canSimulate } from "@/server/session";
import { needsOf } from "@/server/needs";
import { moodOf } from "@/lib/sims";
import { body, route } from "@/server/http";

export const GET = route(async () => {
  const u = await requireUser();
  const [inventory, achievements, runs, pendingFriends, base] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { userId: u.id, qty: { gt: 0 } } }),
    prisma.userAchievement.findMany({ where: { userId: u.id } }),
    prisma.missionRun.findMany({ where: { userId: u.id, status: "ACTIVE" } }),
    prisma.friendship.count({ where: { addresseeId: u.id, status: "PENDING" } }),
    prisma.base.findUnique({ where: { ownerId: u.id }, select: { id: true, name: true, lat: true, lng: true } }),
  ]);
  const needs = needsOf(u);
  const prog = levelProgress(u.xp);
  const today = dayKey(u.timezone);
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    role: u.role,
    xp: u.xp,
    coins: u.coins,
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
    faction: u.faction,
    base,
    needs,
    needsAt: Date.now(),
    mood: moodOf(needs),
    restedAt: u.restedAt,
    socialAt: u.socialAt,
  };
});

const Patch = z.object({
  avatar: z.string().min(1).max(8).optional(),
  timezone: z.string().max(64).optional(),
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
  await prisma.user.update({ where: { id: u.id }, data: d });
  return { ok: true };
});
