// Buying from a player's shop. The buyer pays up front and the coins wait in escrow;
// at pickup the buyer shows a 4-digit code and the seller enters it, which hands the
// coins over (minus the market fee). Either side can call an open order off and the
// buyer gets everything back.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { t, toAsciiDigits } from "@/lib/i18n";
import { priceNow, shopFee, SHOP_LIMITS } from "@/lib/shops";
import { requireUser } from "@/server/auth";
import { actionRoute, body, HttpError, route } from "@/server/http";
import { notify } from "@/server/hub";
import { track, unlock } from "@/server/rewards";
import { cancelOrder, ORDER_INCLUDE, orderView, pickupCode, shopLive } from "@/server/shops";

/** My purchases: everything still open, then the latest closed ones. */
export const GET = route(async () => {
  const u = await requireUser();
  const [open, closed] = await Promise.all([
    prisma.shopOrder.findMany({ where: { buyerId: u.id, status: "PENDING" }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" } }),
    prisma.shopOrder.findMany({ where: { buyerId: u.id, status: { not: "PENDING" } }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return { orders: [...open, ...closed].map((o) => orderView(o, u.id)) };
});

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("buy"),
    productId: z.string(),
    qty: z.number().int().min(1).max(SHOP_LIMITS.qty),
    note: z.string().trim().max(SHOP_LIMITS.note).default(""),
    /** The unit price the buyer saw: if it changed meanwhile (a discount ended), ask again. */
    price: z.number().int().optional(),
  }),
  z.object({ action: z.literal("handover"), orderId: z.string(), code: z.string().max(12) }),
  z.object({ action: z.literal("cancel"), orderId: z.string() }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "buy") {
    const p = await prisma.product.findUnique({
      where: { id: d.productId },
      select: { id: true, title: true, price: true, discountPct: true, discountUntil: true, stock: true, active: true, photos: { select: { id: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 1 }, shop: { select: { id: true, name: true, ownerId: true, open: true, expiresAt: true } } },
    });
    if (!p || !p.active) throw new HttpError(404, t("This product isn't for sale any more"));
    if (p.shop.ownerId === u.id) throw new HttpError(400, t("That's your own shop"));
    if (!shopLive(p.shop)) throw new HttpError(400, t("{shop} is closed right now", { shop: p.shop.name }));
    if (p.stock < d.qty) throw new HttpError(409, p.stock ? t("Only {n} left", { n: p.stock }) : t("Sold out"));
    const unit = priceNow(p);
    if (d.price !== undefined && d.price !== unit) throw new HttpError(409, t("The price just changed to {n} coins — check it and buy again", { n: unit }));
    const total = unit * d.qty;
    const code = pickupCode();
    const order = await prisma.$transaction(async (tx) => {
      const paid = await tx.user.updateMany({ where: { id: u.id, coins: { gte: total } }, data: { coins: { decrement: total } } });
      if (!paid.count) throw new HttpError(400, t("Not enough coins — this costs {n}", { n: total }));
      const took = await tx.product.updateMany({ where: { id: p.id, active: true, stock: { gte: d.qty } }, data: { stock: { decrement: d.qty } } });
      if (!took.count) throw new HttpError(409, t("Someone just bought the last ones — refresh"));
      return tx.shopOrder.create({
        data: { shopId: p.shop.id, buyerId: u.id, productId: p.id, title: p.title, photoId: p.photos[0]?.id ?? null, qty: d.qty, unitPrice: unit, total, fee: shopFee(total), code, note: d.note },
        include: ORDER_INCLUDE,
      });
    });
    const what = { qty: d.qty, title: p.title, name: u.username, n: total };
    await notify(p.shop.ownerId, () => ({
      link: "market",
      kind: "reward",
      title: t("🛒 New order: {qty}× {title}", what),
      body: t("{name} paid {n} coins. Hand it over at your shop and enter their pickup code.", what),
    }));
    await track("shop_order", { userId: u.id });
    return { message: t("🛍️ Ordered! Show code {code} at {shop} to pick it up", { code, shop: p.shop.name }), order: orderView(order, u.id) };
  }

  const o = await prisma.shopOrder.findUnique({ where: { id: d.orderId }, include: ORDER_INCLUDE });
  if (!o) throw new HttpError(404, t("Order not found"));
  const seller = o.shop.ownerId === u.id;
  if (!seller && o.buyerId !== u.id) throw new HttpError(403, t("That isn't your order"));

  if (d.action === "cancel") {
    if (o.status !== "PENDING") throw new HttpError(409, t("That order is already closed — refresh"));
    await cancelOrder(o.id, seller ? "seller" : "buyer");
    return { message: seller ? t("Order cancelled — the buyer got their {n} coins back", { n: o.total }) : t("Order cancelled — {n} coins refunded", { n: o.total }) };
  }

  // handover: only the seller, and only with the buyer's code
  if (!seller) throw new HttpError(403, t("Only the seller can hand an order over"));
  if (toAsciiDigits(d.code).replace(/\D/g, "") !== o.code) throw new HttpError(400, t("Wrong pickup code — ask the buyer for the 4 digits on their order"));
  const payout = o.total - o.fee;
  const done = await prisma.$transaction(async (tx) => {
    const flipped = await tx.shopOrder.updateMany({ where: { id: o.id, status: "PENDING" }, data: { status: "DONE", doneAt: new Date() } });
    if (!flipped.count) return false;
    await tx.user.update({ where: { id: u.id }, data: { coins: { increment: payout } } });
    await tx.shop.update({ where: { id: o.shopId }, data: { sales: { increment: o.qty } } });
    if (o.productId) await tx.product.updateMany({ where: { id: o.productId }, data: { sold: { increment: o.qty } } });
    return true;
  });
  if (!done) throw new HttpError(409, t("That order is already closed — refresh"));
  await unlock(u.id, "first_sale");
  await notify(o.buyerId, () => ({ kind: "reward", link: "market", title: t("✅ Picked up: {qty}× {title}", { qty: o.qty, title: o.title }), body: t("Thanks for shopping at {shop}!", { shop: o.shop.name }) }));
  return { message: o.fee ? t("💰 Handed over — +{n} coins (market fee {fee})", { n: payout, fee: o.fee }) : t("💰 Handed over — +{n} coins", { n: payout }) };
});
