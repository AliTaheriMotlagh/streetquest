// The in-game inbox: recent notifications, mark read, dismiss one, clear all.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";

export const GET = route(async () => {
  const u = await requireUser();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 60, select: { id: true, kind: true, title: true, body: true, readAt: true, createdAt: true } }),
    prisma.notification.count({ where: { userId: u.id, readAt: null } }),
  ]);
  return { items, unread };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("readAll") }),
  z.object({ action: z.literal("dismiss"), id: z.string().max(40) }),
  z.object({ action: z.literal("clear") }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "readAll") await prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  else if (d.action === "dismiss") await prisma.notification.deleteMany({ where: { id: d.id, userId: u.id } });
  else await prisma.notification.deleteMany({ where: { userId: u.id } });
  return { ok: true };
});
