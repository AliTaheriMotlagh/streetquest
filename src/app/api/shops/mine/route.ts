// The seller's side: my shop (every product, hidden ones too), its orders and takings, and buyers' messages.
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { parseShopRoom } from "@/lib/shopKinds";
import { ORDER_INCLUDE, orderView, PRODUCT_SELECT, SHOP_SELECT, shopView } from "@/server/shops";

export const GET = route(async () => {
  const u = await requireUser();
  const s = await prisma.shop.findUnique({
    where: { ownerId: u.id },
    select: { ...SHOP_SELECT, products: { select: PRODUCT_SELECT, orderBy: [{ featured: "desc" }, { createdAt: "desc" }] } },
  });
  if (!s) return { shop: null, orders: [], stats: null, chats: [] };
  const [pending, recent, earned, last] = await Promise.all([
    prisma.shopOrder.findMany({ where: { shopId: s.id, status: "PENDING" }, include: ORDER_INCLUDE, orderBy: { createdAt: "asc" } }),
    prisma.shopOrder.findMany({ where: { shopId: s.id, status: { not: "PENDING" } }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.shopOrder.aggregate({ where: { shopId: s.id, status: "DONE" }, _sum: { total: true, fee: true } }),
    // The newest message of each buyer's chat with the shop ("shop:<shop>:<buyer>").
    prisma.message.findMany({ where: { room: { startsWith: `shop:${s.id}:` } }, orderBy: { createdAt: "desc" }, distinct: ["room"], take: 30, select: { room: true, body: true, authorId: true, createdAt: true } }),
  ]);
  const buyerIds = [...new Set(last.map((m) => parseShopRoom(m.room)?.buyerId).filter((x): x is string => !!x))];
  const buyers = new Map((await prisma.user.findMany({ where: { id: { in: buyerIds } }, select: { id: true, username: true, avatar: true } })).map((b) => [b.id, b]));
  const chats = last.flatMap((m) => {
    const b = buyers.get(parseShopRoom(m.room)?.buyerId ?? "");
    return b ? [{ room: m.room, buyer: b, last: m.body.slice(0, 120), fromBuyer: m.authorId === b.id, at: m.createdAt.getTime() }] : [];
  });
  const { products, ...shop } = s;
  return {
    shop: shopView(shop, products, u.id, null),
    orders: [...pending, ...recent].map((o) => orderView(o, u.id)),
    stats: { pending: pending.length, sold: s.sales, earned: (earned._sum.total ?? 0) - (earned._sum.fee ?? 0) },
    chats,
  };
});
