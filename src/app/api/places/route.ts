// Missions at real places: start a delivery at the pickup, or check in for a visit.
// Both need the server-trusted position at the place itself.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { lastKnownLocation } from "@/server/rewards";
import { missionsAround, startPlaceMission } from "@/server/places";
import { HttpError } from "@/server/http";
import { t } from "@/lib/i18n";

// The jobs around a point (the 3D city lists them; the map gets them with /api/world).
export const GET = route(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const here = { lat: Number(sp.get("lat") ?? NaN), lng: Number(sp.get("lng") ?? NaN) };
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng) || Math.abs(here.lat) > 90 || Math.abs(here.lng) > 180) throw new HttpError(400, t("lat/lng required"));
  return { missions: (await missionsAround(here)).missions };
});

const Schema = z.object({ id: z.string().max(80) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const { id } = await body(req, Schema);
  return startPlaceMission(u, id, await lastKnownLocation(u.id));
});
