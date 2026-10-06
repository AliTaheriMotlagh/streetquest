import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { roomAudience } from "@/server/rooms";

export const GET = route(async (req) => {
  const u = await requireUser();
  const room = new URL(req.url).searchParams.get("room") ?? "global";
  if (!(await roomAudience(u.id, room))) throw new HttpError(403, "No access to this room");
  const msgs = await prisma.message.findMany({
    where: { room },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { author: { select: { id: true, username: true, avatar: true } } },
  });
  return { messages: msgs.reverse().map(({ authorId: _a, ...m }) => m) };
});
