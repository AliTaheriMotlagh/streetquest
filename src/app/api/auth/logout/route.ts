import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/server/auth";
import { route } from "@/server/http";

export const POST = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
});
