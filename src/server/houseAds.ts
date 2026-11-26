// Self-serve house ads (rules: lib/ads/slot.ts). A player buys views with coins; the text is pre-checked
// like a shop listing (lib/stores/moderation.ts: refused, held for Admin → Listings, or live), and the
// slot serves approved ads weighted by the views they have left, counting each view and click.
import { prisma } from "../lib/db";
import { t, dot } from "../lib/i18n";
import { S } from "../lib/settings";
import { adChain, adPrice, cleanAdUrl, pickHouse, type AdNetworks } from "../lib/ads/slot";
import { preCheck, reviewAfter } from "../lib/stores/moderation";
import { audit } from "./audit";
import { HttpError } from "./http";
import { notify } from "./hub";
import { spendCoins } from "./rewards";

type Who = { id: string; username: string; role?: string };

/** The networks this deployment has (env), for the client's fallback chain. */
export function adNetworks(): AdNetworks {
  const client = process.env.ADSENSE_CLIENT?.trim(), slot = process.env.ADSENSE_SLOT?.trim();
  return {
    yektanet: process.env.YEKTANET_SCRIPT?.trim() || undefined,
    tapsell: process.env.TAPSELL_SCRIPT?.trim() || undefined,
    adsense: client && slot && /^ca-pub-\d{10,20}$/.test(client) && /^\d{5,20}$/.test(slot) ? { client, slot } : undefined,
  };
}

export async function buyAd(u: Who, d: { title: string; body: string; url: string; emoji: string; views: number }) {
  if (!S.houseAdsEnabled) throw new HttpError(400, t("Ads can't be bought right now"));
  const url = cleanAdUrl(d.url);
  if (url == null) throw new HttpError(400, t("The link must start with https://"));
  const mine = await prisma.houseAd.findMany({ where: { ownerId: u.id }, select: { title: true, body: true, review: true }, take: 50, orderBy: { createdAt: "desc" } });
  const v = preCheck({ title: d.title, description: d.body, price: 0, currency: "coins" }, {
    approved: mine.filter((a) => a.review === "ok").length,
    others: mine.map((a) => ({ title: a.title, description: a.body, price: 0, currency: "coins" as const })),
    trusted: u.role === "ADMIN",
  });
  if (v.verdict === "block") {
    await audit(u, "ad.blocked", { type: "ad", id: u.id }, d.title, { cat: v.cat });
    throw new HttpError(400, t(v.reasons[0]));
  }
  const coins = adPrice(d.views, S.houseAdCoinsPer100);
  await spendCoins(u.id, coins);
  const review = reviewAfter(v, null);
  const ad = await prisma.houseAd.create({ data: { ownerId: u.id, title: d.title, body: d.body, url, emoji: d.emoji || "📣", views: d.views, coins, review, reviewNote: v.verdict === "hold" ? v.reasons.join(dot()) : "" } });
  return {
    message: review === "ok" ? t("📣 Your ad is live — {n} views", { n: d.views }) : t("🕓 Your ad is saved — a moderator checks it before players see it"),
    ad: { id: ad.id, review },
  };
}

export async function myAds(userId: string) {
  const ads = await prisma.houseAd.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, body: true, url: true, emoji: true, views: true, shown: true, clicks: true, coins: true, review: true, reviewNote: true, paused: true, createdAt: true } });
  return { ads: ads.map((a) => ({ ...a, createdAt: a.createdAt.getTime() })), per100: S.houseAdCoinsPer100, enabled: S.houseAdsEnabled };
}

export async function pauseAd(userId: string, id: string, paused: boolean) {
  const r = await prisma.houseAd.updateMany({ where: { id, ownerId: userId }, data: { paused } });
  if (!r.count) throw new HttpError(404, t("That ad is gone"));
  return { ok: true };
}

/** One slot filled: a house ad (counted as a view) and the networks to fall back on, in order. */
export async function serveSlot(country: string | null) {
  const nets = adNetworks();
  const chain = adChain(country, nets);
  const pool = S.houseAdsEnabled ? await prisma.houseAd.findMany({ where: { review: "ok", paused: false }, select: { id: true, title: true, body: true, url: true, emoji: true, views: true, shown: true }, take: 200, orderBy: { createdAt: "desc" } }) : [];
  // Two tries: another slot may have taken the last view of the one picked.
  for (let i = 0; i < 2; i++) {
    const a = pickHouse(pool.filter((x) => x.shown < x.views));
    if (!a) break;
    const took = await prisma.houseAd.updateMany({ where: { id: a.id, shown: { lt: a.views } }, data: { shown: { increment: 1 } } });
    if (took.count) return { chain, nets, house: { id: a.id, title: a.title, body: a.body, emoji: a.emoji, link: !!a.url } };
    a.shown = a.views;
  }
  return { chain: chain.filter((c) => c !== "house"), nets, house: null };
}

/** A click on a house ad: counted, and where it goes. */
export async function clickAd(id: string) {
  const a = await prisma.houseAd.findUnique({ where: { id }, select: { url: true, review: true } });
  if (!a || a.review !== "ok" || !a.url) return null;
  await prisma.houseAd.update({ where: { id }, data: { clicks: { increment: 1 } } });
  return a.url;
}

/** Admin → Listings: ads waiting for a moderator. */
export const pendingAds = () =>
  prisma.houseAd.findMany({ where: { review: "pending" }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, title: true, body: true, url: true, emoji: true, views: true, reviewNote: true, owner: { select: { username: true } } } });

/** A moderator lets an ad through or turns it down (the coins go back with a turned-down ad). */
export async function decideAd(admin: Who, id: string, approve: boolean, note: string) {
  const a = await prisma.houseAd.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true, coins: true, shown: true, review: true } });
  if (!a) throw new HttpError(404, t("That ad is gone"));
  if (a.review !== "pending") return { ok: true };
  await prisma.$transaction([
    prisma.houseAd.update({ where: { id }, data: { review: approve ? "ok" : "rejected", reviewNote: approve ? "" : note } }),
    ...(approve ? [] : [prisma.user.update({ where: { id: a.ownerId }, data: { coins: { increment: a.coins } } })]),
  ]);
  await audit(admin, approve ? "ad.approve" : "ad.reject", { type: "ad", id }, a.title, { note });
  await notify(a.ownerId, () => ({
    link: "market",
    kind: "info",
    title: approve ? t("📣 Your ad {title} is live", { title: a.title }) : t("⛔ Your ad {title} was turned down", { title: a.title }),
    body: approve ? t("Players see it in the game's lists now.") : `${note || t("It breaks the ad rules.")} ${t("Your coins are back.")}`,
  }));
  return { ok: true };
}
