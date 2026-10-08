// No login: the first visit gets a guest commander and a long-lived session cookie.
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { createAccount } from "@/server/accounts";
import { currentUser, SESSION_COOKIE, setSessionCookie } from "@/server/auth";
import { HttpError, route } from "@/server/http";
import { track } from "@/server/rewards";
import { verifySession } from "@/server/session";

const PER_IP_PER_HOUR = 20;

export const POST = route(async (req) => {
  const existing = await currentUser();
  if (existing) return { ok: true, username: existing.username };
  // A banned player's cookie still verifies: don't hand them a fresh account.
  const prior = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (prior && (await prisma.user.findUnique({ where: { id: prior }, select: { banned: true } }))?.banned) throw new HttpError(403, "This account is banned");

  // Light abuse guard: cap how many guest accounts one network can mint per hour.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const recent = await prisma.metric.count({ where: { name: "guest_created", source: ip, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= PER_IP_PER_HOUR) throw new HttpError(429, "Too many new players from this network — try again later");

  const user = await createAccount({});
  await track("guest_created", { userId: user.id, source: ip });
  await setSessionCookie(user.id);
  return { ok: true, username: user.username };
});
