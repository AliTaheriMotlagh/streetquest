import { prisma } from "../lib/db";
import { regionKey } from "../lib/geo";
import { parseShopRoom } from "../lib/shopKinds";

export const dmRoom = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

export async function areFriends(a: string, b: string) {
  const f = await prisma.friendship.findFirst({
    where: { status: "ACCEPTED", OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
  });
  return !!f;
}

/** Direct messages: crew members, or two players who follow each other. */
export async function canDm(a: string, b: string) {
  if (await areFriends(a, b)) return true;
  const n = await prisma.follow.count({ where: { OR: [{ followerId: a, followeeId: b }, { followerId: b, followeeId: a }] } });
  return n === 2;
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
    return (await canDm(a, b)) ? [a, b] : null;
  }
  // A buyer asking a shop about a product (paid in toman, or just a question): that buyer and the shop's owner.
  if (room.startsWith("shop:")) {
    const r = parseShopRoom(room);
    if (!r) return null;
    const shop = await prisma.shop.findUnique({ where: { id: r.shopId }, select: { ownerId: true } });
    if (!shop || shop.ownerId === r.buyerId) return null;
    return userId === r.buyerId || userId === shop.ownerId ? [r.buyerId, shop.ownerId] : null;
  }
  if (room.startsWith("event:")) {
    const eventId = room.slice(6);
    const ps = await prisma.eventParticipant.findMany({ where: { eventId }, select: { userId: true } });
    const ids = ps.map((p) => p.userId);
    return ids.includes(userId) ? ids : null;
  }
  return null;
}
