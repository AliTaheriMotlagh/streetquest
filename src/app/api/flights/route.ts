// Planes in the sky round a point (server/travel.ts planesAround): GET ?lat&lng → live ADS-B planes
// and, where no receiver hears them (Iran), today's scheduled flights placed by the clock.
import { route, HttpError } from "@/server/http";
import { requireUser } from "@/server/auth";
import { planesAround } from "@/server/travel";

export const GET = route(async (req) => {
  await requireUser();
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85) throw new HttpError(400, "lat/lng");
  return planesAround({ lat, lng });
});
