// Getting about by metro (pure; tests/transit.test.ts): the stations near a point and the walk
// to them, when the next trains leave, and a trip from here to there — walk, ride, change
// lines, walk — in minutes (RAPTOR: the fastest trip and the ones with fewer changes). Times come from each line's headway and hours (lib/transit/network.ts):
// estimates, not a live board.
import { metres, type Line, type Mode, type Network, type Station } from "./network";

/** Walking: 4.8 km/h, and streets aren't straight (×1.25). */
const WALK_MPS = 4.8 / 3.6;
const DETOUR = 1.25;
export const walkMin = (m: number) => (m * DETOUR) / WALK_MPS / 60;

/** Average speed between stations, stops included (km/h), and the stop itself. */
const SPEED: Record<Mode, number> = { subway: 34, light_rail: 26, monorail: 28, tram: 16, funicular: 12, train: 45 };
const DWELL_MIN = 0.5;
/** Changing lines: down the corridors to the other platform. */
const CHANGE_WALK_MIN = 4;
/** Off the train and up to the street. */
const EXIT_MIN = 1;
/** Walk to a station at most this far (metres) at either end of a trip. */
const MAX_WALK_M = 2500;

export const rideMin = (line: Line, a: Station, b: Station) => (metres(a, b) / 1000 / SPEED[line.mode]) * 60 + DWELL_MIN;

export type Near = { station: Station; m: number; walk: number };
/** The nearest stations to a point, nearest first. */
export function nearStations(net: Network, at: { lat: number; lng: number }, n = 3, maxM = MAX_WALK_M): Near[] {
  return net.stations
    .map((station) => ({ station, m: metres(at, station) }))
    .filter((x) => x.m <= maxM)
    .sort((a, b) => a.m - b.m)
    .slice(0, n)
    .map((x) => ({ ...x, m: Math.round(x.m), walk: Math.max(1, Math.round(walkMin(x.m))) }));
}

/** Minutes after local midnight in a time zone (Asia/Tehran, Europe/Istanbul). */
export function localMinutes(now: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0), m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export type Departures = { running: boolean; /** Minutes from now of the next few trains. */ next: number[]; /** Minutes after midnight of the first train, when it isn't running. */ first: number; last: number };
/**
 * When the next trains leave a station (from the line's headway: about every N minutes — a
 * clockless estimate, so the first is "within N"). Outside its hours: when the first one goes.
 */
export function departures(line: Line, nowMin: number, n = 3): Departures {
  const t = nowMin < line.from && line.to > 1440 && nowMin + 1440 <= line.to ? nowMin + 1440 : nowMin;
  const running = t >= line.from && t <= line.to;
  const last = line.to % 1440;
  if (!running) return { running, next: [], first: line.from, last };
  const out: number[] = [];
  // Trains leave every `headway` from the first one; the next is that far into the cycle.
  const into = (t - line.from) % line.headway;
  const first = into === 0 ? 0 : line.headway - into;
  for (let k = 0; out.length < n; k++) {
    const at = first + k * line.headway;
    if (t + at > line.to) break;
    out.push(Math.round(at));
  }
  return { running, next: out, first: line.from, last };
}

export type Leg =
  | { kind: "walk"; minutes: number; m: number; to: string }
  | { kind: "ride"; line: string; from: string; to: string; stops: number; minutes: number; wait: number; towards: string };
export type Trip = { minutes: number; legs: Leg[]; changes: number };

/** At most this many rides in one trip (3 changes). */
const MAX_RIDES = 4;

/** A ride found by a RAPTOR round: on `line` from `from` (boarded at `board` minutes) to here, set in round `round`. */
type Label = { line: string; from: string; board: number; round: number };

/**
 * Trips from `a` to `b` by RAPTOR (round-based, Delling et al. 2012) over each line's headway:
 * round k finds the earliest arrival at every station with at most k rides, scanning only the
 * lines through a station that improved in round k−1. Boarding waits half a headway; a change
 * costs the corridor walk. The answer is the Pareto set — the fastest trip, and each trip with
 * fewer changes that's still slower — fewest changes first. Empty when no station is in reach
 * of either end or walking all the way is quicker than every trip.
 */
export function planTrips(net: Network, a: { lat: number; lng: number }, b: { lat: number; lng: number }): Trip[] {
  const starts = nearStations(net, a, 4), ends = nearStations(net, b, 4);
  if (!starts.length || !ends.length) return [];
  const lines = new Map(net.lines.map((l) => [l.id, l]));
  const st = new Map(net.stations.map((s) => [s.id, s]));
  const access = new Map(starts.map((s) => [s.station.id, s]));
  const egress = new Map(ends.map((e) => [e.station.id, e]));
  // tau[k]: earliest time off a train (or, k = 0, walked in) at each station with ≤ k rides.
  const tau: Map<string, number>[] = [new Map(starts.map((s) => [s.station.id, s.walk]))];
  const labels: Map<string, Label>[] = [new Map()];
  const best = new Map(tau[0]);
  let marked = new Set(tau[0].keys());
  const straight = walkMin(metres(a, b));
  let bound = straight;
  const found: { k: number; t: number; at: string }[] = [];
  for (let k = 1; k <= MAX_RIDES && marked.size; k++) {
    const prev = tau[k - 1];
    const cur = new Map(prev), lab = new Map(labels[k - 1]);
    tau.push(cur);
    labels.push(lab);
    // Each line through a marked station, scanned both ways from its first marked station.
    const scan = new Set<string>();
    for (const sid of marked) for (const l of st.get(sid)?.lines ?? []) scan.add(l);
    const next = new Set<string>();
    for (const lid of scan) {
      const line = lines.get(lid);
      if (!line) continue;
      for (const order of [line.stations, [...line.stations].reverse()]) {
        let on: { t: number; from: string; board: number } | null = null;
        for (let i = 0; i < order.length; i++) {
          const sid = order[i];
          if (on && i > 0) {
            on.t += rideMin(line, st.get(order[i - 1])!, st.get(sid)!);
            // Off here: better than anything with ≤ k rides so far, and can still beat the best trip.
            if (on.t < (best.get(sid) ?? Infinity) && on.t < bound) {
              cur.set(sid, on.t);
              best.set(sid, on.t);
              lab.set(sid, { line: lid, from: on.from, board: on.board, round: k });
              next.add(sid);
            }
          }
          // Board here if waiting for this line beats the train we're on.
          const ready = prev.get(sid);
          if (ready == null) continue;
          const board = ready + (k > 1 && labels[k - 1].get(sid) ? CHANGE_WALK_MIN : 0) + line.headway / 2;
          if (!on || board < on.t) on = { t: board, from: sid, board };
        }
      }
    }
    marked = next;
    // The best trip with ≤ k rides: off at a station near `b`, up to the street, walk.
    let top: { t: number; at: string } | null = null;
    for (const [sid, e] of egress) {
      const t = cur.get(sid);
      if (t == null || !lab.get(sid)) continue;
      const total = t + EXIT_MIN + e.walk;
      if (!top || total < top.t) top = { t: total, at: sid };
    }
    if (top && top.t < bound) {
      found.push({ k, ...top });
      bound = top.t;
    }
  }
  return found.map(({ k, t, at }) => tripOf(k, t, at)).filter((x): x is Trip => !!x);

  function tripOf(k: number, total: number, at: string): Trip | null {
    const rides: Leg[] = [];
    let sid = at, round = k, first = at;
    while (round > 0) {
      const l = labels[round].get(sid);
      if (!l) break;
      const line = lines.get(l.line)!;
      const off = tau[l.round].get(sid)!;
      const fromIdx = line.stations.indexOf(l.from), toIdx = line.stations.indexOf(sid);
      const wait = Math.round(line.headway / 2);
      rides.unshift({ kind: "ride", line: l.line, from: l.from, to: sid, stops: Math.abs(toIdx - fromIdx), minutes: Math.round(off - l.board), wait, towards: line.stations[toIdx > fromIdx ? line.stations.length - 1 : 0] });
      first = l.from;
      sid = l.from;
      round = l.round - 1;
    }
    const w = access.get(first), e = egress.get(at)!;
    if (!w || !rides.length) return null;
    return { minutes: Math.round(total), legs: [{ kind: "walk", minutes: w.walk, m: w.m, to: first }, ...rides, { kind: "walk", minutes: e.walk, m: e.m, to: "" }], changes: rides.length - 1 };
  }
}

/** The quickest trip from `a` to `b` (see planTrips), or null. */
export function planTrip(net: Network, a: { lat: number; lng: number }, b: { lat: number; lng: number }): Trip | null {
  const all = planTrips(net, a, b);
  return all.length ? all.reduce((x, y) => (y.minutes < x.minutes ? y : x)) : null;
}

/** The stations a ride passes, boarding and alighting included, in the order you pass them. */
export function rideStops(line: Line, from: string, to: string): string[] {
  const a = line.stations.indexOf(from), b = line.stations.indexOf(to);
  if (a < 0 || b < 0) return [];
  return a <= b ? line.stations.slice(a, b + 1) : line.stations.slice(b, a + 1).reverse();
}

/** A trip as a timetable from `startMin` (minutes after midnight): when each step starts and ends. */
export type Step = { leg: Leg; start: number; end: number };
export function timeline(trip: Trip, startMin: number): Step[] {
  let t = startMin;
  return trip.legs.map((leg) => {
    const start = t;
    t += leg.kind === "walk" ? leg.minutes : leg.wait + leg.minutes;
    return { leg, start, end: t };
  });
}

/** "08:05" for minutes after midnight (wrapping past midnight). */
export const clockOf = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
