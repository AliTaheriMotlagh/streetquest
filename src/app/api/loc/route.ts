// The client reports its GPS position here (on move + every ~20s as a heartbeat).
// This is also the presence ping: lastSeenAt drives "online" everywhere.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { canSimulate } from "@/server/session";

const Schema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), sim: z.boolean().optional() });
const MAX_SPEED_MS = 70; // ~250 km/h — anything faster is a spoofed jump

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const trusted = canSimulate(u.role);
  if (d.sim && !trusted) throw new HttpError(403, "GPS simulator is not available");
  if (!trusted && u.lastLat != null && u.lastLng != null && u.lastSeenAt) {
    const dist = distanceM({ lat: u.lastLat, lng: u.lastLng }, d);
    const dt = Math.max(1, (Date.now() - u.lastSeenAt.getTime()) / 1000);
    if (dist > 500 && dist / dt > MAX_SPEED_MS) {
      // Still count as online, but don't move them.
      await prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } });
      throw new HttpError(409, "GPS jump ignored — faster than any getaway car");
    }
  }
  await prisma.user.update({ where: { id: u.id }, data: { lastLat: d.lat, lastLng: d.lng, lastSeenAt: new Date() } });
  return { ok: true };
});
