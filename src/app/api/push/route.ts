// Push notifications: the VAPID public key, and (un)subscribing this device.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { pushPublicKey, pushTo } from "@/server/push";

export const GET = route(async () => {
  const u = await requireUser();
  return { publicKey: pushPublicKey(), devices: await prisma.pushSub.count({ where: { userId: u.id } }) };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), sub: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }) }),
  z.object({ action: z.literal("unsubscribe"), endpoint: z.string().max(1000) }),
  z.object({ action: z.literal("test") }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "subscribe") {
    if (!pushPublicKey()) throw new HttpError(503, "Notifications aren't set up on this server yet");
    if (!/^https:\/\//.test(d.sub.endpoint)) throw new HttpError(400, "Bad subscription");
    await prisma.pushSub.upsert({
      where: { endpoint: d.sub.endpoint },
      create: { userId: u.id, endpoint: d.sub.endpoint, p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth },
      update: { userId: u.id, p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth },
    });
    // Keep it tidy: at most 5 devices per player.
    const extra = await prisma.pushSub.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, skip: 5, select: { id: true } });
    if (extra.length) await prisma.pushSub.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    return { message: "🔔 Notifications on for this device" };
  }
  if (d.action === "unsubscribe") {
    await prisma.pushSub.deleteMany({ where: { userId: u.id, endpoint: d.endpoint } });
    return { message: "🔕 Notifications off for this device" };
  }
  const sent = await pushTo(u.id, { title: "🔔 Notifications work!", body: "You'll hear about raids, rewards and your crew here.", kind: "info", tag: "test" }, { evenIfActive: true });
  if (!sent) throw new HttpError(400, "No device to notify — turn notifications on first");
  return { message: "Test notification sent" };
});
