// Gem store: real-money gem packs (Stripe), and things to spend gems on.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { confirmCheckout, createCheckout, stripeReady } from "@/server/store";
import { maxHpOf } from "@/server/td";
import { adStatus } from "@/server/ads";

export const GET = route(async () => {
  const u = await requireUser();
  return {
    enabled: S.storeEnabled,
    payments: stripeReady(),
    currency: S.currency,
    packs: S.gemPacks,
    offers: S.gemOffers,
    boosts: { heal: S.healGems, refresh: S.refreshGems, shield: S.shieldGems },
    gems: u.gems,
    ads: await adStatus(u.id),
  };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), pack: z.string().max(40) }),
  z.object({ action: z.literal("confirm"), sessionId: z.string().max(200) }),
  z.object({ action: z.literal("offer"), key: z.string().max(40) }),
  z.object({ action: z.literal("heal") }),
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("shield") }),
]);

async function spendGems(userId: string, gems: number) {
  const took = await prisma.user.updateMany({ where: { id: userId, gems: { gte: gems } }, data: { gems: { decrement: gems } } });
  if (!took.count) throw new HttpError(400, `Needs ${gems} 💎 — watch a sponsor spot or visit the gem store`);
}

export const POST = route(async (req) => {
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
    if (!o) throw new HttpError(404, "Unknown offer");
    await spendGems(u.id, o.gems);
    await prisma.user.update({ where: { id: u.id }, data: { coins: { increment: o.coins } } });
    return { message: `🪙 +${o.coins.toLocaleString()} coins (−${o.gems} 💎)` };
  }
  if (d.action === "heal") {
    const max = await maxHpOf(u.id);
    await spendGems(u.id, S.healGems);
    await prisma.user.update({ where: { id: u.id }, data: { hp: max, hpAt: new Date(), downedUntil: null } });
    return { message: `❤️ Fully healed (−${S.healGems} 💎)` };
  }
  if (d.action === "refresh") {
    await spendGems(u.id, S.refreshGems);
    await prisma.user.update({ where: { id: u.id }, data: { hunger: 100, energy: 100, social: 100, fun: 100, needsAt: new Date() } });
    return { message: `🥤 Fully refreshed (−${S.refreshGems} 💎)` };
  }
  // shield
  const base = await prisma.base.findUnique({ where: { ownerId: u.id } });
  if (!base) throw new HttpError(400, "Plant a base first");
  await spendGems(u.id, S.shieldGems);
  const from = Math.max(Date.now(), base.shieldUntil?.getTime() ?? 0);
  await prisma.base.update({ where: { id: base.id }, data: { shieldUntil: new Date(from + 4 * 3600_000) } });
  return { message: `🛡️ Base shielded for 4 more hours (−${S.shieldGems} 💎)` };
});
