// Imports a city's real bus timetable from its GTFS feed (the rules: src/lib/transit/gtfs.ts):
//   npm run transit:times -- istanbul path/to/iett-gtfs.zip      (or an unzipped folder)
// → src/data/transit/<city>-times.json, which /api/transit reads for the stop cards (every line's
// next departures, first and last bus, stops ahead). Without it the cards show live buses
// (Istanbul) and the map's routes, and say no timetable is known.
//
// Where to get the feeds (download in a browser; they're open data):
//   Istanbul (IETT): https://data.ibb.gov.tr/en/dataset/iett-gtfs-verisi
//     or the Mobility Database mirror: https://mobilitydatabase.org/feeds/gtfs/mdb-3128
//   (from Iran these sites need a VPN; Google Cloud and data.ibb.gov.tr refuse Iranian addresses.)
// stop_times.txt can be millions of rows: it's streamed, one trip at a time.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { csvRow, csvTable, TimetableBuilder } from "../src/lib/transit/gtfs";
import { CITIES, type City } from "../src/lib/transit/network";

const [city, path] = process.argv.slice(2) as [City, string];
if (!city || !(city in CITIES) || !path || !existsSync(path)) {
  console.error("usage: transit-gtfs <tehran|istanbul> <gtfs.zip | folder>");
  process.exit(1);
}
const dir = statSync(path).isDirectory();

/** A file of the feed as a stream (from the zip with `unzip -p`, or the folder). */
function stream(name: string): Readable | null {
  if (dir) return existsSync(join(path, name)) ? createReadStream(join(path, name)) : null;
  const p = spawn("unzip", ["-p", path, name]);
  return p.stdout;
}
async function text(name: string): Promise<string> {
  if (dir) return existsSync(join(path, name)) ? readFileSync(join(path, name), "utf8") : "";
  const s = stream(name);
  if (!s) return "";
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const t0 = Date.now();
const b = new TimetableBuilder(CITIES[city].tz, path.split("/").pop() ?? "gtfs");
b.routes(csvTable(await text("routes.txt")));
b.tripsTable(csvTable(await text("trips.txt")));
b.stopsTable(csvTable(await text("stops.txt")));
const cal = csvTable(await text("calendar.txt"));
b.calendar(cal);
b.calendarDates(csvTable(await text("calendar_dates.txt")));
console.log(`tables read in ${((Date.now() - t0) / 1000).toFixed(0)} s; streaming stop_times…`);

const st = stream("stop_times.txt");
if (!st) throw new Error("no stop_times.txt in the feed");
let head: string[] | null = null;
let trip = "", rows: { seq: number; stop: string; time: string }[] = [], n = 0, trips = 0;
const flush = () => {
  if (trip && rows.length) (b.trip(trip, rows), trips++);
  rows = [];
};
for await (const line of createInterface({ input: st, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const r = csvRow(head ? line : line.replace(/^﻿/, ""));
  if (!head) {
    head = r;
    continue;
  }
  const at = (k: string) => r[head!.indexOf(k)] ?? "";
  const id = at("trip_id");
  if (id !== trip) (flush(), (trip = id));
  rows.push({ seq: Number(at("stop_sequence")), stop: at("stop_id"), time: at("departure_time") || at("arrival_time") });
  if (++n % 1_000_000 === 0) console.log(`  ${(n / 1e6).toFixed(0)}M rows…`);
}
flush();
const out = b.result(new Date().toISOString().slice(0, 10));
const file = join(process.cwd(), "src/data/transit", `${city}-times.json`);
writeFileSync(file, JSON.stringify(out));
const pats = Object.values(out.lines).reduce((k, l) => k + l.length, 0);
console.log(`${city}: ${n} stop times, ${trips} trips → ${Object.keys(out.lines).length} lines, ${pats} ways, ${(statSync(file).size / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${file}`);
