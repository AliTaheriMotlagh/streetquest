// The Seller center (server/seller.ts): GET → the seller's shop, businesses and to-do list;
// POST { businessId } links that verified business to the shop, { businessId: null } unlinks it.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { linkShop, sellerOverview } from "@/server/seller";

export const GET = route(async () => sellerOverview((await requireUser()).id));

const Link = z.object({ businessId: z.string().min(1).max(40).nullable() });
export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const { businessId } = await body(req, Link);
  return linkShop(u.id, businessId);
});
