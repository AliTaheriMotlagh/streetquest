// Optional email/password account (not used by the UI — players start as guests).
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createAccount } from "@/server/accounts";
import { setSessionCookie } from "@/server/auth";
import { body, route } from "@/server/http";

const Schema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and _ only"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  timezone: z.string().max(64).optional(),
});

export const POST = route(async (req) => {
  const d = await body(req, Schema);
  const user = await createAccount({ username: d.username, email: d.email, passwordHash: await bcrypt.hash(d.password, 10), timezone: d.timezone });
  await setSessionCookie(user.id);
  return { ok: true };
});
