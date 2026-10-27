// Businesses: real stores on the map, their campaigns, check-ins and coupon redemptions,
// and what the owner sees on their dashboard. Rules and plans are in lib/business.ts.
import { randomInt } from "node:crypto";
import { prisma } from "../lib/db";
import { bbox, distanceM, type LatLng } from "../lib/geo";
import { activePlan, BIZ_CHECKIN_M, COUPON_ALPHABET, PLAN_BY_KEY, PLAN_DAYS, type PlanKey } from "../lib/business";
import { PLACE_CATS, type PlaceCat } from "../lib/places";
import { S } from "../lib/settings";
import { msg, t } from "../lib/i18n";
import { HttpError } from "./http";
import { notify } from "./hub";
import { grant, track } from "./rewards";
import { autoPost } from "./social";
import { stripeCheckout } from "./store";

const MONTH_MS = 30 * 86_400_000;
const live = (now = new Date()) => ({ paused: false, activeFrom: { lte: now }, activeTo: { gt: now } });

export type WorldBusiness = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  about: string;
  address: string;
  lat: number;
  lng: number;
  verified: boolean;
  featured: boolean;
  mine: boolean;
  osmId: string | null;
  campaigns: {
    id: string;
    title: string;
    description: string;
    kind: string;
    offer: string;
    rewardCoins: number;
    rewardXp: number;
    bonusCoins: number;
    left: number;
    activeTo: string;
    visited: boolean;
    code: string | null;
    redeemed: boolean;
  }[];
};

/** Businesses around the player with their running campaigns (and the player's own visits). */
export async function bizAround(here: LatLng, userId: string, radiusM = 3000): Promise<WorldBusiness[]> {
  if (!S.bizEnabled) return [];
  const b = bbox(here, radiusM);
  const now = new Date();
  const rows = await prisma.business.findMany({
    where: { lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } },
    include: { campaigns: { where: live(now), orderBy: { createdAt: "desc" }, take: 5 } },
    take: 80,
  });
  const ids = rows.flatMap((r) => r.campaigns.map((c) => c.id));
  const mine = new Map((await prisma.bizVisit.findMany({ where: { userId, campaignId: { in: ids } }, select: { campaignId: true, code: true, redeemedAt: true } })).map((v) => [v.campaignId, v]));
  return rows.map((r) => {
    const plan = activePlan(r, now.getTime());
    return {
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      category: r.category,
      about: r.about,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      verified: r.verified,
      featured: plan.featured,
      mine: r.ownerId === userId,
      osmId: r.osmId,
      campaigns: r.campaigns.filter((c) => c.visits < c.maxVisits).map((c) => {
        const v = mine.get(c.id);
        return { id: c.id, title: c.title, description: c.description, kind: c.kind, offer: c.offer, rewardCoins: c.rewardCoins, rewardXp: c.rewardXp, bonusCoins: c.bonusCoins, left: c.maxVisits - c.visits, activeTo: c.activeTo.toISOString(), visited: !!v, code: v?.code ?? null, redeemed: !!v?.redeemedAt };
      }),
    };
  });
}

/** Check-ins across a business's campaigns in the last 30 days (the plan's monthly quota). */
const visitsThisMonth = (businessId: string) => prisma.bizVisit.count({ where: { campaign: { businessId }, createdAt: { gt: new Date(Date.now() - MONTH_MS) } } });

const newCode = () => Array.from({ length: 6 }, () => COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)]).join("");

export async function checkIn(user: { id: string; username: string }, campaignId: string, here: LatLng) {
  if (!S.bizEnabled) throw new HttpError(400, t("Business missions are switched off right now"));
  const now = new Date();
  const c = await prisma.bizCampaign.findFirst({ where: { id: campaignId, ...live(now) }, include: { business: true } });
  if (!c) throw new HttpError(404, t("This mission has ended"));
  if (c.business.ownerId === user.id) throw new HttpError(400, t("That's your own business"));
  if (distanceM(here, c.business) > BIZ_CHECKIN_M + S.claimSlack) throw new HttpError(400, t("Go to {place} to check in", { place: c.business.name }));
  if (c.visits >= c.maxVisits) throw new HttpError(410, t("All spots for this mission are taken"));
  const plan = activePlan(c.business);
  if ((await visitsThisMonth(c.businessId)) >= plan.visitsPerMonth) throw new HttpError(410, t("{place} has reached its monthly visits — try again later", { place: c.business.name }));

  let code = newCode();
  for (let i = 0; ; i++) {
    try {
      await prisma.bizVisit.create({ data: { campaignId: c.id, userId: user.id, code } });
      break;
    } catch (e) {
      if (await prisma.bizVisit.findUnique({ where: { campaignId_userId: { campaignId: c.id, userId: user.id } } })) throw new HttpError(409, t("You already checked in here"));
      if (i > 4) throw e;
      code = newCode();
    }
  }
  const after = await prisma.bizCampaign.update({ where: { id: c.id }, data: { visits: { increment: 1 } }, select: { visits: true } });
  const coins = Math.min(S.bizCampaignMaxCoins, c.rewardCoins);
  await grant(user.id, { xp: c.rewardXp, coins });
  await track("biz_visit", { userId: user.id, campaign: c.businessId });
  await autoPost(user.id, "business", { t: msg("{emoji} Visited {place}"), v: { emoji: c.business.emoji, place: c.business.name } }, { name: c.business.name, cat: c.business.category, lat: c.business.lat, lng: c.business.lng });
  if (after.visits === 1 || after.visits % 10 === 0)
    await notify(c.business.ownerId, () => ({ kind: "reward", link: "biz", title: t("🏪 {n} players visited {place}", { n: after.visits, place: c.business.name }), body: t(c.kind === "coupon" ? msg("“{title}” is bringing people in. Enter their codes at the till.") : msg("“{title}” is bringing people in."), { title: c.title }) }));
  const coupon = c.kind === "coupon" && plan.coupons;
  return {
    code: coupon ? code : null,
    message: coupon
      ? t("✅ Checked in at {place} · +{n} 🪙 — show code {code} at the till for {offer}", { place: c.business.name, n: coins, code, offer: c.offer || t("your reward") })
      : t("✅ Checked in at {place} · +{n} 🪙", { place: c.business.name, n: coins }),
  };
}

/** The owner enters a player's coupon code at the till. */
export async function redeem(ownerId: string, businessId: string, rawCode: string) {
  const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const biz = await prisma.business.findFirst({ where: { id: businessId, ownerId } });
  if (!biz) throw new HttpError(404, t("Business not found"));
  const v = await prisma.bizVisit.findFirst({ where: { code, campaign: { businessId } }, include: { campaign: true, user: { select: { id: true, username: true } } } });
  if (!v) throw new HttpError(404, t("No customer has code {code}", { code }));
  const flipped = await prisma.bizVisit.updateMany({ where: { id: v.id, redeemedAt: null }, data: { redeemedAt: new Date() } });
  if (!flipped.count) throw new HttpError(409, t("Code {code} was already used", { code }));
  await prisma.bizCampaign.update({ where: { id: v.campaignId }, data: { redeemed: { increment: 1 } } });
  const bonus = Math.min(S.bizCampaignMaxCoins, v.campaign.bonusCoins);
  if (bonus) await grant(v.userId, { coins: bonus });
  await notify(v.userId, () => ({ kind: "reward", title: t("🎟️ Coupon used at {place}", { place: biz.name }), body: bonus ? t("+{n} 🪙 bonus — thanks for shopping local!", { n: bonus }) : undefined }));
  await track("biz_redeem", { userId: v.userId, campaign: businessId });
  return { message: t("✅ {name}'s coupon redeemed — {offer}", { name: v.user.username, offer: v.campaign.offer || v.campaign.title }) };
}

/** Everything the owner's dashboard shows. */
export async function dashboard(ownerId: string) {
  const rows = await prisma.business.findMany({ where: { ownerId }, include: { campaigns: { orderBy: { createdAt: "desc" }, take: 30 } }, orderBy: { createdAt: "asc" } });
  const since = new Date(Date.now() - MONTH_MS);
  return Promise.all(
    rows.map(async (b) => {
      const plan = activePlan(b);
      const [month, redeemedMonth, players, recent] = await Promise.all([
        visitsThisMonth(b.id),
        prisma.bizVisit.count({ where: { campaign: { businessId: b.id }, redeemedAt: { gt: since } } }),
        prisma.bizVisit.groupBy({ by: ["userId"], where: { campaign: { businessId: b.id } }, _count: { _all: true } }),
        prisma.bizVisit.findMany({ where: { campaign: { businessId: b.id } }, orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { username: true, avatar: true } }, campaign: { select: { title: true } } } }),
      ]);
      return {
        id: b.id,
        name: b.name,
        emoji: b.emoji,
        category: b.category,
        about: b.about,
        address: b.address,
        phone: b.phone,
        website: b.website,
        lat: b.lat,
        lng: b.lng,
        osmId: b.osmId,
        verified: b.verified,
        views: b.views,
        plan: plan.key,
        planUntil: plan.key === "free" ? null : b.planUntil?.toISOString() ?? null,
        trialUsed: b.trialUsed,
        stats: { visitsMonth: month, quota: plan.visitsPerMonth, redeemedMonth, customers: players.length, repeat: players.filter((p) => p._count._all > 1).length },
        campaigns: b.campaigns.map((c) => ({ id: c.id, title: c.title, description: c.description, kind: c.kind, offer: c.offer, rewardCoins: c.rewardCoins, rewardXp: c.rewardXp, bonusCoins: c.bonusCoins, maxVisits: c.maxVisits, visits: c.visits, redeemed: c.redeemed, views: c.views, activeFrom: c.activeFrom.toISOString(), activeTo: c.activeTo.toISOString(), paused: c.paused, live: !c.paused && c.activeFrom <= new Date() && c.activeTo > new Date() && c.visits < c.maxVisits })),
        recent: recent.map((v) => ({ id: v.id, username: v.user.username, avatar: v.user.avatar, campaign: v.campaign.title, at: v.createdAt.toISOString(), redeemed: !!v.redeemedAt })),
      };
    }),
  );
}
export type BizDashboard = Awaited<ReturnType<typeof dashboard>>[number];

/** Extend a business's plan by one period (a paid checkout, or an admin gift). */
export async function extendPlan(businessId: string, plan: PlanKey, days = PLAN_DAYS) {
  const b = await prisma.business.findUnique({ where: { id: businessId } });
  if (!b) return null;
  // Same plan: add to what's left. Another plan: starts now.
  const from = b.plan === plan && b.planUntil && b.planUntil.getTime() > Date.now() ? b.planUntil.getTime() : Date.now();
  const until = new Date(from + days * 86_400_000);
  await prisma.business.update({ where: { id: businessId }, data: { plan, planUntil: until } });
  await notify(b.ownerId, () => ({ kind: "reward", link: "biz", title: t("{emoji} {place} is on the {plan} plan", { emoji: PLAN_BY_KEY[plan].emoji, place: b.name, plan: t(PLAN_BY_KEY[plan].name) }), body: t("Until {date}", { date: until.toISOString().slice(0, 10) }) }));
  return until;
}

export async function startTrial(ownerId: string, businessId: string) {
  const b = await prisma.business.findFirst({ where: { id: businessId, ownerId } });
  if (!b) throw new HttpError(404, t("Business not found"));
  if (b.trialUsed) throw new HttpError(400, t("The free trial was already used"));
  if (activePlan(b).key !== "free") throw new HttpError(400, t("You're already on a paid plan"));
  if (!S.bizTrialDays) throw new HttpError(400, t("There's no free trial right now"));
  await prisma.business.update({ where: { id: b.id }, data: { trialUsed: true } });
  await extendPlan(b.id, "starter", S.bizTrialDays);
  return { message: t("🚀 {n}-day Starter trial on — coupons unlocked!", { n: S.bizTrialDays }) };
}

export async function planCheckout(ownerId: string, businessId: string, plan: PlanKey, origin: string) {
  const b = await prisma.business.findFirst({ where: { id: businessId, ownerId } });
  if (!b) throw new HttpError(404, t("Business not found"));
  const def = PLAN_BY_KEY[plan];
  if (!def || !def.priceCents) throw new HttpError(400, t("Pick a paid plan"));
  return stripeCheckout(ownerId, {
    pack: `biz:${plan}:${b.id}`,
    name: `StreetQuest ${def.name} — ${b.name} (${PLAN_DAYS} days)`,
    amountCents: def.priceCents,
    metadata: { kind: "biz", plan, businessId: b.id },
    successPath: `/play?bizpaid={CHECKOUT_SESSION_ID}`,
  }, origin);
}

export const catLabel = (cat: string) => PLACE_CATS[cat as PlaceCat]?.label ?? PLACE_CATS.shop.label;
