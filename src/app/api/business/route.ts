// Business center: real stores claim their place on the map, run campaigns (missions
// at the store), redeem players' coupons at the till and pick a plan. Players check in
// here too. Rules and plans: lib/business.ts; the work: server/business.ts.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bbox, distanceM } from "@/lib/geo";
import { activePlan, BIZ_LIMITS, BIZ_MENU_MAX, BIZ_SETUP_M, CAMPAIGN_MAX_DAYS, cleanColor, cleanMenu, HOURS_RE, OFF_DAY_BITS, PLAN_KEYS, PLANS } from "@/lib/business";
import { createHash } from "node:crypto";
import { decodePhoto, MAX_PHOTO_DATA_URL } from "@/server/photos";
import { PLACE_CAT_KEYS, PLACE_CATS } from "@/lib/places";
import { S } from "@/lib/settings";
import { t, dot } from "@/lib/i18n";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, route } from "@/server/http";
import { lastKnownLocation } from "@/server/rewards";
import { checkIn, dashboard, extendPlan, planCheckout, redeem, startTrial } from "@/server/business";
import { placesAround } from "@/server/city";
import { OwnerLinks } from "@/server/localData";
import { confirmCheckout, stripeReady } from "@/server/store";
import { notify, onlineSince } from "@/server/hub";
import { audit, businessHistory } from "@/server/audit";
import { checkWebsite, claimDocument, claimsOf, claimVisit, startClaim } from "@/server/claims";
import { CLAIM_METHOD_KEYS } from "@/lib/claims";

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
  const businesses = await dashboard(u.id);
  return { enabled: S.bizEnabled, businesses, claims: await claimsOf(u.id, businesses.map((b: { id: string }) => b.id)), plans: PLANS, payments: stripeReady(), currency: S.currency, trialDays: S.bizTrialDays, maxCoins: S.bizCampaignMaxCoins, claimable, admin: u.role === "ADMIN" };
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
  // Its look in the game: brand colour, banner line, menu, hours, logo (a data URL; null removes it).
  z.object({
    action: z.literal("look"),
    businessId: z.string(),
    color: z.string().max(7).default(""),
    tagline: text(BIZ_LIMITS.tagline).default(""),
    menu: z.array(z.object({ title: text(BIZ_LIMITS.menuTitle).min(1), price: z.number().int().min(0).max(1e9) })).max(BIZ_MENU_MAX).default([]),
    hours: z.string().trim().max(40).refine((v) => !v || HOURS_RE.test(v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))), "Hours look like 09:00-22:00").default(""),
    offDays: z.number().int().min(0).max(OFF_DAY_BITS).default(0),
    logo: z.string().max(MAX_PHOTO_DATA_URL).nullable().optional(),
  }),
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
  // Proving the store is yours (lib/claims.ts): start, read the website, a visit at the store, a document photo.
  z.object({ action: z.literal("claim"), businessId: z.string(), method: z.enum(CLAIM_METHOD_KEYS), note: z.string().max(500).default("") }),
  z.object({ action: z.literal("claim_check"), claimId: z.string(), url: z.string().max(500).optional() }),
  z.object({ action: z.literal("claim_visit"), claimId: z.string() }),
  z.object({ action: z.literal("claim_doc"), claimId: z.string(), photo: z.string().max(MAX_PHOTO_DATA_URL), note: z.string().max(500).default("") }),
  z.object({ action: z.literal("history"), businessId: z.string() }),
  z.object({ action: z.literal("admin"), businessId: z.string(), plan: z.enum(PLAN_KEYS).optional(), days: z.number().int().min(1).max(3650).optional(), verified: z.boolean().optional() }),
]);

async function mine(userId: string, businessId: string) {
  const b = await prisma.business.findFirst({ omit: { logo: true }, where: { id: businessId, ownerId: userId } });
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
    const owned = await prisma.business.findMany({ omit: { logo: true }, where: { ownerId: u.id } });
    const allowed = Math.max(1, ...owned.map((b) => activePlan(b).locations));
    if (owned.length >= allowed) throw new HttpError(400, owned.length === 1 ? t("More locations need the Chain plan") : t("Your plan allows {n} locations", { n: allowed }));
    const here = await lastKnownLocation(u.id);
    let at = here;
    if (d.osmId) {
      const place = [...(await placesAround(here)).values()].flat().find((p) => p.id === d.osmId);
      if (!place) throw new HttpError(404, t("That place isn't on the map here"));
      if (await prisma.business.findFirst({ omit: { logo: true }, where: { osmId: d.osmId } })) throw new HttpError(409, t("{place} is already claimed — contact support if it's yours", { place: place.name }));
      at = { lat: place.lat, lng: place.lng };
    }
    // Set up from inside (or right outside) the store, so nobody claims a place they've never been to.
    if (distanceM(here, at) > BIZ_SETUP_M && u.role !== "ADMIN") throw new HttpError(400, t("Set up your business from your store"));
    const b = await prisma.business.create({
      data: { ownerId: u.id, name: d.name, category: d.category, emoji: d.emoji || PLACE_CATS[d.category].emoji, about: d.about, address: d.address, phone: d.phone, website: d.website, snappfood: d.snappfood, torob: d.torob, divar: d.divar, lat: at.lat, lng: at.lng, osmId: d.osmId ?? null },
    });
    await audit(u, "business.create", { type: "business", id: b.id }, b.name, { osmId: d.osmId ?? null, at });
    return { message: t("🏪 {place} is on the map! Create your first mission.", { place: b.name }), id: b.id };
  }
  if (d.action === "update") {
    const was = await mine(u.id, d.businessId);
    const changed = (["name", "category", "about", "address", "phone", "website", "snappfood", "torob", "divar"] as const).filter((k) => was[k] !== d[k]);
    // A verified store that changes its name or website proves itself again.
    const reverify = was.verified && (changed.includes("name") || changed.includes("website")) && u.role !== "ADMIN";
    if (changed.length) await audit(u, "business.update", { type: "business", id: was.id }, `${was.name}: ${changed.join(", ")}`, Object.fromEntries(changed.map((k) => [k, { from: was[k], to: d[k] }])));
    if (reverify) await audit(u, "business.unverified", { type: "business", id: was.id }, `${was.name}: name or website changed`);
    await prisma.business.update({ where: { id: d.businessId }, data: { ...(reverify ? { verified: false, verifiedHow: "" } : {}), name: d.name, category: d.category, emoji: d.emoji || PLACE_CATS[d.category].emoji, about: d.about, address: d.address, phone: d.phone, website: d.website, snappfood: d.snappfood, torob: d.torob, divar: d.divar } });
    return { message: t("Saved") };
  }
  if (d.action === "look") {
    await mine(u.id, d.businessId);
    const logo = d.logo ? decodePhoto(d.logo) : null;
    await prisma.business.update({
      where: { id: d.businessId },
      data: {
        color: cleanColor(d.color),
        tagline: d.tagline,
        menu: cleanMenu(d.menu),
        hours: d.hours.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0)),
        offDays: d.offDays,
        ...(logo ? { logo: new Uint8Array(logo.bytes), logoType: logo.type, logoHash: createHash("sha1").update(logo.bytes).digest("hex").slice(0, 12) } : d.logo === null ? { logo: null, logoType: "", logoHash: "" } : {}),
      },
    });
    return { message: t("Saved") };
  }
  if (d.action === "delete") {
    const b = await mine(u.id, d.businessId);
    if (activePlan(b).key !== "free") throw new HttpError(400, t("Wait until the paid plan ends before removing the business"));
    await prisma.business.delete({ where: { id: b.id } });
    await audit(u, "business.delete", { type: "business", id: b.id }, b.name);
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
    await audit(u, "campaign.create", { type: "business", id: b.id }, `${b.name}: ${c.title}`, { campaignId: c.id, kind: d.kind, rewardCoins: d.rewardCoins, maxVisits: d.maxVisits, days: d.days });
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
  if (d.action === "redeem") {
    const r = await redeem(u.id, d.businessId, d.code);
    await audit(u, "coupon.redeem", { type: "business", id: d.businessId }, d.code.toUpperCase());
    return r;
  }
  if (d.action === "claim") return { claim: await startClaim(u, d.businessId, d.method, d.note) };
  if (d.action === "claim_check") {
    const r = await checkWebsite(u, d.claimId, d.url);
    return { ...r, message: r.status === "approved" ? t("✅ Found the code — your store is verified") : r.found ? t("Found the code — our team will confirm shortly") : t("The code isn't on that page yet. Save the page and try again in a minute.") };
  }
  if (d.action === "claim_visit") {
    const r = await claimVisit(u, d.claimId, await lastKnownLocation(u.id));
    return { ...r, message: r.status === "approved" ? t("✅ Second visit done — your store is verified") : r.status === "review" ? t("Both visits done — our team will confirm shortly") : t("Visit 1 of 2 counted. Check in again on another day.") };
  }
  if (d.action === "claim_doc") return { ...(await claimDocument(u, d.claimId, d.photo, d.note)), message: t("Sent — our team checks it within 2 days") };
  if (d.action === "history") {
    await mine(u.id, d.businessId);
    return { history: await businessHistory(d.businessId) };
  }
  if (d.action === "trial") return startTrial(u.id, d.businessId);
  if (d.action === "checkout") return { url: await planCheckout(u.id, d.businessId, d.plan, new URL(req.url).origin) };
  if (d.action === "confirm") {
    const r = await confirmCheckout(u.id, d.sessionId);
    return { message: r.already ? t("Payment already applied") : t("✅ Plan active — thank you!") };
  }
  // admin
  if (u.role !== "ADMIN") throw new HttpError(403, t("Admins only"));
  if (d.plan) {
    await extendPlan(d.businessId, d.plan, d.days ?? 30);
    await audit(u, "admin.plan", { type: "business", id: d.businessId }, `${d.plan}${dot()}${d.days ?? 30} days`);
  }
  if (d.verified !== undefined) {
    await prisma.business.update({ where: { id: d.businessId }, data: { verified: d.verified, verifiedAt: d.verified ? new Date() : null, verifiedHow: d.verified ? "admin" : "" } });
    await audit(u, d.verified ? "admin.verify" : "admin.unverify", { type: "business", id: d.businessId }, d.verified ? "verified by hand" : "verification removed");
  }
  return { message: t("Saved") };
});
