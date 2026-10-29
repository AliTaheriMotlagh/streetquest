// Map data for the 3D city, one ~450 m cell at a time (see server/city.ts).
// { tile: null, pending: true } means "still fetching — draw the village, ask again".
// ?keys=cx_cy,cx_cy… asks for up to 9 cells in one round trip: { tiles: { key: … } }.
import { z } from "zod";
import { requireAdmin, requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";
import { getTile, getTiles, saveTile } from "@/server/city";
import { parseTileKey, TILE_V, tileKey, type CityTile } from "@/lib/city";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";

const int = (v: string | null) => (v != null && /^-?\d{1,6}$/.test(v) ? Number(v) : NaN);

export const GET = route(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const many = sp.get("keys");
  if (many != null) {
    const cells = [...new Set(many.split(",").filter(Boolean))].slice(0, 9).map(parseTileKey);
    if (!cells.length || cells.some((c) => !c || Math.abs(c.cx) > 999_999 || Math.abs(c.cy) > 999_999)) throw new HttpError(400, t("cx/cy required"));
    const tiles = await getTiles(cells as { cx: number; cy: number }[], sp.get("wait") === "0" ? 0 : 5000);
    const settled = Object.values(tiles).every((x) => !x.pending && x.tile);
    return Response.json({ tiles }, { headers: { "cache-control": settled ? "private, max-age=600" : "no-store" } });
  }
  const cx = int(sp.get("cx")), cy = int(sp.get("cy"));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) throw new HttpError(400, t("cx/cy required"));
  const res = await getTile(cx, cy, sp.get("wait") === "0" ? 0 : 6000);
  return Response.json(res, { headers: { "cache-control": res.tile && !res.pending ? "private, max-age=3600" : "no-store" } });
});

// Admins: upload a tile (e.g. from a self-hosted Overpass) or drop one so it's fetched again.
const Points = z.array(z.number().int()).max(20_000);
const Colour = z.string().regex(/^#[0-9a-f]{6}$/i);
const Info = z.object({ phone: z.string().max(30).optional(), web: z.string().url().max(200).optional(), ig: z.string().max(30).optional(), hours: z.string().max(80).optional(), addr: z.string().max(100).optional(), img: z.string().url().max(200).optional() });
const Upload = z.object({
  tile: z.object({
    cx: z.number().int(),
    cy: z.number().int(),
    b: z.array(z.object({ r: Points, h: z.number().min(0).max(1000), k: z.string().max(20), n: z.string().max(60).optional(), mh: z.number().min(0).max(1000).optional(), rf: z.string().max(12).optional(), c: Colour.optional(), rc: Colour.optional() })).max(5000),
    r: z.array(z.object({ l: Points, w: z.number().min(0).max(60), k: z.string().max(20), n: z.string().max(60).optional(), ln: z.number().int().min(1).max(8).optional(), ow: z.literal(1).optional() })).max(5000),
    a: z.array(z.object({ r: Points, k: z.string().max(20) })).max(1000),
    p: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), cat: z.string().max(20), lat: z.number(), lng: z.number(), brand: z.string().max(40).optional(), info: Info.optional() })).max(1000),
    o: Points.optional(),
  }).optional(),
  forget: z.string().max(30).optional(),
});

export const POST = route(async (req) => {
  await requireAdmin();
  const d = await body(req, Upload);
  if (d.forget) {
    await prisma.cityTile.deleteMany({ where: { key: d.forget } });
    return { message: t("Tile {key} will be fetched again", { key: d.forget }) };
  }
  if (!d.tile) throw new HttpError(400, t("Nothing to do"));
  const tile = { v: TILE_V, key: tileKey(d.tile.cx, d.tile.cy), real: true, ...d.tile } as CityTile;
  await saveTile(tile);
  return { message: t("Tile {key} saved ({n} places)", { key: tile.key, n: tile.p.length }) };
});
