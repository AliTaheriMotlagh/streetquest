"use client";
// Public transport on the map (lib/transit/*, server/transit.ts): a metro station's card (its
// lines, the next trains each way, the trip planner), a bus stop's (when each line's next bus
// comes — live in Istanbul when IETT answers, else "about every N min"), a live bus, and the
// Metro sheet: every line as a strip of stations, a planner from here to any station, a guide.
import { useEffect, useMemo, useState } from "react";
import { fmtNum, getLocale, msg, t, dot } from "@/lib/i18n";
import { distanceM, formatDistance, type LatLng } from "@/lib/geo";
import type { LiveBus } from "@/lib/transit/iett";
import type { BusStop, City, Exit, Line, Network, Station } from "@/lib/transit/network";
import { clockOf, departures, localMinutes, nearStations, planTrips, rideStops, timeline, type Trip } from "@/lib/transit/plan";
import { fareRule, tripFare, type FareRule } from "@/lib/transit/fares";
import { Button } from "@/components/Button";
import { api } from "./client";
import { metroOf } from "./transit";
import { clientLine } from "./iettClient";
import { arrivalsAt } from "@/lib/transit/iett";
import { Sheet, Tabs, useGame } from "./ui";

export type StationPick = { city: City; station: Station };

const nameOf = (s: { name: string; en?: string }) => (getLocale() === "fa" ? s.name : s.en || s.name);
const clock = (min: number) => `${fmtNum(Math.floor(min / 60) % 24, undefined, { minimumIntegerDigits: 2 })}:${fmtNum(min % 60, undefined, { minimumIntegerDigits: 2 })}`;
const lineLabel = (l: Line) => (/^\d+$/.test(l.ref) ? t("Line {n}", { n: fmtNum(Number(l.ref)) }) : l.ref);
const MODE_EMOJI: Record<Line["mode"], string> = { subway: "🚇", light_rail: "🚈", monorail: "🚝", tram: "🚋", funicular: "🚞", train: "🚆" };

/** Named colours OSM uses for lines, as hex (to judge the text on them). */
const NAMED: Record<string, string> = { yellow: "#ffff00", gold: "#ffd700", orange: "#ffa500", lime: "#00ff00", white: "#ffffff", pink: "#ffc0cb", cyan: "#00ffff", red: "#ff0000", blue: "#0000ff", green: "#008000", purple: "#800080", brown: "#a52a2a", grey: "#808080", gray: "#808080", black: "#000000" };
/** Dark text on a light line colour (Tehran's yellow Line 4), white on the rest. */
export function onColour(c: string): string {
  const hex = (NAMED[c.trim().toLowerCase()] ?? c).replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.62 ? "#111" : "#fff";
}

export function LineChip({ l }: { l: Line }) {
  return (
    <span className="tr-chip" style={{ "--line": l.colour, color: onColour(l.colour), textShadow: onColour(l.colour) === "#111" ? "none" : undefined } as React.CSSProperties} title={nameOf(l)}>
      {lineLabel(l)}
    </span>
  );
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** A metro station: each line through it, the next trains towards either end. */
export function StationCard({ pick, onClose }: { pick: StationPick; onClose: () => void }) {
  const { pos } = useGame();
  const [net, setNet] = useState<Network | null>(null);
  // "Trip to here" / "Metro map": the Metro sheet takes the card's place.
  const [metro, setMetro] = useState<{ to?: Station } | null>(null);
  const onMetro = (to?: Station) => setMetro({ to });
  const now = useNow();
  useEffect(() => void metroOf(pick.city).then(setNet).catch(() => {}), [pick.city]);
  const s = pick.station;
  const lines = (net?.lines ?? []).filter((l) => l.stations.includes(s.id));
  const st = new Map((net?.stations ?? []).map((x) => [x.id, x]));
  const nowMin = net ? localMinutes(now, net.tz) : 0;
  const dist = pos ? distanceM(pos, s) : null;
  if (metro) return <MetroSheet city={pick.city} to={metro.to} onClose={onClose} />;
  return (
    <Sheet title={`🚇 ${nameOf(s)}`} onClose={onClose}>
      <p className="small muted">{[lines.length > 1 ? t("Interchange · {n} lines", { n: fmtNum(lines.length) }) : t("Metro station"), dist != null ? formatDistance(dist) : ""].filter(Boolean).join(dot())}</p>
      {lines.map((l) => {
        const d = departures(l, nowMin);
        const ends = [l.stations[l.stations.length - 1], l.stations[0]].map((id) => st.get(id)).filter((x): x is Station => !!x && x.id !== s.id);
        return (
          <div key={l.id} className="card tr-line">
            <div className="row tr-line-head">
              <LineChip l={l} />
              <b className="grow" dir="auto">{MODE_EMOJI[l.mode]} {nameOf(l)}</b>
            </div>
            {d.running ? (
              ends.map((e) => (
                <div key={e.id} className="small tr-dep">
                  <span className="grow" dir="auto">{t("Towards {station}", { station: nameOf(e) })}</span>
                  <b>{d.next.map((m) => (m ? t("{n} min", { n: fmtNum(m) }) : t("now"))).join(dot())}</b>
                </div>
              ))
            ) : (
              <div className="small muted">{t("Closed now — first train {time}", { time: clock(d.first) })}</div>
            )}
            <div className="small muted">{t("{from}–{to} · about every {n} min", { from: clock(l.from), to: clock(l.to % 1440), n: fmtNum(l.headway) })}{l.mapped ? "" : `${dot()}${t("typical times")}`}</div>
          </div>
        );
      })}
      <Exits exits={(net?.stations.find((x) => x.id === s.id) ?? s).exits} from={pos ?? null} />
      <div className="row">
        <Button className="btn cyan grow" onClick={() => onMetro(s)}>🧭 {t("Trip to here")}</Button>
        <Button className="btn ghost grow" onClick={() => onMetro()}>🗺️ {t("Metro map")}</Button>
      </div>
      <p className="small muted ext-source">{t("Times are estimates from each line's usual frequency, not a live board. Stations from OpenStreetMap.")}</p>
    </Sheet>
  );
}

/** " · about 4,000 toman" for a trip under a fare rule (nothing when the fare isn't set). */
function fareText(trip: Trip, rule: FareRule): string {
  const n = tripFare(trip, rule);
  if (!n) return "";
  return `${dot()}${rule.currency === "TRY" ? t("about {n} lira", { n: fmtNum(n) }) : t("about {n} toman", { n: fmtNum(n) })}`;
}

/** A station's exits, the one nearest you first (when your position is known), with lift / step-free marks. */
function Exits({ exits, from }: { exits?: Exit[]; from: LatLng | null }) {
  const [all, setAll] = useState(false);
  if (!exits?.length) return null;
  const list = from ? [...exits].sort((a, b) => distanceM(from, a) - distanceM(from, b)) : exits;
  const shown = all ? list : list.slice(0, 4);
  return (
    <div className="card tr-exits">
      <b className="small">{t("Exits · {n}", { n: fmtNum(exits.length) })}</b>
      <ul>
        {shown.map((e, i) => (
          <li key={`${e.lat},${e.lng}`} className="row small">
            <span className="tr-exit-ref">{e.ref || "↗"}</span>
            <span className="grow" dir="auto">{e.name || t("Exit")}</span>
            {e.lift && <span title={t("Lift")}>🛗</span>}
            {e.stepFree && <span title={t("Step-free")}>♿</span>}
            {from && <span className="muted">{i === 0 && !all ? t("nearest · {d}", { d: formatDistance(distanceM(from, e)) }) : formatDistance(distanceM(from, e))}</span>}
          </li>
        ))}
      </ul>
      {list.length > 4 && <button type="button" className="link-btn small" onClick={() => setAll(!all)}>{all ? t("Fewer") : t("All {n} exits", { n: fmtNum(list.length) })}</button>}
    </div>
  );
}

/** One way a line runs past the stop (server/transit.ts stopBoard). */
type LineHere = {
  line: string;
  name: string;
  operator?: string;
  towards: string;
  from: string;
  left: number;
  ahead: { name: string; min: number }[];
  toEnd: number;
  source: "live" | "timetable" | "map" | "none";
  minutes: number | null;
  times: number[];
  first: number | null;
  last: number | null;
  every: number | null;
  hours?: { from: number; to: number };
};
type Board = { lines: LineHere[]; live: boolean; timetable: string | null };
/** Lines asked live per card from the phone (one request each). */
const PHONE_LINES = 8;

/** When it comes, as the row's big figure: live minutes, the timetable's next time, or what's known. */
function when(l: LineHere): { big: string; note: string } {
  if (l.source === "live" && l.minutes != null) return { big: l.minutes ? t("{n} min", { n: fmtNum(l.minutes) }) : t("arriving"), note: t("Live") };
  if (l.source === "timetable" && l.times.length) return { big: clock(l.times[0] % 1440), note: l.minutes != null ? (l.minutes <= 0 ? t("now") : t("in {n} min", { n: fmtNum(l.minutes) })) : "" };
  if (l.source === "timetable") return { big: "—", note: t("No more buses today") };
  if (l.source === "map" && l.every) return { big: t("every {n} min", { n: fmtNum(l.every) }), note: t("from the map") };
  return { big: "", note: t("No timetable") };
}

/** One line, one way: where it's going, when, its times today and the stops ahead (tap for all of them). */
function LineRow({ l }: { l: LineHere }) {
  const [open, setOpen] = useState(false);
  const w = when(l);
  const extra = [
    l.from && l.towards ? `${l.from} → ${l.towards}` : l.name !== l.line ? l.name : "",
    l.operator,
    l.first != null && l.last != null ? t("First {a} · last {b}", { a: clock(l.first % 1440), b: clock(l.last % 1440) }) : l.hours ? t("Runs {a}–{b}", { a: clock(l.hours.from), b: clock(l.hours.to % 1440) }) : "",
  ].filter(Boolean);
  return (
    <li className={`tr-way src-${l.source}`}>
      <button type="button" className="row tr-way-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tr-chip bus">{l.line}</span>
        <span className="grow tr-way-to" dir="auto">
          <b>{l.towards ? t("→ {station}", { station: l.towards }) : l.name}</b>
          {extra.length > 0 && <span className="tiny muted">{extra.join(dot())}</span>}
        </span>
        <span className="tr-when">
          {w.big && <b>{w.big}{l.source === "live" && <span className="tr-live" title={t("Live")}> ●</span>}</b>}
          {w.note && <span className="tiny muted">{w.note}</span>}
        </span>
      </button>
      {l.times.length > 1 && (
        <div className="tr-times small">
          {l.times.slice(0, 4).map((m) => (
            <span key={m}>{clock(m % 1440)}</span>
          ))}
          {l.every ? <span className="muted">{t("about every {n} min", { n: fmtNum(l.every) })}</span> : null}
        </div>
      )}
      {l.left > 0 && (
        <div className="tiny muted tr-left">
          {t("{n} stops to the end", { n: fmtNum(l.left) })}
          {l.toEnd ? `${dot()}${t("about {n} min", { n: fmtNum(l.toEnd) })}` : ""}
          {!open && l.ahead.length > 0 && `${dot()}${t("next: {stops}", { stops: l.ahead.slice(0, 2).map((a) => a.name).join(", ") })}`}
        </div>
      )}
      {open && l.ahead.length > 0 && (
        <ol className="tr-ahead">
          {l.ahead.map((a, i) => (
            <li key={i} className="row small">
              <span className="grow" dir="auto">{a.name}</span>
              <span className="muted">{t("+{n} min", { n: fmtNum(a.min) })}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** A bus stop: every line calling here, each way it runs — when it comes, its times today, the stops ahead. */
export function BusStopCard({ city, stop, onClose }: { city: City; stop: BusStop; onClose: () => void }) {
  const { pos } = useGame();
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  const now = useNow(30_000);
  useEffect(() => {
    let live = true;
    api<Board>(`/api/transit?board=${stop.id}&lat=${stop.lat}&lng=${stop.lng}`)
      .then(async (r) => {
        if (live) (setData(r), setError(""));
        // Istanbul, and the server can't reach IETT (no relay yet): ask from this phone.
        if (r.live || city !== "istanbul") return;
        const lines = stop.lines.slice(0, PHONE_LINES);
        const buses = await Promise.all(lines.map((l) => clientLine(l).catch(() => null)));
        if (!live || !buses.some(Boolean)) return;
        const got = arrivalsAt(stop, lines, buses, {});
        const liveOf = new Map(got.filter((a) => a.live && a.minutes != null).map((a) => [a.line, a]));
        setData({ ...r, live: true, lines: r.lines.map((l) => { const a = liveOf.get(l.line); return a && (!a.towards || a.towards.includes(l.towards) || l.towards.includes(a.towards)) ? { ...l, source: "live" as const, minutes: a.minutes } : l; }) });
      })
      .catch((e) => live && setError((e as Error).message));
    return () => void (live = false);
  }, [stop.id, stop.lat, stop.lng, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const dist = pos ? distanceM(pos, stop) : null;
  const refs = [...new Set((data?.lines ?? []).map((l) => l.line))];
  const shown = (data?.lines ?? []).filter((l) => !only || l.line === only);
  const known = (data?.lines ?? []).some((l) => l.source !== "none");
  return (
    <Sheet title={`🚏 ${stop.name || t("Bus stop")}`} onClose={onClose} tall>
      <p className="small muted">{[t("Bus stop"), t("{n} lines", { n: fmtNum(stop.lines.length) }), dist != null ? formatDistance(dist) : ""].filter(Boolean).join(dot())}</p>
      {error && <p className="small warn-text">{error}</p>}
      {refs.length > 3 && (
        <div className="fx-chips tr-filter" aria-label={t("Lines")}>
          <button type="button" className={`chip small ${only ? "" : "on"}`} onClick={() => setOnly(null)}>{t("All")}</button>
          {refs.map((r) => (
            <button key={r} type="button" className={`chip small ${only === r ? "on" : ""}`} onClick={() => setOnly(only === r ? null : r)}>{r}</button>
          ))}
        </div>
      )}
      {!data && !error && <p className="small muted">{t("Loading…")}</p>}
      <ul className="tr-ways">
        {shown.map((l, i) => (
          <LineRow key={`${l.line}-${l.towards}-${i}`} l={l} />
        ))}
      </ul>
      <p className="small muted ext-source">
        {[
          data?.live ? t("● live: where IETT's buses are now; minutes are an estimate from the distance.") : "",
          data?.timetable ? t("Times: the published timetable ({source}).", { source: data.timetable }) : known ? "" : t("No timetable for these lines yet — routes and stops are from OpenStreetMap; minutes to each stop are estimates."),
          !data?.live && city === "istanbul" ? t("IETT's live feed isn't reachable right now.") : "",
        ].filter(Boolean).join(" ")}
      </p>
    </Sheet>
  );
}

export function LiveBusCard({ bus, onClose }: { bus: LiveBus; onClose: () => void }) {
  const age = bus.at ? Math.max(0, Math.round((Date.now() - bus.at) / 1000)) : null;
  return (
    <Sheet title={`🚌 ${bus.line ? t("Bus {line}", { line: bus.line }) : t("City bus")}`} onClose={onClose}>
      <p className="small muted">{[bus.id, bus.towards && t("Towards {station}", { station: bus.towards }), bus.kmh != null && t("{n} km/h", { n: fmtNum(Math.round(bus.kmh)) }), age != null && t("{n} s ago", { n: fmtNum(age) })].filter(Boolean).join(dot())}</p>
      <p className="small muted ext-source">{t("Live position from IETT (Istanbul).")}</p>
    </Sheet>
  );
}

/** Iran's smaller metros: the same habits, fewer trains. */
const IRAN_GUIDE = [
  msg("Pay with the city's transit card or a single ticket from the station's machine."),
  msg("Most trains keep a carriage or two for women only — the platform shows where."),
  msg("Trains come less often than in Tehran: check the next one before you go down."),
];

const GUIDE: Record<City, string[]> = {
  tehran: [
    msg("Pay with a Tehran metro card (or a single ticket at the station); the same card works on BRT buses."),
    msg("The first and last carriages are for women; the rest are for everyone."),
    msg("Rush hours (7–9 and 16–19) are packed — the middle of the day is much calmer."),
    msg("Line 5 runs out to Karaj from Sadeghieh; change there from Line 2."),
  ],
  istanbul: [
    msg("Pay with an İstanbulkart (sold at stations and kiosks); transfers within two hours cost less."),
    msg("Marmaray crosses under the Bosphorus between Europe and Asia; M2 and the funicular F1 link Taksim with the shore."),
    msg("Trams and metro start about 06:00; on Friday and Saturday nights some lines run all night."),
    msg("Ferries (vapur) are part of the same card — the most beautiful way across."),
  ],
  mashhad: IRAN_GUIDE,
  isfahan: IRAN_GUIDE,
  shiraz: IRAN_GUIDE,
  tabriz: IRAN_GUIDE,
};
/** Each city's metro by name (the sheet's title). */
const METRO_TITLE: Record<City, string> = { tehran: msg("Tehran Metro"), istanbul: msg("Istanbul rail"), mashhad: msg("Mashhad Metro"), isfahan: msg("Isfahan Metro"), shiraz: msg("Shiraz Metro"), tabriz: msg("Tabriz Metro") };

/** The Metro sheet: the lines as strips of stations, a trip planner, a short guide. */
export function MetroSheet({ city, to, onClose, onStation }: { city: City; to?: Station; onClose: () => void; onStation?: (s: Station) => void }) {
  const { pos } = useGame();
  const [net, setNet] = useState<Network | null>(null);
  const [tab, setTab] = useState<"trip" | "lines" | "guide">(to ? "trip" : "lines");
  const [dest, setDest] = useState<Station | null>(to ?? null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => void metroOf(city).then(setNet).catch(() => {}), [city]);
  const st = useMemo(() => new Map((net?.stations ?? []).map((x) => [x.id, x])), [net]);
  const lines = new Map((net?.lines ?? []).map((l) => [l.id, l]));
  return (
    <Sheet title={t(METRO_TITLE[city])} onClose={onClose} tall>
      <Tabs value={tab} onChange={setTab} tabs={[["trip", t("Trip")], ["lines", t("Lines")], ["guide", t("Guide")]]} />
      {!net && <p className="small muted">{t("Loading…")}</p>}
      {net && tab === "trip" && <MetroTrip net={net} city={city} here={pos ?? null} dest={dest} setDest={setDest} onStation={onStation} />}
      {net && tab === "lines" &&
        net.lines.map((l) => (
          <div key={l.id} className="card tr-line">
            <button type="button" className="row tr-line-head" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
              <LineChip l={l} />
              <span className="grow" dir="auto">{MODE_EMOJI[l.mode]} {nameOf(l)}</span>
              <span className="small muted">{t("{n} stations", { n: fmtNum(l.stations.length) })}</span>
            </button>
            {open === l.id && (
              <ol className="tr-strip" style={{ "--line": l.colour } as React.CSSProperties}>
                {l.stations.map((id) => {
                  const s = st.get(id)!;
                  const other = s.lines.filter((x) => x !== l.id).map((x) => lines.get(x)).filter((x): x is Line => !!x);
                  return (
                    <li key={id}>
                      <button type="button" className="row" onClick={() => onStation?.(s)}>
                        <span className="grow" dir="auto">{nameOf(s)}</span>
                        {other.map((o) => <LineChip key={o.id} l={o} />)}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      {tab === "guide" && (
        <ul className="tr-guide">
          {GUIDE[city].map((g) => (
            <li key={g} className="small">{t(g)}</li>
          ))}
        </ul>
      )}
      <p className="small muted ext-source">{t("Lines and stations from OpenStreetMap; times are estimates.")}</p>
    </Sheet>
  );
}

/** A station picker: type a name, pick from the matches (or "where I am" for the start). */
function StationPick({ net, value, onPick, label, here, placeholder }: { net: Network; value: Station | "here" | null; onPick: (s: Station | "here" | null) => void; label: string; here?: boolean; placeholder: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => new Map(net.lines.map((l) => [l.id, l])), [net]);
  const found = q.trim().length >= 1 ? net.stations.filter((x) => `${x.name} ${x.en}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const shown = value === "here" ? t("📍 Where I am") : value ? nameOf(value) : q;
  return (
    <div className="mt-pick">
      <span className="mt-pick-lb">{label}</span>
      <input
        className="input"
        value={open ? q : shown}
        onFocus={() => (setOpen(true), setQ(""))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        dir="auto"
      />
      {open && (here || found.length > 0) && (
        <ul className="tr-found mt-found">
          {here && !q && (
            <li>
              <button type="button" className="row" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick("here"), setOpen(false))}>
                <span className="grow">{t("📍 Where I am")}</span>
              </button>
            </li>
          )}
          {found.map((x) => (
            <li key={x.id}>
              <button type="button" className="row" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(x), setOpen(false))}>
                <span className="grow" dir="auto">{nameOf(x)}</span>
                {x.lines.map((id) => lines.get(id)).filter((l): l is Line => !!l).map((l) => <LineChip key={l.id} l={l} />)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The metro trip, start to finish: from where you are (or any station) to any station — the
 * total time, when you'd leave and arrive, then each step on a timeline: the walk in, the line
 * to take and which way (its colour, the next trains), every stop it passes (tap to unfold),
 * where to change, the walk out.
 */
function MetroTrip({ net, city, here, dest, setDest, onStation }: { net: Network; city: City; here: LatLng | null; dest: Station | null; setDest: (s: Station | null) => void; onStation?: (s: Station) => void }) {
  const [from, setFrom] = useState<Station | "here">("here");
  const [open, setOpen] = useState<number | null>(null);
  const st = useMemo(() => new Map(net.stations.map((x) => [x.id, x])), [net]);
  const lines = useMemo(() => new Map(net.lines.map((l) => [l.id, l])), [net]);
  const start: LatLng | null = from === "here" ? here : from;
  // Every trip worth taking (RAPTOR's Pareto set: fewest changes first); the fastest is picked unless you choose.
  const trips: Trip[] = useMemo(() => (start && dest ? planTrips(net, start, dest) : []), [net, start?.lat, start?.lng, dest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => setPick(null), [trips]);
  const fastest = trips.reduce((b, x, i) => (x.minutes < trips[b].minutes ? i : b), 0);
  const trip: Trip | null = trips[pick ?? fastest] ?? null;
  const rule = fareRule(city);
  const near = from === "here" && here ? nearStations(net, here, 1, 1e7)[0] : null;
  const now = localMinutes(new Date(), net.tz);
  const steps = trip ? timeline(trip, now) : [];
  const swap = () => {
    if (!dest) return;
    const was = from;
    setFrom(dest);
    setDest(was === "here" ? null : was);
  };
  return (
    <div className="mt-trip">
      <div className="mt-ends card">
        <StationPick net={net} value={from} onPick={(v) => setFrom(v ?? "here")} label={t("From")} here placeholder={t("A station, or where I am")} />
        <button type="button" className="mt-swap" onClick={swap} disabled={!dest} aria-label={t("Swap")} title={t("Swap")}>⇅</button>
        <StationPick net={net} value={dest} onPick={(v) => setDest(v === "here" ? null : v)} label={t("To")} placeholder={t("Where to? A station's name")} />
      </div>
      {from === "here" && <p className="small muted">{near ? t("From you — nearest station {station}, {d} away", { station: nameOf(near.station), d: formatDistance(near.m) }) : t("Waiting for your position…")}</p>}
      {dest && start && !trip && <p className="small muted">{t("Walking there is quicker than the metro.")}</p>}
      {trips.length > 1 && (
        <div className="mt-opts" role="group" aria-label={t("Ways to go")}>
          {trips.map((x, i) => (
            <button key={i} type="button" className="mt-opt small" aria-pressed={x === trip} onClick={() => setPick(i)}>
              <b>{t("{n} min", { n: fmtNum(x.minutes) })}</b>
              <span className="muted">{i === fastest ? t("Fastest") : x.changes ? t("{n} changes", { n: fmtNum(x.changes) }) : t("No changes")}</span>
            </button>
          ))}
        </div>
      )}
      {trip && (
        <section className="mt-plan" aria-label={t("Your trip")}>
          <header className="mt-sum">
            <b className="mt-min">{t("{n} min", { n: fmtNum(trip.minutes) })}</b>
            <span className="small">
              {t("Leave {a} · arrive about {b}", { a: clockOf(now), b: clockOf(now + trip.minutes) })}
              <br />
              <span className="muted">{trip.changes ? t("{n} changes", { n: fmtNum(trip.changes) }) : t("no changes")} · {t("{n} stops", { n: fmtNum(trip.legs.reduce((k, g) => k + (g.kind === "ride" ? g.stops : 0), 0)) })}{fareText(trip, rule)}</span>
            </span>
            <span className="mt-bar" aria-hidden>
              {trip.legs.map((g, i) => (
                <i key={i} style={{ flexGrow: Math.max(1, g.kind === "walk" ? g.minutes : g.wait + g.minutes), background: g.kind === "walk" ? "rgba(255,255,255,.25)" : lines.get(g.line)?.colour || "var(--sky)" }} />
              ))}
            </span>
          </header>
          <ol className="mt-steps">
            {steps.map(({ leg: g, start: a }, i) => {
              if (g.kind === "walk") {
                const to = g.to ? st.get(g.to) : null;
                if (!to && g.m < 30) return null;
                return (
                  <li key={i} className="mt-step walk">
                    <time>{clockOf(a)}</time>
                    <span className="mt-dot" aria-hidden>🚶</span>
                    <div>
                      <b>{to ? t("Walk to {station}", { station: nameOf(to) }) : t("Walk to where you're going")}</b>
                      <span className="small muted">{t("{d} · {n} min", { d: formatDistance(g.m), n: fmtNum(g.minutes) })}</span>
                      {to && onStation && <button type="button" className="link-btn small" onClick={() => onStation(to)}>{t("Show on the map")}</button>}
                    </div>
                  </li>
                );
              }
              const l = lines.get(g.line)!;
              const dep = departures(l, a, 3);
              const stops = rideStops(l, g.from, g.to);
              const change = i > 1 && trip.legs[i - 1]?.kind === "ride";
              return (
                <li key={i} className="mt-step ride" style={{ "--line": l.colour } as React.CSSProperties}>
                  <time>{clockOf(a + g.wait)}</time>
                  <span className="mt-dot" aria-hidden>{MODE_EMOJI[l.mode]}</span>
                  <div>
                    {change && <span className="mt-change small">{t("Change here — about 4 min through the corridors")}</span>}
                    <b>
                      <LineChip l={l} /> {t("Towards {end}", { end: nameOf(st.get(g.towards)!) })}
                    </b>
                    <span className="small">{t("Board at {station}", { station: nameOf(st.get(g.from)!) })}</span>
                    <span className="small muted">
                      {dep.running && dep.next.length ? t("Next trains in {list} min", { list: dep.next.map((n) => fmtNum(n)).join("، ") }) : t("Not running now — first train {time}", { time: clockOf(dep.first) })}
                    </span>
                    <button type="button" className="mt-stops-btn small" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                      {t("{n} stops · {m} min", { n: fmtNum(g.stops), m: fmtNum(g.minutes) })} {open === i ? "▴" : "▾"}
                    </button>
                    {open === i && (
                      <ol className="mt-stops">
                        {stops.map((id, k) => (
                          <li key={id} className={k === 0 || k === stops.length - 1 ? "end" : ""} dir="auto">{nameOf(st.get(id)!)}</li>
                        ))}
                      </ol>
                    )}
                    <span className="small">{t("Get off at {station}", { station: nameOf(st.get(g.to)!) })}</span>
                  </div>
                </li>
              );
            })}
            <li className="mt-step end">
              <time>{clockOf(now + trip.minutes)}</time>
              <span className="mt-dot" aria-hidden>🏁</span>
              <div><b dir="auto">{nameOf(dest!)}</b></div>
            </li>
          </ol>
        </section>
      )}
    </div>
  );
}
