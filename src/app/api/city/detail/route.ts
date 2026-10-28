// A city pack's street detail (lib/cityPack.ts) for up to 25 cells:
// ?keys=cx_cy,cx_cy… → { cells: { key: CityDetail | null } }. null: no pack covers that
// cell (the street-map tile is drawn as it is). Public map data, cached at the edge.
import { HttpError, route } from "@/server/http";
import { parseTileKey } from "@/lib/city";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";

export const GET = route(async (req) => {
  const keys = [...new Set((new URL(req.url).searchParams.get("keys") ?? "").split(",").filter(Boolean))].slice(0, 25);
  if (!keys.length || keys.some((k) => !parseTileKey(k))) throw new HttpError(400, t("cx/cy required"));
  const rows = await prisma.cityDetail.findMany({ where: { key: { in: keys } }, select: { key: true, data: true } });
  const cells: Record<string, unknown> = Object.fromEntries(keys.map((k) => [k, null]));
  for (const r of rows) cells[r.key] = r.data;
  return Response.json({ cells }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" } });
});
