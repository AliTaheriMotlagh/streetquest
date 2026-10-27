// Gem store: real-money gem packs (Stripe), and things to spend gems on.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { confirmCheckout, createCheckout, stripeReady } from "@/server/store";
import { adStatus } from "@/server/ads";
import { t } from "@/lib/i18n";

export const GET = route(async () => {
  const u = await requireUser();
  return {
    enabled: S.storeEnabled,
    payments: stripeReady(),
    currency: S.currency,
    packs: S.gemPacks,
    offers: S.gemOffers,
    gems: u.gems,
    ads: await adStatus(u.id),
  };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), pack: z.string().max(40) }),
  z.object({ action: z.literal("confirm"), sessionId: z.string().max(200) }),
  z.object({ action: z.literal("offer"), key: z.string().max(40) }),
]);

async function spendGems(userId: string, gems: number) {
  const took = await prisma.user.updateMany({ where: { id: userId, gems: { gte: gems } }, data: { gems: { decrement: gems } } });
  if (!took.count) throw new HttpError(400, t("Needs {n} 💎 — watch a sponsor spot or visit the gem store", { n: gems }));
}

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);

  if (d.action === "checkout") {
    const origin = new URL(req.url).origin;
    return { url: await createCheckout(u.id, d.pack, origin) };
  }
  if (d.action === "confirm") {
    const r = await confirmCheckout(u.id, d.sessionId);
    return { message: r.already ? "Purchase already credited" : `💎 +${r.gems.toLocaleString()} gems added!` };
  }
  if (d.action === "offer") {
    const o = S.gemOffers.find((x) => x.key === d.key);
    if (!o) throw new HttpError(404, t("Unknown offer"));
    await spendGems(u.id, o.gems);
    await prisma.user.update({ where: { id: u.id }, data: { coins: { increment: o.coins } } });
    return { message: t("🪙 +{n} coins (−{gems} 💎)", { n: o.coins, gems: o.gems }) };
  }
  throw new HttpError(400, t("Unknown offer"));
});
