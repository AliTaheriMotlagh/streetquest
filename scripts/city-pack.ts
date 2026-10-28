// Build cities' street detail for the 3D city (lib/cityPack.ts) from OpenStreetMap.
//
//   npm run city:pack -- tehran            one city from lib/cityPack.ts CITIES
//   npm run city:pack -- tehran karaj      several (read from the extract in one go)
//   npm run city:pack -- --top 3           the 3 places with the most active players
//   npm run city:pack -- --list            what's built, and where players are
//   … --pbf file.osm.pbf                   read this extract instead of downloading one
//   … --dry                                read and count, write nothing
//
// Data comes from Geofabrik's daily extracts (a country in one file, cached in .cache/osm
// for 3 days) read locally by scripts/osm-pbf.ts, so building a city never queues on a
// public Overpass server. Re-running refreshes a city.
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { rename } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PrismaClient, type Prisma } from "@prisma/client";
import { bboxAround, CITIES, packCells, rangeOf, type CityDef } from "../src/lib/cityPack";
import { propOfTags } from "../src/lib/city";
import { readOsm } from "./osm-pbf";

try {
  process.loadEnvFile(".env");
} catch {}
const prisma = new PrismaClient();
const UA = "StreetQuest/1.0 city-pack (+https://streetquest.app)";
const CACHE = ".cache/osm";
const MAX_AGE_MS = 3 * 86_400_000;
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** The extract on disk (downloaded, or refreshed when older than 3 days). */
async function extractFile(region: string) {
  const path = `${CACHE}/${region.replace(/\//g, "_")}-latest.osm.pbf`;
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs < MAX_AGE_MS) return path;
  mkdirSync(CACHE, { recursive: true });
  const url = `https://download.geofabrik.de/${region}-latest.osm.pbf`;
  console.log(`↓ ${url}`);
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(`${path}.part`));
  await rename(`${path}.part`, path);
  return path;
}

/** The smallest Geofabrik region whose outline box holds a point (for cities found from players). */
async function regionAt(p: { lat: number; lng: number }) {
  const res = await fetch("https://download.geofabrik.de/index-v1.json", { headers: { "user-agent": UA } });
  const idx = (await res.json()) as { features: { properties: { id: string; urls: { pbf: string } }; geometry: { coordinates: number[][][][] } | null }[] };
  let best: { region: string; area: number } | null = null;
  for (const f of idx.features) {
    if (!f.geometry) continue;
    let s = 90, w = 180, n = -90, e = -180;
    for (const poly of f.geometry.coordinates) for (const ring of poly) for (const [lng, lat] of ring as unknown as number[][]) (s = Math.min(s, lat)), (n = Math.max(n, lat)), (w = Math.min(w, lng)), (e = Math.max(e, lng));
    if (p.lat < s || p.lat > n || p.lng < w || p.lng > e) continue;
    const area = (n - s) * (e - w);
    const region = f.properties.urls.pbf.replace("https://download.geofabrik.de/", "").replace(/-latest\.osm\.pbf$/, "");
    if (!best || area < best.area) best = { region, area };
  }
  if (!best) throw new Error(`no Geofabrik extract covers ${p.lat}, ${p.lng}`);
  return best.region;
}

/** Read every city that shares an extract in one pass, then store each city's cells. */
async function build(cities: CityDef[], file: string) {
  const t0 = Date.now();
  if (!dry) for (const c of cities) await prisma.cityPack.upsert({ where: { slug: c.slug }, create: { slug: c.slug, name: c.name, south: c.south, west: c.west, north: c.north, east: c.east, status: "building" }, update: { name: c.name, south: c.south, west: c.west, north: c.north, east: c.east, status: "building", note: null } });
  console.log(`▶ reading ${file} for ${cities.map((c) => c.name).join(", ")}…`);
  const inside = (lat: number, lon: number) => cities.some((c) => lat >= c.south && lat <= c.north && lon >= c.west && lon <= c.east);
  const els = readOsm(file, { inside, node: (t) => propOfTags(t) >= 0, way: (t) => t.leisure === "pitch" || t.natural === "tree_row" }, (pass, mb) => process.stdout.write(`\r  pass ${pass}: ${Math.round(mb)} MB   `));
  console.log(`\r  ${els.length.toLocaleString()} features in ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const city of cities) {
    try {
      const range = rangeOf(city);
      const detail = packCells(els as Parameters<typeof packCells>[0], range);
      let objects = 0, pitches = 0;
      const kinds = new Map<number, number>();
      for (const d of detail.values()) {
        (objects += d.o.length / 3), (pitches += d.f.length);
        for (let i = 2; i < d.o.length; i += 3) kinds.set(d.o[i], (kinds.get(d.o[i]) ?? 0) + 1);
      }
      const names = ["trees", "lamps", "signals", "bus stops", "crossings", "benches", "bins", "hydrants", "fountains"];
      console.log(`  ${city.name}: ${[...kinds].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${n.toLocaleString()} ${names[k]}`).join(", ")}, ${pitches} pitches in ${detail.size} cells`);
      if (dry) continue;
      const rows = [...detail];
      for (let i = 0; i < rows.length; i += 200)
        await prisma.$transaction(rows.slice(i, i + 200).map(([key, data]) => prisma.cityDetail.upsert({ where: { key }, create: { key, city: city.slug, data: data as unknown as Prisma.InputJsonValue }, update: { city: city.slug, data: data as unknown as Prisma.InputJsonValue } })));
      // Cells that had something last time and have nothing now.
      await prisma.cityDetail.deleteMany({ where: { city: city.slug, key: { notIn: rows.map(([k]) => k) } } });
      await prisma.cityPack.update({ where: { slug: city.slug }, data: { status: "ready", cells: detail.size, objects, pitches, builtAt: new Date() } });
    } catch (e) {
      if (!dry) await prisma.cityPack.update({ where: { slug: city.slug }, data: { status: "failed", note: String(e).slice(0, 300) } });
      throw e;
    }
  }
  console.log(`✔ done in ${Math.round((Date.now() - t0) / 1000)} s${dry ? " — dry run, nothing written" : ""}`);
}

/** Where players are: real-GPS players seen in the last 30 days, grouped into ~25 km squares. */
async function hotspots() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const users = await prisma.user.findMany({ where: { lastSeenAt: { gte: since }, lastLat: { not: null }, lastLng: { not: null }, remotePlay: false, locSim: false }, select: { lastLat: true, lastLng: true } });
  const groups = new Map<string, { n: number; lat: number; lng: number }>();
  for (const u of users) {
    const k = `${Math.floor(u.lastLat! / 0.25)}_${Math.floor(u.lastLng! / 0.25)}`;
    const g = groups.get(k) ?? { n: 0, lat: 0, lng: 0 };
    g.n++;
    g.lat += u.lastLat!;
    g.lng += u.lastLng!;
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ n: g.n, lat: g.lat / g.n, lng: g.lng / g.n })).sort((a, b) => b.n - a.n);
}

/** The known city around a point, or a 20 km square named after the nearest town. */
async function cityAt(p: { lat: number; lng: number }): Promise<CityDef> {
  const known = CITIES.find((c) => p.lat >= c.south && p.lat <= c.north && p.lng >= c.west && p.lng <= c.east);
  if (known) return known;
  let name = `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${p.lat}&lon=${p.lng}&accept-language=en`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { address?: Record<string, string> };
    name = j.address?.city ?? j.address?.town ?? j.address?.county ?? name;
  } catch {}
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `area-${p.lat.toFixed(2)}-${p.lng.toFixed(2)}`;
  return { slug, name, ...bboxAround(p, 20), extract: await regionAt(p) };
}

async function main() {
  if (args.includes("--list")) {
    const packs = await prisma.cityPack.findMany({ orderBy: { builtAt: "desc" } });
    console.log("Built cities:");
    for (const c of packs) console.log(`  ${c.slug.padEnd(14)} ${c.status.padEnd(9)} ${String(c.objects).padStart(7)} objects ${String(c.pitches).padStart(5)} pitches  ${c.builtAt?.toISOString().slice(0, 16) ?? ""}`);
    console.log("\nWhere players are (last 30 days):");
    for (const h of (await hotspots()).slice(0, 10)) console.log(`  ${String(h.n).padStart(6)} players around ${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}`);
    return;
  }
  let cities: CityDef[] = [];
  const top = opt("--top");
  if (top) {
    for (const h of await hotspots()) {
      if (cities.length >= Number(top)) break;
      const city = await cityAt(h);
      if (cities.some((c) => c.slug === city.slug)) continue;
      console.log(`${h.n} players → ${city.name}`);
      cities.push(city);
    }
    if (!cities.length) return console.log("No players with a real GPS position in the last 30 days.");
  } else {
    const flagged = new Set([opt("--pbf")]);
    const slugs = args.filter((a) => !a.startsWith("--") && !flagged.has(a));
    cities = slugs.map((s) => CITIES.find((c) => c.slug === s)).filter((c): c is CityDef => !!c);
    if (!slugs.length || cities.length !== slugs.length) {
      console.error(`Which city? One or more of: ${CITIES.map((c) => c.slug).join(", ")} — or --top N, --list`);
      process.exit(1);
    }
  }
  const pbf = opt("--pbf");
  if (pbf) return build(cities, pbf);
  const byRegion = new Map<string, CityDef[]>();
  for (const c of cities) {
    const region = c.extract ?? (await regionAt({ lat: (c.south + c.north) / 2, lng: (c.west + c.east) / 2 }));
    byRegion.set(region, [...(byRegion.get(region) ?? []), c]);
  }
  for (const [region, list] of byRegion) await build(list, await extractFile(region));
}

main()
  .catch((e) => {
    console.error(`\n✖ ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
