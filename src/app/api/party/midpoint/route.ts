// Vasatyab: the party's meeting point (GET ?method=median|centroid|fairest[&lite=1: no places]; {none:true} when not in a party), and pinning it as the
// party's gather point (POST set / clear / gather). See server/midpoint.ts.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { clearMeet, gatherAtMeet, partyMidpoint, setMeet } from "@/server/midpoint";
import { isMidMethod } from "@/lib/midpoint";

export const GET = route(async (req) => {
  const u = await requireUser();
  const q = new URL(req.url).searchParams;
  const m = q.get("method");
  return (await partyMidpoint(u.id, isMidMethod(m) ? m : "median", q.get("lite") !== "1")) ?? { none: true };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), name: z.string().max(80).optional() }),
  z.object({ action: z.literal("clear") }),
  z.object({ action: z.literal("gather"), sim: z.boolean().optional() }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "gather") return { at: await gatherAtMeet(u, d.sim) };
  if (d.action === "set") await setMeet(u, { lat: d.lat, lng: d.lng }, d.name ?? "");
  else await clearMeet(u.id);
  return { ok: true };
});
