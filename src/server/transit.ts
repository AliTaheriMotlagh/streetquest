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
import { busOf, etaMin, IETT_PATH, soapBody, soapJson, STALE_MS, type IettMethod, type LiveBus } from "@/lib/transit/iett";
import { cityAt, metres, type BusLine, type BusNetwork, type BusStop, type City } from "@/lib/transit/network";
import { cached } from "./localData";

const iettBase = () => siteBase("iett", process.env.IETT_URL, "https://api.ibb.gov.tr");
const UA = () => `StreetQuest/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://streetquest.app"})`;

const DATA: Record<City, () => Promise<BusNetwork>> = {
  tehran: () => import("@/data/transit/tehran-bus.json").then((m) => m.default as unknown as BusNetwork),
  istanbul: () => import("@/data/transit/istanbul-bus.json").then((m) => m.default as unknown as BusNetwork),
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

export type Arrival = { line: string; minutes: number | null; live: boolean; headway: number; towards?: string };
/** Lines read live per stop card at most (each is a request on a cold cache). */
const LIVE_LINES = 8;
/** A live bus further than this from the stop isn't "the next one" (it's a far end of the route). */
const NEXT_BUS_M = 8000;

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
  const out = stop.lines.map<Arrival>((line, i) => {
    const headway = net.lines[line]?.headway ?? 15;
    const buses = live[i];
    if (!buses) return { line, minutes: null, live: false, headway };
    const near = buses.map((b) => ({ b, m: metres(stop, b) })).filter((x) => x.m <= NEXT_BUS_M).sort((a, b) => a.m - b.m)[0];
    return near ? { line, minutes: etaMin(near.b, stop), live: true, headway, ...(near.b.towards ? { towards: near.b.towards } : {}) } : { line, minutes: null, live: true, headway };
  });
  out.sort((a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9) || a.line.localeCompare(b.line, "en", { numeric: true }));
  return { stop, arrivals: out, live: live.some((x) => !!x) };
}
