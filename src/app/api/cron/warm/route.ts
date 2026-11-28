// The hourly warm-up (docker/cron.mjs): loads the busiest travel routes, stays and experiences ahead so players'
// first look is instant (server/travel.ts warmTravel). Starts it and answers at once — a run takes ~30 min,
// spaced out. Protected by CRON_SECRET; TRAVEL_WARM="off" turns it off.
import { route, HttpError } from "@/server/http";
import { warmTravel } from "@/server/travel";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, t("Unauthorized"));
  if (process.env.TRAVEL_WARM === "off") return { started: false, off: true };
  void warmTravel().catch((e) => console.error("[travel] warm-up failed", e));
  return { started: true };
});
