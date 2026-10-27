// Street-map vector tiles for the 3D city (OpenStreetMap data in the OpenMapTiles
// schema, from OpenFreeMap), passed through our own server so:
//  - players only ever talk to the game's domain (works where other hosts are blocked);
//  - every tile is cached at the edge for a week — the whole neighbourhood loads in one
//    or two fast requests instead of 20–40 s Overpass queries per cell.
// Only zoom 14 is served (the zoom the 3D city builds from). Public map data: no login.
import { HttpError, route } from "@/server/http";
import { t } from "@/lib/i18n";

const TILEJSON = process.env.VT_TILEJSON_URL ?? "https://tiles.openfreemap.org/planet";
const ZOOM = 14;
let template: { url: string; at: number } | null = null;

/** The current planet build's tile URL template, refreshed every 6 hours. */
async function tileUrl() {
  if (template && Date.now() - template.at < 6 * 3600_000) return template.url;
  const res = await fetch(TILEJSON, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new HttpError(502, t("The map server is busy — try again in a moment"));
  const json = (await res.json()) as { tiles?: string[] };
  const url = json.tiles?.[0];
  if (!url) throw new HttpError(502, t("The map server is busy — try again in a moment"));
  template = { url, at: Date.now() };
  return url;
}

export const GET = route(async (_req, ctx) => {
  const p = await ctx.params;
  const z = Number(p.z), x = Number(p.x), y = Number(String(p.y).replace(/\.pbf$/, ""));
  const n = 2 ** ZOOM;
  if (z !== ZOOM || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) throw new HttpError(400, t("Bad tile"));
  const url = (await tileUrl()).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  // No map data there (open sea): an empty tile, cached like any other.
  if (res.status === 204 || res.status === 404) return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=86400, s-maxage=604800" } });
  if (!res.ok) throw new HttpError(502, t("The map server is busy — try again in a moment"));
  const body = await res.arrayBuffer();
  return new Response(body, {
    headers: {
      "content-type": "application/x-protobuf",
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
    },
  });
});
