// Daily housekeeping (Vercel Cron, see vercel.json). Deletes only data the game no
// longer reads, so tables stay small and queries stay fast. Claims are kept: they
// drive achievements. Protected by CRON_SECRET (Vercel sends it as a Bearer token).
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/server/http";
import { BOUNTY_DAYS } from "@/lib/flags";

export const dynamic = "force-dynamic";
const days = (n: number) => new Date(Date.now() - n * 86_400_000);

export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  const [notifications, lobbies, pings, waves, matches, strikes] = await Promise.all([
    prisma.notification.deleteMany({ where: { createdAt: { lt: days(14) } } }),
    prisma.lobby.deleteMany({ where: { createdAt: { lt: days(1) } } }), // players cascade
    prisma.ping.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.wave.deleteMany({ where: { resolvedAt: { lt: days(7) } } }),
    prisma.match.deleteMany({ where: { status: "ENDED", createdAt: { lt: days(7) } } }),
    // Superweapon charge only looks back a few hours, so week-old launches are safe to drop.
    prisma.superstrike.deleteMany({ where: { launchAt: { lt: days(7) } } }),
  ]);
  // Refund week-old unclaimed bounties to whoever posted them.
  let refunded = 0;
  for (const b of await prisma.bounty.findMany({ where: { claimedAt: null, createdAt: { lt: days(BOUNTY_DAYS) } }, take: 500 })) {
    if ((await prisma.bounty.deleteMany({ where: { id: b.id, claimedAt: null } })).count) {
      await prisma.user.update({ where: { id: b.posterId }, data: { coins: { increment: b.amount } } });
      refunded++;
    }
  }
  return { refunded, deleted: { notifications: notifications.count, lobbies: lobbies.count, pings: pings.count, waves: waves.count, matches: matches.count, strikes: strikes.count } };
});
