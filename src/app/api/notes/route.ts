// Drop a post (text, optionally a photo) pinned to your current real-world location.
// Other players have to walk there to read it.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { questEvent } from "@/server/quests";
import { grant, lastKnownLocation, spendCoins, unlock } from "@/server/rewards";
import { decodePhoto, MAX_PHOTO_DATA_URL } from "@/server/photos";
import { t } from "@/lib/i18n";

const Schema = z.object({
  body: z.string().trim().max(280).default(""),
  // data:image/jpeg;base64,… — the client resizes to ≤1024 px before upload
  photo: z.string().max(MAX_PHOTO_DATA_URL).optional(),
  radiusM: z.number().int().min(20).max(200).default(50),
  hours: z.number().int().min(1).max(24 * 30).default(72),
});
const NOTE_COST = 5;
const PHOTO_COST = 15;

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (!d.body && !d.photo) throw new HttpError(400, t("Write something or add a photo"));
  const photo = d.photo ? decodePhoto(d.photo) : null;
  const here = await lastKnownLocation(u.id);
  const recent = await prisma.geoNote.count({ where: { authorId: u.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 10) throw new HttpError(429, t("Max 10 posts per hour"));
  const cost = photo ? PHOTO_COST : NOTE_COST;
  await spendCoins(u.id, cost);
  await prisma.geoNote.create({
    data: { authorId: u.id, lat: here.lat, lng: here.lng, radiusM: d.radiusM, body: d.body, photo: photo?.bytes, photoType: photo?.type, expiresAt: new Date(Date.now() + d.hours * 3_600_000) },
  });
  await grant(u.id, { xp: photo ? 25 : 10 });
  await unlock(u.id, "note_1");
  if (photo) await unlock(u.id, "photo_1");
  await questEvent(u.id, "post");
  return { message: photo ? t("📸 Photo pinned here (−{n} 🪙)", { n: cost }) : t("💬 Message pinned here (−{n} 🪙)", { n: cost }) };
});
