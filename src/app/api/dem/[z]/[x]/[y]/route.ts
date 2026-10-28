// Elevation tiles for the 3D city's mountain skyline (drive/skyline.ts): Terrarium PNGs
// (height = R·256 + G + B/256 − 32768 m) from the AWS open terrain dataset, passed through
// our own server so players only talk to the game's domain, and cached for a month —
// mountains don't move. Only the coarse zooms the skyline uses. Public data: no login.
import { HttpError, route } from "@/server/http";
import { t } from "@/lib/i18n";

const SRC = process.env.DEM_TILE_URL ?? "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const GET = route(async (_req, ctx) => {
  const p = await ctx.params;
  const z = Number(p.z), x = Number(p.x), y = Number(String(p.y).replace(/\.png$/, ""));
  const n = 2 ** z;
  if (z < 7 || z > 11 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) throw new HttpError(400, t("Bad tile"));
  const res = await fetch(SRC.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new HttpError(502, t("The map server is busy — try again in a moment"));
  return new Response(await res.arrayBuffer(), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=2592000, s-maxage=2592000, immutable" },
  });
});
