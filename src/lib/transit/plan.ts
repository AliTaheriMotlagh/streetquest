// Getting about by metro (pure; tests/transit.test.ts): the stations near a point and the walk
// to them, when the next trains leave, and a trip from here to there — walk, ride, change
// lines, walk — in minutes. Times come from each line's headway and hours (lib/transit/network.ts):
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

/**
 * The quickest trip from `a` to `b`: walk to one of the stations near `a`, ride, change lines
 * where they meet, walk from a station near `b` (Dijkstra over station × line). Null when
 * no station is in reach of either end, or walking is quicker.
 */
export function planTrip(net: Network, a: { lat: number; lng: number }, b: { lat: number; lng: number }): Trip | null {
  const starts = nearStations(net, a, 4), ends = nearStations(net, b, 4);
  if (!starts.length || !ends.length) return null;
  const lines = new Map(net.lines.map((l) => [l.id, l]));
  const st = new Map(net.stations.map((s) => [s.id, s]));
  type Node = string; // `${station}|${line}` riding, or `${station}|` on foot in the station
  const best = new Map<Node, number>();
  const prev = new Map<Node, { from: Node; leg: Leg | null }>();
  const queue: [number, Node][] = [];
  const push = (n: Node, t: number, from: Node, leg: Leg | null) => {
    if ((best.get(n) ?? Infinity) <= t) return;
    best.set(n, t);
    prev.set(n, { from, leg });
    queue.push([t, n]);
  };
  for (const s of starts) push(`${s.station.id}|`, s.walk, "start", { kind: "walk", minutes: s.walk, m: s.m, to: s.station.id });
  const endWalk = new Map(ends.map((e) => [e.station.id, e]));
  let done: { t: number; node: Node; walk: Near } | null = null;
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]);
    const [t, node] = queue.shift()!;
    if (t > (best.get(node) ?? Infinity)) continue;
    if (done && t >= done.t) break;
    const [sid, lid] = node.split("|");
    if (!lid) {
      const e = endWalk.get(sid);
      if (e && (!done || t + e.walk < done.t)) done = { t: t + e.walk, node, walk: e };
      // Board any line here: wait half a headway (plus the corridors if we came off another line).
      for (const l of st.get(sid)?.lines ?? []) {
        const line = lines.get(l)!;
        push(`${sid}|${l}`, t + line.headway / 2, node, null);
      }
      continue;
    }
    const line = lines.get(lid)!;
    const i = line.stations.indexOf(sid);
    for (const j of [i - 1, i + 1]) {
      const nid = line.stations[j];
      if (!nid) continue;
      push(`${nid}|${lid}`, t + rideMin(line, st.get(sid)!, st.get(nid)!), node, null);
    }
    // Off at the end: a minute up to the street, then the walk.
    const e = endWalk.get(sid);
    if (e && (!done || t + EXIT_MIN + e.walk < done.t)) done = { t: t + EXIT_MIN + e.walk, node, walk: e };
    // Get off here to change (the walk to the other platform).
    push(`${sid}|`, t + CHANGE_WALK_MIN, node, null);
  }
  if (!done) return null;
  // Walking all the way may beat it.
  const straight = walkMin(metres(a, b));
  if (straight <= done.t) return null;
  // Rebuild the path: runs of the same line become one ride.
  const path: Node[] = [];
  for (let n: Node = done.node; n !== "start"; n = prev.get(n)!.from) path.unshift(n);
  const legs: Leg[] = [prev.get(path[0])!.leg!];
  let i = 0;
  while (i < path.length) {
    const [, lid] = path[i].split("|");
    if (!lid) {
      i++;
      continue;
    }
    const line = lines.get(lid)!;
    const from = path[i - 1]?.split("|")[0] ?? path[i].split("|")[0];
    let j = i;
    while (j + 1 < path.length && path[j + 1].split("|")[1] === lid) j++;
    const to = path[j].split("|")[0];
    const fromIdx = line.stations.indexOf(from), toIdx = line.stations.indexOf(to);
    const stops = Math.abs(toIdx - fromIdx);
    if (stops > 0) {
      const t0 = best.get(`${from}|${lid}`) ?? 0, t1 = best.get(path[j]) ?? t0;
      legs.push({ kind: "ride", line: lid, from, to, stops, minutes: Math.round(t1 - t0), wait: Math.round(line.headway / 2), towards: line.stations[toIdx > fromIdx ? line.stations.length - 1 : 0] });
    }
    i = j + 1;
  }
  legs.push({ kind: "walk", minutes: done.walk.walk, m: done.walk.m, to: "" });
  const rides = legs.filter((l) => l.kind === "ride").length;
  if (!rides) return null;
  return { minutes: Math.round(done.t), legs, changes: rides - 1 };
}
