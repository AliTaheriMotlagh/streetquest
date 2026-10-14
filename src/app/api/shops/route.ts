// Player shops. GET: shops near a point (or matching a search) and the best deals
// around. POST: open, edit, move, renew your own shop.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bbox } from "@/lib/geo";
import { t } from "@/lib/i18n";
import { S } from "@/lib/settings";
import { MAX_PREPAID_PERIODS, SHOP_CATEGORY_KEYS, SHOP_LIMITS, shopPeriodMs } from "@/lib/shops";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, route } from "@/server/http";
import { decodePhoto, MAX_PHOTO_DATA_URL } from "@/server/photos";
import { lastKnownLocation, spendCoins, track, unlock } from "@/server/rewards";
import { PRODUCT_SELECT, SHOP_SELECT, shopCard } from "@/server/shops";

/** Shops further than this don't show in the nearby list (search finds them anywhere). */
const NEAR_KM = 50;

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const here = sp.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const cat = SHOP_CATEGORY_KEYS.find((c) => c === sp.get("cat"));
  if (!here && !q) throw new HttpError(400, t("lat/lng or q required"));
  const now = new Date();
  const box = here ? bbox(here, NEAR_KM * 1000) : null;
  const rows = await prisma.shop.findMany({
    where: {
      open: true,
      expiresAt: { gt: now },
      ...(cat ? { category: cat } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { tagline: { contains: q, mode: "insensitive" } },
              { products: { some: { active: true, title: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : box
          ? { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } }
          : {}),
    },
    select: { ...SHOP_SELECT, products: { where: { active: true }, select: PRODUCT_SELECT, orderBy: { createdAt: "desc" }, take: 80 } },
    take: 80,
  });
  const shops = rows
    .map(({ products, ...s }) => shopCard(s, products, u.id, here, q || undefined))
    .filter((s) => s.inStock > 0 || s.mine)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  // The deepest discounts around (closest first among equals).
  const deals = shops
    .flatMap((s) => s.showcase.filter((p) => p.deal > 0).map((p) => ({ ...p, shopId: s.id, shopName: s.name, shopEmoji: s.emoji, distanceM: s.distanceM })))
    .sort((a, b) => b.deal - a.deal || (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, 12);
  return { shops: shops.slice(0, 60), deals };
});

const text = (max: number) => z.string().trim().max(max);
const Details = z.object({
  name: text(SHOP_LIMITS.name).min(2, "Give your shop a name (at least 2 letters)"),
  tagline: text(SHOP_LIMITS.tagline).default(""),
  about: text(SHOP_LIMITS.about).default(""),
  emoji: z.string().min(1).max(8).default("🏪"),
  category: z.enum(SHOP_CATEGORY_KEYS).default("other"),
  address: text(SHOP_LIMITS.address).default(""),
});

const Schema = z.discriminatedUnion("action", [
  Details.extend({ action: z.literal("create"), cover: z.string().max(MAX_PHOTO_DATA_URL).optional() }),
  Details.partial().extend({ action: z.literal("update"), open: z.boolean().optional() }),
  z.object({ action: z.literal("cover"), photo: z.string().max(MAX_PHOTO_DATA_URL).nullable() }),
  z.object({ action: z.literal("move") }),
  z.object({ action: z.literal("renew") }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const now = Date.now();

  if (d.action === "create") {
    if (!S.shopsEnabled) throw new HttpError(400, t("Shops are closed right now"));
    if (await prisma.shop.findUnique({ where: { ownerId: u.id }, select: { id: true } })) throw new HttpError(409, t("You already have a shop"));
    const cover = d.cover ? decodePhoto(d.cover) : null;
    const here = await lastKnownLocation(u.id);
    await spendCoins(u.id, S.shopOpenCost);
    const { action: _a, cover: _c, ...details } = d;
    const shop = await prisma.shop.create({ data: { ...details, ownerId: u.id, lat: here.lat, lng: here.lng, expiresAt: new Date(now + shopPeriodMs()) } });
    if (cover) {
      const img = await prisma.shopImage.create({ data: { shopId: shop.id, data: cover.bytes, type: cover.type } });
      await prisma.shop.update({ where: { id: shop.id }, data: { coverId: img.id } });
    }
    await unlock(u.id, "shopkeeper");
    await track("shop_opened", { userId: u.id });
    return { message: t("🏪 {name} is open for {days} days — add your first products!", { name: shop.name, days: S.shopDays }), shopId: shop.id };
  }

  const shop = await prisma.shop.findUnique({ where: { ownerId: u.id }, select: { id: true, coverId: true, expiresAt: true, name: true } });
  if (!shop) throw new HttpError(404, t("You don't have a shop yet"));

  if (d.action === "update") {
    const { action: _a, ...data } = d;
    await prisma.shop.update({ where: { id: shop.id }, data });
    return { message: data.open === false ? t("⏸️ Shop paused — buyers can't order until you reopen") : data.open === true ? t("▶️ Shop reopened") : t("✅ Shop updated") };
  }

  if (d.action === "cover") {
    const photo = d.photo ? decodePhoto(d.photo) : null;
    const img = photo ? await prisma.shopImage.create({ data: { shopId: shop.id, data: photo.bytes, type: photo.type } }) : null;
    await prisma.shop.update({ where: { id: shop.id }, data: { coverId: img?.id ?? null } });
    if (shop.coverId) await prisma.shopImage.deleteMany({ where: { id: shop.coverId, productId: null } });
    return { message: img ? t("🖼️ New banner up") : t("Banner removed") };
  }

  if (d.action === "move") {
    const here = await lastKnownLocation(u.id);
    await prisma.shop.update({ where: { id: shop.id }, data: { lat: here.lat, lng: here.lng } });
    return { message: t("📍 Your shop moved here") };
  }

  // renew
  const period = shopPeriodMs();
  const ahead = shop.expiresAt.getTime() - now;
  if (ahead > period * (MAX_PREPAID_PERIODS - 1)) throw new HttpError(400, t("Already paid {days} days ahead — renew closer to the end", { days: Math.floor(ahead / 86_400_000) }));
  await spendCoins(u.id, S.shopRenewCost);
  const until = new Date(Math.max(now, shop.expiresAt.getTime()) + period);
  await prisma.shop.update({ where: { id: shop.id }, data: { expiresAt: until, warnedAt: null } });
  return { message: t("🔁 {name} renewed for {days} more days", { name: shop.name, days: S.shopDays }), expiresAt: until.getTime() };
});
