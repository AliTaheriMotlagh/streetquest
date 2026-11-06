// Playing together in the 3D city: open a party, invite friends (or players online near
// you), join by code, go to the host, start a round — or a Street Arena match, which the
// members join by themselves (arena: the match the party is in). Rounds are refereed from
// the /api/drive position stream (server/drive.ts).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { createParty, gatherAtHost, invitesFor, inviteToParty, joinParty, leaveParty, partyViewFor, setPartyArena, startRound } from "@/server/drive";
import { friendIds } from "@/server/rooms";
import { onlineSince } from "@/server/hub";
import { levelForXp } from "@/lib/progression";

export const GET = route(async () => {
  const u = await requireUser();
  const [party, invites, ids] = await Promise.all([partyViewFor(u.id), invitesFor(u.id), friendIds(u.id)]);
  const friends = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatar: true, xp: true, lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 50 })
    : [];
  const since = onlineSince().getTime();
  return {
    party,
    invites,
    friends: friends.map((f) => ({ id: f.id, username: f.username, avatar: f.avatar, level: levelForXp(f.xp), online: !!f.lastSeenAt && f.lastSeenAt.getTime() > since })),
  };
});

const Point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), sim: z.boolean().optional() }),
  z.object({ action: z.literal("join"), code: z.string().max(12), sim: z.boolean().optional() }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("invite"), partyId: z.string().max(40), userId: z.string().max(40) }),
  z.object({ action: z.literal("gather"), sim: z.boolean().optional() }),
  z.object({ action: z.literal("arena"), partyId: z.string().max(40).optional(), id: z.string().max(40).nullable(), kind: z.literal("ws").optional(), mode: z.string().max(12).optional() }),
  z.object({
    action: z.literal("start"),
    partyId: z.string().max(40),
    game: z.enum(["race", "tag", "coins"]),
    start: Point.extend({ yaw: z.number().min(-1e4).max(1e4) }),
    points: z.array(Point).max(40).optional(),
  }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "gather") return { at: await gatherAtHost(u, d.sim), party: await partyViewFor(u.id) };
  if (d.action === "create") await createParty(u, d.sim);
  else if (d.action === "arena") await setPartyArena(u, d.partyId, d.id, d.mode);
  else if (d.action === "join") await joinParty(u, d.code, d.sim);
  else if (d.action === "leave") await leaveParty(u.id);
  else if (d.action === "invite") await inviteToParty(u, d.partyId, d.userId);
  else await startRound(u, d.partyId, d.game, d.start, d.points);
  return { party: await partyViewFor(u.id) };
});
