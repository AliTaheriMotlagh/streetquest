// Stripe webhook: credits gems when a Checkout session completes, even if the
// player never comes back to the game tab. Point Stripe at /api/store/webhook and
// subscribe to checkout.session.completed (+ async_payment_succeeded).
import { settleSession, verifyWebhook } from "@/server/store";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"))) return Response.json({ error: "bad signature" }, { status: 400 });
  try {
    const event = JSON.parse(raw);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await settleSession(event.data.object);
    return Response.json({ received: true });
  } catch (e) {
    console.error("webhook failed", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
