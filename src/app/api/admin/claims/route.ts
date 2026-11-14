// Admin → Store claims: owners proving their store (GET ?status=review|pending|approved|rejected|all),
// and the decision (POST: approve verifies it — a dispute hands the store over — or turn it down).
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminClaims, decideClaim } from "@/server/claims";

const STATUS = ["review", "pending", "approved", "rejected", "all"] as const;

export const GET = route(async (req) => {
  await requireAdmin();
  const s = new URL(req.url).searchParams.get("status") ?? "review";
  return { claims: await adminClaims((STATUS as readonly string[]).includes(s) ? (s as (typeof STATUS)[number]) : "review") };
});

const Decide = z.object({ id: z.string().max(40), approve: z.boolean(), reason: z.string().max(300).default("") });

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const d = await body(req, Decide);
  return decideClaim(admin, d.id, d.approve, d.reason);
});
