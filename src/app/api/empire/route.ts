// Street Empire (the idle tycoon): GET the settled empire, POST an action.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body, route } from "@/server/http";
import { act, settled, view } from "@/server/empire";

export const GET = route(async () => {
  const u = await requireUser();
  const { row, s, steps, offline } = await settled(u);
  return { ...view(row, s, steps, u.stepsTotal), offline };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), biz: z.string().max(20), count: z.number().int().min(-1).max(1000) }),
  z.object({ action: z.literal("run"), biz: z.string().max(20) }),
  z.object({ action: z.literal("hire"), biz: z.string().max(20) }),
  z.object({ action: z.literal("upgrade"), id: z.string().max(30) }),
  z.object({ action: z.literal("rush") }),
  z.object({ action: z.literal("prestige") }),
  z.object({ action: z.literal("dividend") }),
  z.object({ action: z.literal("rank") }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const a = await body(req, Schema);
  const r = await act(u, a);
  // The fresh state comes back with every action, so the client never drifts.
  const { row, s, steps } = await settled(u);
  return { ...r, ...view(row, s, steps, u.stepsTotal) };
});
