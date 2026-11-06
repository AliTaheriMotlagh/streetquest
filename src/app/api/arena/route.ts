// Street Arena matches between players without the realtime server: the match runs in its
// host's browser and everyone links to it through here (server/arenaRelay.ts):
// open/close a room (host), list the ones nearby, join/leave, the host's and players'
// polls, and the host's result (paid like the realtime server's).
import { z } from "zod";
import { cookies } from "next/headers";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { SESSION_COOKIE, verifySession } from "@/server/session";
import { t } from "@/lib/i18n";
import { ArenaRowSchema } from "@/server/arenaPay";
import { closeRoom, guestPoll, hostPoll, joinRoom, leaveRoom, listRooms, openRoom, roomResult } from "@/server/arenaRelay";
import { levelForXp } from "@/lib/progression";
import { DOWN_MAX, UP_MAX } from "@/lib/arena/relay";

const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Id = z.string().min(6).max(16);
const Trail = z.array(z.array(z.number()).max(12)).max(12);
const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"), id: Id, mode: z.string().max(12), radius: z.number().int(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
    bots: z.number().int().min(0).max(16), anchor: LatLng, color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), party: z.boolean().optional(), sim: z.boolean().optional(),
  }),
  z.object({ action: z.literal("close"), id: Id }),
  z.object({ action: z.literal("list"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  z.object({ action: z.literal("join"), id: Id, anchor: LatLng, color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), sim: z.boolean().optional() }),
  z.object({ action: z.literal("leave"), id: Id }),
  z.object({
    action: z.literal("host"), id: Id, ack: z.number().int().min(0), trail: Trail, snap: z.string().max(40_000).optional(),
    out: z.array(z.object({ to: z.string().max(64), body: z.array(z.string().max(4000)).max(DOWN_MAX) })).max(20),
    phase: z.string().max(10), humans: z.number().int().min(0).max(64), bots: z.number().int().min(0).max(64), clock: z.number(), sweep: z.boolean().optional(),
  }),
  z.object({ action: z.literal("guest"), id: Id, ack: z.number().int().min(0), trail: Trail, up: z.array(z.object({ at: z.number(), m: z.record(z.string(), z.unknown()) })).max(UP_MAX) }),
  z.object({ action: z.literal("result"), id: Id, mode: z.string().max(12), players: z.number().int().min(1).max(64), results: z.array(ArenaRowSchema).max(32) }),
]);

/** Polls come a few times a second: the signed session is enough (no user lookup). */
async function pollerId() {
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) throw new HttpError(401, t("Not signed in"));
  return id;
}

export const POST = route(async (req) => {
  const d = await body(req, Schema);
  if (d.action === "host") return hostPoll(await pollerId(), d);
  if (d.action === "guest") return guestPoll(await pollerId(), d);
  const u = await requireUser();
  switch (d.action) {
    case "open":
      return openRoom(u, levelForXp(u.xp), d);
    case "close":
      await closeRoom(u.id, d.id);
      return { ok: true };
    case "list":
      return { rooms: await listRooms(u.id, d) };
    case "join":
      return joinRoom(u, levelForXp(u.xp), d.id, d.anchor, d.color, d.sim);
    case "leave":
      await leaveRoom(u.id, d.id);
      return { ok: true };
    case "result":
      return roomResult(u.id, d.id, d.mode, d.players, d.results);
  }
});
