// Real map data for the 3D city and real-place missions, from OpenStreetMap via the
// Overpass API, cached per cell in CityTile. Overpass is slow (20–40 s per cell) and
// often busy, so:
//  - nothing waits for it longer than the caller allows: the client draws the cell's
//    fantasy village meanwhile and asks again;
//  - each cell is fetched once (deduped per instance, at most two at a time, polite
//    User-Agent), kept for a month, and failures back off before retrying;
//  - OVERPASS_URL lists the endpoints to try in order ("off" disables fetching, which
//    the e2e tests use — tiles can still be uploaded by an admin).
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { fromOverpass, overpassQuery, parseTileKey, TILE_V, tileKey, tileOf, type CityTile } from "../lib/city";
import type { LatLng } from "../lib/geo";
import type { Place } from "../lib/places";

const DEFAULT_ENDPOINTS = "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.private.coffee/api/interpreter";
const endpoints = () => {
  const v = process.env.OVERPASS_URL ?? DEFAULT_ENDPOINTS;
  return v === "off" ? [] : v.split(",").map((s) => s.trim()).filter(Boolean);
};
const REFRESH_MS = 30 * 86_400_000;
const FETCH_TIMEOUT_MS = 55_000;
const MAX_PARALLEL = 2;
const backoffMs = (fails: number) => Math.min(6 * 3600_000, 120_000 * 2 ** Math.max(0, fails - 1));

const inflight = new Map<string, Promise<CityTile | null>>();
let running = 0;
const queue: (() => void)[] = [];
const slot = () => (running < MAX_PARALLEL ? Promise.resolve() : new Promise<void>((r) => queue.push(r)));

async function overpass(query: string): Promise<{ elements: unknown[] } | null> {
  const ua = `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;
  for (const url of endpoints()) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": ua, accept: "application/json" }, body: new URLSearchParams({ data: query }).toString(), signal: ctl.signal });
      if (!res.ok) continue; // busy (429/504) — try the next mirror
      const json = (await res.json().catch(() => null)) as { elements?: unknown[] } | null;
      if (json && Array.isArray(json.elements)) return { elements: json.elements };
    } catch {
      // timeout or network: next mirror
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Store a tile (from Overpass or an admin upload). */
export async function saveTile(tile: CityTile) {
  const data = { data: tile as unknown as Prisma.InputJsonValue, pois: tile.p as unknown as Prisma.InputJsonValue, fetchedAt: new Date(), failedAt: null, fails: 0 };
  await prisma.cityTile.upsert({ where: { key: tile.key }, create: { key: tile.key, ...data }, update: data });
  poiCache.set(tile.key, { at: Date.now(), places: tile.p });
}

function fetchTile(cx: number, cy: number): Promise<CityTile | null> {
  const key = tileKey(cx, cy);
  const have = inflight.get(key);
  if (have) return have;
  const p = (async () => {
    await slot();
    running++;
    try {
      const res = await overpass(overpassQuery(cx, cy));
      if (!res) {
        await prisma.cityTile.upsert({ where: { key }, create: { key, failedAt: new Date(), fails: 1 }, update: { failedAt: new Date(), fails: { increment: 1 } } }).catch(() => {});
        return null;
      }
      const tile = fromOverpass(res.elements as Parameters<typeof fromOverpass>[0], cx, cy);
      await saveTile(tile);
      return tile;
    } finally {
      running--;
      queue.shift()?.();
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Keep a fetch alive after the response on serverless hosts. */
function keepAlive(p: Promise<unknown>) {
  try {
    after(() => p.catch(() => {}));
  } catch {
    void p.catch(() => {}); // outside a request (scripts, tests)
  }
}

type Row = { fetchedAt: Date | null; failedAt: Date | null; fails: number; data?: unknown };
/** Fetch (again)? Never fetched, older than a month, or stored in an older tile format. */
const due = (row: Row | null) => {
  if (!row) return true;
  if (row.failedAt && Date.now() - row.failedAt.getTime() < backoffMs(row.fails)) return false;
  if (row.data && ((row.data as { v?: number }).v ?? 1) < TILE_V) return true;
  return !row.fetchedAt || Date.now() - row.fetchedAt.getTime() > REFRESH_MS;
};

/**
 * One tile for the 3D city. Waits up to `waitMs` for a fetch; otherwise `pending`
 * tells the client to draw the village and ask again in a few seconds.
 */
export async function getTile(cx: number, cy: number, waitMs = 6000): Promise<{ tile: CityTile | null; pending: boolean }> {
  const key = tileKey(cx, cy);
  const row = await prisma.cityTile.findUnique({ where: { key } });
  const stored = (row?.data as CityTile | null) ?? null;
  if (!due(row) || !endpoints().length) return { tile: stored, pending: false };
  const p = fetchTile(cx, cy);
  keepAlive(p);
  const res = await Promise.race([p, new Promise<"wait">((r) => setTimeout(() => r("wait"), waitMs))]);
  if (res === "wait") return { tile: stored, pending: !stored };
  return { tile: res ?? stored, pending: false };
}

/**
 * Several tiles in one round trip (the 3D city asks for the 3×3 or 5×5 around the car).
 * Tiles we already have come back at once, even if a fresher copy is being fetched;
 * missing ones are waited for up to `waitMs` together, then reported as pending.
 */
export async function getTiles(cells: { cx: number; cy: number }[], waitMs = 0): Promise<Record<string, { tile: CityTile | null; pending: boolean }>> {
  const keys = cells.map((c) => tileKey(c.cx, c.cy));
  const rows = new Map((await prisma.cityTile.findMany({ where: { key: { in: keys } } })).map((r) => [r.key, r]));
  const out: Record<string, { tile: CityTile | null; pending: boolean }> = {};
  const waits: Promise<void>[] = [];
  const deadline = new Promise<"wait">((r) => setTimeout(() => r("wait"), waitMs));
  for (const { cx, cy } of cells) {
    const key = tileKey(cx, cy);
    const row = rows.get(key) ?? null;
    const stored = (row?.data as CityTile | null) ?? null;
    out[key] = { tile: stored, pending: false };
    if (!due(row) || !endpoints().length) continue;
    const p = fetchTile(cx, cy);
    keepAlive(p);
    if (stored) continue;
    out[key].pending = true;
    if (waitMs > 0)
      waits.push(
        Promise.race([p, deadline]).then((res) => {
          if (res !== "wait" && res) out[key] = { tile: res, pending: false };
          else if (res !== "wait") out[key] = { tile: null, pending: false };
        }),
      );
  }
  await Promise.all(waits);
  return out;
}

// ---------------------------------------------------------------- places, for the map and missions
const POI_TTL_MS = 5 * 60_000;
const poiCache = new Map<string, { at: number; places: Place[] | null }>();

/**
 * Real places in the 3×3 cells around a point, by cell. Cells we have no data for are
 * missing from the map (and fetched in the background for next time).
 */
export async function placesAround(here: LatLng, opts: { warm?: boolean } = {}): Promise<Map<string, Place[]>> {
  const { cx, cy } = tileOf(here);
  const keys: string[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) keys.push(tileKey(cx + dx, cy + dy));
  return placesIn(keys, opts);
}

export async function placesIn(keys: string[], opts: { warm?: boolean } = {}): Promise<Map<string, Place[]>> {
  const out = new Map<string, Place[]>();
  const now = Date.now();
  const missing = keys.filter((k) => {
    const c = poiCache.get(k);
    if (c && now - c.at < POI_TTL_MS) {
      if (c.places) out.set(k, c.places);
      return false;
    }
    return true;
  });
  if (missing.length) {
    const rows = await prisma.cityTile.findMany({ where: { key: { in: missing } }, select: { key: true, pois: true, fetchedAt: true, failedAt: true, fails: true } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const k of missing) {
      const r = byKey.get(k);
      const places = (r?.pois as Place[] | null | undefined) ?? null;
      poiCache.set(k, { at: now, places });
      if (places) out.set(k, places);
      if (opts.warm && endpoints().length && due(r ?? null)) {
        const t = parseTileKey(k);
        if (t) keepAlive(fetchTile(t.cx, t.cy));
      }
    }
  }
  if (poiCache.size > 4000) poiCache.clear();
  return out;
}

/** Find one place by id in a cell (and its neighbours: a mission's place is in its cell). */
export async function findPlace(cell: string, placeId: string): Promise<Place | null> {
  const places = await placesIn([cell]);
  return places.get(cell)?.find((p) => p.id === placeId) ?? null;
}
