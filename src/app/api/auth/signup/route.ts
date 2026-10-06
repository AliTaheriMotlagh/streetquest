import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/server/auth";
import { notify } from "@/server/hub";
import { body, HttpError, route } from "@/server/http";
import { track } from "@/server/rewards";

const Schema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  timezone: z.string().max(64).optional(),
});

const REFERRAL_BONUS = 150;

export const POST = route(async (req) => {
  const d = await body(req, Schema);
  const taken = await prisma.user.findFirst({ where: { OR: [{ username: d.username }, { email: d.email }] } });
  if (taken) throw new HttpError(409, "Username or email already taken");

  const jar = await cookies();
  const refCode = jar.get("sq_ref")?.value;
  const referrer = refCode ? await prisma.user.findUnique({ where: { referralCode: refCode } }) : null;
  let utm: { source?: string; medium?: string; campaign?: string } = {};
  try {
    utm = JSON.parse(jar.get("sq_utm")?.value ?? "{}");
  } catch {}

  const isFirstUser = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      username: d.username,
      email: d.email,
      passwordHash: await bcrypt.hash(d.password, 10),
      timezone: d.timezone || "UTC",
      role: isFirstUser ? "ADMIN" : "PLAYER", // first account bootstraps the admin panel
      referralCode: `${d.username.slice(0, 6).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      referredById: referrer?.id,
      coins: referrer ? 100 + REFERRAL_BONUS : 100,
      utmSource: utm.source ?? (referrer ? "referral" : undefined),
      utmMedium: utm.medium ?? undefined,
      utmCampaign: utm.campaign ?? undefined,
    },
  });
  if (referrer) {
    await prisma.user.update({ where: { id: referrer.id }, data: { coins: { increment: REFERRAL_BONUS } } });
    notify(referrer.id, { kind: "reward", title: "Referral bonus!", body: `${user.username} joined with your code: +${REFERRAL_BONUS} coins` });
  }
  await track("signup", { userId: user.id, source: user.utmSource ?? undefined, campaign: user.utmCampaign ?? undefined });
  await setSessionCookie(user.id);
  return { ok: true };
});
