// Siktir: "never again" marks on places.
//   GET ?minLat&maxLat&minLng&maxLng   marked spots in a box, aggregated (the map layer)
//   GET ?placeKey=<id> | ?lat&lng      one place's count, top reasons and my own mark
//   POST {lat, lng, placeKey?, placeName?, reason, note?}   mark a place (again: change my mark)
//   DELETE ?placeKey | ?lat&lng        take my mark back
// See lib/siktir.ts for the rules and server/siktir.ts.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, route } from "@/server/http";
import { placeSiktir, saveSiktir, siktirIn, undoSiktir } from "@/server/siktir";
import { SIKTIR_REASONS, SIKTIR_LIMITS } from "@/lib/siktir";
import { t } from "@/lib/i18n";

const num = z.coerce.number().finite();
const Query = z.union([
  z.object({ minLat: num.min(-90).max(90), maxLat: num.min(-90).max(90), minLng: num.min(-180).max(180), maxLng: num.min(-180).max(180) }),
  z.object({ placeKey: z.string().trim().min(1).max(60), lat: num.optional(), lng: num.optional() }),
  z.object({ lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
]);
const query = (req: Request) => Query.parse(Object.fromEntries(new URL(req.url).searchParams));

export const GET = route(async (req) => {
  const u = await requireUser();
  const q = query(req);
  if ("minLat" in q) return { spots: await siktirIn(q) };
  return placeSiktir(u.id, "placeKey" in q ? q.placeKey : null, { lat: q.lat ?? 0, lng: q.lng ?? 0 });
});

const Mark = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  placeKey: z.string().trim().max(60).nullish(),
  placeName: z.string().max(200).optional(),
  reason: z.enum(SIKTIR_REASONS, { message: "Pick a reason" }),
  note: z.string().max(SIKTIR_LIMITS.note * 2).optional(),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  return saveSiktir(u.id, await body(req, Mark));
});

export const DELETE = actionRoute(async (req) => {
  const u = await requireUser();
  const q = query(req);
  if ("minLat" in q) throw new HttpError(400, t("That spot isn't valid"));
  return undoSiktir(u.id, "placeKey" in q ? q.placeKey : null, { lat: q.lat ?? 0, lng: q.lng ?? 0 });
});
