// Travel (server/travel.ts): GET ?trips=1&from=<city key>&to=<city key>&date=YYYY-MM-DD[&modes=flight,train,bus]
// → every flight, train and bus between them that day, one row per trip with every site's price;
// GET ?stays=<city key>[&lat&lng] → villas, suites and hotels there; GET ?experiences=<city key> → tours,
// walks and workshops to book there (Jabama Events, lib/travel/experiences.ts). Filtering and sorting happen on
// the phone (lib/travel filterTrips / filterStays) so changing them never asks the sites again.
import { route, HttpError } from "@/server/http";
import { requireUser } from "@/server/auth";
import { isIsoDay, MODE_KEYS, type Mode } from "@/lib/travel";
import { experiencesIn, staysIn, tripsBetween } from "@/server/travel";
import { t } from "@/lib/i18n";

export const GET = route(async (req) => {
  await requireUser();
  const p = new URL(req.url).searchParams;
  if (p.get("experiences")) return experiencesIn(p.get("experiences")!.slice(0, 40));
  if (p.get("stays")) {
    const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
    return staysIn(p.get("stays")!.slice(0, 40), Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null);
  }
  const from = (p.get("from") ?? "").slice(0, 40), to = (p.get("to") ?? "").slice(0, 40), date = p.get("date") ?? "";
  if (!from || !to || !isIsoDay(date)) throw new HttpError(400, t("Pick where from, where to and the day"));
  const modes = (p.get("modes") ?? MODE_KEYS.join(",")).split(",").filter((m): m is Mode => (MODE_KEYS as string[]).includes(m));
  return tripsBetween(from, to, date, modes.length ? modes : [...MODE_KEYS]);
});
