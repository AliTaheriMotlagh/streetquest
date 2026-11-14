// Builds a city's metro and bus data from a Geofabrik extract (no Overpass):
//   npm run transit:build -- tehran  path/to/iran-latest.osm.pbf
//   npm run transit:build -- istanbul path/to/turkey-latest.osm.pbf
// → src/data/transit/<city>-metro.json (lines, stations; shipped to the browser),
//   src/data/transit/<city>-bus.json (stops and the lines calling there; read by /api/transit) and
//   src/data/transit/<city>-cinemas.json (the open map's cinemas; server/cinema.ts in Turkey).
// The logic is lib/transit/network.ts; this only reads the file and writes the result.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBuses, buildNetwork, CITIES, modeOf, type City, type RawNode } from "../src/lib/transit/network";
import { parseOsmCinema } from "../src/lib/cinemaTr";
import { readOsm, readRelations } from "./osm-pbf";

const [city, path] = process.argv.slice(2) as [City, string];
if (!city || !(city in CITIES) || !path) {
  console.error("usage: transit-osm <tehran|istanbul> <extract.osm.pbf>");
  process.exit(1);
}
const [s, w, n, e] = CITIES[city].box;
const inside = (lat: number, lon: number) => lat >= s && lat <= n && lon >= w && lon <= e;
const t0 = Date.now();
const { relations, nodes } = readRelations(path, {
  rel: (t) => (t.type === "route" && (!!modeOf(t) || t.route === "bus" || t.route === "trolleybus")) || (t.type === "route_master" && /^(subway|light_rail|monorail|tram|funicular|train|bus|trolleybus)$/.test(t.route ?? "")),
  node: () => false,
  inside,
});
// Only stops inside the city count (a country's file has every city's routes).
const local = new Map<number, RawNode>();
for (const [id, nd] of nodes) if (inside(nd.lat, nd.lon)) local.set(id, { id, lat: nd.lat, lon: nd.lon, tags: nd.tags });
const built = new Date().toISOString().slice(0, 10);
const metro = buildNetwork(city, relations, local, built);
const bus = buildBuses(city, relations, local, built);
const dir = join(process.cwd(), "src/data/transit");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${city}-metro.json`), JSON.stringify(metro));
writeFileSync(join(dir, `${city}-bus.json`), JSON.stringify(bus));
// Cinemas: nodes, and buildings (ways) at their middle — the shape parseOsmCinema reads from Overpass.
const cin = readOsm(path, { inside, node: (t) => t.amenity === "cinema", way: (t) => t.amenity === "cinema" })
  .map((e) => {
    const g = e.geometry ?? [];
    const center = g.length ? { lat: g.reduce((a, p) => a + p.lat, 0) / g.length, lon: g.reduce((a, p) => a + p.lon, 0) / g.length } : undefined;
    return parseOsmCinema({ type: e.type, id: e.id, lat: e.lat, lon: e.lon, center, tags: e.tags });
  })
  .filter((c) => !!c);
writeFileSync(join(dir, `${city}-cinemas.json`), JSON.stringify(cin));
console.log(
  `${city}: ${relations.length} relations read in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${metro.lines.length} rail lines (${metro.lines.map((l) => l.ref).join(" ")}), ${metro.stations.length} stations, ${bus.stops.length} bus stops, ${Object.keys(bus.lines).length} bus lines, ${cin.length} cinemas`,
);
