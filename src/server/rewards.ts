import { prisma } from "../lib/db";
import { ACHIEVEMENT_BY_KEY, levelForXp, titleForLevel } from "../lib/progression";
import { ITEM_BY_KEY } from "../lib/catalog";
import { notify } from "./hub";
import { HttpError } from "./http";
import { moodOfUser } from "./needs";
import { bonusOf } from "./hero";

export type Grant = { xp?: number; coins?: number; scrap?: number; gems?: number; items?: Record<string, number> };

/** Give rewards. Earned XP is scaled by the commander's mood (life-sim layer). */
export async function grant(userId: string, g: Grant) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, hunger: true, energy: true, social: true, fun: true, needsAt: true } });
  const xp = g.xp && g.xp > 0 ? Math.round(g.xp * moodOfUser(before).xpMult * (await bonusOf(userId)).xp) : (g.xp ?? 0);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: xp }, coins: { increment: g.coins ?? 0 }, scrap: { increment: g.scrap ?? 0 }, gems: { increment: g.gems ?? 0 } },
  });
  for (const [itemKey, qty] of Object.entries(g.items ?? {})) {
    if (!qty) continue;
    await prisma.inventoryItem.upsert({
      where: { userId_itemKey: { userId, itemKey } },
      create: { userId, itemKey, qty },
      update: { qty: { increment: qty } },
    });
  }
  const oldLevel = levelForXp(before.xp);
  const newLevel = levelForXp(user.xp);
  if (newLevel > oldLevel) {
    const gained = newLevel - oldLevel;
    await prisma.user.update({ where: { id: userId }, data: { gems: { increment: 2 * gained } } });
    await notify(userId, { kind: "reward", title: `LEVEL UP! ${newLevel}`, body: `${titleForLevel(newLevel)} · +${3 * gained} attribute points, +${gained} Command Point${gained > 1 ? "s" : ""}, +${2 * gained} 💎` });
  }
  return user;
}

export async function unlock(userId: string, key: string) {
  const def = ACHIEVEMENT_BY_KEY[key];
  if (!def) return;
  const exists = await prisma.userAchievement.findUnique({ where: { userId_key: { userId, key } } });
  if (exists) return;
  await prisma.userAchievement.create({ data: { userId, key } });
  await notify(userId, { kind: "reward", title: `${def.emoji} Achievement: ${def.name}`, body: `+${def.xp} XP · +5 💎` });
  await grant(userId, { xp: def.xp, gems: 5 });
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

/** Server-trusted player position: the last fix accepted by /api/loc (must be recent). */
export async function lastKnownLocation(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { lastLat: true, lastLng: true, lastSeenAt: true } });
  if (u?.lastLat == null || u.lastLng == null || !u.lastSeenAt || Date.now() - u.lastSeenAt.getTime() > 2 * 60_000) {
    throw new HttpError(400, "No recent GPS fix — enable location and try again");
  }
  return { lat: u.lastLat, lng: u.lastLng };
}

export async function track(name: string, data: { userId?: string; path?: string; source?: string; campaign?: string } = {}) {
  await prisma.metric.create({ data: { name, ...data } }).catch(() => {});
}
