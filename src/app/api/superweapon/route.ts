// Faction superweapon: status (charge) and launch at a point within range of your base.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route, actionRoute } from "@/server/http";
import { assertNotDowned } from "@/server/td";
import { launch, superStatus } from "@/server/superweapons";

export const GET = route(async () => {
  const u = await requireUser();
  const s = await superStatus(u);
  return { def: s.def, level: s.level, readyAt: s.readyAt, now: Date.now() };
});

const Schema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  await assertNotDowned(u);
  const s = await launch(u, d);
  return { strikeId: s.id, impactAt: s.impactAt.getTime(), message: `Launch confirmed — impact in ${Math.round((s.impactAt.getTime() - Date.now()) / 1000)}s` };
});
