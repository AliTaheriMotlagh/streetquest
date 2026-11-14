// Buses (server/transit.ts; the metro's lines and stations ship with the app, lib/transit/*):
//   ?stops=1&lat&lng          the bus stops round a point, each with the lines calling there (the map layer)
//   ?buses=1&lat&lng          Istanbul's buses live round a point (IETT; the map and the 3D city)
//   ?stop=<id>&lat&lng        when each line's next bus comes to that stop (live/estimate, short)
//   ?board=<id>&lat&lng       the stop card: every line each way, its stops ahead, live / timetable times
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { arrivals, busesAround, stopBoard, stopsAround } from "@/server/transit";

const num = z.coerce.number().finite();
const lat = num.min(-90).max(90), lng = num.min(-180).max(180);
const Query = z.union([
  z.object({ stops: z.literal("1"), lat, lng }),
  z.object({ buses: z.literal("1"), lat, lng }),
  z.object({ stop: z.string().regex(/^b\d{1,15}$/), lat, lng }),
  z.object({ board: z.string().regex(/^b\d{1,15}$/), lat, lng }),
]);

export const GET = route(async (req) => {
  await requireUser();
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const at = { lat: q.lat, lng: q.lng };
  if ("stops" in q) return await stopsAround(at);
  if ("buses" in q) return await busesAround(at);
  if ("board" in q) return await stopBoard(q.board, at);
  return await arrivals(q.stop, at);
});
