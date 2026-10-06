// Start or join a live FPS fight: "breach" an enemy base or "raid" a world boss.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { openMatch } from "@/server/match";

const Schema = z.object({ kind: z.enum(["breach", "raid"]), targetId: z.string().max(80) });

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  return openMatch(u, d.kind, d.targetId);
});
