// Admin → Siktir: every "never again" mark (GET ?q= filters by place or note), hide or delete one (POST).
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminSiktir, adminSiktirAction } from "@/server/siktir";

export const GET = route(async (req) => {
  await requireAdmin();
  return { marks: await adminSiktir((new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80)) };
});

const Action = z.object({ action: z.enum(["hide", "unhide", "delete"]), id: z.string().max(40) });

export const POST = route(async (req) => {
  await requireAdmin();
  const d = await body(req, Action);
  await adminSiktirAction(d.id, d.action);
  return { ok: true };
});
