// Cinemas and what's on (server/cinema.ts, from cinematicket.org):
//   ?near=1&lat&lng   the cinemas around a point (the map layer, the 3D city's billboards)
//   ?id=<cinema id>   its films and sessions today and tomorrow (the cinema card)
//   ?trailer=<film id>  the film's trailer MP4 + Aparat page (billboards, the card)
// Iran's cinemas are Cinematicket's, Turkey's the open map's (no sessions: a link to the cinema's page).
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { S } from "@/lib/settings";
import { cinemaShows, cinemasNear, filmTrailer } from "@/server/cinema";

const num = z.coerce.number().finite();
const Query = z.union([
  z.object({ near: z.literal("1"), lat: num.min(-90).max(90), lng: num.min(-180).max(180) }),
  z.object({ id: z.coerce.number().int().positive().max(1e7) }),
  z.object({ trailer: z.coerce.number().int().positive().max(1e7) }),
]);

export const GET = route(async (req) => {
  await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  // The same switch as the store data (Admin → Game settings): off, nothing is asked of other sites.
  if (!S.localDataEnabled) return "near" in q ? { cinemas: [] } : "trailer" in q ? { url: null, page: null } : { cinema: null, films: [], fetchedAt: new Date().toISOString() };
  if ("near" in q) return { cinemas: await cinemasNear({ lat: q.lat, lng: q.lng }) };
  if ("trailer" in q) return await filmTrailer(q.trailer);
  return await cinemaShows(q.id);
});
