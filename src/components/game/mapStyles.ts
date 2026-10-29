// Every look the 2D map can wear. Some are a different tile provider (satellite, terrain,
// OSM's German and French styles…), the rest are the default street tiles under a CSS
// filter (see world.css). Every provider here works without a key — keep it that way:
// CARTO's basemaps began answering every tile with an "API KEY REQUIRED" picture (HTTP 200,
// cached for 30 days), so its looks are now filters over the default tiles. Esri is
// geo-blocked in Iran on and off: its looks fall back to a keyless provider (`fallback`).
// NEXT_PUBLIC_TILE_URL replaces only the default tiles. tests/mapStyles.test.ts keeps
// keyed and watermarking hosts out.
import { msg } from "@/lib/i18n";

export type Tiles = { url: string; attribution: string; subdomains?: string; maxNativeZoom?: number };

export type MapStyle = {
  id: string;
  emoji: string;
  /** English name, translated where it's shown: t(style.name). */
  name: string;
  /** Default street tiles when left out. */
  tiles?: Tiles;
  /** Drawn on top, e.g. place names over satellite photos. */
  labels?: Tiles;
  /** Used instead when the provider can't be reached (blocked in this country): same kind of map, another host. */
  fallback?: Tiles;
  /** Class on the .map wrapper that styles the tiles. */
  css?: string;
  /** Parchment clouds + compass rose. */
  fx?: boolean;
};

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI = "Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const esri = (service: string, maxNativeZoom = 19): Tiles => ({ url: `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, attribution: ESRI, maxNativeZoom });

const OPEN_TOPO: Tiles = { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: `${OSM}, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`, subdomains: "abc", maxNativeZoom: 17 };

export const DEFAULT_TILES: Tiles = {
  url: process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || OSM,
};
// The night-ops filter is for the light OSM tiles; a custom provider is assumed to be dark already.
const DARKEN = !process.env.NEXT_PUBLIC_TILE_URL || process.env.NEXT_PUBLIC_TILE_DARKEN === "1";

export const MAP_STYLES: MapStyle[] = [
  { id: "fantasy", emoji: "🗺️", name: msg("Fantasy"), css: "fantasy", fx: true },
  { id: "classic", emoji: "🧭", name: msg("Street") },
  { id: "dark", emoji: "🌃", name: msg("Night ops"), css: DARKEN ? "darken" : undefined },
  { id: "satellite", emoji: "🛰️", name: msg("Satellite"), tiles: esri("World_Imagery", 18), css: "photo" },
  { id: "hybrid", emoji: "🌏", name: msg("Satellite + names"), tiles: esri("World_Imagery", 18), labels: esri("Reference/World_Boundaries_and_Places", 18), css: "photo" },
  {
    id: "terrain",
    emoji: "⛰️",
    name: msg("Terrain"),
    tiles: OPEN_TOPO,
  },
  { id: "topo", emoji: "🧗", name: msg("Topographic"), tiles: esri("World_Topo_Map"), fallback: OPEN_TOPO },
  { id: "light", emoji: "☁️", name: msg("Light"), css: "light" },
  { id: "midnight", emoji: "🌑", name: msg("Midnight"), css: "midnight" },
  // OpenStreetMap Germany's style: softer colours, and names in the local script with a Latin line under them.
  { id: "voyager", emoji: "🧳", name: msg("Voyager"), tiles: { url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png", attribution: `${OSM}, style by <a href="https://www.openstreetmap.de/">OSM Germany</a>`, maxNativeZoom: 19 } },
  { id: "esri-streets", emoji: "🚦", name: msg("City streets"), tiles: esri("World_Street_Map"), fallback: { url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", attribution: `${OSM}, style by <a href="https://www.openstreetmap.fr/">OSM France</a>`, subdomains: "abc", maxNativeZoom: 19 } },
  {
    id: "humanitarian",
    emoji: "🤝",
    name: msg("Humanitarian"),
    tiles: { url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", attribution: `${OSM}, style by <a href="https://www.hotosm.org/">HOT</a>, hosted by OSM France`, subdomains: "abc" },
  },
  {
    id: "cycle",
    emoji: "🚲",
    name: msg("Cycling"),
    tiles: { url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", attribution: `${OSM}, <a href="https://www.cyclosm.org">CyclOSM</a>`, subdomains: "abc" },
  },
  { id: "retro", emoji: "📜", name: msg("Retro"), css: "retro" },
  { id: "noir", emoji: "🎞️", name: msg("Noir"), css: "noir" },
  { id: "blueprint", emoji: "📐", name: msg("Blueprint"), css: "blueprint" },
  { id: "neon", emoji: "🌆", name: msg("Neon"), css: "neon" },
];

export const DEFAULT_STYLE = MAP_STYLES[0];
export const mapStyle = (id: string | null | undefined) => MAP_STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE;

/** Hosts of every tile provider, so the service worker keeps what you've seen for offline. */
export function tileHosts(): string[] {
  const urls = [DEFAULT_TILES, ...MAP_STYLES.flatMap((s) => [s.tiles, s.labels, s.fallback])].filter((t): t is Tiles => !!t).map((t) => t.url);
  // "{s}.host" covers a., b., c.… (the worker matches subdomains); other placeholders just need a value.
  return [...new Set(urls.map((u) => new URL(u.replace(/^(https?:\/\/)\{s\}\./, "$1").replace(/\{[^}]+\}/g, "0")).hostname))];
}
