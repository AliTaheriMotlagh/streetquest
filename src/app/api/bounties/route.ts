// Bounties: put coins on a rival commander's head. Whoever downs them (gun, tower,
// superweapon) collects. Unclaimed bounties are refunded after a week by the cron.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BOUNTY_MAX, BOUNTY_MIN } from "@/lib/flags";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { notify } from "@/server/hub";
import { spendCoins } from "@/server/rewards";
import { areFriends } from "@/server/rooms";

export const GET = route(async () => {
  await requireUser();
  const open = await prisma.bounty.groupBy({ by: ["targetId"], where: { claimedAt: null }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 20 });
  const users = await prisma.user.findMany({ where: { id: { in: open.map((o) => o.targetId) } }, select: { id: true, username: true, avatar: true } });
  const by = new Map(users.map((x) => [x.id, x]));
  return { wanted: open.map((o) => ({ ...by.get(o.targetId)!, amount: o._sum.amount ?? 0 })).filter((x) => x.id) };
});

const Schema = z.object({ targetId: z.string().max(40), amount: z.number().int().min(BOUNTY_MIN).max(BOUNTY_MAX) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const t = await prisma.user.findUnique({ where: { id: d.targetId } });
  if (!t || t.banned) throw new HttpError(404, "Player not found");
  if (t.id === u.id) throw new HttpError(400, "You can't put a bounty on yourself");
  if (await areFriends(u.id, t.id)) throw new HttpError(400, "That's your crew");
  const recent = await prisma.bounty.count({ where: { posterId: u.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 5) throw new HttpError(429, "Max 5 bounties per hour");
  await spendCoins(u.id, d.amount);
  await prisma.bounty.create({ data: { targetId: t.id, posterId: u.id, amount: d.amount } });
  await notify(t.id, { kind: "event", title: `💀 There's a ${d.amount} 🪙 bounty on your head`, body: `${u.username} wants you down. Watch your back.` });
  return { message: `💀 ${d.amount} 🪙 bounty placed on ${t.username}` };
});
