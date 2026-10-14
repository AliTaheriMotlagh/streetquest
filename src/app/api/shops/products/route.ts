// A seller's shelves: add, edit and remove products and their photos. Photos go up
// one per request (each is already resized on the phone), so a slow connection
// uploads them one by one instead of failing one giant request.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { S } from "@/lib/settings";
import { MAX_DISCOUNT, SHOP_LIMITS } from "@/lib/shops";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError } from "@/server/http";
import { decodePhoto, MAX_PHOTO_DATA_URL } from "@/server/photos";
import { PRODUCT_SELECT, productView } from "@/server/shops";

const Fields = z.object({
  title: z.string().trim().min(2, "Give the product a name (at least 2 letters)").max(SHOP_LIMITS.title),
  description: z.string().trim().max(SHOP_LIMITS.description).default(""),
  price: z.number().int().min(1, "The price must be at least 1 coin"),
  stock: z.number().int().min(0).max(9999).default(1),
  discountPct: z.number().int().min(0).max(MAX_DISCOUNT).default(0),
  discountUntil: z.number().int().nullable().default(null), // ms since epoch; null = no end date
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

const Schema = z.discriminatedUnion("action", [
  Fields.extend({ action: z.literal("create") }),
  Fields.partial().extend({ action: z.literal("update"), productId: z.string() }),
  z.object({ action: z.literal("delete"), productId: z.string() }),
  z.object({ action: z.literal("addPhoto"), productId: z.string(), photo: z.string().max(MAX_PHOTO_DATA_URL) }),
  z.object({ action: z.literal("removePhoto"), productId: z.string(), photoId: z.string() }),
  z.object({ action: z.literal("firstPhoto"), productId: z.string(), photoId: z.string() }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  const shop = await prisma.shop.findUnique({ where: { ownerId: u.id }, select: { id: true } });
  if (!shop) throw new HttpError(404, t("You don't have a shop yet"));

  const checkPrice = (price?: number) => {
    if (price !== undefined && price > S.shopMaxPrice) throw new HttpError(400, t("The highest price allowed is {n} coins", { n: S.shopMaxPrice }));
  };
  const checkDiscount = (pct?: number, until?: number | null) => {
    if (pct && until != null && until <= Date.now()) throw new HttpError(400, t("Pick a discount end time in the future"));
  };
  const checkWindow = async (except?: string) => {
    const n = await prisma.product.count({ where: { shopId: shop.id, featured: true, ...(except ? { id: { not: except } } : {}) } });
    if (n >= S.shopMaxFeatured) throw new HttpError(400, t("Your shop window holds {n} products — take one out first", { n: S.shopMaxFeatured }));
  };

  if (d.action === "create") {
    checkPrice(d.price);
    checkDiscount(d.discountPct, d.discountUntil);
    if ((await prisma.product.count({ where: { shopId: shop.id } })) >= S.shopMaxProducts) throw new HttpError(400, t("Your shop is full ({n} products) — remove one first", { n: S.shopMaxProducts }));
    if (d.featured) await checkWindow();
    const { action: _a, discountUntil, ...data } = d;
    const p = await prisma.product.create({ data: { ...data, shopId: shop.id, discountUntil: discountUntil ? new Date(discountUntil) : null }, select: PRODUCT_SELECT });
    return { message: t("✅ {title} is on your shelves", { title: p.title }), product: productView(p) };
  }

  const product = await prisma.product.findFirst({ where: { id: d.productId, shopId: shop.id }, select: { id: true, title: true, featured: true, discountPct: true, discountUntil: true } });
  if (!product) throw new HttpError(404, t("That product isn't in your shop"));

  if (d.action === "update") {
    checkPrice(d.price);
    checkDiscount(d.discountPct ?? product.discountPct, d.discountUntil !== undefined ? d.discountUntil : product.discountUntil?.getTime() ?? null);
    if (d.featured && !product.featured) await checkWindow(product.id);
    const { action: _a, productId: _p, discountUntil, ...data } = d;
    const p = await prisma.product.update({
      where: { id: product.id },
      data: { ...data, ...(discountUntil !== undefined ? { discountUntil: discountUntil ? new Date(discountUntil) : null } : {}) },
      select: PRODUCT_SELECT,
    });
    return { message: t("✅ Saved"), product: productView(p) };
  }

  if (d.action === "delete") {
    // Open orders keep their own copy of the title, so they can still be handed over.
    await prisma.product.delete({ where: { id: product.id } });
    return { message: t("🗑️ {title} removed", { title: product.title }) };
  }

  if (d.action === "addPhoto") {
    const photo = decodePhoto(d.photo);
    const have = await prisma.shopImage.findMany({ where: { productId: product.id }, select: { position: true } });
    if (have.length >= S.shopMaxPhotos) throw new HttpError(400, t("Up to {n} photos per product", { n: S.shopMaxPhotos }));
    const img = await prisma.shopImage.create({ data: { shopId: shop.id, productId: product.id, data: photo.bytes, type: photo.type, position: Math.max(0, ...have.map((h) => h.position + 1)) } });
    return { photoId: img.id };
  }

  if (d.action === "removePhoto") {
    await prisma.shopImage.deleteMany({ where: { id: d.photoId, productId: product.id } });
    return { ok: true };
  }

  // firstPhoto: the photo buyers see first
  const first = await prisma.shopImage.findFirst({ where: { productId: product.id }, orderBy: { position: "asc" }, select: { position: true } });
  await prisma.shopImage.updateMany({ where: { id: d.photoId, productId: product.id }, data: { position: (first?.position ?? 0) - 1 } });
  return { ok: true };
});
