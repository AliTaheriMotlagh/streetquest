// Ride state machine: REQUESTED → ACCEPTED → ONBOARD → DONE (or CANCELLED).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { driverXp, RIDE_CHECKIN_M, RIDE_REQUEST_TTL_MS, RIDE_RIDER_DROPOFF_M } from "@/lib/rides";
import { requireUser } from "@/server/auth";
import { notify } from "@/server/hub";
import { body, HttpError, actionRoute } from "@/server/http";
import { bumpNeeds } from "@/server/needs";
import { grant, lastKnownLocation, unlock } from "@/server/rewards";

const Schema = z.object({ action: z.enum(["accept", "start", "complete", "arrive", "cancel"]), pin: z.string().max(8).optional() });

export const POST = actionRoute(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const d = await body(req, Schema);
  const ride = await prisma.ride.findUnique({ where: { id } });
  if (!ride) throw new HttpError(404, "Ride not found");
  const isRider = ride.riderId === u.id;
  const isDriver = ride.driverId === u.id;
  // Conditional update guards against two drivers racing for the same rider.
  const move = async (from: string, data: Parameters<typeof prisma.ride.update>[0]["data"]) => {
    const r = await prisma.ride.updateMany({ where: { id, status: from }, data });
    if (!r.count) throw new HttpError(409, "Ride changed — refresh");
  };
  const pickup = { lat: ride.pickupLat, lng: ride.pickupLng };
  const dropoff = { lat: ride.dropoffLat, lng: ride.dropoffLng };

  /** Pay the driver and close the ride. */
  const finish = async (how: string) => {
    await move("ONBOARD", { status: "DONE", endedAt: new Date() });
    const km = distanceM(pickup, dropoff) / 1000;
    await grant(ride.driverId!, { coins: ride.fare }, { raw: true }); // the rider's escrow
    await grant(ride.driverId!, { xp: driverXp(km) });
    await grant(ride.riderId, { xp: 40 });
    // A shared ride is a hangout too (life-sim layer).
    await bumpNeeds(ride.driverId!, { social: 15, fun: 5 });
    await bumpNeeds(ride.riderId, { social: 15, fun: 5 });
    const done = await prisma.ride.count({ where: { driverId: ride.driverId, status: "DONE" } });
    await unlock(ride.driverId!, "driver_1");
    if (done >= 10) await unlock(ride.driverId!, "driver_10");
    const other = isRider ? ride.driverId! : ride.riderId;
    await notify(other, { kind: "delivery", title: "🏁 Ride complete", body: isRider ? `${u.username} confirmed arrival — +${ride.fare} coins` : `You arrived at ${ride.dropoffLabel}` });
    return { message: `🏁 ${how} ${isDriver ? `+${ride.fare} coins` : "Thanks for riding!"}` };
  };

  switch (d.action) {
    case "accept": {
      if (isRider) throw new HttpError(400, "You can't drive yourself");
      if (ride.status !== "REQUESTED" || Date.now() - ride.createdAt.getTime() > RIDE_REQUEST_TTL_MS) throw new HttpError(400, "That rider is no longer waiting");
      if (await prisma.ride.count({ where: { driverId: u.id, status: { in: ["ACCEPTED", "ONBOARD"] } } })) throw new HttpError(400, "Finish your current ride first");
      await move("REQUESTED", { status: "ACCEPTED", driverId: u.id, acceptedAt: new Date() });
      await notify(ride.riderId, { kind: "delivery", title: "🚕 Driver on the way", body: `${u.username} is coming to ${ride.pickupLabel}` });
      return { message: "Ride accepted — head to the pickup point" };
    }
    case "start": {
      if (!isDriver || ride.status !== "ACCEPTED") throw new HttpError(400, "Not your rider to pick up");
      const here = await lastKnownLocation(u.id);
      if (distanceM(here, pickup) > RIDE_CHECKIN_M) throw new HttpError(400, `Get to the pickup point first (within ${RIDE_CHECKIN_M} m)`);
      if (d.pin?.trim() !== ride.pin) throw new HttpError(400, "Wrong PIN — ask your rider for the 4-digit code");
      await move("ACCEPTED", { status: "ONBOARD", startedAt: new Date() });
      await notify(ride.riderId, { kind: "delivery", title: "🚗 Ride started", body: `Heading to ${ride.dropoffLabel}` });
      return { message: `Rider on board — drive to ${ride.dropoffLabel}` };
    }
    case "complete": {
      if (!isDriver || ride.status !== "ONBOARD") throw new HttpError(400, "No ride in progress");
      const here = await lastKnownLocation(u.id);
      if (distanceM(here, dropoff) > RIDE_CHECKIN_M) throw new HttpError(400, `You're not at the drop-off yet (within ${RIDE_CHECKIN_M} m)`);
      // The rider's phone has to agree they're there too — otherwise they confirm themselves.
      const rider = await prisma.user.findUnique({ where: { id: ride.riderId }, select: { lastLat: true, lastLng: true, lastSeenAt: true } });
      const riderFresh = rider?.lastLat != null && rider.lastLng != null && rider.lastSeenAt && Date.now() - rider.lastSeenAt.getTime() < 2 * 60_000;
      if (!riderFresh || distanceM({ lat: rider.lastLat!, lng: rider.lastLng! }, dropoff) > RIDE_RIDER_DROPOFF_M)
        throw new HttpError(400, "Your rider's GPS doesn't show them here — ask them to tap “I've arrived”");
      return finish("Ride complete!");
    }
    case "arrive": {
      if (!isRider || ride.status !== "ONBOARD") throw new HttpError(400, "No ride in progress");
      return finish("You've arrived.");
    }
    case "cancel": {
      if (isRider && (ride.status === "REQUESTED" || ride.status === "ACCEPTED")) {
        await move(ride.status, { status: "CANCELLED", endedAt: new Date() });
        await grant(u.id, { coins: ride.fare }, { raw: true }); // refund escrow
        if (ride.driverId) await notify(ride.driverId, { kind: "delivery", title: "🚕 Ride cancelled", body: `${u.username} cancelled the ride` });
        return { message: "Ride cancelled, fare refunded" };
      }
      if (isDriver && ride.status === "ACCEPTED") {
        // Back in the queue for another driver; the waiting clock restarts.
        await move("ACCEPTED", { status: "REQUESTED", driverId: null, acceptedAt: null, createdAt: new Date() });
        await notify(ride.riderId, { kind: "delivery", title: "🚕 Driver cancelled", body: "Looking for another driver…" });
        return { message: "You dropped the ride" };
      }
      throw new HttpError(400, ride.status === "ONBOARD" ? "The ride is under way — the rider ends it with “I've arrived”" : "Can't cancel at this stage");
    }
  }
});
