// A player reports a shop or one of its products (lib/stores/moderation.ts REPORT_REASONS): it goes to
// Admin → Listings; reports from several players hide a product until a moderator has looked.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body } from "@/server/http";
import { reportListing } from "@/server/moderation";
import { REPORT_REASONS } from "@/lib/stores/moderation";

const Schema = z.object({
  shopId: z.string().max(40),
  productId: z.string().max(40).nullable().default(null),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(300).default(""),
});

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  return reportListing(u, await body(req, Schema));
});
