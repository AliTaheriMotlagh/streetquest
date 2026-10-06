import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { friendIds } from "@/server/rooms";

export const GET = route(async (req) => {
  const u = await requireUser();
  const scope = new URL(req.url).searchParams.get("scope") ?? "global";
  const where = scope === "friends" ? { id: { in: [u.id, ...(await friendIds(u.id))] } } : { banned: false };
  const top = await prisma.user.findMany({ where, orderBy: { xp: "desc" }, take: 50, select: { id: true, username: true, avatar: true, xp: true } });
  const myRank = (await prisma.user.count({ where: { ...where, xp: { gt: u.xp } } })) + 1;
  return { top: top.map((t) => ({ ...t, level: levelForXp(t.xp), me: t.id === u.id })), myRank };
});
