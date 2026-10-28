// Street Arena in the open city over HTTP (no realtime server): passive mode, respawning,
// and hits. See server/arena.ts.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { hit, respawn, setPassive } from "@/server/arena";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("passive"), on: z.boolean() }),
  z.object({ action: z.literal("respawn") }),
  z.object({ action: z.literal("hit"), target: z.string().max(64), weapon: z.string().max(12), zone: z.enum(["head", "body", "legs"]), pellets: z.number().int().min(1).max(12).default(1) }),
]);

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "passive") return setPassive(u, d.on);
  if (d.action === "respawn") return respawn(u.id);
  return hit(u, d.target, d.weapon, d.zone, d.pellets);
});
