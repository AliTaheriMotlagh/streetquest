// Every look the 2D map can wear. Some are a different tile provider (satellite, terrain,
// CARTO…), the rest are the default street tiles under a CSS filter (see world.css).
// All providers here work without a key; NEXT_PUBLIC_TILE_URL replaces only the default tiles.
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
  /** Class on the .map wrapper that styles the tiles. */
  css?: string;
  /** Parchment clouds + compass rose. */
  fx?: boolean;
};

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const ESRI = "Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const carto = (name: string): Tiles => ({ url: `https://{s}.basemaps.cartocdn.com/${name}/{z}/{x}/{y}{r}.png`, attribution: CARTO, subdomains: "abcd" });
const esri = (service: string, maxNativeZoom = 19): Tiles => ({ url: `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, attribution: ESRI, maxNativeZoom });

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
    tiles: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: `${OSM}, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`, subdomains: "abc", maxNativeZoom: 17 },
  },
  { id: "topo", emoji: "🧗", name: msg("Topographic"), tiles: esri("World_Topo_Map") },
  { id: "light", emoji: "☁️", name: msg("Light"), tiles: carto("light_all") },
  { id: "midnight", emoji: "🌑", name: msg("Midnight"), tiles: carto("dark_all") },
  { id: "voyager", emoji: "🧳", name: msg("Voyager"), tiles: carto("rastertiles/voyager") },
  { id: "esri-streets", emoji: "🚦", name: msg("City streets"), tiles: esri("World_Street_Map") },
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
  const urls = [DEFAULT_TILES, ...MAP_STYLES.flatMap((s) => [s.tiles, s.labels])].filter((t): t is Tiles => !!t).map((t) => t.url);
  // "{s}.host" covers a., b., c.… (the worker matches subdomains); other placeholders just need a value.
  return [...new Set(urls.map((u) => new URL(u.replace(/^(https?:\/\/)\{s\}\./, "$1").replace(/\{[^}]+\}/g, "0")).hostname))];
}
