// Push notifications: the VAPID public key, and (un)subscribing this device.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { pushPublicKey, pushTo } from "@/server/push";
import { t } from "@/lib/i18n";

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
    if (!pushPublicKey()) throw new HttpError(503, t("Notifications aren't set up on this server yet"));
    if (!/^https:\/\//.test(d.sub.endpoint)) throw new HttpError(400, t("Bad subscription"));
    await prisma.pushSub.upsert({
      where: { endpoint: d.sub.endpoint },
      create: { userId: u.id, endpoint: d.sub.endpoint, p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth },
      update: { userId: u.id, p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth },
    });
    // Keep it tidy: at most 5 devices per player.
    const extra = await prisma.pushSub.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, skip: 5, select: { id: true } });
    if (extra.length) await prisma.pushSub.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    return { message: t("🔔 Notifications on for this device") };
  }
  if (d.action === "unsubscribe") {
    await prisma.pushSub.deleteMany({ where: { userId: u.id, endpoint: d.endpoint } });
    return { message: t("🔕 Notifications off for this device") };
  }
  const sent = await pushTo(u.id, { title: t("🔔 Notifications work!"), body: t("You'll hear about raids, rewards and your crew here."), kind: "info", tag: "test" }, { evenIfActive: true });
  if (!sent) {
    // Every device was rejected (and the dead ones just forgotten): subscribing again fixes it.
    if (await prisma.pushSub.count({ where: { userId: u.id } }).then((n) => n === 0)) throw new HttpError(400, t("No device to notify — turn notifications on first"));
    throw new HttpError(502, t("Couldn't reach this device — turn notifications off and on again"));
  }
  return { message: t("Test notification sent") };
});
