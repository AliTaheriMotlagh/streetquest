// Buses for the map and the stop cards (lib/transit/*): the stops round a point with the lines
// that call there (built from OpenStreetMap by scripts/transit-osm.ts, shipped with the app),
// and in Istanbul the buses live from IETT's feed — every bus's position (cached 20 s for
// everyone: one request serves every player), and per stop the next bus of each line.
//
// IETT's servers answer from Turkey only (as far as we can tell they drop other countries'
// connections), so production reaches them through a relay there: IETT_URL (or RELAY_URL with
// "iett" in RELAY_FOR, relay/relay.mjs). "off" turns the live part off; stops and lines stay.
import { siteBase } from "@/lib/relayUrl";
import { pacerFor } from "@/lib/pace";
import { sourceAt } from "@/lib/region";
import { arrivalsAt, busOf, IETT_PATH, soapBody, soapJson, STALE_MS, type Arrival, type IettMethod, type LiveBus } from "@/lib/transit/iett";
import { cityAt, metres, type BusLine, type BusNetwork, type BusStop, type City } from "@/lib/transit/network";
import { departuresAt, localDay, type Departures, type Timetable } from "@/lib/transit/gtfs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cached } from "./localData";

const iettBase = () => siteBase("iett", process.env.IETT_URL, "https://api.ibb.gov.tr");
const UA = () => `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;

const DATA: Record<City, () => Promise<BusNetwork>> = {
  tehran: () => import("@/data/transit/tehran-bus.json").then((m) => m.default as unknown as BusNetwork),
  istanbul: () => import("@/data/transit/istanbul-bus.json").then((m) => m.default as unknown as BusNetwork),
  mashhad: () => import("@/data/transit/mashhad-bus.json").then((m) => m.default as unknown as BusNetwork),
  isfahan: () => import("@/data/transit/isfahan-bus.json").then((m) => m.default as unknown as BusNetwork),
  shiraz: () => import("@/data/transit/shiraz-bus.json").then((m) => m.default as unknown as BusNetwork),
  tabriz: () => import("@/data/transit/tabriz-bus.json").then((m) => m.default as unknown as BusNetwork),
};
const nets = new Map<City, Promise<BusNetwork>>();
const busNet = (c: City) => {
  let p = nets.get(c);
  if (!p) nets.set(c, (p = DATA[c]()));
  return p;
};

export type StopsAround = { city: City | null; stops: BusStop[]; lines: Record<string, BusLine> };
/** The bus stops round a point, nearest first, with the lines calling at them. */
export async function stopsAround(at: { lat: number; lng: number }, radiusM = 700, max = 60): Promise<StopsAround> {
  const city = cityAt(at);
  if (!city) return { city: null, stops: [], lines: {} };
  const net = await busNet(city);
  const stops = net.stops
    .filter((s) => Math.abs(s.lat - at.lat) < radiusM / 90_000 && Math.abs(s.lng - at.lng) < radiusM / 70_000)
    .map((s) => ({ s, m: metres(at, s) }))
    .filter((x) => x.m <= radiusM)
    .sort((a, b) => a.m - b.m)
    .slice(0, max)
    .map((x) => x.s);
  const lines: Record<string, BusLine> = {};
  for (const s of stops) for (const l of s.lines) if (net.lines[l]) lines[l] = net.lines[l];
  return { city, stops, lines };
}

/** One SOAP call to IETT; [] when it's off, refused, unreachable or paced. */
async function iett(method: IettMethod, params: Record<string, string> = {}): Promise<unknown[] | null> {
  const root = iettBase();
  if (!root) return null;
  const url = `${root}${IETT_PATH}`;
  const pace = pacerFor(url);
  const hold = pace ? pace.take(Date.now()) : 0;
  if (hold == null) return null;
  if (hold > 0) await new Promise((r) => setTimeout(r, hold));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/xml; charset=utf-8", soapaction: `"http://tempuri.org/${method}"`, "user-agent": UA() },
      body: soapBody(method, params),
      signal: ctl.signal,
    });
    pace?.saw(res.status, Date.now());
    return res.ok ? soapJson(await res.text(), method) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const fresh = (b: LiveBus, now: number) => !b.at || now - b.at < STALE_MS;

/** Every Istanbul bus on the road now (one cached answer for all players). */
function fleet() {
  return cached<LiveBus[]>("iett:fleet", 20_000, async () => {
    const rows = await iett("GetFiloAracKonum_json");
    if (!rows) return null;
    const now = Date.now();
    return rows.map((r) => busOf(r, now)).filter((b): b is LiveBus => !!b && fresh(b, now));
  });
}

/** One line's buses now, with where each is headed. */
function lineBuses(line: string) {
  return cached<LiveBus[]>(`iett:line:${line}`, 20_000, async () => {
    const rows = await iett("GetHatOtoKonum_json", { HatKodu: line });
    if (!rows) return null;
    const now = Date.now();
    return rows.map((r) => busOf(r, now)).filter((b): b is LiveBus => !!b && fresh(b, now)).map((b) => ({ ...b, line: b.line || line }));
  });
}

/** The live buses round a point (Istanbul only: IETT is Turkey's). `live`: false when the feed isn't reachable. */
export async function busesAround(at: { lat: number; lng: number }, radiusM = 2500, max = 80): Promise<{ live: boolean; buses: LiveBus[] }> {
  if (!sourceAt("iett", at) || cityAt(at) !== "istanbul") return { live: false, buses: [] };
  const all = await fleet().catch(() => null);
  if (!all) return { live: false, buses: [] };
  return {
    live: true,
    buses: all
      .map((b) => ({ b, m: metres(at, b) }))
      .filter((x) => x.m <= radiusM)
      .sort((a, b) => a.m - b.m)
      .slice(0, max)
      .map((x) => x.b),
  };
}

export type { Arrival } from "@/lib/transit/iett";

/**
 * A city's real timetable, when one has been imported from its GTFS feed (scripts/transit-gtfs.ts →
 * src/data/transit/<city>-times.json; read from disk, not bundled: it can be megabytes). Null when absent.
 */
const tables = new Map<City, Promise<Timetable | null>>();
function timetable(c: City) {
  let p = tables.get(c);
  if (!p)
    tables.set(
      c,
      (p = readFile(join(process.cwd(), "src/data/transit", `${c}-times.json`), "utf8")
        .then((t) => JSON.parse(t) as Timetable)
        .catch(() => null)),
    );
  return p;
}

/** One way a line runs past a stop: where it's going, the stops ahead, and its times. */
export type LineHere = {
  line: string;
  name: string;
  operator?: string;
  /** The end it's heading for, and the stop it started from. */
  towards: string;
  from: string;
  /** Stops after this one to the end, and the next few of them with minutes from here (estimated from the distance when there's no timetable). */
  left: number;
  ahead: { name: string; min: number }[];
  toEnd: number;
  /** Where the times come from: a live bus, the published timetable, the map's own interval, or nothing known. */
  source: "live" | "timetable" | "map" | "none";
  /** Minutes until the next bus (live or timetable); null when not known. */
  minutes: number | null;
  /** The next departures here, minutes after local midnight (timetable only). */
  times: number[];
  first: number | null;
  last: number | null;
  /** Minutes between buses: the map's interval ("map"), or the timetable's average gap. */
  every: number | null;
  /** Service hours from the map (minutes after midnight). */
  hours?: { from: number; to: number };
};

/** Buses average about this through the city, stops included (km/h). */
const BUS_KMH = 17;

/** A line's ways past a stop from the map's routes: the stop's place on each, the stops ahead and rough minutes to them. */
function waysFromMap(net: BusNetwork, line: BusLine, stop: BusStop): Omit<LineHere, "source" | "minutes" | "times" | "first" | "last" | "every">[] {
  const byId = new Map(net.stops.map((s) => [s.id, s]));
  const out: Omit<LineHere, "source" | "minutes" | "times" | "first" | "last" | "every">[] = [];
  for (const r of line.routes ?? []) {
    const i = r.indexOf(stop.id);
    if (i < 0 || i === r.length - 1) continue;
    let m = 0;
    const ahead: { name: string; min: number }[] = [];
    for (let k = i + 1; k < r.length; k++) {
      const a = byId.get(r[k - 1]), b = byId.get(r[k]);
      if (a && b) m += (metres(a, b) * 1.3) / ((BUS_KMH * 1000) / 60) + 0.4;
      ahead.push({ name: b?.name || "", min: Math.max(1, Math.round(m)) });
    }
    out.push({ line: line.ref, name: line.name, ...(line.operator ? { operator: line.operator } : {}), towards: byId.get(r[r.length - 1])?.name || line.to, from: byId.get(r[0])?.name || line.from, left: r.length - 1 - i, ahead: ahead.filter((x) => x.name).slice(0, 40), toEnd: ahead[ahead.length - 1]?.min ?? 0, ...(line.hours ? { hours: line.hours } : {}) });
  }
  // A line the map has no route for: just its own ends.
  if (!out.length) out.push({ line: line.ref, name: line.name, ...(line.operator ? { operator: line.operator } : {}), towards: line.to, from: line.from, left: 0, ahead: [], toEnd: 0, ...(line.hours ? { hours: line.hours } : {}) });
  return out;
}

/** The average gap between departures (minutes), from a day's times. */
const gapOf = (d: Departures) => (d.first != null && d.last != null && d.next.length >= 2 ? Math.max(1, Math.round((d.next[d.next.length - 1] - d.next[0]) / (d.next.length - 1))) : null);

/**
 * Everything the stop card shows: each line calling here, each way it runs, with its stops ahead,
 * and when it comes — live (Istanbul, IETT), else from the published timetable, else the map's own
 * interval; never a made-up number (`source: "none"` says nothing is known).
 */
export async function stopBoard(stopId: string, at: { lat: number; lng: number }, now = new Date()): Promise<{ stop: BusStop | null; lines: LineHere[]; live: boolean; timetable: string | null }> {
  const city = cityAt(at);
  if (!city) return { stop: null, lines: [], live: false, timetable: null };
  const [net, tt, arr] = await Promise.all([busNet(city), timetable(city), arrivals(stopId, at)]);
  const stop = arr.stop;
  if (!stop) return { stop: null, lines: [], live: false, timetable: null };
  const liveOf = new Map(arr.arrivals.filter((a) => a.live && a.minutes != null).map((a) => [a.line, a]));
  const nowMin = tt ? localDay(now, tt.tz).min : 0;
  const lines: LineHere[] = [];
  for (const ref of stop.lines) {
    const line = net.lines[ref] ?? { ref, name: ref, from: "", to: "", headway: 0, mapped: false };
    const ways = waysFromMap(net, line, stop);
    const deps = tt?.lines[ref] ? departuresAt(tt.lines[ref], stop, now, tt.tz) : [];
    const live = liveOf.get(ref);
    ways.forEach((w, i) => {
      // The timetable's way going to the same end (by name), else the same order.
      const d = deps.find((x) => x.headsign && w.towards && (x.headsign.includes(w.towards) || w.towards.includes(x.headsign))) ?? deps[i] ?? null;
      const base = d ? { ...w, towards: w.towards || d.headsign, left: w.left || d.left, ahead: d.ahead.length ? d.ahead.slice(0, 40) : w.ahead, toEnd: d.toEnd || w.toEnd } : w;
      if (live && (!live.towards || i === 0 || live.towards.includes(w.towards)))
        lines.push({ ...base, source: "live", minutes: live.minutes, times: d?.next ?? [], first: d?.first ?? null, last: d?.last ?? null, every: d ? gapOf(d) : line.mapped ? line.headway : null });
      else if (d) lines.push({ ...base, source: "timetable", minutes: d.next.length ? d.next[0] - nowMin : null, times: d.next, first: d.first, last: d.last, every: gapOf(d) });
      else lines.push({ ...base, source: line.mapped ? "map" : "none", minutes: null, times: [], first: null, last: null, every: line.mapped ? line.headway : null });
    });
  }
  const rank = (l: LineHere) => (l.minutes ?? 1e6) + (l.source === "none" ? 1e7 : 0);
  lines.sort((a, b) => rank(a) - rank(b) || a.line.localeCompare(b.line, "en", { numeric: true }));
  return { stop, lines, live: arr.live, timetable: tt ? tt.source : null };
}
/** Lines read live per stop card at most (each is a request on a cold cache). */
const LIVE_LINES = 8;

/**
 * When each line's next bus comes to a stop: live in Istanbul when IETT answers (the nearest
 * bus of that line, by distance — an estimate, like every board's), else every `headway`
 * (OSM's interval, else the city's usual).
 */
export async function arrivals(stopId: string, at: { lat: number; lng: number }): Promise<{ stop: BusStop | null; arrivals: Arrival[]; live: boolean }> {
  const city = cityAt(at);
  if (!city) return { stop: null, arrivals: [], live: false };
  const net = await busNet(city);
  const stop = net.stops.find((s) => s.id === stopId) ?? null;
  if (!stop) return { stop: null, arrivals: [], live: false };
  const canLive = city === "istanbul" && sourceAt("iett", stop) && !!iettBase();
  const live = canLive ? await Promise.all(stop.lines.slice(0, LIVE_LINES).map((l) => lineBuses(l).catch(() => null))) : [];
  const headways = Object.fromEntries(stop.lines.map((l) => [l, net.lines[l]?.headway ?? 15]));
  return { stop, arrivals: arrivalsAt(stop, stop.lines, live, headways), live: live.some((x) => !!x) };
}
