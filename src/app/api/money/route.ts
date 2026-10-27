// Pick up money on the map (a game pickup "$…" or an admin drop "$d:…").
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { actionRoute, body } from "@/server/http";
import { collectMoney } from "@/server/money";

const Schema = z.object({ id: z.string().max(80) });

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const { id } = await body(req, Schema);
  return collectMoney(u, id);
});
