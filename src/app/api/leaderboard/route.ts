import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { leagueOf } from "@/lib/rts";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { friendIds } from "@/server/rooms";

export const GET = route(async (req) => {
  const u = await requireUser();
  const scope = new URL(req.url).searchParams.get("scope") ?? "global";
  // ?by=trophies ranks by Clash-style trophies instead of XP.
  const by = new URL(req.url).searchParams.get("by") === "trophies" ? "trophies" : "xp";
  const where = scope === "friends" ? { id: { in: [u.id, ...(await friendIds(u.id))] } } : { banned: false };
  const top = await prisma.user.findMany({ where, orderBy: { [by]: "desc" }, take: 50, select: { id: true, username: true, avatar: true, xp: true, trophies: true } });
  const myRank = (await prisma.user.count({ where: { ...where, [by]: { gt: u[by] } } })) + 1;
  return { top: top.map((t) => ({ ...t, level: levelForXp(t.xp), league: leagueOf(t.trophies), me: t.id === u.id })), myRank };
});
