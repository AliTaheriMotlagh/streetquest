// Delivery state machine: OPEN → ACCEPTED → PICKED_UP → DELIVERED (or CANCELLED).
import { z } from "zod";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { requireUser } from "@/server/auth";
import { notify } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { grant, lastKnownLocation, unlock } from "@/server/rewards";

const Schema = z.object({ action: z.enum(["accept", "pickup", "deliver", "cancel"]), code: z.string().optional() });
const CHECKIN_M = 75;

export const POST = route(async (req, ctx) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const d = await body(req, Schema);
  const del = await prisma.delivery.findUnique({ where: { id } });
  if (!del) throw new HttpError(404, "Delivery not found");
  const isSender = del.senderId === u.id;
  const isCourier = del.courierId === u.id;
  // Conditional update guards against two couriers racing for the same job.
  const move = async (from: string, data: Parameters<typeof prisma.delivery.update>[0]["data"]) => {
    const r = await prisma.delivery.updateMany({ where: { id, status: from }, data });
    if (!r.count) throw new HttpError(409, "Delivery state changed, refresh");
  };

  switch (d.action) {
    case "accept": {
      if (isSender) throw new HttpError(400, "You can't courier your own package");
      if (del.status !== "OPEN") throw new HttpError(400, "Already taken");
      const active = await prisma.delivery.count({ where: { courierId: u.id, status: { in: ["ACCEPTED", "PICKED_UP"] } } });
      if (active >= 2) throw new HttpError(400, "You can carry at most 2 packages at once");
      await move("OPEN", { status: "ACCEPTED", courierId: u.id, acceptedAt: new Date() });
      await notify(del.senderId, { kind: "delivery", title: "📦 Courier assigned", body: `${u.username} accepted "${del.title}"` });
      return { message: "Job accepted — head to the pickup point" };
    }
    case "pickup": {
      if (!isCourier || del.status !== "ACCEPTED") throw new HttpError(400, "Not your job to pick up");
      const here = await lastKnownLocation(u.id);
      if (distanceM(here, { lat: del.pickupLat, lng: del.pickupLng }) > CHECKIN_M) throw new HttpError(400, "You must be at the pickup point");
      await move("ACCEPTED", { status: "PICKED_UP", pickedUpAt: new Date() });
      await notify(del.senderId, { kind: "delivery", title: "📦 Package picked up", body: `${u.username} has "${del.title}"` });
      return { message: "Package picked up — get it to the drop-off" };
    }
    case "deliver": {
      if (!isCourier || del.status !== "PICKED_UP") throw new HttpError(400, "Nothing to deliver");
      const here = await lastKnownLocation(u.id);
      if (distanceM(here, { lat: del.dropoffLat, lng: del.dropoffLng }) > CHECKIN_M) throw new HttpError(400, "You must be at the drop-off point");
      if (d.code !== del.dropoffCode) throw new HttpError(400, "Wrong handover code — ask the recipient");
      await move("PICKED_UP", { status: "DELIVERED", deliveredAt: new Date() });
      const km = distanceM({ lat: del.pickupLat, lng: del.pickupLng }, { lat: del.dropoffLat, lng: del.dropoffLng }) / 1000;
      await grant(u.id, { coins: del.reward, xp: 200 + Math.round(km * 50) });
      await grant(del.senderId, { xp: 50 });
      const done = await prisma.delivery.count({ where: { courierId: u.id, status: "DELIVERED" } });
      await unlock(u.id, "courier_1");
      if (done >= 10) await unlock(u.id, "courier_10");
      await notify(del.senderId, { kind: "delivery", title: "✅ Delivered!", body: `"${del.title}" was handed over by ${u.username}` });
      return { message: `Delivered! +${del.reward} coins` };
    }
    case "cancel": {
      if (isSender && del.status === "OPEN") {
        await move("OPEN", { status: "CANCELLED" });
        await grant(u.id, { coins: del.reward }); // refund escrow
        return { message: "Request cancelled, coins refunded" };
      }
      if (isCourier && del.status === "ACCEPTED") {
        await move("ACCEPTED", { status: "OPEN", courierId: null, acceptedAt: null });
        await notify(del.senderId, { kind: "delivery", title: "Courier dropped your job", body: `"${del.title}" is open again` });
        return { message: "You dropped the job" };
      }
      throw new HttpError(400, "Can't cancel at this stage — contact support");
    }
  }
});
