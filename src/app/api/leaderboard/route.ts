import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { friendIds } from "@/server/rooms";

export const GET = route(async (req) => {
  const u = await requireUser();
  const scope = new URL(req.url).searchParams.get("scope") ?? "global";
  // ?by=toman ranks by the toman in each wallet instead of XP.
  const by = new URL(req.url).searchParams.get("by") === "toman" ? "toman" : "xp";
  const where = scope === "friends" ? { id: { in: [u.id, ...(await friendIds(u.id))] } } : { banned: false };
  const top = await prisma.user.findMany({ where, orderBy: { [by]: "desc" }, take: 50, select: { id: true, username: true, avatar: true, xp: true, toman: true } });
  const myRank = (await prisma.user.count({ where: { ...where, [by]: { gt: u[by] } } })) + 1;
  return { top: top.map((t) => ({ ...t, level: levelForXp(t.xp), me: t.id === u.id })), myRank };
});
