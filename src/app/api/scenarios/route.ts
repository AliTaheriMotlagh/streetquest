// Story scenarios in the 3D city (lib/scenarios). GET: the enabled scenarios and my recent runs.
// POST: start a run (with the places the client resolved around me), finish it (the server checks
// it could have happened and pays once per window), or abandon it. See server/scenarios.ts.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { abandonRun, finishRun, playerView, startRun } from "@/server/scenarios";

export const GET = route(async (req) => {
  const u = await requireUser();
  // An admin can open a switched-off scenario to try it (?test=<id>).
  return playerView(u.id, u.role === "ADMIN" ? { test: new URL(req.url).searchParams.get("test") } : undefined);
});

const Pt = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), id: z.string().max(40), giver: Pt, places: z.array(Pt.nullable()).max(30) }),
  z.object({ action: z.literal("finish"), runId: z.string().max(40), result: z.enum(["won", "failed"]), elapsedS: z.number().min(0).max(86_400), travelledM: z.number().min(0).max(5_000_000), reason: z.string().max(40).optional() }),
  z.object({ action: z.literal("abandon"), runId: z.string().max(40) }),
]);

export const POST = route(
  async (req) => {
    const u = await requireUser();
    const d = await body(req, Action);
    if (d.action === "start") return startRun(u.id, d.id, { giver: d.giver, places: d.places }, u.role === "ADMIN");
    if (d.action === "abandon") return (await abandonRun(u.id, d.runId), { ok: true });
    return finishRun(u.id, d.runId, d);
  },
  { exclusive: true },
);
