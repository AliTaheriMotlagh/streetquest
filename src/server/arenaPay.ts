// Paying out a finished Street Arena match: each human once per match (matchId + userId
// is unique), up to ARENA_REWARDS_PER_DAY paid matches a day. Used by the realtime
// server's signed report (/api/rt/result) and by relayed matches' hosts (/api/arena).
import { z } from "zod";
import { prisma } from "../lib/db";
import { ARENA_REWARDS_PER_DAY, matchPrize, type ModeKey } from "../lib/arena/modes";
import { grant } from "./rewards";

export const ArenaRowSchema = z.object({
  userId: z.string().max(64),
  kills: z.number().int().min(0).max(1000),
  botKills: z.number().int().min(0).max(1000),
  deaths: z.number().int().min(0).max(1000),
  score: z.number().int().min(0).max(1_000_000),
  place: z.number().int().min(1).max(64),
  won: z.boolean(),
  rounds: z.number().int().min(0).max(20).default(0),
});
export type ArenaRow = z.infer<typeof ArenaRowSchema>;

export async function payArena(matchId: string, mode: ModeKey, players: number, results: ArenaRow[]) {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rewards: Record<string, { xp: number; coins: number } | null> = {};
  for (const r of results) {
    if (r.userId.startsWith("bot:")) continue;
    const exists = await prisma.arenaResult.findUnique({ where: { matchId_userId: { matchId, userId: r.userId } } });
    if (exists) {
      rewards[r.userId] = exists.rewardedAt ? { xp: exists.xp, coins: exists.coins } : null;
      continue;
    }
    const paid = await prisma.arenaResult.count({ where: { userId: r.userId, rewardedAt: { gte: dayStart } } });
    const prize = paid < ARENA_REWARDS_PER_DAY ? matchPrize({ mode, won: r.won, place: r.place, players, kills: r.kills, botKills: r.botKills, deaths: r.deaths, rounds: r.rounds }) : null;
    await prisma.arenaResult.create({
      data: { matchId, userId: r.userId, mode, kills: r.kills, botKills: r.botKills, deaths: r.deaths, score: r.score, place: r.place, won: r.won, xp: prize?.xp ?? 0, coins: prize?.coins ?? 0, rewardedAt: prize ? new Date() : null },
    });
    if (prize) await grant(r.userId, prize).catch(() => {});
    rewards[r.userId] = prize;
  }
  return rewards;
}
