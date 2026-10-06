import { cookies } from "next/headers";
import { prisma } from "../lib/db";
import { HttpError } from "./http";
import { SESSION_COOKIE, signSession, verifySession } from "./session";

export { canSimulate, SESSION_COOKIE } from "./session";

export async function setSessionCookie(userId: string) {
  (await cookies()).set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // guests have no password, so the cookie *is* the account
  });
}

export async function currentUser() {
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  return user && !user.banned ? user : null;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new HttpError(403, "Admins only");
  return u;
}

