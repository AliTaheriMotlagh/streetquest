// Rewarded sponsor spots. The server times the view (start → claim must take at
// least adSeconds), caps views per player per day and logs views/clicks per
// creative so sponsors can be shown reach. With no creatives set up, the game
// shows its own "invite a friend" spot so the flow still works.
import { prisma } from "../lib/db";
import { S, type AdCreative } from "../lib/settings";
import { HttpError } from "./http";

export const HOUSE_AD: AdCreative = {
  id: "house",
  sponsor: "StreetQuest",
  title: "Bring your crew",
  body: "Invite a friend with your link from Hero → Profile — you both get bonus coins when they join.",
  videoUrl: "/media/streetquest-ad.mp4",
};

const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export async function adStatus(userId: string) {
  const today = await prisma.adView.count({ where: { userId, claimedAt: { not: null }, startedAt: { gte: dayStart() } } });
  return { enabled: S.adsEnabled, left: Math.max(0, S.adDailyLimit - today), seconds: S.adSeconds, gems: S.adGems, coins: S.adCoins };
}

export async function startAd(userId: string) {
  if (!S.adsEnabled) throw new HttpError(400, "Sponsor spots are switched off");
  const st = await adStatus(userId);
  if (st.left <= 0) throw new HttpError(429, "That's all the sponsor spots for today — come back tomorrow");
  const pool = S.adCreatives.filter((c) => c.active !== false);
  const creative = pool.length ? pool[Math.floor(Math.random() * pool.length)] : HOUSE_AD;
  const view = await prisma.adView.create({ data: { userId, creativeId: creative.id } });
  return { viewId: view.id, creative, seconds: S.adSeconds };
}

export async function claimAd(userId: string, viewId: string) {
  const v = await prisma.adView.findUnique({ where: { id: viewId } });
  if (!v || v.userId !== userId) throw new HttpError(404, "Unknown spot");
  if (v.claimedAt) throw new HttpError(409, "Already rewarded");
  if (Date.now() - v.startedAt.getTime() < (S.adSeconds - 1) * 1000) throw new HttpError(400, "Watch the whole spot to get the reward");
  if (Date.now() - v.startedAt.getTime() > 30 * 60_000) throw new HttpError(410, "This spot expired — start a new one");
  if ((await adStatus(userId)).left <= 0) throw new HttpError(429, "Daily limit reached");
  const ok = await prisma.adView.updateMany({ where: { id: viewId, claimedAt: null }, data: { claimedAt: new Date() } });
  if (!ok.count) throw new HttpError(409, "Already rewarded");
  return { gems: S.adGems, coins: S.adCoins };
}

export async function clickAd(userId: string, viewId: string) {
  await prisma.adView.updateMany({ where: { id: viewId, userId }, data: { clicked: true } });
}
