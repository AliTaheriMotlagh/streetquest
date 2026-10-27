// Player shops on the server: what clients see of shops, products and orders, and the
// money paths (refunds) shared by the API and the daily cron. Coins only ever move
// inside a transaction that first flips the order's status, so a double tap, a retry
// or the cron racing a player can't pay or refund twice.
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import { t } from "../lib/i18n";
import { S } from "../lib/settings";
import { discountLive, priceNow, SHOP_WARN_MS } from "../lib/shops";
import { HttpError } from "./http";
import { notify } from "./hub";

/** Product fields for views — never the photo bytes (served by /shop-img/<id>). */
export const PRODUCT_SELECT = {
  id: true,
  title: true,
  description: true,
  price: true,
  discountPct: true,
  discountUntil: true,
  stock: true,
  featured: true,
  active: true,
  sold: true,
  createdAt: true,
  photos: { select: { id: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ProductSelect;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

export const SHOP_SELECT = {
  id: true,
  ownerId: true,
  name: true,
  tagline: true,
  about: true,
  emoji: true,
  category: true,
  address: true,
  lat: true,
  lng: true,
  coverId: true,
  open: true,
  expiresAt: true,
  sales: true,
  createdAt: true,
  owner: { select: { username: true, avatar: true } },
} satisfies Prisma.ShopSelect;
type ShopRow = Prisma.ShopGetPayload<{ select: typeof SHOP_SELECT }>;

/** Open for business: not paused by the owner and paid up. */
export const shopLive = (s: { open: boolean; expiresAt: Date }, now = Date.now()) => s.open && s.expiresAt.getTime() > now;

export function productView(p: ProductRow, now = Date.now()) {
  const live = discountLive(p, now);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: p.price,
    priceNow: priceNow(p, now),
    /** The discount running right now (0 if none). */
    deal: live ? p.discountPct : 0,
    /** When the running discount ends (null: no end, or no discount). */
    dealEnds: live && p.discountUntil ? p.discountUntil.getTime() : null,
    // As the seller set them, for editing.
    discountPct: p.discountPct,
    discountUntil: p.discountUntil?.getTime() ?? null,
    stock: p.stock,
    featured: p.featured,
    active: p.active,
    sold: p.sold,
    photos: p.photos.map((x) => x.id),
  };
}
export type ProductView = ReturnType<typeof productView>;

export function shopView(s: ShopRow, products: ProductRow[], viewerId: string, here: LatLng | null, now = Date.now()) {
  const mine = s.ownerId === viewerId;
  const list = products.map((p) => productView(p, now)).filter((p) => mine || p.active);
  return {
    id: s.id,
    name: s.name,
    tagline: s.tagline,
    about: s.about,
    emoji: s.emoji,
    category: s.category,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    coverId: s.coverId,
    open: s.open,
    live: shopLive(s, now),
    expiresAt: s.expiresAt.getTime(),
    sales: s.sales,
    createdAt: s.createdAt.getTime(),
    owner: s.owner,
    mine,
    distanceM: here ? Math.round(distanceM(here, s)) : null,
    deal: Math.max(0, ...list.filter((p) => p.active && p.stock > 0).map((p) => p.deal)),
    inStock: list.filter((p) => p.active && p.stock > 0).length,
    products: list,
  };
}
export type ShopView = ReturnType<typeof shopView>;

/** A shop in a list: the window display instead of the whole stock. */
export function shopCard(s: ShopRow, products: ProductRow[], viewerId: string, here: LatLng | null, match?: string) {
  const { products: list, about: _about, ...rest } = shopView(s, products, viewerId, here);
  const forSale = list.filter((p) => p.active && p.stock > 0);
  const q = match?.toLowerCase();
  // Searching: show what matched. Otherwise: the shop window, then the best deals.
  const window = q
    ? forSale.filter((p) => p.title.toLowerCase().includes(q))
    : [...forSale.filter((p) => p.featured), ...forSale.filter((p) => !p.featured).sort((a, b) => b.deal - a.deal)];
  return { ...rest, showcase: window.slice(0, 6).map(({ id, title, price, priceNow, deal, photos }) => ({ id, title, price, priceNow, deal, photo: photos[0] ?? null })) };
}
export type ShopCard = ReturnType<typeof shopCard>;

type OrderRow = Prisma.ShopOrderGetPayload<{ include: { shop: { select: { id: true; name: true; emoji: true; lat: true; lng: true; address: true; ownerId: true } }; buyer: { select: { username: true; avatar: true } } } }>;
export const ORDER_INCLUDE = {
  shop: { select: { id: true, name: true, emoji: true, lat: true, lng: true, address: true, ownerId: true } },
  buyer: { select: { username: true, avatar: true } },
} satisfies Prisma.ShopOrderInclude;

/** An order as one side sees it. Only the buyer ever sees the pickup code. */
export function orderView(o: OrderRow, viewerId: string) {
  const buyer = o.buyerId === viewerId;
  return {
    id: o.id,
    side: buyer ? ("buyer" as const) : ("seller" as const),
    shop: { id: o.shop.id, name: o.shop.name, emoji: o.shop.emoji, lat: o.shop.lat, lng: o.shop.lng, address: o.shop.address },
    buyer: o.buyer,
    productId: o.productId,
    title: o.title,
    photo: o.photoId,
    qty: o.qty,
    unitPrice: o.unitPrice,
    total: o.total,
    fee: o.fee,
    code: buyer ? o.code : null,
    note: o.note,
    status: o.status as "PENDING" | "DONE" | "CANCELLED",
    cancelledBy: o.cancelledBy,
    createdAt: o.createdAt.getTime(),
    doneAt: o.doneAt?.getTime() ?? null,
    /** Not handed over by then → refunded automatically. */
    refundAt: o.createdAt.getTime() + S.shopOrderDays * 86_400_000,
  };
}
export type OrderView = ReturnType<typeof orderView>;

/** A 4-digit pickup code. */
export const pickupCode = () => String(randomInt(1000, 10000));

/**
 * Call an order off: the buyer gets every coin back and the items go back on the
 * shelf. `by` says who did it (the other side is told).
 */
export async function cancelOrder(orderId: string, by: "buyer" | "seller" | "expired") {
  const o = await prisma.$transaction(async (tx) => {
    const flipped = await tx.shopOrder.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "CANCELLED", cancelledBy: by, doneAt: new Date() } });
    if (!flipped.count) return null;
    const order = await tx.shopOrder.findUniqueOrThrow({ where: { id: orderId }, include: { shop: { select: { name: true, ownerId: true } } } });
    await tx.user.update({ where: { id: order.buyerId }, data: { coins: { increment: order.total } } });
    if (order.productId) await tx.product.updateMany({ where: { id: order.productId }, data: { stock: { increment: order.qty } } });
    return order;
  });
  if (!o) throw new HttpError(409, t("That order is already closed — refresh"));
  const what = { qty: o.qty, title: o.title, shop: o.shop.name, n: o.total };
  if (by !== "buyer")
    await notify(o.buyerId, () => ({
      link: "market",
      kind: "reward",
      title: by === "seller" ? t("🛍️ {shop} cancelled your order", what) : t("🛍️ Your order from {shop} expired", what),
      body: t("{qty}× {title} · {n} coins refunded", what),
    }));
  if (by !== "seller")
    await notify(o.shop.ownerId, () => ({
      link: "market",
      kind: "info",
      title: by === "buyer" ? t("🛍️ An order was cancelled") : t("🛍️ An order expired — it wasn't handed over in time"),
      body: t("{qty}× {title} is back in stock", what),
    }));
  return o;
}

/** Daily: refund orders nobody handed over in time, warn owners whose shop is about to close. */
export async function shopHousekeeping() {
  const stale = await prisma.shopOrder.findMany({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - S.shopOrderDays * 86_400_000) } }, select: { id: true }, take: 500 });
  let refunded = 0;
  for (const o of stale) if (await cancelOrder(o.id, "expired").catch(() => null)) refunded++;

  const now = new Date();
  const closing = await prisma.shop.findMany({ where: { warnedAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + SHOP_WARN_MS) } }, select: { id: true, ownerId: true, name: true, expiresAt: true }, take: 500 });
  for (const s of closing) {
    if (!(await prisma.shop.updateMany({ where: { id: s.id, warnedAt: null }, data: { warnedAt: now } })).count) continue;
    const days = Math.max(1, Math.ceil((s.expiresAt.getTime() - now.getTime()) / 86_400_000));
    await notify(s.ownerId, () => ({ kind: "info", link: "market", title: t("🏪 {name} closes in {days, plural, one {# day} other {# days}}", { name: s.name, days }), body: t("Renew it in Market → My shop to keep selling") }));
  }
  return { refunded, warned: closing.length };
}

/** For the world map: shops in a box, with their best running discount. */
export async function shopsInBox(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }, viewerId: string) {
  const now = new Date();
  const rows = await prisma.shop.findMany({
    where: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng }, OR: [{ open: true, expiresAt: { gt: now } }, { ownerId: viewerId }] },
    select: { id: true, ownerId: true, name: true, emoji: true, lat: true, lng: true, open: true, expiresAt: true, products: { where: { active: true, stock: { gt: 0 }, discountPct: { gt: 0 } }, select: { discountPct: true, discountUntil: true } } },
    take: 150,
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    emoji: s.emoji,
    lat: s.lat,
    lng: s.lng,
    mine: s.ownerId === viewerId,
    live: s.open && s.expiresAt > now,
    deal: Math.max(0, ...s.products.filter((p) => !p.discountUntil || p.discountUntil > now).map((p) => p.discountPct)),
  }));
}
