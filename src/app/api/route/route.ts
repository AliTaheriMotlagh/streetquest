// Navigation: a live driving route from where you are to a spot on the map, drawn on the
// map with the time it takes in today's traffic (server/traffic.ts liveRoute).
//   ?from=lat,lng&to=lat,lng → LiveRoute, or 503 when routing isn't available.
import { requireUser } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { liveRoute } from "@/server/traffic";
import { distanceM } from "@/lib/geo";
import { t } from "@/lib/i18n";

const point = (v: string | null) => {
  const m = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(v ?? "");
  const p = m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  return p && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? p : null;
};

export const GET = route(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const from = point(sp.get("from")), to = point(sp.get("to"));
  if (!from || !to) throw new HttpError(400, t("lat/lng required"));
  if (distanceM(from, to) > 150_000) throw new HttpError(400, t("That's too far to route"));
  const r = await liveRoute(from, to);
  if (!r) throw new HttpError(503, t("Routing isn't available right now — try Directions instead"));
  return Response.json(r, { headers: { "cache-control": "no-store" } });
});
