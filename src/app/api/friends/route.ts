import { z } from "zod";
import { prisma } from "@/lib/db";
import { levelForXp } from "@/lib/progression";
import { requireUser } from "@/server/auth";
import { isOnline, notify } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { friendIds } from "@/server/rooms";
import { unlock } from "@/server/rewards";

const pub = { select: { id: true, username: true, avatar: true, xp: true, lastSeenAt: true } } as const;

export const GET = route(async () => {
  const u = await requireUser();
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: u.id }, { addresseeId: u.id }] },
    include: { requester: pub, addressee: pub },
  });
  const shape = (x: { id: string; username: string; avatar: string; xp: number; lastSeenAt: Date | null }) => ({
    id: x.id,
    username: x.username,
    avatar: x.avatar,
    level: levelForXp(x.xp),
    lastSeenAt: x.lastSeenAt,
    online: isOnline(x.lastSeenAt),
  });
  return {
    friends: rows.filter((r) => r.status === "ACCEPTED").map((r) => ({ friendshipId: r.id, ...shape(r.requesterId === u.id ? r.addressee : r.requester) })),
    incoming: rows.filter((r) => r.status === "PENDING" && r.addresseeId === u.id).map((r) => ({ friendshipId: r.id, ...shape(r.requester) })),
    outgoing: rows.filter((r) => r.status === "PENDING" && r.requesterId === u.id).map((r) => ({ friendshipId: r.id, ...shape(r.addressee) })),
  };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), username: z.string().trim().min(1) }),
  z.object({ action: z.enum(["accept", "decline", "remove"]), friendshipId: z.string() }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  let otherId: string;
  if (d.action === "request") {
    const other = await prisma.user.findUnique({ where: { username: d.username } });
    if (!other || other.id === u.id) throw new HttpError(404, "Player not found");
    otherId = other.id;
    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ requesterId: u.id, addresseeId: other.id }, { requesterId: other.id, addresseeId: u.id }] },
    });
    if (existing?.status === "ACCEPTED") throw new HttpError(400, "Already friends");
    if (existing && existing.requesterId === other.id) {
      // They already asked us — just accept.
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: "ACCEPTED" } });
    } else if (!existing) {
      await prisma.friendship.create({ data: { requesterId: u.id, addresseeId: other.id } });
      await notify(other.id, { kind: "social", title: "Friend request", body: `${u.username} wants to join your crew` });
      return { message: "Request sent" };
    } else return { message: "Request already pending" };
  } else {
    const f = await prisma.friendship.findUnique({ where: { id: d.friendshipId } });
    if (!f || (f.requesterId !== u.id && f.addresseeId !== u.id)) throw new HttpError(404, "Not found");
    otherId = f.requesterId === u.id ? f.addresseeId : f.requesterId;
    if (d.action === "accept") {
      if (f.addresseeId !== u.id) throw new HttpError(400, "Can't accept your own request");
      await prisma.friendship.update({ where: { id: f.id }, data: { status: "ACCEPTED" } });
      await notify(f.requesterId, { kind: "social", title: "New crew member", body: `${u.username} accepted your request` });
    } else {
      await prisma.friendship.delete({ where: { id: f.id } });
      return { message: d.action === "decline" ? "Declined" : "Removed" };
    }
  }
  for (const id of [u.id, otherId]) if ((await friendIds(id)).length >= 5) await unlock(id, "social_5");
  return { message: "You're now friends" };
});
