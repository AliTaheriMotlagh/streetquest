// Live traffic around a point (server/traffic.ts): ?lat&lng → { cells: [lat, lng, dir,
// km/h][], neshan, at }. Looking also nudges a Neshan refresh for the area (after the
// reply, at most every few minutes), so traffic stays live wherever players are.
import { after } from "next/server";
import { requireUser } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { neshanState, refreshNeshan, trafficNear } from "@/server/traffic";
import { t } from "@/lib/i18n";

export const GET = route(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, t("lat/lng required"));
  const p = { lat, lng };
  after(() => refreshNeshan(p).catch(() => {}));
  const cells = await trafficNear(p);
  return Response.json({ cells, neshan: neshanState(), at: Date.now() }, { headers: { "cache-control": "no-store" } });
});
