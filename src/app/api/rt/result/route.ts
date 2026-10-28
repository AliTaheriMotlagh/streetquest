// Finished Street Arena matches, posted by the realtime server (signed with a key derived
// from AUTH_SECRET). Each human player is paid once per match (matchId + userId is
// unique), up to ARENA_REWARDS_PER_DAY paid matches a day; the answer tells the realtime
// server what each player got so it can show them.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ARENA_REWARDS_PER_DAY, isMode, matchPrize } from "@/lib/arena/modes";
import { HttpError, route } from "@/server/http";
import { grant } from "@/server/rewards";
import { serverKey } from "@/server/session";

const Row = z.object({
  userId: z.string().max(64),
  kills: z.number().int().min(0).max(1000),
  botKills: z.number().int().min(0).max(1000),
  deaths: z.number().int().min(0).max(1000),
  score: z.number().int().min(0).max(1_000_000),
  place: z.number().int().min(1).max(64),
  won: z.boolean(),
  rounds: z.number().int().min(0).max(20).default(0),
});
const Body = z.object({ matchId: z.string().max(64), mode: z.string(), players: z.number().int().min(1).max(64), results: z.array(Row).max(32) });

export const POST = route(async (req) => {
  const raw = await req.text();
  const sig = Buffer.from(req.headers.get("x-rt-signature") ?? "", "hex");
  const want = createHmac("sha256", serverKey("rt-result")).update(raw).digest();
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) throw new HttpError(401, "bad signature");
  const b = Body.parse(JSON.parse(raw));
  if (!isMode(b.mode)) throw new HttpError(400, "mode");
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rewards: Record<string, { xp: number; coins: number } | null> = {};
  for (const r of b.results) {
    if (r.userId.startsWith("bot:")) continue;
    const exists = await prisma.arenaResult.findUnique({ where: { matchId_userId: { matchId: b.matchId, userId: r.userId } } });
    if (exists) {
      rewards[r.userId] = exists.rewardedAt ? { xp: exists.xp, coins: exists.coins } : null;
      continue;
    }
    const paid = await prisma.arenaResult.count({ where: { userId: r.userId, rewardedAt: { gte: dayStart } } });
    const prize = paid < ARENA_REWARDS_PER_DAY ? matchPrize({ mode: b.mode, won: r.won, place: r.place, players: b.players, kills: r.kills, botKills: r.botKills, deaths: r.deaths, rounds: r.rounds }) : null;
    await prisma.arenaResult.create({
      data: { matchId: b.matchId, userId: r.userId, mode: b.mode, kills: r.kills, botKills: r.botKills, deaths: r.deaths, score: r.score, place: r.place, won: r.won, xp: prize?.xp ?? 0, coins: prize?.coins ?? 0, rewardedAt: prize ? new Date() : null },
    });
    if (prize) await grant(r.userId, prize).catch(() => {});
    rewards[r.userId] = prize;
  }
  return { rewards };
});
