// The client reports its GPS position here (on move + every ~20s as a heartbeat).
// This is also the presence ping: lastSeenAt drives "online" everywhere.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { canSimulate } from "@/server/session";
import { takeFire } from "@/server/td";
import { trackStat } from "@/server/goals";
import { S } from "@/lib/settings";

const Schema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), sim: z.boolean().optional(), acc: z.number().min(0).max(100_000).optional() });

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const trusted = canSimulate(u.role);
  if (d.sim && !trusted) throw new HttpError(403, "GPS simulator is not available");
  const moved = u.lastLat != null && u.lastLng != null ? distanceM({ lat: u.lastLat, lng: u.lastLng }, d) : 0;
  const since = u.lastSeenAt ? Math.max(1, (Date.now() - u.lastSeenAt.getTime()) / 1000) : Infinity;
  if (!trusted && moved > 500 && moved / since > S.maxSpeedKmh / 3.6) {
    // Still count as online, but don't move them.
    await prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } });
    throw new HttpError(409, "GPS jump ignored — faster than any getaway car");
  }
  // Distance on foot feeds walking goals and sprints. Driving (faster than the on-foot
  // limit), GPS noise (tiny hops, poor accuracy) and test-mode teleports don't count.
  const onFoot = !d.sim && moved >= 3 && moved <= 400 && moved / since <= S.footSpeedKmh / 3.6 && (d.acc ?? 0) <= 50;
  const walked = onFoot ? moved : 0;
  await prisma.user.update({ where: { id: u.id }, data: { lastLat: d.lat, lastLng: d.lng, lastSeenAt: new Date(), ...(walked ? { walkedM: { increment: walked } } : {}) } });
  if (walked) await trackStat(u.id, "walk_m", walked, u.faction);
  // Tower defense: hostile towers and guard squads in range open fire.
  const dt = u.lastSeenAt ? (Date.now() - u.lastSeenAt.getTime()) / 1000 : 0;
  const fire = await takeFire(u, d, dt);
  return { ok: true, fire };
});
