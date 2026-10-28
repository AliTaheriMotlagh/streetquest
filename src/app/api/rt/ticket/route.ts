// A short-lived pass for the realtime server (realtime/server.ts): who you are, your
// friends (who may always see you) and whether you're on a virtual position (play from
// home / test mode) — players following their real GPS can watch but are never shown.
// Signed with a key derived from AUTH_SECRET, which the realtime server shares.
import { SignJWT } from "jose";
import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { friendIds } from "@/server/rooms";
import { canSimulate, serverKey } from "@/server/session";
import { levelForXp } from "@/lib/progression";

const KEY = new TextEncoder().encode(serverKey("rt"));

export const GET = route(async (req) => {
  const u = await requireUser();
  const url = process.env.NEXT_PUBLIC_RT_URL || process.env.RT_URL || "";
  if (!url) return { url: null, ticket: null };
  const sim = new URL(req.url).searchParams.get("sim") === "1";
  const friends = (await friendIds(u.id)).slice(0, 500);
  const ticket = await new SignJWT({ name: u.username, avatar: u.avatar, level: levelForXp(u.xp), friends, virtual: u.remotePlay || (sim && canSimulate(u.role)) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(KEY);
  return { url, ticket };
});
