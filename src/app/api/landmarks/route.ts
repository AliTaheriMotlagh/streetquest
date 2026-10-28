// Stores' own 3D buildings around a spot, for drive mode (see server/landmarks.ts).
// The models themselves come from /landmark/<id>/<hash>.glb.
import { requireUser } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { landmarksAround } from "@/server/landmarks";
import { t } from "@/lib/i18n";

export const GET = route(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, t("lat/lng required"));
  return { landmarks: await landmarksAround({ lat, lng }) };
});
