// Account creation shared by guest play (the default) and the legacy signup API.
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../lib/db";
import { notify } from "./hub";
import { HttpError } from "./http";
import { track } from "./rewards";

const REFERRAL_BONUS = 150;
const CALLSIGNS = ["Ghost", "Viper", "Falcon", "Raven", "Wolf", "Cobra", "Titan", "Nova", "Blaze", "Shadow", "Hawk", "Rogue"];

const randomName = () => `${CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)]}${Math.floor(1000 + Math.random() * 9000)}`;
const referralCode = (username: string) => `${username.slice(0, 6).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;

type NewAccount = { username?: string; email?: string; passwordHash?: string; timezone?: string; role?: string };

/** Create a player, crediting ?ref= referrals and UTM attribution from the visitor's cookies. */
export async function createAccount(d: NewAccount) {
  const jar = await cookies();
  const refCode = jar.get("sq_ref")?.value;
  const referrer = refCode ? await prisma.user.findUnique({ where: { referralCode: refCode } }) : null;
  let utm: { source?: string; medium?: string; campaign?: string } = {};
  try {
    utm = JSON.parse(jar.get("sq_utm")?.value ?? "{}");
  } catch {}

  for (let attempt = 0; ; attempt++) {
    const username = d.username ?? randomName();
    try {
      const user = await prisma.user.create({
        data: {
          username,
          // Guests have no email or password; placeholders keep the unique columns happy and can never log in.
          email: d.email ?? `guest-${randomBytes(8).toString("hex")}@guest.invalid`,
          passwordHash: d.passwordHash ?? "!guest",
          timezone: d.timezone || "UTC",
          role: d.role ?? "PLAYER",
          referralCode: referralCode(username),
          referredById: referrer?.id,
          coins: referrer ? 100 + REFERRAL_BONUS : 100,
          utmSource: utm.source ?? (referrer ? "referral" : undefined),
          utmMedium: utm.medium ?? undefined,
          utmCampaign: utm.campaign ?? undefined,
        },
      });
      if (referrer) {
        await prisma.user.update({ where: { id: referrer.id }, data: { coins: { increment: REFERRAL_BONUS } } });
        await notify(referrer.id, { kind: "reward", title: "Referral bonus!", body: `${user.username} joined with your code: +${REFERRAL_BONUS} coins` });
      }
      await track("signup", { userId: user.id, source: user.utmSource ?? undefined, campaign: user.utmCampaign ?? undefined });
      return user;
    } catch (e) {
      // Random callsign collided with an existing player: roll another one.
      if ((e as { code?: string }).code === "P2002" && !d.username && attempt < 5) continue;
      if ((e as { code?: string }).code === "P2002") throw new HttpError(409, "Username or email already taken");
      throw e;
    }
  }
}
