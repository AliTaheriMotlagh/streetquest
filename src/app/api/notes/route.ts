// Leave a message pinned to your current real-world location.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { lastKnownLocation, spendCoins, unlock } from "@/server/rewards";

const Schema = z.object({
  body: z.string().trim().min(1).max(280),
  radiusM: z.number().int().min(20).max(200).default(50),
  hours: z.number().int().min(1).max(24 * 30).default(72),
});
const NOTE_COST = 5;

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const here = await lastKnownLocation(u.id);
  const recent = await prisma.geoNote.count({ where: { authorId: u.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 10) throw new HttpError(429, "Max 10 notes per hour");
  await spendCoins(u.id, NOTE_COST);
  await prisma.geoNote.create({
    data: { authorId: u.id, lat: here.lat, lng: here.lng, radiusM: d.radiusM, body: d.body, expiresAt: new Date(Date.now() + d.hours * 3_600_000) },
  });
  await unlock(u.id, "note_1");
  return { message: `Message dropped here (−${NOTE_COST} coins)` };
});
