// The Seller center's data (rules: lib/sellerCenter.ts): the seller's shop and businesses, what needs doing, and
// linking a verified business to the shop. "One shop per business" is kept here, inside a transaction.
import { prisma } from "@/lib/db";
import { HttpError } from "@/server/http";
import { LINK_PROBLEMS, linkProblem, sellerTodos, type SellerBusiness, type SellerShop } from "@/lib/sellerCenter";

/** The seller's shop (its products' state and pending orders), their businesses, and the to-do list. */
export async function sellerOverview(userId: string, now = Date.now()) {
  const [s, bizs] = await Promise.all([
    prisma.shop.findUnique({
      where: { ownerId: userId },
      select: { id: true, name: true, emoji: true, open: true, expiresAt: true, sales: true, businessId: true, products: { select: { active: true, stock: true, review: true } }, orders: { where: { status: "PENDING" }, select: { createdAt: true } } },
    }),
    prisma.business.findMany({ where: { ownerId: userId }, select: { id: true, name: true, emoji: true, verified: true, plan: true, planUntil: true, views: true, shops: { select: { id: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const shop: (SellerShop & { emoji: string; sales: number }) | null = s
    ? { id: s.id, name: s.name, emoji: s.emoji, sales: s.sales, open: s.open, expiresAt: s.expiresAt.getTime(), businessId: s.businessId, products: s.products, pending: s.orders.map((o) => o.createdAt.getTime()) }
    : null;
  const businesses: (SellerBusiness & { emoji: string; linked: boolean })[] = bizs.map((b) => ({
    id: b.id, name: b.name, emoji: b.emoji, verified: b.verified, plan: b.plan, planUntil: b.planUntil?.getTime() ?? null, views: b.views,
    linked: !!s && s.businessId === b.id,
    linkedElsewhere: b.shops.some((x) => x.id !== s?.id),
  }));
  return {
    shop: shop && { id: shop.id, name: shop.name, emoji: shop.emoji, sales: shop.sales, open: shop.open, expiresAt: shop.expiresAt, businessId: shop.businessId, products: shop.products.length, pending: shop.pending.length },
    businesses,
    todos: sellerTodos(shop, businesses, now),
  };
}

/** Links one of the seller's verified businesses to their shop (or unlinks it: `businessId` null). */
export async function linkShop(userId: string, businessId: string | null) {
  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({ where: { ownerId: userId }, select: { id: true, businessId: true } });
    if (!businessId) {
      if (!shop) throw new HttpError(400, LINK_PROBLEMS["no-shop"]);
      await tx.shop.update({ where: { id: shop.id }, data: { businessId: null } });
      return { linked: null };
    }
    const biz = await tx.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, ownerId: true, verified: true, plan: true, planUntil: true, views: true, shops: { select: { id: true } } } });
    const problem = linkProblem(shop, biz && { ...biz, planUntil: biz.planUntil?.getTime() ?? null, linkedElsewhere: biz.shops.some((x) => x.id !== shop?.id) }, userId);
    if (problem) throw new HttpError(problem === "not-yours" ? 404 : 409, LINK_PROBLEMS[problem]);
    await tx.shop.update({ where: { id: shop!.id }, data: { businessId } });
    return { linked: businessId };
  });
}
