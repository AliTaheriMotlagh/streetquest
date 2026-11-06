// Finished Street Arena matches, posted by the realtime server (signed with a key derived
// from AUTH_SECRET). Each human player is paid once per match (server/arenaPay.ts); the
// answer tells the realtime server what each player got so it can show them.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isMode } from "@/lib/arena/modes";
import { ArenaRowSchema as Row, payArena } from "@/server/arenaPay";
import { HttpError, route } from "@/server/http";
import { serverKey } from "@/server/session";

const Body = z.object({ matchId: z.string().max(64), mode: z.string(), players: z.number().int().min(1).max(64), results: z.array(Row).max(32) });

export const POST = route(async (req) => {
  const raw = await req.text();
  const sig = Buffer.from(req.headers.get("x-rt-signature") ?? "", "hex");
  const want = createHmac("sha256", serverKey("rt-result")).update(raw).digest();
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) throw new HttpError(401, "bad signature");
  const b = Body.parse(JSON.parse(raw));
  if (!isMode(b.mode)) throw new HttpError(400, "mode");
  const rewards = await payArena(b.matchId, b.mode, b.players, b.results);
  return { rewards };
});
