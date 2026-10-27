// The in-game inbox: recent notifications, mark read, dismiss one, clear all.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";

export const GET = route(async () => {
  const u = await requireUser();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id, hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 60, select: { id: true, kind: true, tag: true, title: true, body: true, link: true, readAt: true, createdAt: true } }),
    prisma.notification.count({ where: { userId: u.id, readAt: null, hiddenAt: null } }),
  ]);
  return { items, unread };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("readAll") }),
  z.object({ action: z.literal("dismiss"), id: z.string().max(40) }),
  z.object({ action: z.literal("clear") }),
  z.object({ action: z.literal("read"), id: z.string().max(40) }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "readAll") await prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  else if (d.action === "read") await prisma.notification.updateMany({ where: { id: d.id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
  else {
    // Keyed alerts ("Power Plant is built") stay as hidden rows so the same alert isn't sent again.
    const which = d.action === "dismiss" ? { id: d.id, userId: u.id } : { userId: u.id };
    const now = new Date();
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { ...which, key: null } }),
      prisma.notification.updateMany({ where: { ...which, key: { not: null }, hiddenAt: null }, data: { hiddenAt: now, readAt: now } }),
    ]);
  }
  return { ok: true };
});
