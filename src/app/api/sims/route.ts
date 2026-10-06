// Life-sim actions for your commander: eat, rest at base, hang out with nearby players.
import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { levelOf } from "@/lib/rts";
import { AT_BASE_M, MESS_HALL_COST, REST_COOLDOWN_MS, SOCIAL_COOLDOWN_MS } from "@/lib/sims";
import { requireUser } from "@/server/auth";
import { loadBase } from "@/server/army";
import { body, HttpError, route } from "@/server/http";
import { isOnline, notify } from "@/server/hub";
import { bumpNeeds } from "@/server/needs";
import { lastKnownLocation, spendCoins } from "@/server/rewards";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("eat"), itemKey: z.string().max(40) }),
  z.object({ action: z.literal("mess") }),
  z.object({ action: z.literal("rest") }),
  z.object({ action: z.literal("socialize"), userId: z.string().max(40) }),
]);

async function atBase(userId: string) {
  const [base, here] = await Promise.all([loadBase({ ownerId: userId }), lastKnownLocation(userId)]);
  if (!base) throw new HttpError(400, "You don't have a base yet");
  if (distanceM(here, base) > AT_BASE_M) throw new HttpError(400, `Go home first — be within ${AT_BASE_M} m of your base`);
  return base;
}

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "eat") {
    const item = ITEM_BY_KEY[d.itemKey];
    if (!item?.food) throw new HttpError(400, "You can't eat that");
    const res = await prisma.inventoryItem.updateMany({ where: { userId: u.id, itemKey: item.key, qty: { gte: 1 } }, data: { qty: { decrement: 1 } } });
    if (!res.count) throw new HttpError(400, `No ${item.name} in your bag`);
    await bumpNeeds(u.id, { hunger: item.food });
    return { message: `${item.emoji} Yum! Hunger +${item.food}` };
  }

  if (d.action === "mess") {
    const base = await atBase(u.id);
    if (levelOf(base.buildings, "quarters") < 1) throw new HttpError(400, "Build Quarters to get a mess hall");
    await spendCoins(u.id, MESS_HALL_COST);
    await bumpNeeds(u.id, { hunger: 45 });
    return { message: `🍲 Hot meal at the mess hall. Hunger +45` };
  }

  if (d.action === "rest") {
    if (u.restedAt && Date.now() - u.restedAt.getTime() < REST_COOLDOWN_MS) throw new HttpError(429, "You just rested — not tired enough to sleep yet");
    const base = await atBase(u.id);
    const gain = 30 + 10 * levelOf(base.buildings, "quarters");
    await bumpNeeds(u.id, { energy: gain }, { restedAt: new Date() });
    return { message: `😴 Power nap at ${base.name}. Energy +${gain}` };
  }

  // socialize
  if (d.userId === u.id) throw new HttpError(400, "Talking to yourself doesn't count");
  if (u.socialAt && Date.now() - u.socialAt.getTime() < SOCIAL_COOLDOWN_MS) throw new HttpError(429, "Give it a few minutes before the next hangout");
  const other = await prisma.user.findUnique({ where: { id: d.userId } });
  const here = await lastKnownLocation(u.id);
  if (!other || !isOnline(other.lastSeenAt) || other.lastLat == null || other.lastLng == null) throw new HttpError(400, "They're not online");
  if (distanceM(here, { lat: other.lastLat, lng: other.lastLng }) > 120) throw new HttpError(400, "Get closer — hang out in person (within 120 m)");
  await bumpNeeds(u.id, { social: 25, fun: 5 }, { socialAt: new Date() });
  await bumpNeeds(other.id, { social: 15 });
  await notify(other.id, { kind: "social", title: `👋 ${u.username} hung out with you`, body: "Social +15" });
  return { message: `🤝 Hung out with ${other.username}. Social +25` };
});
