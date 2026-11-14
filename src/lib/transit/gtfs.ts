// A city's real bus timetable from a GTFS feed (pure; tests/transit.test.ts). GTFS is the
// standard every transit agency publishes (Istanbul's IETT on data.ibb.gov.tr, the Kentkart
// cities, …); scripts/transit-gtfs.ts streams one in and keeps only what the stop card needs,
// compactly: for each line, each distinct way it runs (a "pattern": its stops in order) with
// the minutes from its first stop to each stop, and the departure times from the first stop by
// the days of the week they run. The stop card adds them up: when each line leaves this stop.

export type Pattern = {
  /** Where it's going (the trip's headsign, else its last stop's name). */
  headsign: string;
  /** Its stops in order: name and position (×1e5, rounded). */
  names: string[];
  at: [number, number][];
  /** Minutes from the first stop to each stop (the first trip's; the same for every trip of a pattern). */
  offsets: number[];
  /** Departure minutes (after midnight) from the first stop, by days: key = week bits, Monday = 1 … Sunday = 64. */
  days: Record<string, number[]>;
};
export type Timetable = { built: string; source: string; tz: string; lines: Record<string, Pattern[]> };

/** One CSV line split into fields (GTFS quotes fields that hold commas). */
export function csvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Rows of a GTFS table as objects keyed by its header (the header may start with a byte-order mark). */
export function csvTable(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = csvRow(lines[0].replace(/^﻿/, ""));
  return lines.slice(1).map((l) => {
    const r = csvRow(l);
    return Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]));
  });
}

/** "25:10:00" → 1510 (GTFS times run past 24:00 for trips after midnight); null if unreadable. */
export function gtfsMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** calendar.txt's day flags as week bits (Monday = 1 … Sunday = 64). */
export function weekBits(row: Record<string, string>): number {
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].reduce((b, d, i) => (row[d] === "1" ? b | (1 << i) : b), 0);
}

type Stop = { name: string; lat: number; lng: number };
type Trip = { route: string; service: string; headsign: string };

/**
 * Builds a Timetable trip by trip (stop_times can be millions of rows: the script hands over
 * one trip's rows at a time). Lines are routes' short names, as on the bus ("500T").
 */
export class TimetableBuilder {
  private pats = new Map<string, { line: string; p: Pattern }>();
  private lineOf = new Map<string, string>();
  private trips = new Map<string, Trip>();
  private stops = new Map<string, Stop>();
  private days = new Map<string, number>();

  constructor(private tz: string, private source: string) {}

  routes(rows: Record<string, string>[]) {
    for (const r of rows) this.lineOf.set(r.route_id, (r.route_short_name || r.route_long_name || r.route_id).trim());
  }
  tripsTable(rows: Record<string, string>[]) {
    for (const r of rows) this.trips.set(r.trip_id, { route: r.route_id, service: r.service_id, headsign: (r.trip_headsign ?? "").trim() });
  }
  stopsTable(rows: Record<string, string>[]) {
    for (const r of rows) this.stops.set(r.stop_id, { name: (r.stop_name ?? "").trim(), lat: Number(r.stop_lat), lng: Number(r.stop_lon) });
  }
  private weekly = new Set<string>();
  calendar(rows: Record<string, string>[]) {
    for (const r of rows) this.days.set(r.service_id, weekBits(r)), this.weekly.add(r.service_id);
  }
  /** calendar_dates.txt only (no calendar.txt): a service runs on the weekdays of the dates it's added. */
  calendarDates(rows: Record<string, string>[]) {
    for (const r of rows) {
      if (r.exception_type !== "1" || this.weekly.has(r.service_id)) continue;
      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(r.date ?? "");
      if (!m) continue;
      const wd = (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 6) % 7; // Monday = 0
      this.days.set(r.service_id, (this.days.get(r.service_id) ?? 0) | (1 << wd));
    }
  }

  /** One trip's stop_times rows (any order). */
  trip(tripId: string, rows: { seq: number; stop: string; time: string }[]) {
    const tr = this.trips.get(tripId);
    if (!tr) return;
    const line = this.lineOf.get(tr.route);
    const bits = this.days.get(tr.service) ?? 0;
    if (!line || !bits) return;
    const sorted = [...rows].sort((a, b) => a.seq - b.seq);
    const times = sorted.map((r) => gtfsMinutes(r.time));
    // Stops with no time of their own get the last known one (GTFS allows timing points only).
    let last = times[0];
    if (last == null) return;
    for (let i = 0; i < times.length; i++) times[i] = times[i] ?? last, (last = times[i]!);
    const key = `${line}|${sorted.map((r) => r.stop).join(">")}`;
    let e = this.pats.get(key);
    if (!e) {
      const st = sorted.map((r) => this.stops.get(r.stop) ?? { name: "", lat: 0, lng: 0 });
      e = {
        line,
        p: {
          headsign: tr.headsign || st[st.length - 1].name,
          names: st.map((s) => s.name),
          at: st.map((s) => [Math.round(s.lat * 1e5), Math.round(s.lng * 1e5)]),
          offsets: times.map((t) => t! - times[0]!),
          days: {},
        },
      };
      this.pats.set(key, e);
    }
    (e.p.days[bits] ??= []).push(times[0]!);
  }

  /** The timetable: each line's patterns, busiest first; short workings with few trips left out when the line has fuller ones. */
  result(built: string): Timetable {
    const lines: Record<string, Pattern[]> = {};
    for (const { line, p } of this.pats.values()) {
      for (const k of Object.keys(p.days)) p.days[k] = [...new Set(p.days[k])].sort((a, b) => a - b);
      (lines[line] ??= []).push(p);
    }
    const trips = (p: Pattern) => Object.values(p.days).reduce((n, d) => n + d.length, 0);
    for (const l of Object.keys(lines)) {
      const ps = lines[l].sort((a, b) => trips(b) - trips(a));
      lines[l] = ps.filter((p, i) => i < 2 || trips(p) >= Math.max(3, trips(ps[0]) * 0.1)).slice(0, 6);
    }
    return { built, source: this.source, tz: this.tz, lines };
  }
}

/** Metres between two points (×1e5 positions on one side). */
const metres = (a: [number, number], b: { lat: number; lng: number }) => {
  const toR = Math.PI / 180, la = a[0] / 1e5, lo = a[1] / 1e5;
  const x = (b.lng - lo) * toR * Math.cos(((la + b.lat) / 2) * toR), y = (b.lat - la) * toR;
  return Math.hypot(x, y) * 6371000;
};

/** A stop of the timetable this near the map's stop is the same stop. */
export const SAME_STOP_M = 120;

/** The local weekday (Monday = 0) and minutes after midnight in a time zone. */
export function localDay(now: Date, tz: string): { wd: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return { wd: Math.max(0, wd), min: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type Departures = {
  headsign: string;
  /** This stop's place on the route, and how many stops are left after it. */
  index: number;
  left: number;
  /** Minutes from here to the end of the line. */
  toEnd: number;
  /** The next departures from this stop, minutes after local midnight (may pass 1440). */
  next: number[];
  /** Today's first and last bus here (null: none today). */
  first: number | null;
  last: number | null;
  /** The next few stops after this one, with minutes from here. */
  ahead: { name: string; min: number }[];
};

/**
 * When a line leaves a stop (the map's stop at `at`), each way it runs: its patterns that pass
 * within SAME_STOP_M, the next `n` departures from now (yesterday's late trips included), today's
 * first and last, and the stops ahead. Patterns going the same way (same headsign) are merged.
 */
export function departuresAt(patterns: Pattern[], at: { lat: number; lng: number }, now: Date, tz: string, n = 4): Departures[] {
  const { wd, min } = localDay(now, tz);
  const today = 1 << wd, yesterday = 1 << ((wd + 6) % 7);
  const byWay = new Map<string, Departures>();
  for (const p of patterns) {
    let idx = -1, best = SAME_STOP_M;
    p.at.forEach((s, i) => {
      const d = metres(s, at);
      // The last stop is where it ends: nobody boards there.
      if (d < best && i < p.at.length - 1) (best = d), (idx = i);
    });
    if (idx < 0) continue;
    const off = p.offsets[idx];
    const todays: number[] = [], late: number[] = [];
    for (const [k, list] of Object.entries(p.days)) {
      const bits = Number(k);
      if (bits & today) for (const t of list) todays.push(t + off);
      // Trips that started yesterday and pass here after midnight.
      if (bits & yesterday) for (const t of list) if (t + off >= 1440) late.push(t + off - 1440);
    }
    const all = [...late, ...todays].sort((a, b) => a - b);
    const w = byWay.get(p.headsign) ?? { headsign: p.headsign, index: idx, left: p.at.length - 1 - idx, toEnd: p.offsets[p.offsets.length - 1] - off, next: [], first: null, last: null, ahead: [] };
    w.next = [...new Set([...w.next, ...all.filter((t) => t >= min)])].sort((a, b) => a - b).slice(0, n);
    if (todays.length) {
      const f = Math.min(...todays), l = Math.max(...todays);
      w.first = w.first == null ? f : Math.min(w.first, f);
      w.last = w.last == null ? l : Math.max(w.last, l);
    }
    if (!w.ahead.length) w.ahead = p.names.slice(idx + 1).map((name, i) => ({ name, min: p.offsets[idx + 1 + i] - off }));
    byWay.set(p.headsign, w);
  }
  return [...byWay.values()].sort((a, b) => (a.next[0] ?? 1e9) - (b.next[0] ?? 1e9));
}
