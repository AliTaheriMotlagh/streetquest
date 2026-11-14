// A player's API keys for the public data API (server/apiKeys.ts; the API itself is /api/v1):
//   GET            their keys (an admin may add ?all=1 for everyone's)
//   POST {name}    make one — the key is in the answer once, never again
//   PATCH {id, perMinute}  (admin) change a key's rate limit
//   DELETE ?id=    revoke one (an admin can revoke anyone's)
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { createKey, listAllKeys, listKeys, revokeKey, setLimit } from "@/server/apiKeys";
import { t } from "@/lib/i18n";
import { MAX_KEYS_PER_PLAYER, MAX_PER_MINUTE } from "@/lib/apiV1";

export const GET = route(async (req) => {
  const u = await requireUser();
  const all = new URL(req.url).searchParams.get("all") === "1" && u.role === "ADMIN";
  return { keys: all ? await listAllKeys() : await listKeys(u.id), admin: u.role === "ADMIN", max: MAX_KEYS_PER_PLAYER };
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const { name } = await body(req, z.object({ name: z.string().trim().max(60).default("") }));
  const made = await createKey(u.id, name);
  if (!made) throw new HttpError(409, t("You already have {n} active keys — revoke one first", { n: MAX_KEYS_PER_PLAYER }));
  return { key: made.key, row: made.row };
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new HttpError(403, t("Admins only"));
  const { id, perMinute } = await body(req, z.object({ id: z.string().min(1).max(40), perMinute: z.number().int().min(1).max(MAX_PER_MINUTE) }));
  if (!(await setLimit(id, perMinute))) throw new HttpError(404, t("That's no longer there — refresh and try again"));
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const u = await requireUser();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!(await revokeKey(id, u.id, u.role === "ADMIN"))) throw new HttpError(404, t("That's no longer there — refresh and try again"));
  return { ok: true };
});
