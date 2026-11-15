// Stamps User.pulseAt: "something /api/sync reports changed for these players" (lib/pulse.ts).
// Call it after every write the sync poll reads — a notification, a private chat message,
// a call ringing or ending — or that player's poll keeps answering "same" until the next
// full one. tests/pulse.test.ts checks every such write sits next to a pulse() call.
import { prisma } from "../lib/db";

export async function pulse(userIds: string | Iterable<string>) {
  const ids = [...new Set(typeof userIds === "string" ? [userIds] : userIds)].filter(Boolean);
  if (!ids.length) return;
  await prisma.user.updateMany({ where: { id: { in: ids } }, data: { pulseAt: new Date() } }).catch(() => {});
}
