import { prisma } from "../lib/db";
import { ACHIEVEMENT_BY_KEY, levelForXp, titleForLevel } from "../lib/progression";
import { ITEM_BY_KEY } from "../lib/catalog";
import { hub, notify } from "./hub";
import { HttpError } from "./http";

export type Grant = { xp?: number; coins?: number; items?: Record<string, number> };

export async function grant(userId: string, g: Grant) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: g.xp ?? 0 }, coins: { increment: g.coins ?? 0 } },
  });
  for (const [itemKey, qty] of Object.entries(g.items ?? {})) {
    await prisma.inventoryItem.upsert({
      where: { userId_itemKey: { userId, itemKey } },
      create: { userId, itemKey, qty },
      update: { qty: { increment: qty } },
    });
  }
  const oldLevel = levelForXp(before.xp);
  const newLevel = levelForXp(user.xp);
  if (newLevel > oldLevel) {
    const p = hub.presence.get(userId);
    if (p) p.level = newLevel;
    notify(userId, { kind: "reward", title: `LEVEL UP! ${newLevel}`, body: `You're now a ${titleForLevel(newLevel)}` });
  }
  return user;
}

export async function unlock(userId: string, key: string) {
  const def = ACHIEVEMENT_BY_KEY[key];
  if (!def) return;
  const exists = await prisma.userAchievement.findUnique({ where: { userId_key: { userId, key } } });
  if (exists) return;
  await prisma.userAchievement.create({ data: { userId, key } });
  notify(userId, { kind: "reward", title: `${def.emoji} Achievement: ${def.name}`, body: `+${def.xp} XP` });
  await grant(userId, { xp: def.xp });
}

/** Re-evaluate claim-based achievements after a claim. */
export async function checkClaimAchievements(userId: string, phase: string) {
  const [total, chests, runs, cells] = await Promise.all([
    prisma.claim.count({ where: { userId } }),
    prisma.claim.count({ where: { userId, kind: "chest" } }),
    prisma.missionRun.count({ where: { userId, status: "DONE" } }),
    prisma.claim.groupBy({ by: ["cell"], where: { userId } }),
  ]);
  if (total >= 1) await unlock(userId, "first_claim");
  if (total >= 25) await unlock(userId, "collector_25");
  if (total >= 250) await unlock(userId, "collector_250");
  if (chests >= 10) await unlock(userId, "chest_10");
  if (runs >= 5) await unlock(userId, "runner_5");
  if (cells.length >= 10) await unlock(userId, "explorer_10");
  if (phase === "night") await unlock(userId, "night_owl");
}

export async function spendCoins(userId: string, amount: number) {
  const res = await prisma.user.updateMany({ where: { id: userId, coins: { gte: amount } }, data: { coins: { decrement: amount } } });
  if (res.count === 0) throw new HttpError(400, "Not enough coins");
}

export const itemLabel = (key: string) => {
  const i = ITEM_BY_KEY[key];
  return i ? `${i.emoji} ${i.name}` : key;
};

/** Server-trusted player position: live socket presence first, then last DB fix. */
export async function lastKnownLocation(userId: string) {
  const p = hub.presence.get(userId);
  if (p && Date.now() - p.at < 5 * 60_000) return { lat: p.lat, lng: p.lng };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { lastLat: true, lastLng: true, lastSeenAt: true } });
  if (u?.lastLat == null || u.lastLng == null || !u.lastSeenAt || Date.now() - u.lastSeenAt.getTime() > 5 * 60_000) {
    throw new HttpError(400, "No recent GPS fix — enable location and try again");
  }
  return { lat: u.lastLat, lng: u.lastLng };
}

export async function track(name: string, data: { userId?: string; path?: string; source?: string; campaign?: string } = {}) {
  await prisma.metric.create({ data: { name, ...data } }).catch(() => {});
}
