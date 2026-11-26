// Listings moderation on the server (rules: lib/stores/moderation.ts). Players report a shop or a product
// (/api/shops/report); moderators work the queue — products waiting for a first look, flagged edits, and
// open reports — in Admin → Listings (/api/admin/listings). Every decision is in the audit log and the
// seller is told.
import { prisma } from "../lib/db";
import { t } from "../lib/i18n";
import { HELD_BY_REPORTS, HIDE_AFTER_REPORTS, type ReportReason } from "../lib/stores/moderation";
import { audit } from "./audit";
import { HttpError } from "./http";
import { notify } from "./hub";

/** A player can file this many reports an hour (a bad actor can't bury a rival's shop). */
const REPORTS_PER_HOUR = 15;

type Who = { id: string; username: string };

/** A player reports a shop, or one of its products. Reports from several players send a product back to a moderator. */
export async function reportListing(u: Who, r: { shopId: string; productId?: string | null; reason: ReportReason; note: string }) {
  const shop = await prisma.shop.findUnique({ where: { id: r.shopId }, select: { id: true, ownerId: true, name: true } });
  if (!shop) throw new HttpError(404, t("That shop is gone"));
  if (shop.ownerId === u.id) throw new HttpError(400, t("That's your own shop"));
  const product = r.productId ? await prisma.product.findFirst({ where: { id: r.productId, shopId: shop.id }, select: { id: true, title: true, review: true } }) : null;
  if (r.productId && !product) throw new HttpError(404, t("This product isn't for sale any more"));
  const recent = await prisma.listingReport.count({ where: { reporterId: u.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= REPORTS_PER_HOUR) throw new HttpError(429, t("You've sent a lot of reports — try again in a while"));
  const target = product?.id ?? "shop";
  await prisma.listingReport.upsert({
    where: { reporterId_shopId_target: { reporterId: u.id, shopId: shop.id, target } },
    create: { reporterId: u.id, shopId: shop.id, productId: product?.id ?? null, target, reason: r.reason, note: r.note },
    // Reported again: the newest reason counts, and it's open again.
    update: { reason: r.reason, note: r.note, status: "open", createdAt: new Date() },
  });
  if (product && product.review === "ok") {
    const n = await prisma.listingReport.count({ where: { shopId: shop.id, target: product.id, status: "open" } });
    if (n >= HIDE_AFTER_REPORTS) {
      await prisma.product.update({ where: { id: product.id }, data: { review: "pending", reviewNote: HELD_BY_REPORTS } });
      await audit(null, "listing.hidden", { type: "product", id: product.id }, `${product.title} · ${n} reports`);
    }
  }
  return { message: t("Thanks — a moderator will look at it") };
}

/** Admin → Listings: what's waiting (pending products, oldest first) and the open reports (most reported first). */
export async function moderationQueue() {
  const [pending, reports] = await Promise.all([
    prisma.product.findMany({
      where: { review: "pending" },
      orderBy: { updatedAt: "asc" },
      take: 100,
      select: {
        id: true, title: true, description: true, price: true, currency: true, kind: true, reviewNote: true, updatedAt: true,
        photos: { select: { id: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: 3 },
        shop: { select: { id: true, name: true, owner: { select: { username: true } } } },
      },
    }),
    prisma.listingReport.groupBy({ by: ["shopId", "target"], where: { status: "open" }, _count: { _all: true }, _max: { createdAt: true }, orderBy: { _count: { id: "desc" } }, take: 100 }),
  ]);
  const detail = reports.length
    ? await prisma.listingReport.findMany({ where: { status: "open", OR: reports.map((g) => ({ shopId: g.shopId, target: g.target })) }, select: { shopId: true, target: true, reason: true, note: true }, take: 500 })
    : [];
  const shops = new Map((await prisma.shop.findMany({ where: { id: { in: [...new Set(reports.map((g) => g.shopId))] } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const titles = new Map(
    (await prisma.product.findMany({ where: { id: { in: reports.map((g) => g.target).filter((x) => x !== "shop") } }, select: { id: true, title: true, review: true } })).map((p) => [p.id, p]),
  );
  return {
    pending: pending.map((p) => ({ ...p, updatedAt: p.updatedAt.getTime(), photos: p.photos.map((x) => x.id) })),
    reports: reports.map((g) => {
      const mine = detail.filter((d) => d.shopId === g.shopId && d.target === g.target);
      const reasons: Record<string, number> = {};
      for (const d of mine) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
      const p = g.target === "shop" ? null : titles.get(g.target);
      return { shopId: g.shopId, shop: shops.get(g.shopId) ?? "?", target: g.target, title: p?.title ?? null, review: p?.review ?? null, n: g._count._all, last: g._max.createdAt?.getTime() ?? 0, reasons, notes: mine.map((d) => d.note).filter(Boolean).slice(0, 5) };
    }),
  };
}

/** A moderator lets a product through or turns it down (with a reason the seller reads); its open reports close. */
export async function decideListing(admin: Who, productId: string, approve: boolean, note: string) {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true, shop: { select: { id: true, ownerId: true } } } });
  if (!p) throw new HttpError(404, t("That product is gone"));
  await prisma.$transaction([
    prisma.product.update({ where: { id: p.id }, data: { review: approve ? "ok" : "rejected", reviewNote: approve ? "" : note } }),
    prisma.listingReport.updateMany({ where: { shopId: p.shop.id, target: p.id, status: "open" }, data: { status: approve ? "dismissed" : "done" } }),
  ]);
  await audit(admin, approve ? "listing.approve" : "listing.reject", { type: "product", id: p.id }, p.title, { note });
  await notify(p.shop.ownerId, () => ({
    link: "market",
    kind: "info",
    title: approve ? t("✅ {title} is live in your shop", { title: p.title }) : t("⛔ {title} was turned down", { title: p.title }),
    body: approve ? t("Buyers can see it now.") : note || t("It breaks the shop rules — edit it and it's checked again."),
  }));
  return { ok: true };
}

/** Reports about a shop itself (or a product a moderator has already looked at) closed without changes. */
export async function dismissReports(admin: Who, shopId: string, target: string) {
  const n = await prisma.listingReport.updateMany({ where: { shopId, target, status: "open" }, data: { status: "dismissed" } });
  await audit(admin, "listing.dismiss", { type: target === "shop" ? "shop" : "product", id: target === "shop" ? shopId : target }, `${n.count} reports`);
  return { ok: true };
}
