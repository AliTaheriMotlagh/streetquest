// The FPS netcode: GET for state, POST your position/hits each tick (~7 Hz).
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { tick } from "@/server/match";

const n = z.number().finite();
const Schema = z.object({
  x: n,
  z: n,
  yaw: n,
  inZone: z.boolean().optional(),
  hits: z.array(z.object({ key: z.string().max(40), head: z.boolean().optional() })).max(10).optional(),
  bots: z.array(z.object({ key: z.string().max(40), x: n, z: n, yaw: n })).max(12).optional(),
  botHits: z.array(z.object({ from: z.string().max(40), key: z.string().max(40), dmg: n })).max(12).optional(),
});

export const GET = route(async (_req, ctx) => {
  const u = await requireUser();
  return tick(u, (await ctx.params).id, null);
});

export const POST = route(async (req, ctx) => {
  const u = await requireUser();
  return tick(u, (await ctx.params).id, await body(req, Schema));
});
