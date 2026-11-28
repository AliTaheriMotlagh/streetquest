// Map tiles through the game's own server (pure; tests/tileProxy.test.ts). The 2D map's keyless tile providers
// are in Europe — slow from Iran and filtered now and then — so the phone asks /api/tile/<source>/<z>/<x>/<y>.png
// on our domain, and the server fetches each tile once and keeps it on disk (TILE_CACHE_DIR, 30 days), so a
// street every player walks is served from the box at once. Esri (satellite) is left direct: it refuses the
// Iranian server and the map already falls back to a keyless provider when it's blocked.
// NEXT_PUBLIC_TILE_PROXY="off" sends every tile straight to its provider again.

/** The providers we pass through, by a short name; `{s}` takes one of `subdomains` (spread by tile). */
export const TILE_SOURCES: Record<string, { url: string; subdomains?: string; maxZoom: number }> = {
  osm: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19 },
  osmde: { url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png", maxZoom: 19 },
  osmfr: { url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 19 },
  hot: { url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 19 },
  cyclosm: { url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 19 },
  topo: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 17 },
  rail: { url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", subdomains: "abc", maxZoom: 19 },
};

/** Our own path for a provider's URL template (a template we don't pass through is returned as it is). */
export function viaHost(template: string, on = true): string {
  if (!on) return template;
  for (const [key, s] of Object.entries(TILE_SOURCES)) if (s.url === template) return `/api/tile/${key}/{z}/{x}/{y}.png`;
  return template;
}

/** The provider's URL for one tile, or null when the source or the tile is not one we serve. */
export function tileSourceUrl(key: string, z: number, x: number, y: number): string | null {
  const s = TILE_SOURCES[key];
  if (!s || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > s.maxZoom) return null;
  const n = 2 ** z;
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  const sub = s.subdomains ? s.subdomains[(x + y) % s.subdomains.length] : "";
  return s.url.replace("{s}", sub).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Where a tile is kept on disk under the cache folder. */
export const tileCachePath = (key: string, z: number, x: number, y: number) => `${key}/${z}/${x}/${y}.png`;

/** A kept tile younger than this is served without asking the provider (ms). */
export const TILE_KEEP_MS = 30 * 24 * 3600_000;
