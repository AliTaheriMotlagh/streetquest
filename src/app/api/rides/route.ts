// Ride hailing: request a car (fare held in escrow) and see your current ride.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { RIDE_MAX_FARE, RIDE_MIN_FARE } from "@/lib/rides";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { isOnline } from "@/server/hub";
import { spendCoins, track } from "@/server/rewards";
import { expireRides } from "@/server/rides";

const pub = { select: { id: true, username: true, avatar: true, lastLat: true, lastLng: true, lastSeenAt: true } } as const;
const ACTIVE = ["REQUESTED", "ACCEPTED", "ONBOARD"];

/** Where the other person is — shared only between the two people in an accepted ride. */
const live = (p: { lastLat: number | null; lastLng: number | null; lastSeenAt: Date | null } | null) =>
  p && p.lastLat != null && p.lastLng != null && isOnline(p.lastSeenAt) ? { lat: p.lastLat, lng: p.lastLng } : null;

export const GET = route(async () => {
  const u = await requireUser();
  await expireRides({ riderId: u.id });
  const [riding, driving, history] = await Promise.all([
    prisma.ride.findFirst({ where: { riderId: u.id, status: { in: ACTIVE } }, include: { driver: pub }, orderBy: { createdAt: "desc" } }),
    prisma.ride.findFirst({ where: { driverId: u.id, status: { in: ["ACCEPTED", "ONBOARD"] } }, include: { rider: pub }, orderBy: { createdAt: "desc" } }),
    prisma.ride.findMany({
      where: { OR: [{ riderId: u.id }, { driverId: u.id }], status: { in: ["DONE", "CANCELLED"] } },
      include: { rider: { select: { username: true } }, driver: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return {
    // Only the rider ever sees the PIN.
    riding: riding && {
      ...riding,
      driver: riding.driver && { id: riding.driver.id, username: riding.driver.username, avatar: riding.driver.avatar, pos: live(riding.driver) },
    },
    driving: driving && (({ pin: _p, ...r }) => ({
      ...r,
      rider: { id: driving.rider.id, username: driving.rider.username, avatar: driving.rider.avatar, pos: live(driving.rider) },
    }))(driving),
    history: history.map(({ pin: _p, ...r }) => ({ ...r, mine: r.riderId === u.id ? "rider" : "driver" })),
  };
});

const Point = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) };
const Schema = z.object({
  pickupLabel: z.string().trim().min(2).max(120),
  pickupLat: Point.lat,
  pickupLng: Point.lng,
  dropoffLabel: z.string().trim().min(2).max(120),
  dropoffLat: Point.lat,
  dropoffLng: Point.lng,
  seats: z.number().int().min(1).max(4).default(1),
  note: z.string().trim().max(200).default(""),
  fare: z.number().int().min(RIDE_MIN_FARE).max(RIDE_MAX_FARE),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.pickupLat === d.dropoffLat && d.pickupLng === d.dropoffLng) throw new HttpError(400, "Pick a destination different from the pickup");
  if (await prisma.ride.count({ where: { riderId: u.id, status: { in: ACTIVE } } })) throw new HttpError(400, "You already have a ride on the way");
  await spendCoins(u.id, d.fare); // escrow
  const ride = await prisma.ride.create({ data: { ...d, riderId: u.id, pin: String(Math.floor(1000 + Math.random() * 9000)) } });
  await track("ride_requested", { userId: u.id });
  return { message: `🚕 Car requested — tell your driver PIN ${ride.pin} at pickup`, ride };
});
