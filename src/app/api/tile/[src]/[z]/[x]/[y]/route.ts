// A 2D map tile through our own server (lib/tileProxy.ts): from the disk cache when we have it (TILE_CACHE_DIR,
// kept 30 days), else fetched once from the provider — players asking for the same tile at once share one fetch —
// and kept. A provider that fails gets our older copy if there is one. Public map data: no login.
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HttpError, route } from "@/server/http";
import { TILE_KEEP_MS, tileCachePath, tileSourceUrl } from "@/lib/tileProxy";
import { t } from "@/lib/i18n";

const DIR = process.env.TILE_CACHE_DIR || "";
const UA = `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;
const inflight = new Map<string, Promise<Uint8Array | null>>();

const png = (body: Uint8Array, hit: string) =>
  new Response(body as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800, stale-while-revalidate=2592000", "x-tile-cache": hit } });

async function fetchTile(url: string, file: string | null): Promise<Uint8Array | null> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const body = new Uint8Array(await res.arrayBuffer());
  if (file)
    await mkdir(dirname(file), { recursive: true })
      .then(() => writeFile(`${file}.tmp`, body))
      .then(() => rename(`${file}.tmp`, file))
      .catch(() => {}); // a full or read-only disk only costs the cache
  return body;
}

export const GET = route(async (_req, ctx) => {
  const p = await ctx.params;
  const key = String(p.src), z = Number(p.z), x = Number(p.x), y = Number(String(p.y).replace(/\.png$/, ""));
  const url = tileSourceUrl(key, z, x, y);
  if (!url) throw new HttpError(400, t("Bad tile"));
  const file = DIR ? join(DIR, tileCachePath(key, z, x, y)) : null;
  const kept = file ? await stat(file).then((s) => ({ fresh: Date.now() - s.mtimeMs < TILE_KEEP_MS }), () => null) : null;
  if (file && kept?.fresh) {
    const body = await readFile(file).catch(() => null);
    if (body) return png(body, "hit");
  }
  let p2 = inflight.get(url);
  if (!p2) {
    p2 = fetchTile(url, file).finally(() => inflight.delete(url));
    inflight.set(url, p2);
  }
  const body = await p2;
  if (body) return png(body, "miss");
  const old = file && kept ? await readFile(file).catch(() => null) : null;
  if (old) return png(old, "stale");
  throw new HttpError(502, t("The map server is busy — try again in a moment"));
});
