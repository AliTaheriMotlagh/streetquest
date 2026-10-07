import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { DAILY_REWARD, dayKey, levelProgress, titleForLevel } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { canSimulate } from "@/server/session";
import { needsOf } from "@/server/needs";
import { moodOf } from "@/lib/sims";
import { attrPointsFree } from "@/lib/hero";
import { commandPoints } from "@/lib/powers";
import { leagueOf } from "@/lib/rts";
import { questView } from "@/server/quests";
import { body, HttpError, route } from "@/server/http";
import { currentHp, ROOKIE_LEVEL } from "@/lib/td";
import { maxHpOf } from "@/server/td";
import { superStatus } from "@/server/superweapons";

export const GET = route(async () => {
  const u = await requireUser();
  const [inventory, achievements, runs, pendingFriends, base, powers, equipped] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { userId: u.id, qty: { gt: 0 } } }),
    prisma.userAchievement.findMany({ where: { userId: u.id } }),
    prisma.missionRun.findMany({ where: { userId: u.id, status: "ACTIVE" } }),
    prisma.friendship.count({ where: { addresseeId: u.id, status: "PENDING" } }),
    prisma.base.findUnique({ where: { ownerId: u.id }, select: { id: true, name: true, lat: true, lng: true } }),
    prisma.powerState.findMany({ where: { userId: u.id }, select: { rank: true } }),
    prisma.gear.count({ where: { userId: u.id, equipped: true } }),
  ]);
  const maxHp = await maxHpOf(u.id);
  const sw = base ? await superStatus(u) : null;
  const quests = await questView(u.id, { heroClass: !!u.heroClass, base: !!base, equipped: equipped > 0 });
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
    heroClass: u.heroClass,
    scrap: u.scrap,
    gems: u.gems,
    trophies: u.trophies,
    league: leagueOf(u.trophies),
    freePoints: attrPointsFree(prog.level, u),
    commandPoints: commandPoints(prog.level, powers.reduce((s, p) => s + p.rank, 0)),
    quest: quests[0] ? { title: quests[0].title, desc: quests[0].desc, progress: quests[0].progress, target: quests[0].target, done: quests[0].done, campaign: quests[0].campaign } : null,
    questsReady: quests.filter((q) => q.done && !q.claimed).length,
    hp: currentHp(u.hp, u.hpAt, maxHp),
    maxHp,
    downedUntil: u.downedUntil && u.downedUntil.getTime() > Date.now() ? u.downedUntil.getTime() : null,
    rookie: prog.level < ROOKIE_LEVEL,
    superweapon: sw?.def && sw.level > 0 ? { key: sw.def.key, name: sw.def.name, emoji: sw.def.emoji, level: sw.level, readyAt: sw.readyAt, radius: sw.def.radius } : null,
  };
});

const Patch = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only").optional(),
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
  if (d.username && d.username !== u.username && (await prisma.user.findUnique({ where: { username: d.username } }))) throw new HttpError(409, "That callsign is taken");
  await prisma.user.update({ where: { id: u.id }, data: d });
  return { ok: true };
});
