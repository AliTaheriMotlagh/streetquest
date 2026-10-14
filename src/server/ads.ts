// Rewarded sponsor spots. The server times the view (start → claim must take at
// least adSeconds), caps views per player per day and logs views/clicks per
// creative so sponsors can be shown reach. With no creatives set up, the game
// shows its own "invite a friend" spot so the flow still works.
//
// Real ad network: with ADSENSE_CLIENT set, the client first asks Google's H5 Games
// Ads (Ad Placement API) for a rewarded video and only falls back to the sponsor
// spot when Google has no fill (no ads in that country, ad blocker, frequency cap).
// Google has no server-side reward callback for web games, so network views are
// trusted on the client's "viewed" signal, kept honest by a minimum watch time and
// the same daily cap.
import { prisma } from "../lib/db";
import { S, type AdCreative } from "../lib/settings";
import { HttpError } from "./http";
import { msg, t } from "../lib/i18n";

export const HOUSE_AD: AdCreative = {
  id: "house",
  sponsor: "StreetQuest",
  title: msg("Bring your crew"),
  body: msg("Invite a friend with your link from Hero → Profile — you both get bonus coins when they join."),
  videoUrl: "/media/streetquest-ad.mp4",
};

/** Google rewarded videos run at least this long; a faster claim didn't watch one. */
const NETWORK_MIN_SECONDS = 5;
export const NETWORK_ID = "google";

/** Ad network the client should try first, or null for sponsor spots only. */
function network() {
  const client = process.env.ADSENSE_CLIENT?.trim();
  if (!S.adNetworkEnabled || !client || !/^ca-pub-\d{10,20}$/.test(client)) return null;
  return { provider: NETWORK_ID, client, test: process.env.ADSENSE_TEST === "on" };
}

/** ads.txt line that authorizes Google to sell this site's inventory. */
export function adsTxt() {
  const client = process.env.ADSENSE_CLIENT?.trim();
  return client ? `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : "";
}

const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export async function adStatus(userId: string) {
  const today = await prisma.adView.count({ where: { userId, claimedAt: { not: null }, startedAt: { gte: dayStart() } } });
  return { enabled: S.adsEnabled, left: Math.max(0, S.adDailyLimit - today), seconds: S.adSeconds, gems: S.adGems, coins: S.adCoins, network: network() };
}

/** `viaNetwork`: the client has a Google rewarded video ready and is about to play it. */
export async function startAd(userId: string, viaNetwork = false) {
  if (!S.adsEnabled) throw new HttpError(400, t("Sponsor spots are switched off"));
  const st = await adStatus(userId);
  if (st.left <= 0) throw new HttpError(429, t("That's all the sponsor spots for today — come back tomorrow"));
  if (viaNetwork) {
    if (!st.network) throw new HttpError(400, t("Video ads aren't available right now"));
    const view = await prisma.adView.create({ data: { userId, creativeId: NETWORK_ID } });
    return { viewId: view.id, network: true as const };
  }
  const pool = S.adCreatives.filter((c) => c.active !== false);
  const creative = pool.length ? pool[Math.floor(Math.random() * pool.length)] : HOUSE_AD;
  const view = await prisma.adView.create({ data: { userId, creativeId: creative.id } });
  return { viewId: view.id, creative, seconds: S.adSeconds };
}

export async function claimAd(userId: string, viewId: string) {
  const v = await prisma.adView.findUnique({ where: { id: viewId } });
  if (!v || v.userId !== userId) throw new HttpError(404, t("Unknown spot"));
  if (v.claimedAt) throw new HttpError(409, t("Already rewarded"));
  const minSeconds = v.creativeId === NETWORK_ID ? NETWORK_MIN_SECONDS : S.adSeconds;
  if (Date.now() - v.startedAt.getTime() < (minSeconds - 1) * 1000) throw new HttpError(400, t("Watch the whole spot to get the reward"));
  if (Date.now() - v.startedAt.getTime() > 30 * 60_000) throw new HttpError(410, t("This spot expired — start a new one"));
  if ((await adStatus(userId)).left <= 0) throw new HttpError(429, t("Daily limit reached"));
  const ok = await prisma.adView.updateMany({ where: { id: viewId, claimedAt: null }, data: { claimedAt: new Date() } });
  if (!ok.count) throw new HttpError(409, t("Already rewarded"));
  return { gems: S.adGems, coins: S.adCoins };
}

export async function clickAd(userId: string, viewId: string) {
  await prisma.adView.updateMany({ where: { id: viewId, userId }, data: { clicked: true } });
}
