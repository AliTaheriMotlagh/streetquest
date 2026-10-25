// Real-money gem purchases through Stripe Checkout (REST API, no SDK). Set
// STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook) to switch it on.
// Gems are credited exactly once per Checkout session: either by the webhook or
// when the player returns to the game, whichever comes first.
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/db";
import { S } from "../lib/settings";
import { HttpError } from "./http";
import { notify } from "./hub";
import { fmtNum, t } from "../lib/i18n";
import { track } from "./rewards";
import { trackStat } from "./goals";

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;

async function stripe<T>(path: string, params?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, t("Payments aren't set up yet"));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { authorization: `Bearer ${key}`, ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("stripe error", data);
    throw new HttpError(502, data?.error?.message ?? "Payment provider error");
  }
  return data as T;
}

/**
 * A one-off Checkout for anything sold for real money (gem packs, business plans).
 * The Purchase row is what settleSession credits, exactly once.
 */
export async function stripeCheckout(
  userId: string,
  o: { pack: string; name: string; amountCents: number; gems?: number; metadata: Record<string, string>; successPath: string },
  origin: string,
) {
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": S.currency,
    "line_items[0][price_data][unit_amount]": String(o.amountCents),
    "line_items[0][price_data][product_data][name]": o.name,
    client_reference_id: userId,
    "metadata[userId]": userId,
    success_url: `${origin}${o.successPath}`,
    cancel_url: `${origin}/play?purchase=cancelled`,
  };
  for (const [k, v] of Object.entries(o.metadata)) params[`metadata[${k}]`] = v;
  const session = await stripe<{ id: string; url: string }>("checkout/sessions", params);
  await prisma.purchase.create({ data: { userId, ref: session.id, pack: o.pack, gems: o.gems ?? 0, amountCents: o.amountCents, currency: S.currency } });
  await track("checkout_started", { userId, campaign: o.pack.split(":").slice(0, 2).join(":") });
  return session.url;
}

export async function createCheckout(userId: string, packKey: string, origin: string) {
  if (!S.storeEnabled) throw new HttpError(400, t("The store is closed"));
  const pack = S.gemPacks.find((p) => p.key === packKey);
  if (!pack) throw new HttpError(404, t("Unknown pack"));
  const session = await stripe<{ id: string; url: string }>("checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": S.currency,
    "line_items[0][price_data][unit_amount]": String(pack.priceCents),
    "line_items[0][price_data][product_data][name]": `${pack.gems.toLocaleString()} Gems — ${pack.label}`,
    client_reference_id: userId,
    "metadata[userId]": userId,
    "metadata[pack]": pack.key,
    "metadata[gems]": String(pack.gems),
    success_url: `${origin}/play?purchase={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/play?purchase=cancelled`,
  });
  await prisma.purchase.create({ data: { userId, ref: session.id, pack: pack.key, gems: pack.gems, amountCents: pack.priceCents, currency: S.currency } });
  await track("checkout_started", { userId, campaign: pack.key });
  return session.url;
}

type Session = { id: string; payment_status: string; amount_total: number | null; currency: string | null; metadata: Record<string, string> | null };

/** Credit a paid session once. Safe to call any number of times. */
export async function settleSession(s: Session) {
  if (s.payment_status !== "paid") return null;
  const row = await prisma.purchase.findUnique({ where: { ref: s.id } });
  if (!row) return null;
  const flipped = await prisma.purchase.updateMany({ where: { ref: s.id, status: { not: "PAID" } }, data: { status: "PAID", paidAt: new Date(), amountCents: s.amount_total ?? row.amountCents, currency: s.currency ?? row.currency } });
  if (!flipped.count) return { gems: row.gems, already: true };
  // Business plan ("biz:<plan>:<businessId>"): extend the plan instead of crediting gems.
  if (row.pack.startsWith("biz:")) {
    const [, plan, businessId] = row.pack.split(":");
    const { extendPlan } = await import("./business");
    await extendPlan(businessId, plan as Parameters<typeof extendPlan>[1]);
    await track("biz_plan_paid", { userId: row.userId, campaign: plan });
    return { gems: 0, already: false, plan };
  }
  await prisma.user.update({ where: { id: row.userId }, data: { gems: { increment: row.gems } } });
  await notify(row.userId, () => ({ kind: "reward", title: t("💎 +{n} gems!", { n: row.gems }), body: t("Thanks for supporting the game, commander.") }));
  await track("purchase", { userId: row.userId, campaign: row.pack });
  await trackStat(row.userId, "purchase", 1);
  return { gems: row.gems, already: false };
}

export async function confirmCheckout(userId: string, sessionId: string) {
  const row = await prisma.purchase.findUnique({ where: { ref: sessionId } });
  if (!row || row.userId !== userId) throw new HttpError(404, t("Purchase not found"));
  if (row.status === "PAID") return { gems: row.gems, already: true };
  const s = await stripe<Session>(`checkout/sessions/${encodeURIComponent(sessionId)}`);
  const r = await settleSession(s);
  if (!r) throw new HttpError(402, t("Payment not completed yet — if you paid, your gems arrive in a minute"));
  return r;
}

/** Stripe-Signature: t=<ts>,v1=<hex>; signed payload is `${t}.${body}`. */
export function verifyWebhook(raw: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const want = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const got = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  return got.some((g) => g.length === want.length && timingSafeEqual(Buffer.from(g), Buffer.from(want)));
}
