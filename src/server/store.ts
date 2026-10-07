// Real-money gem purchases through Stripe Checkout (REST API, no SDK). Set
// STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook) to switch it on.
// Gems are credited exactly once per Checkout session: either by the webhook or
// when the player returns to the game, whichever comes first.
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/db";
import { S } from "../lib/settings";
import { HttpError } from "./http";
import { notify } from "./hub";
import { track } from "./rewards";
import { trackStat } from "./goals";

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;

async function stripe<T>(path: string, params?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "Payments aren't set up yet");
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

export async function createCheckout(userId: string, packKey: string, origin: string) {
  if (!S.storeEnabled) throw new HttpError(400, "The store is closed");
  const pack = S.gemPacks.find((p) => p.key === packKey);
  if (!pack) throw new HttpError(404, "Unknown pack");
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
  await prisma.user.update({ where: { id: row.userId }, data: { gems: { increment: row.gems } } });
  await notify(row.userId, { kind: "reward", title: `💎 +${row.gems.toLocaleString()} gems!`, body: "Thanks for supporting the game, commander." });
  await track("purchase", { userId: row.userId, campaign: row.pack });
  await trackStat(row.userId, "purchase", 1);
  return { gems: row.gems, already: false };
}

export async function confirmCheckout(userId: string, sessionId: string) {
  const row = await prisma.purchase.findUnique({ where: { ref: sessionId } });
  if (!row || row.userId !== userId) throw new HttpError(404, "Purchase not found");
  if (row.status === "PAID") return { gems: row.gems, already: true };
  const s = await stripe<Session>(`checkout/sessions/${encodeURIComponent(sessionId)}`);
  const r = await settleSession(s);
  if (!r) throw new HttpError(402, "Payment not completed yet — if you paid, your gems arrive in a minute");
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
