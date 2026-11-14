// A city's public transport as the game knows it (pure; tests/transit.test.ts): its metro,
// tram and funicular lines with their stations in order, and its bus stops with the lines
// that call there — built from OpenStreetMap's route relations by scripts/transit-osm.ts
// (Geofabrik extracts, no Overpass) into src/data/transit/<city>.json.
//
// Times are what OSM says a line runs (`interval`, `opening_hours` on the route or its route
// master), else the city's usual: estimates, and the game labels them so. Istanbul's buses
// can be live too (lib/transit/iett.ts) when the IETT feed is reachable.

export type Mode = "subway" | "light_rail" | "monorail" | "tram" | "funicular" | "train";
export const MODES: Mode[] = ["subway", "light_rail", "monorail", "tram", "funicular", "train"];

export type Station = { id: string; name: string; en: string; lat: number; lng: number; lines: string[] };
export type Line = {
  id: string;
  /** What's on the signs: "1", "M2", "T1", "F1", "Marmaray". */
  ref: string;
  name: string;
  en: string;
  mode: Mode;
  colour: string;
  /** Stations in order, one direction (the other is the same reversed). */
  stations: string[];
  /** Minutes between trains (OSM's interval, else the city's usual). */
  headway: number;
  /** Service hours in minutes after local midnight; `to` past 1440 runs after midnight. */
  from: number;
  to: number;
  /** True when headway/hours came from OSM, false when they're the city's usual. */
  mapped: boolean;
};
export type BusStop = { id: string; name: string; lat: number; lng: number; lines: string[] };
export type BusLine = { ref: string; name: string; from: string; to: string; headway: number; mapped: boolean };
export type City = "tehran" | "istanbul";
export type Network = { city: City; built: string; tz: string; lines: Line[]; stations: Station[] };
export type BusNetwork = { city: City; built: string; stops: BusStop[]; lines: Record<string, BusLine> };

/** Where each city is (the extract is cut to this box) and its usual service when OSM is silent. */
export const CITIES: Record<City, { box: [number, number, number, number]; tz: string; headway: number; from: number; to: number; busHeadway: number; centre: { lat: number; lng: number } }> = {
  // Tehran's metro (and Line 5 out to Karaj): about 05:30–22:30, a train every 6–8 minutes.
  tehran: { box: [35.45, 50.85, 35.9, 51.75], tz: "Asia/Tehran", headway: 7, from: 330, to: 1350, busHeadway: 15, centre: { lat: 35.6892, lng: 51.389 } },
  // Istanbul's rail: about 06:00–00:00 (weekend nights longer), every 4–10 minutes.
  istanbul: { box: [40.75, 28.4, 41.35, 29.6], tz: "Europe/Istanbul", headway: 6, from: 360, to: 1440, busHeadway: 12, centre: { lat: 41.0082, lng: 28.9784 } },
};

export const cityAt = (p: { lat: number; lng: number }): City | null => {
  for (const [c, v] of Object.entries(CITIES) as [City, (typeof CITIES)[City]][]) {
    const [s, w, n, e] = v.box;
    if (p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e) return c;
  }
  return null;
};

// ---------------------------------------------------------------- from OSM
type Tags = Record<string, string>;
export type RawRel = { id: number; tags: Tags; members: { type: string; ref: number; role: string }[] };
export type RawNode = { id: number; lat: number; lon: number; tags: Tags | null };

const STOP_ROLES = /^(stop|stop_entry_only|stop_exit_only|platform|platform_entry_only|platform_exit_only)$/;
const RAIL_WORDS = /metro|مترو|marmaray|subway|raylı|rayli/i;

/** Which mode a route relation is, if it's one the metro section shows (a train only when it's the city's metro, like Marmaray or Tehran's Line 5). */
export function modeOf(tags: Tags): Mode | null {
  const r = tags.route;
  if (r === "subway" || r === "light_rail" || r === "monorail" || r === "tram" || r === "funicular") return r;
  if (r === "train" && RAIL_WORDS.test(`${tags.network ?? ""} ${tags.name ?? ""} ${tags.operator ?? ""}`)) return "train";
  return null;
}

/** "00:05", "5", "5 min", "PT5M" → 5 (minutes); null if it can't be read. */
export function minutesOf(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  let m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]) || null;
  m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(s);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) || null;
  m = /^(\d{1,3})(?:\s*min)?$/i.exec(s);
  return m ? Number(m[1]) || null : null;
}

/** The first "HH:MM-HH:MM" in an opening_hours value, as minutes after midnight (an end at or before the start runs past midnight). */
export function hoursOf(v: string | undefined): { from: number; to: number } | null {
  if (!v) return null;
  if (/24\/7/.test(v)) return { from: 0, to: 1440 };
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  const from = Number(m[1]) * 60 + Number(m[2]);
  let to = Number(m[3]) * 60 + Number(m[4]);
  if (to <= from) to += 1440;
  return { from, to };
}

/** A station's name as signs say it: without "metro station" around it ("ایستگاه مترو X", "X metro station", "X İstasyonu"). */
export const cleanStation = (s: string) =>
  s.replace(/^\s*ایستگاه\s+(مترو\s+)?/u, "").replace(/\s+(metro\s+)?station\s*$/i, "").replace(/\s+(metro\s+)?[iİI]stasyonu\s*$/u, "").trim() || s.trim();
/** A line's name without the direction one route of it carries ("Line 5 eastbound", "M2: Yenikapı → Hacıosman"). */
export const cleanLine = (s: string) => s.replace(/\s*[:：].*$/, "").replace(/\s*\(?\b(east|west|north|south)bound\b\)?/gi, "").replace(/\s*(→|->|⇒|←).*$/, "").trim();
const norm = (s: string) => s.toLowerCase().replace(/[ً-ْ]/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\b(station|istasyonu|istasyon|ایستگاه|metro|مترو)\b/gi, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export { dist as metres };

/** One station for every stop of the same name within this far (the platforms, the entrances, the two directions; and interchanges). */
const SAME_STATION_M = 450;

/**
 * The metro network of a city from its route relations (and route masters, for times and
 * colours): one line per ref (its longest direction), each stop merged with the other stops
 * of that name nearby into one station — which is where lines meet.
 */
export function buildNetwork(city: City, rels: RawRel[], nodes: Map<number, RawNode>, built: string): Network {
  const c = CITIES[city];
  const masters = new Map<number, Tags>();
  for (const r of rels) if (r.tags.type === "route_master") for (const m of r.members) if (m.type === "relation") masters.set(m.ref, r.tags);
  const stations: (Station & { key: string; n: number })[] = [];
  const stationFor = (n: RawNode): Station | null => {
    const name = n.tags?.name?.trim();
    if (!name) return null;
    const key = norm(name);
    const p = { lat: n.lat, lng: n.lon };
    let s = stations.find((x) => x.key === key && dist(x, p) < SAME_STATION_M);
    if (!s) {
      s = { id: `${city[0]}${stations.length + 1}`, name: cleanStation(name), en: cleanStation(n.tags?.["name:en"] ?? ""), lat: p.lat, lng: p.lng, lines: [], key, n: 0 };
      stations.push(s);
    }
    // The station sits at the middle of its stops.
    s.lat = (s.lat * s.n + p.lat) / (s.n + 1);
    s.lng = (s.lng * s.n + p.lng) / (s.n + 1);
    s.n++;
    if (!s.en && n.tags?.["name:en"]) s.en = cleanStation(n.tags["name:en"]);
    return s;
  };
  const byRef = new Map<string, Line>();
  for (const r of rels) {
    const mode = modeOf(r.tags);
    if (!mode || r.tags.type !== "route") continue;
    const ms = masters.get(r.id) ?? {};
    const stops = r.members.filter((m) => m.type === "node" && STOP_ROLES.test(m.role));
    const list: string[] = [];
    for (const m of stops) {
      const n = nodes.get(m.ref);
      if (!n) continue;
      const s = stationFor(n);
      if (s && list[list.length - 1] !== s.id && !list.includes(s.id)) list.push(s.id);
    }
    if (list.length < 2) continue;
    // Every running line has a number on its signs; a route without one (or one only planned, or
    // gone) is the map's sketch of something else (Istanbul's "Üsküdar-Cevizli" tram that isn't).
    const ref = (r.tags.ref || ms.ref || "").trim();
    if (!ref || /^(proposed|construction|disused|abandoned)$/.test(r.tags.state ?? r.tags.disused ?? "")) continue;
    const head = minutesOf(r.tags.interval ?? ms.interval);
    const hours = hoursOf(r.tags.opening_hours ?? ms.opening_hours);
    const line: Line = {
      id: `${mode}:${ref}`, ref, mode,
      name: cleanLine(ms.name || r.tags.name || ref),
      en: cleanLine(ms["name:en"] || r.tags["name:en"] || ""),
      colour: (r.tags.colour || ms.colour || "#888888").trim(),
      stations: list,
      headway: head ?? c.headway,
      from: hours?.from ?? c.from,
      to: hours?.to ?? c.to,
      mapped: head != null || hours != null,
    };
    const had = byRef.get(line.id);
    if (!had || list.length > had.stations.length) byRef.set(line.id, had?.mapped && !line.mapped ? { ...line, headway: had.headway, from: had.from, to: had.to, mapped: true } : line);
  }
  const lines = [...byRef.values()].sort((a, b) => MODES.indexOf(a.mode) - MODES.indexOf(b.mode) || a.ref.localeCompare(b.ref, "en", { numeric: true }));
  const used = new Set(lines.flatMap((l) => l.stations));
  for (const l of lines) for (const id of l.stations) stations.find((s) => s.id === id)!.lines.push(l.id);
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    city, built, tz: c.tz, lines,
    stations: stations.filter((s) => used.has(s.id)).map(({ key: _k, n: _n, ...s }) => ({ ...s, lat: round(s.lat), lng: round(s.lng), lines: [...new Set(s.lines)] })),
  };
}

/** Same bus stop: the pole and the platform of one stop, both directions' poles across the road. */
const SAME_STOP_M = 60;

/** A city's bus stops (each with the lines that call there) and its bus lines, from route=bus relations. */
export function buildBuses(city: City, rels: RawRel[], nodes: Map<number, RawNode>, built: string): BusNetwork {
  const c = CITIES[city];
  const stops: (BusStop & { key: string; set: Set<string> })[] = [];
  const grid = new Map<string, number[]>();
  const cell = (lat: number, lng: number) => `${Math.round(lat * 500)}:${Math.round(lng * 500)}`;
  const stopFor = (n: RawNode) => {
    const name = n.tags?.name?.trim() || "";
    const key = norm(name);
    const p = { lat: n.lat, lng: n.lon };
    const [gy, gx] = cell(p.lat, p.lng).split(":").map(Number);
    for (let y = gy - 1; y <= gy + 1; y++)
      for (let x = gx - 1; x <= gx + 1; x++)
        for (const i of grid.get(`${y}:${x}`) ?? []) if (stops[i].key === key && dist(stops[i], p) < SAME_STOP_M) return stops[i];
    const s = { id: `b${n.id}`, name, lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, lines: [], key, set: new Set<string>() };
    const k = cell(p.lat, p.lng);
    grid.set(k, [...(grid.get(k) ?? []), stops.length]);
    stops.push(s);
    return s;
  };
  const lines: Record<string, BusLine> = {};
  const masters = new Map<number, Tags>();
  for (const r of rels) if (r.tags.type === "route_master") for (const m of r.members) if (m.type === "relation") masters.set(m.ref, r.tags);
  for (const r of rels) {
    if (r.tags.type !== "route" || (r.tags.route !== "bus" && r.tags.route !== "trolleybus")) continue;
    const ms = masters.get(r.id) ?? {};
    // OSM lists a route that runs as several lines as "101;901".
    const refs = (r.tags.ref || ms.ref || "").split(";").map((x) => x.trim()).filter(Boolean);
    if (!refs.length) continue;
    let any = false;
    for (const m of r.members) {
      if (m.type !== "node" || !STOP_ROLES.test(m.role)) continue;
      const n = nodes.get(m.ref);
      const [s, w, nn, e] = c.box;
      if (!n || n.lat < s || n.lat > nn || n.lon < w || n.lon > e) continue;
      for (const ref of refs) stopFor(n).set.add(ref);
      any = true;
    }
    if (!any) continue;
    const head = minutesOf(r.tags.interval ?? ms.interval);
    for (const ref of refs)
      if (!lines[ref] || (head != null && !lines[ref].mapped))
        lines[ref] = { ref, name: (ms.name || r.tags.name || ref).trim(), from: (r.tags.from || "").trim(), to: (r.tags.to || "").trim(), headway: head ?? c.busHeadway, mapped: head != null };
  }
  const byRef = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
  return { city, built, stops: stops.filter((s) => s.set.size).map(({ key: _k, set, ...s }) => ({ ...s, lines: [...set].sort(byRef) })), lines };
}
