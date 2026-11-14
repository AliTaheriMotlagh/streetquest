"use client";
// Public transport on the map (lib/transit/*, server/transit.ts): a metro station's card (its
// lines, the next trains each way, the trip planner), a bus stop's (when each line's next bus
// comes — live in Istanbul when IETT answers, else "about every N min"), a live bus, and the
// Metro sheet: every line as a strip of stations, a planner from here to any station, a guide.
import { useEffect, useMemo, useState } from "react";
import { fmtNum, getLocale, msg, t } from "@/lib/i18n";
import { distanceM, formatDistance, type LatLng } from "@/lib/geo";
import type { LiveBus } from "@/lib/transit/iett";
import type { BusStop, City, Line, Network, Station } from "@/lib/transit/network";
import { departures, localMinutes, nearStations, planTrip, type Trip } from "@/lib/transit/plan";
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
      <p className="small muted">{[lines.length > 1 ? t("Interchange · {n} lines", { n: fmtNum(lines.length) }) : t("Metro station"), dist != null ? formatDistance(dist) : ""].filter(Boolean).join(" · ")}</p>
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
                  <b>{d.next.map((m) => (m ? t("{n} min", { n: fmtNum(m) }) : t("now"))).join(" · ")}</b>
                </div>
              ))
            ) : (
              <div className="small muted">{t("Closed now — first train {time}", { time: clock(d.first) })}</div>
            )}
            <div className="small muted">{t("{from}–{to} · about every {n} min", { from: clock(l.from), to: clock(l.to % 1440), n: fmtNum(l.headway) })}{l.mapped ? "" : ` · ${t("typical times")}`}</div>
          </div>
        );
      })}
      <div className="row">
        <Button className="btn cyan grow" onClick={() => onMetro(s)}>🧭 {t("Trip to here")}</Button>
        <Button className="btn ghost grow" onClick={() => onMetro()}>🗺️ {t("Metro map")}</Button>
      </div>
      <p className="small muted ext-source">{t("Times are estimates from each line's usual frequency, not a live board. Stations from OpenStreetMap.")}</p>
    </Sheet>
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
          {extra.length > 0 && <span className="tiny muted">{extra.join(" · ")}</span>}
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
          {l.toEnd ? ` · ${t("about {n} min", { n: fmtNum(l.toEnd) })}` : ""}
          {!open && l.ahead.length > 0 && ` · ${t("next: {stops}", { stops: l.ahead.slice(0, 2).map((a) => a.name).join(", ") })}`}
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
      <p className="small muted">{[t("Bus stop"), t("{n} lines", { n: fmtNum(stop.lines.length) }), dist != null ? formatDistance(dist) : ""].filter(Boolean).join(" · ")}</p>
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
      <p className="small muted">{[bus.id, bus.towards && t("Towards {station}", { station: bus.towards }), bus.kmh != null && t("{n} km/h", { n: fmtNum(Math.round(bus.kmh)) }), age != null && t("{n} s ago", { n: fmtNum(age) })].filter(Boolean).join(" · ")}</p>
      <p className="small muted ext-source">{t("Live position from IETT (Istanbul).")}</p>
    </Sheet>
  );
}

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
};

/** The Metro sheet: the lines as strips of stations, a trip planner, a short guide. */
export function MetroSheet({ city, to, onClose, onStation }: { city: City; to?: Station; onClose: () => void; onStation?: (s: Station) => void }) {
  const { pos } = useGame();
  const [net, setNet] = useState<Network | null>(null);
  const [tab, setTab] = useState<"trip" | "lines" | "guide">(to ? "trip" : "lines");
  const [dest, setDest] = useState<Station | null>(to ?? null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => void metroOf(city).then(setNet).catch(() => {}), [city]);
  const st = useMemo(() => new Map((net?.stations ?? []).map((x) => [x.id, x])), [net]);
  const lines = new Map((net?.lines ?? []).map((l) => [l.id, l]));
  const from: LatLng | null = pos ?? null;
  const trip: Trip | null = useMemo(() => (net && from && dest ? planTrip(net, from, dest) : null), [net, from?.lat, from?.lng, dest]); // eslint-disable-line react-hooks/exhaustive-deps
  const near = net && from ? nearStations(net, from, 1, 1e7)[0] : null;
  const found = q.trim().length >= 2 ? (net?.stations ?? []).filter((s) => `${s.name} ${s.en}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <Sheet title={city === "tehran" ? t("Tehran Metro") : t("Istanbul rail")} onClose={onClose} tall>
      <Tabs value={tab} onChange={setTab} tabs={[["trip", t("Trip")], ["lines", t("Lines")], ["guide", t("Guide")]]} />
      {!net && <p className="small muted">{t("Loading…")}</p>}
      {net && tab === "trip" && (
        <>
          <p className="small muted">{near ? t("From you — nearest station {station}, {d} away", { station: nameOf(near.station), d: formatDistance(near.m) }) : t("Waiting for your position…")}</p>
          <input className="input" value={dest ? nameOf(dest) : q} onChange={(e) => (setDest(null), setQ(e.target.value))} placeholder={t("Where to? A station's name")} aria-label={t("Destination station")} dir="auto" />
          {!dest && found.length > 0 && (
            <ul className="tr-found">
              {found.map((s) => (
                <li key={s.id}>
                  <button type="button" className="row" onClick={() => (setDest(s), setQ(""))}>
                    <span className="grow" dir="auto">{nameOf(s)}</span>
                    {s.lines.map((id) => lines.get(id)).filter((l): l is Line => !!l).map((l) => <LineChip key={l.id} l={l} />)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dest && from && !trip && <p className="small muted">{t("Walking there is quicker than the metro.")}</p>}
          {trip && (
            <div className="card tr-trip">
              <b>{t("About {n} min · {c}", { n: fmtNum(trip.minutes), c: trip.changes ? t("{n} changes", { n: fmtNum(trip.changes) }) : t("no changes") })}</b>
              <ol className="tr-legs">
                {trip.legs.filter((g) => g.kind === "ride" || g.m >= 30).map((g, i) =>
                  g.kind === "walk" ? (
                    <li key={i} className="small">🚶 {g.to ? t("Walk {d} to {station} ({n} min)", { d: formatDistance(g.m), station: nameOf(st.get(g.to)!), n: fmtNum(g.minutes) }) : t("Walk {d} to where you're going ({n} min)", { d: formatDistance(g.m), n: fmtNum(g.minutes) })}</li>
                  ) : (
                    <li key={i} className="small">
                      <LineChip l={lines.get(g.line)!} /> {t("{from} → {to}, {n} stops, towards {end} ({m} min, about {w} min wait)", { from: nameOf(st.get(g.from)!), to: nameOf(st.get(g.to)!), n: fmtNum(g.stops), end: nameOf(st.get(g.towards)!), m: fmtNum(g.minutes), w: fmtNum(g.wait) })}
                    </li>
                  ),
                )}
              </ol>
            </div>
          )}
        </>
      )}
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
