// Admin → Listings (server/moderation.ts): GET the queue (products waiting for a moderator, open reports);
// POST a decision — let a product through or turn it down with a reason, or dismiss a shop's reports.
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { decideListing, dismissReports, moderationQueue } from "@/server/moderation";
import { decideAd, pendingAds } from "@/server/houseAds";

export const GET = route(async () => {
  await requireAdmin();
  const [queue, ads] = await Promise.all([moderationQueue(), pendingAds()]);
  return { ...queue, ads };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("decide"), productId: z.string().max(40), approve: z.boolean(), note: z.string().trim().max(300).default("") }),
  z.object({ action: z.literal("dismiss"), shopId: z.string().max(40), target: z.string().max(40) }),
  z.object({ action: z.literal("decideAd"), id: z.string().max(40), approve: z.boolean(), note: z.string().trim().max(300).default("") }),
]);

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const d = await body(req, Schema);
  if (d.action === "decideAd") return decideAd(admin, d.id, d.approve, d.note);
  return d.action === "decide" ? decideListing(admin, d.productId, d.approve, d.note) : dismissReports(admin, d.shopId, d.target);
});
