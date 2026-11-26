// A seller's shelves: add, edit and remove products — any kind (lib/shopKinds.ts: an item, food, a ticket, an ad, a
// deal, a service) with its details, priced in coins or toman — and their photos. Photos go up
// one per request (each is already resized on the phone), so a slow connection
// uploads them one by one instead of failing one giant request.
import { enforce } from "@/server/limits";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { t, dot } from "@/lib/i18n";
import { S } from "@/lib/settings";
import { MAX_DISCOUNT, SHOP_LIMITS } from "@/lib/shops";
import { cleanDetails, CURRENCIES, PRODUCT_KIND_KEYS, priceProblem, type Currency, type ProductKind } from "@/lib/shopKinds";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, patch } from "@/server/http";
import { decodePhoto, MAX_PHOTO_DATA_URL } from "@/server/photos";
import { PRODUCT_SELECT, productView } from "@/server/shops";
import { pingIndexNow } from "@/server/indexNow";
import { changesText, preCheck, reviewAfter, type Review, type Verdict } from "@/lib/stores/moderation";
import { audit } from "@/server/audit";

const Fields = z.object({
  title: z.string().trim().min(2, "Give the product a name (at least 2 letters)").max(SHOP_LIMITS.title),
  description: z.string().trim().max(SHOP_LIMITS.description).default(""),
  // Coins (≥ 1) or toman (0 = "ask the seller"): checked against the currency below.
  price: z.number().int().min(0),
  kind: z.enum(PRODUCT_KIND_KEYS as [ProductKind, ...ProductKind[]]).default("item"),
  details: z.record(z.string(), z.unknown()).default({}),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]).default("coins"),
  stock: z.number().int().min(0).max(9999).default(1),
  discountPct: z.number().int().min(0).max(MAX_DISCOUNT).default(0),
  discountUntil: z.number().int().nullable().default(null), // ms since epoch; null = no end date
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

const Schema = z.discriminatedUnion("action", [
  Fields.extend({ action: z.literal("create") }),
  patch(Fields).extend({ action: z.literal("update"), productId: z.string() }),
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

  /**
   * The listing as buyers would read it, checked (lib/stores/moderation.ts): refused with the reason, held for a
   * moderator, or live. The seller's track record and other listings are the context.
   */
  const moderate = async (l: { title: string; description: string; price: number; currency: Currency }, except?: string): Promise<Verdict> => {
    const [others, approved, verifiedBiz] = await Promise.all([
      prisma.product.findMany({ where: { shopId: shop.id, ...(except ? { id: { not: except } } : {}) }, select: { title: true, description: true, price: true, currency: true }, take: 200, orderBy: { createdAt: "desc" } }),
      prisma.product.count({ where: { shopId: shop.id, review: "ok", ...(except ? { id: { not: except } } : {}) } }),
      prisma.business.count({ where: { ownerId: u.id, verified: true } }),
    ]);
    const v = preCheck(l, { approved, others: others.map((o) => ({ ...o, currency: o.currency === "toman" ? "toman" : "coins" })), trusted: u.role === "ADMIN" || verifiedBiz > 0 });
    if (v.verdict === "block") {
      await audit(u, "listing.blocked", { type: "shop", id: shop.id }, l.title, { cat: v.cat });
      throw new HttpError(400, t(v.reasons[0]));
    }
    return v;
  };
  const heldNote = (v: Verdict) => (v.verdict === "hold" ? v.reasons.join(dot()) : "");

  const checkPrice = (price: number | undefined, currency: Currency) => {
    const why = price === undefined ? null : priceProblem(currency, price, S.shopMaxPrice);
    if (why) throw new HttpError(400, t(why, { n: S.shopMaxPrice }));
  };
  /** The kind's details, cleaned (lib/shopKinds.ts); a ticket without its date is refused. */
  const checkDetails = (kind: ProductKind, details: unknown) => {
    const c = cleanDetails(kind, details);
    if (c.problem) throw new HttpError(400, t(c.problem));
    return c.details;
  };
  const checkDiscount = (pct?: number, until?: number | null) => {
    if (pct && until != null && until <= Date.now()) throw new HttpError(400, t("Pick a discount end time in the future"));
  };
  const checkWindow = async (except?: string) => {
    const n = await prisma.product.count({ where: { shopId: shop.id, featured: true, ...(except ? { id: { not: except } } : {}) } });
    if (n >= S.shopMaxFeatured) throw new HttpError(400, t("Your shop window holds {n} products — take one out first", { n: S.shopMaxFeatured }));
  };

  if (d.action === "create") {
    await enforce("listing", u);
    checkPrice(d.price, d.currency);
    d.details = checkDetails(d.kind, d.details);
    checkDiscount(d.discountPct, d.discountUntil);
    if ((await prisma.product.count({ where: { shopId: shop.id } })) >= S.shopMaxProducts) throw new HttpError(400, t("Your shop is full ({n} products) — remove one first", { n: S.shopMaxProducts }));
    if (d.featured) await checkWindow();
    const v = await moderate(d);
    const review = reviewAfter(v, null);
    const { action: _a, discountUntil, ...data } = d;
    const p = await prisma.product.create({ data: { ...data, details: data.details as object, shopId: shop.id, discountUntil: discountUntil ? new Date(discountUntil) : null, review, reviewNote: heldNote(v) }, select: PRODUCT_SELECT });
    if (review === "ok") pingIndexNow([`/s/${shop.id}`]); // a shop with products is in the sitemap; tell Bing/Yandex now
    return { message: review === "ok" ? t("✅ {title} is on your shelves", { title: p.title }) : t("🕓 {title} is saved — a moderator checks it before buyers see it (usually within a day)", { title: p.title }), product: productView(p) };
  }

  const product = await prisma.product.findFirst({ where: { id: d.productId, shopId: shop.id }, select: { id: true, title: true, description: true, featured: true, discountPct: true, discountUntil: true, kind: true, details: true, currency: true, price: true, review: true } });
  if (!product) throw new HttpError(404, t("That product isn't in your shop"));

  if (d.action === "update") {
    const kind = (d.kind ?? product.kind) as ProductKind, currency = (d.currency ?? product.currency) as Currency;
    checkPrice(d.price ?? (d.currency ? product.price : undefined), currency);
    // New details, or a new kind: what's kept is cleaned against the kind it is now.
    if (d.details !== undefined || d.kind !== undefined) d.details = checkDetails(kind, d.details ?? product.details);
    checkDiscount(d.discountPct ?? product.discountPct, d.discountUntil !== undefined ? d.discountUntil : product.discountUntil?.getTime() ?? null);
    if (d.featured && !product.featured) await checkWindow(product.id);
    // What buyers read changed (or it was turned down): checked again.
    let review: Review | undefined, reviewNote: string | undefined;
    if (changesText(product, d) || product.review === "rejected" || (d.currency !== undefined && d.currency !== product.currency)) {
      const v = await moderate({ title: d.title ?? product.title, description: d.description ?? product.description, price: d.price ?? product.price, currency }, product.id);
      // A listing already live stays live through an edit unless the new text itself is flagged.
      review = product.review === "ok" && v.verdict === "hold" && v.reasons.every((r) => r.startsWith("A new seller")) ? "ok" : reviewAfter(v, product.review as Review);
      reviewNote = heldNote(v);
    }
    const { action: _a, productId: _p, discountUntil, ...data } = d;
    const p = await prisma.product.update({
      where: { id: product.id },
      data: { ...data, ...(review ? { review, reviewNote } : {}), ...(data.details !== undefined ? { details: data.details as object } : {}), ...(discountUntil !== undefined ? { discountUntil: discountUntil ? new Date(discountUntil) : null } : {}) },
      select: PRODUCT_SELECT,
    });
    return { message: review === "pending" ? t("🕓 Saved — a moderator checks the change before buyers see it") : t("✅ Saved"), product: productView(p) };
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
