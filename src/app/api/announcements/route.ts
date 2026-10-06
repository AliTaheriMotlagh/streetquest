import { prisma } from "@/lib/db";
import { route } from "@/server/http";

export const GET = route(async () => ({
  announcements: await prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 3 }),
}));
