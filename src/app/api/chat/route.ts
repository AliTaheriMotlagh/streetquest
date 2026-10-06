import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { roomAudience } from "@/server/rooms";
import { bumpNeeds } from "@/server/needs";

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const room = sp.get("room") ?? "global";
  const after = sp.get("after"); // ISO timestamp of the newest message the client has
  if (!(await roomAudience(u.id, room))) throw new HttpError(403, "No access to this room");
  const msgs = await prisma.message.findMany({
    where: { room, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { author: { select: { id: true, username: true, avatar: true } } },
  });
  return { messages: msgs.reverse().map(({ authorId: _a, ...m }) => m) };
});

const Send = z.object({ room: z.string().max(120), body: z.string().trim().min(1).max(500) });

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Send);
  const last = await prisma.message.findFirst({ where: { authorId: u.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && Date.now() - last.createdAt.getTime() < 700) throw new HttpError(429, "Slow down");
  if (!(await roomAudience(u.id, d.room))) throw new HttpError(403, "You can't post in that room");
  const m = await prisma.message.create({
    data: { room: d.room, authorId: u.id, body: d.body },
    include: { author: { select: { id: true, username: true, avatar: true } } },
  });
  await bumpNeeds(u.id, { social: 2 });
  const { authorId: _a, ...msg } = m;
  return { message: msg };
});
