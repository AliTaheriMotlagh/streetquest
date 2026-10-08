// Drop a post (text, optionally a photo) pinned to your current real-world location.
// Other players have to walk there to read it.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, actionRoute } from "@/server/http";
import { questEvent } from "@/server/quests";
import { grant, lastKnownLocation, spendCoins, unlock } from "@/server/rewards";

const MAX_PHOTO_BYTES = 400 * 1024;
const Schema = z.object({
  body: z.string().trim().max(280).default(""),
  // data:image/jpeg;base64,… — the client resizes to ≤1024 px before upload
  photo: z.string().max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64).optional(),
  radiusM: z.number().int().min(20).max(200).default(50),
  hours: z.number().int().min(1).max(24 * 30).default(72),
});
const NOTE_COST = 5;
const PHOTO_COST = 15;

/** Decode a data URL and check the bytes really are a JPEG/WebP/PNG (not just the label). */
function decodePhoto(dataUrl: string) {
  const m = /^data:(image\/(jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, "Photos must be JPEG, WebP or PNG");
  const buf = Buffer.from(m[3], "base64");
  if (buf.length > MAX_PHOTO_BYTES) throw new HttpError(413, "Photo is too large");
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!jpeg && !png && !webp) throw new HttpError(400, "That file isn't an image");
  return { bytes: buf, type: m[1] };
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (!d.body && !d.photo) throw new HttpError(400, "Write something or add a photo");
  const photo = d.photo ? decodePhoto(d.photo) : null;
  const here = await lastKnownLocation(u.id);
  const recent = await prisma.geoNote.count({ where: { authorId: u.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 10) throw new HttpError(429, "Max 10 posts per hour");
  const cost = photo ? PHOTO_COST : NOTE_COST;
  await spendCoins(u.id, cost);
  await prisma.geoNote.create({
    data: { authorId: u.id, lat: here.lat, lng: here.lng, radiusM: d.radiusM, body: d.body, photo: photo?.bytes, photoType: photo?.type, expiresAt: new Date(Date.now() + d.hours * 3_600_000) },
  });
  await grant(u.id, { xp: photo ? 25 : 10 });
  await unlock(u.id, "note_1");
  if (photo) await unlock(u.id, "photo_1");
  await questEvent(u.id, "post");
  return { message: `${photo ? "📸 Photo" : "💬 Message"} pinned here (−${cost} 🪙)` };
});
