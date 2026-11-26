// A player's own ads (server/houseAds.ts): GET lists them with views and clicks; POST buys one with coins,
// or pauses / resumes one.
import { enforce } from "@/server/limits";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { buyAd, myAds, pauseAd } from "@/server/houseAds";
import { AD_VIEWS_MAX, AD_VIEWS_MIN, AD_VIEWS_STEP } from "@/lib/ads/slot";

export const GET = route(async () => myAds((await requireUser()).id));

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("buy"),
    title: z.string().trim().min(3).max(60),
    body: z.string().trim().max(140).default(""),
    url: z.string().trim().max(300).default(""),
    emoji: z.string().trim().max(8).default("📣"),
    views: z.number().int().min(AD_VIEWS_MIN).max(AD_VIEWS_MAX).multipleOf(AD_VIEWS_STEP),
  }),
  z.object({ action: z.literal("pause"), id: z.string().max(40), paused: z.boolean() }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "buy") await enforce("ad", u);
  return d.action === "buy" ? buyAd(u, d) : pauseAd(u.id, d.id, d.paused);
});
