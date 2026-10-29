// Who's online (server/presence.ts onlineAround): how many players in all, your online
// friends, and players around where the server last saw you — with a rounded distance,
// never a position.
import { requireUser } from "@/server/auth";
import { onlineAround } from "@/server/presence";
import { route } from "@/server/http";

export const GET = route(async () => {
  const u = await requireUser();
  const here = u.lastLat != null && u.lastLng != null ? { lat: u.lastLat, lng: u.lastLng } : null;
  return onlineAround(u.id, here);
});
