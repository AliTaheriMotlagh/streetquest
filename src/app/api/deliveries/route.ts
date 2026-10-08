import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { spendCoins, track } from "@/server/rewards";

const pub = { select: { id: true, username: true, avatar: true } } as const;

export const GET = route(async () => {
  const u = await requireUser();
  const [sent, carrying] = await Promise.all([
    prisma.delivery.findMany({ where: { senderId: u.id }, include: { courier: pub }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.delivery.findMany({ where: { courierId: u.id }, include: { sender: pub }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  // Only the sender ever sees the handover code.
  return { sent, carrying: carrying.map(({ dropoffCode: _c, ...d }) => d) };
});

const Point = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) };
const Schema = z.object({
  title: z.string().trim().min(3).max(60),
  description: z.string().trim().max(500).default(""),
  pickupLabel: z.string().trim().min(2).max(120),
  pickupLat: Point.lat,
  pickupLng: Point.lng,
  dropoffLabel: z.string().trim().min(2).max(120),
  dropoffLat: Point.lat,
  dropoffLng: Point.lng,
  reward: z.number().int().min(10).max(100_000),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const open = await prisma.delivery.count({ where: { senderId: u.id, status: { in: ["OPEN", "ACCEPTED", "PICKED_UP"] } } });
  if (open >= 5) throw new HttpError(400, "You already have 5 active delivery requests");
  await spendCoins(u.id, d.reward); // escrow
  const delivery = await prisma.delivery.create({
    data: { ...d, senderId: u.id, dropoffCode: String(Math.floor(1000 + Math.random() * 9000)) },
  });
  await track("delivery_created", { userId: u.id });
  return { message: `Request posted. Give code ${delivery.dropoffCode} to the recipient.`, delivery };
});
