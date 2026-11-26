// For the game: which store products have a 3D model made from their photo, and the kind the LLM or an admin gave
// the ones the rules couldn't place (server/product3d.ts lookup). ?keys=<productKey>,… (lib/product3d/pipeline.ts).
import { route } from "@/server/http";
import { lookup } from "@/server/product3d";

export const GET = route(async (req) => {
  const keys = (new URL(req.url).searchParams.get("keys") ?? "").split(",").slice(0, 300);
  const out = await lookup(keys).catch(() => ({}));
  return Response.json({ products: out }, { headers: { "cache-control": "public, max-age=120, s-maxage=300, stale-while-revalidate=600" } });
});
