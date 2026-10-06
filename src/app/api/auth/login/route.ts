import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";

const Schema = z.object({ login: z.string().trim().min(1), password: z.string().min(1) });

export const POST = route(async (req) => {
  const d = await body(req, Schema);
  const user = await prisma.user.findFirst({ where: { OR: [{ username: d.login }, { email: d.login.toLowerCase() }] } });
  if (!user || !(await bcrypt.compare(d.password, user.passwordHash))) throw new HttpError(401, "Wrong username or password");
  if (user.banned) throw new HttpError(403, "This account is banned");
  await setSessionCookie(user.id);
  return { ok: true };
});
