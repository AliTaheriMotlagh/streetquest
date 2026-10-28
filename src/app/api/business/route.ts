// Business center: real stores claim their place on the map, run campaigns (missions
// at the store), redeem players' coupons at the till and pick a plan. Players check in
// here too. Rules and plans: lib/business.ts; the work: server/business.ts.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bbox, distanceM } from "@/lib/geo";
import { activePlan, BIZ_LIMITS, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, PLAN_KEYS, PLANS } from "@/lib/business";
import { PLACE_CAT_KEYS, PLACE_CATS } from "@/lib/places";
import { S } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, route } from "@/server/http";
import { lastKnownLocation } from "@/server/rewards";
import { checkIn, dashboard, extendPlan, planCheckout, redeem, startTrial } from "@/server/business";
import { placesAround } from "@/server/city";
import { OwnerLinks } from "@/server/localData";
import { confirmCheckout, stripeReady } from "@/server/store";
import { notify, onlineSince } from "@/server/hub";

export const GET = route(async () => {
  const u = await requireUser();
  const here = u.lastLat != null && u.lastLng != null ? { lat: u.lastLat, lng: u.lastLng } : null;
  // Real places right here that a new business can claim (not claimed by someone else yet).
  let claimable: { id: string; name: string; cat: string; lat: number; lng: number; distanceM: number }[] = [];
  if (here) {
    const all = [...(await placesAround(here, { warm: true })).values()].flat().map((p) => ({ ...p, distanceM: Math.round(distanceM(here, p)) })).filter((p) => p.distanceM <= BIZ_SETUP_M);
    const taken = new Set((await prisma.business.findMany({ where: { osmId: { in: all.map((p) => p.id) } }, select: { osmId: true } })).map((b) => b.osmId));
    claimable = all.filter((p) => !taken.has(p.id)).sort((a, b) => a.distanceM - b.distanceM).slice(0, 25);
  }
  return { enabled: S.bizEnabled, businesses: await dashboard(u.id), plans: PLANS, payments: stripeReady(), currency: S.currency, trialDays: S.bizTrialDays, maxCoins: S.bizCampaignMaxCoins, claimable, admin: u.role === "ADMIN" };
});

const text = (n: number) => z.string().trim().max(n);
const Details = z.object({
  name: text(BIZ_LIMITS.name).min(2),
  category: z.enum(PLACE_CAT_KEYS),
  emoji: z.string().max(16).optional(),
  about: text(BIZ_LIMITS.about).default(""),
  address: text(BIZ_LIMITS.address).default(""),
  phone: text(BIZ_LIMITS.phone).default(""),
  website: text(BIZ_LIMITS.website).refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Website must start with http:// or https://").default(""),
  ...OwnerLinks,
});

const Schema = z.discriminatedUnion("action", [
  Details.extend({ action: z.literal("create"), osmId: z.string().max(40).optional() }),
  Details.extend({ action: z.literal("update"), businessId: z.string() }),
  z.object({ action: z.literal("delete"), businessId: z.string() }),
  z.object({
    action: z.literal("campaign"),
    businessId: z.string(),
    title: text(BIZ_LIMITS.title).min(3),
    description: text(BIZ_LIMITS.description).default(""),
    kind: z.enum(["visit", "coupon"]),
    offer: text(BIZ_LIMITS.offer).default(""),
    rewardCoins: z.number().int().min(0).max(5000),
    bonusCoins: z.number().int().min(0).max(5000).default(0),
    maxVisits: z.number().int().min(1).max(100_000),
    days: z.number().int().min(1).max(CAMPAIGN_MAX_DAYS),
  }),
  z.object({ action: z.literal("campaign_state"), campaignId: z.string(), state: z.enum(["pause", "resume", "end"]) }),
  z.object({ action: z.literal("redeem"), businessId: z.string(), code: z.string().max(20) }),
  z.object({ action: z.literal("trial"), businessId: z.string() }),
  z.object({ action: z.literal("checkout"), businessId: z.string(), plan: z.enum(PLAN_KEYS) }),
  z.object({ action: z.literal("confirm"), sessionId: z.string().max(200) }),
  z.object({ action: z.literal("checkin"), campaignId: z.string() }),
  z.object({ action: z.literal("view"), businessId: z.string() }),
  z.object({ action: z.literal("admin"), businessId: z.string(), plan: z.enum(PLAN_KEYS).optional(), days: z.number().int().min(1).max(3650).optional(), verified: z.boolean().optional() }),
]);

async function mine(userId: string, businessId: string) {
  const b = await prisma.business.findFirst({ where: { id: businessId, ownerId: userId } });
  if (!b) throw new HttpError(404, t("Business not found"));
  return b;
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const off = () => {
    if (!S.bizEnabled) throw new HttpError(400, t("Business accounts are switched off right now"));
  };

  if (d.action === "checkin") return checkIn(u, d.campaignId, await lastKnownLocation(u.id));
  if (d.action === "view") {
    await prisma.business.updateMany({ where: { id: d.businessId, ownerId: { not: u.id } }, data: { views: { increment: 1 } } });
    await prisma.bizCampaign.updateMany({ where: { businessId: d.businessId, paused: false, activeTo: { gt: new Date() } }, data: { views: { increment: 1 } } });
    return { ok: true };
  }

  if (d.action === "create") {
    off();
    const owned = await prisma.business.findMany({ where: { ownerId: u.id } });
    const allowed = Math.max(1, ...owned.map((b) => activePlan(b).locations));
    if (owned.length >= allowed) throw new HttpError(400, owned.length === 1 ? t("More locations need the Chain plan") : t("Your plan allows {n} locations", { n: allowed }));
    const here = await lastKnownLocation(u.id);
    let at = here;
    if (d.osmId) {
      const place = [...(await placesAround(here)).values()].flat().find((p) => p.id === d.osmId);
      if (!place) throw new HttpError(404, t("That place isn't on the map here"));
      if (await prisma.business.findFirst({ where: { osmId: d.osmId } })) throw new HttpError(409, t("{place} is already claimed — contact support if it's yours", { place: place.name }));
      at = { lat: place.lat, lng: place.lng };
    }
    // Set up from inside (or right outside) the store, so nobody claims a place they've never been to.
    if (distanceM(here, at) > BIZ_SETUP_M && u.role !== "ADMIN") throw new HttpError(400, t("Set up your business from your store"));
    const b = await prisma.business.create({
      data: { ownerId: u.id, name: d.name, category: d.category, emoji: d.emoji || PLACE_CATS[d.category].emoji, about: d.about, address: d.address, phone: d.phone, website: d.website, snappfood: d.snappfood, torob: d.torob, divar: d.divar, lat: at.lat, lng: at.lng, osmId: d.osmId ?? null },
    });
    return { message: t("🏪 {place} is on the map! Create your first mission.", { place: b.name }), id: b.id };
  }
  if (d.action === "update") {
    await mine(u.id, d.businessId);
    await prisma.business.update({ where: { id: d.businessId }, data: { name: d.name, category: d.category, emoji: d.emoji || PLACE_CATS[d.category].emoji, about: d.about, address: d.address, phone: d.phone, website: d.website, snappfood: d.snappfood, torob: d.torob, divar: d.divar } });
    return { message: t("Saved") };
  }
  if (d.action === "delete") {
    const b = await mine(u.id, d.businessId);
    if (activePlan(b).key !== "free") throw new HttpError(400, t("Wait until the paid plan ends before removing the business"));
    await prisma.business.delete({ where: { id: b.id } });
    return { message: t("{place} was removed from the map", { place: b.name }) };
  }
  if (d.action === "campaign") {
    off();
    const b = await mine(u.id, d.businessId);
    const plan = activePlan(b);
    const now = new Date();
    const running = await prisma.bizCampaign.count({ where: { businessId: b.id, paused: false, activeTo: { gt: now } } });
    if (running >= plan.campaigns) throw new HttpError(400, t("Your plan runs {n} missions at a time — end one or upgrade", { n: plan.campaigns }));
    if (d.kind === "coupon" && !plan.coupons) throw new HttpError(400, t("Coupons need the Starter plan or higher"));
    if (d.rewardCoins > S.bizCampaignMaxCoins || d.bonusCoins > S.bizCampaignMaxCoins) throw new HttpError(400, t("Rewards are at most {n} 🪙", { n: S.bizCampaignMaxCoins }));
    const c = await prisma.bizCampaign.create({
      data: { businessId: b.id, title: d.title, description: d.description, kind: d.kind, offer: d.offer, rewardCoins: d.rewardCoins, rewardXp: Math.round(30 + d.rewardCoins), bonusCoins: d.kind === "coupon" ? d.bonusCoins : 0, maxVisits: Math.min(d.maxVisits, plan.visitsPerMonth), activeTo: new Date(now.getTime() + d.days * 86_400_000) },
    });
    // Pro and Chain: tell players who were near the store today.
    if (plan.push) {
      const box = bbox(b, 1000);
      const near = await prisma.user.findMany({ where: { id: { not: u.id }, banned: false, lastSeenAt: { gt: new Date(Date.now() - 86_400_000) }, lastLat: { gte: box.minLat, lte: box.maxLat }, lastLng: { gte: box.minLng, lte: box.maxLng } }, select: { id: true, lastSeenAt: true }, take: 50 });
      for (const p of near) if (!p.lastSeenAt || p.lastSeenAt < onlineSince()) await notify(p.id, () => ({ kind: "event", link: "jobs", title: t("{emoji} New at {place}: {title}", { emoji: b.emoji, place: b.name, title: c.title }), body: t("+{n} 🪙 for checking in", { n: c.rewardCoins }) }));
    }
    return { message: t("🎯 “{title}” is live on the map", { title: c.title }) };
  }
  if (d.action === "campaign_state") {
    const c = await prisma.bizCampaign.findFirst({ where: { id: d.campaignId, business: { ownerId: u.id } } });
    if (!c) throw new HttpError(404, t("Mission not found"));
    if (d.state === "end") await prisma.bizCampaign.update({ where: { id: c.id }, data: { activeTo: new Date() } });
    else {
      if (d.state === "resume") {
        const b = await prisma.business.findUniqueOrThrow({ where: { id: c.businessId } });
        const running = await prisma.bizCampaign.count({ where: { businessId: c.businessId, paused: false, activeTo: { gt: new Date() } } });
        if (running >= activePlan(b).campaigns) throw new HttpError(400, t("Your plan runs {n} missions at a time — end one or upgrade", { n: activePlan(b).campaigns }));
      }
      await prisma.bizCampaign.update({ where: { id: c.id }, data: { paused: d.state === "pause" } });
    }
    return { message: d.state === "end" ? t("Mission ended") : d.state === "pause" ? t("Mission paused") : t("Mission resumed") };
  }
  if (d.action === "redeem") return redeem(u.id, d.businessId, d.code);
  if (d.action === "trial") return startTrial(u.id, d.businessId);
  if (d.action === "checkout") return { url: await planCheckout(u.id, d.businessId, d.plan, new URL(req.url).origin) };
  if (d.action === "confirm") {
    const r = await confirmCheckout(u.id, d.sessionId);
    return { message: r.already ? t("Payment already applied") : t("✅ Plan active — thank you!") };
  }
  // admin
  if (u.role !== "ADMIN") throw new HttpError(403, t("Admins only"));
  if (d.plan) await extendPlan(d.businessId, d.plan, d.days ?? 30);
  if (d.verified !== undefined) await prisma.business.update({ where: { id: d.businessId }, data: { verified: d.verified } });
  return { message: t("Saved") };
});
