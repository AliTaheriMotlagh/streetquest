import { prisma } from "../lib/db";
import { regionKey } from "../lib/geo";

export const dmRoom = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

export async function areFriends(a: string, b: string) {
  const f = await prisma.friendship.findFirst({
    where: { status: "ACCEPTED", OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
  });
  return !!f;
}

export async function friendIds(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

export async function currentRegion(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { lastLat: true, lastLng: true } });
  return u?.lastLat != null && u.lastLng != null ? regionKey({ lat: u.lastLat, lng: u.lastLng }) : null;
}

/** Returns the user ids that should receive a message in `room`, or null if not allowed. */
export async function roomAudience(userId: string, room: string): Promise<"broadcast" | string[] | null> {
  if (room === "global") return "broadcast";
  if (room.startsWith("local:")) return room === `local:${await currentRegion(userId)}` ? "broadcast" : null;
  if (room.startsWith("dm:")) {
    const [, a, b] = room.split(":");
    if (userId !== a && userId !== b) return null;
    return (await areFriends(a, b)) ? [a, b] : null;
  }
  if (room.startsWith("event:")) {
    const eventId = room.slice(6);
    const ps = await prisma.eventParticipant.findMany({ where: { eventId }, select: { userId: true } });
    const ids = ps.map((p) => p.userId);
    return ids.includes(userId) ? ids : null;
  }
  return null;
}
