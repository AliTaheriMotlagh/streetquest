import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { track } from "@/server/rewards";

export const GET = route(async () => {
  const u = await requireUser();
  const mine = await prisma.event.findMany({
    where: { endsAt: { gt: new Date() }, OR: [{ creatorId: u.id }, { participants: { some: { userId: u.id } } }] },
    include: { _count: { select: { participants: true } }, participants: { where: { userId: u.id } } },
    orderBy: { startsAt: "asc" },
  });
  return {
    events: mine.map(({ participants, _count, ...e }) => ({
      ...e,
      participants: _count.participants,
      joined: participants.length > 0,
      checkedIn: !!participants[0]?.checkedInAt,
    })),
  };
});

const Schema = z
  .object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(1000).default(""),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    maxPlayers: z.number().int().min(2).max(10_000).default(50),
    isPublic: z.boolean().default(true),
  })
  .refine((d) => d.endsAt > d.startsAt, "Event must end after it starts")
  .refine((d) => d.endsAt.getTime() - d.startsAt.getTime() <= 24 * 3_600_000, "Max 24h long");

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event";

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.endsAt < new Date()) throw new HttpError(400, "That time has already passed");
  const upcoming = await prisma.event.count({ where: { creatorId: u.id, endsAt: { gt: new Date() } } });
  if (u.role !== "ADMIN" && upcoming >= 3) throw new HttpError(400, "Max 3 upcoming events per player");
  const event = await prisma.event.create({
    data: {
      ...d,
      slug: `${slugify(d.title)}-${Math.random().toString(36).slice(2, 7)}`,
      creatorId: u.id,
      official: u.role === "ADMIN",
      participants: { create: { userId: u.id } },
    },
  });
  await track("event_created", { userId: u.id });
  return { message: "Event created — share the link!", event };
});
