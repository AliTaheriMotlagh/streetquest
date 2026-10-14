// Life-sim actions for your commander: eat, rest at base, hang out with nearby players.
import { z } from "zod";
import { ITEM_BY_KEY } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { distanceM } from "@/lib/geo";
import { levelOf } from "@/lib/rts";
import { AT_BASE_M, MESS_HALL_COST, REST_COOLDOWN_MS, SOCIAL_COOLDOWN_MS } from "@/lib/sims";
import { requireUser } from "@/server/auth";
import { loadBase } from "@/server/army";
import { body, HttpError, actionRoute } from "@/server/http";
import { isOnline, notify } from "@/server/hub";
import { bumpNeeds } from "@/server/needs";
import { lastKnownLocation, spendCoins } from "@/server/rewards";
import { questEvent } from "@/server/quests";
import { t } from "@/lib/i18n";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("eat"), itemKey: z.string().max(40) }),
  z.object({ action: z.literal("mess") }),
  z.object({ action: z.literal("rest") }),
  z.object({ action: z.literal("socialize"), userId: z.string().max(40) }),
]);

async function atBase(userId: string) {
  const [base, here] = await Promise.all([loadBase({ ownerId: userId }), lastKnownLocation(userId)]);
  if (!base) throw new HttpError(400, t("You don't have a base yet"));
  if (distanceM(here, base) > AT_BASE_M) throw new HttpError(400, t("Go home first — be within {m} m of your base", { m: AT_BASE_M }));
  return base;
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "eat") {
    const item = ITEM_BY_KEY[d.itemKey];
    if (!item?.food) throw new HttpError(400, t("You can't eat that"));
    const res = await prisma.inventoryItem.updateMany({ where: { userId: u.id, itemKey: item.key, qty: { gte: 1 } }, data: { qty: { decrement: 1 } } });
    if (!res.count) throw new HttpError(400, t("No {item} in your bag", { item: t(item.name) }));
    await bumpNeeds(u.id, { hunger: item.food });
    await questEvent(u.id, "eat");
    return { message: `${item.emoji} ${t("Yum! Hunger +{n}", { n: item.food ?? 0 })}` };
  }

  if (d.action === "mess") {
    const base = await atBase(u.id);
    if (levelOf(base.buildings, "quarters") < 1) throw new HttpError(400, t("Build Quarters to get a mess hall"));
    await spendCoins(u.id, MESS_HALL_COST);
    await bumpNeeds(u.id, { hunger: 45 });
    await questEvent(u.id, "eat");
    return { message: t("🍲 Hot meal at the mess hall. Hunger +45") };
  }

  if (d.action === "rest") {
    if (u.restedAt && Date.now() - u.restedAt.getTime() < REST_COOLDOWN_MS) throw new HttpError(429, t("You just rested — not tired enough to sleep yet"));
    const base = await atBase(u.id);
    const gain = 30 + 10 * levelOf(base.buildings, "quarters");
    await bumpNeeds(u.id, { energy: gain }, { restedAt: new Date() });
    await questEvent(u.id, "rest");
    return { message: t("😴 Power nap at {base}. Energy +{n}", { base: base.name, n: gain }) };
  }

  // socialize
  if (d.userId === u.id) throw new HttpError(400, t("Talking to yourself doesn't count"));
  if (u.socialAt && Date.now() - u.socialAt.getTime() < SOCIAL_COOLDOWN_MS) throw new HttpError(429, t("Give it a few minutes before the next hangout"));
  const other = await prisma.user.findUnique({ where: { id: d.userId } });
  const here = await lastKnownLocation(u.id);
  if (!other || !isOnline(other.lastSeenAt) || other.lastLat == null || other.lastLng == null) throw new HttpError(400, t("They're not online"));
  if (distanceM(here, { lat: other.lastLat, lng: other.lastLng }) > 120) throw new HttpError(400, t("Get closer — hang out in person (within 120 m)"));
  await bumpNeeds(u.id, { social: 25, fun: 5 }, { socialAt: new Date() });
  await bumpNeeds(other.id, { social: 15 });
  await questEvent(u.id, "socialize");
  await notify(other.id, () => ({ kind: "social", title: t("👋 {name} hung out with you", { name: u.username }), body: t("Social +15") }));
  return { message: t("🤝 Hung out with {name}. Social +25", { name: other.username }) };
});
