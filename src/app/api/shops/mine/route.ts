// The seller's side: my shop (every product, hidden ones too), its orders and takings.
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { ORDER_INCLUDE, orderView, PRODUCT_SELECT, SHOP_SELECT, shopView } from "@/server/shops";

export const GET = route(async () => {
  const u = await requireUser();
  const s = await prisma.shop.findUnique({
    where: { ownerId: u.id },
    select: { ...SHOP_SELECT, products: { select: PRODUCT_SELECT, orderBy: [{ featured: "desc" }, { createdAt: "desc" }] } },
  });
  if (!s) return { shop: null, orders: [], stats: null };
  const [pending, recent, earned] = await Promise.all([
    prisma.shopOrder.findMany({ where: { shopId: s.id, status: "PENDING" }, include: ORDER_INCLUDE, orderBy: { createdAt: "asc" } }),
    prisma.shopOrder.findMany({ where: { shopId: s.id, status: { not: "PENDING" } }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.shopOrder.aggregate({ where: { shopId: s.id, status: "DONE" }, _sum: { total: true, fee: true } }),
  ]);
  const { products, ...shop } = s;
  return {
    shop: shopView(shop, products, u.id, null),
    orders: [...pending, ...recent].map((o) => orderView(o, u.id)),
    stats: { pending: pending.length, sold: s.sales, earned: (earned._sum.total ?? 0) - (earned._sum.fee ?? 0) },
  };
});
