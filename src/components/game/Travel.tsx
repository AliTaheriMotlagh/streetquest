"use client";
// The trip planner: from home through any number of cities — so many nights in each — and back (or
// not), each leg its own way and each city its own stay, all added up for everyone travelling.
//  - the plan (lib/travel/plan.ts): a timeline — home, each leg (how, when, the price), each city (its
//    nights and stay), "+ Add a city", the way back — over a bill that stays at the bottom: the total,
//    per person, and what's still to choose. "Cheapest everywhere" fills every open leg and stay;
//  - a leg: flight, train, bus and your own car side by side (cheapest, fastest, how many; the car's
//    km, hours and fuel), then every ticket of that way from Alibaba and MrBilit in one list (the same
//    trip on both is one row with both prices), narrowed in the filters sheet, chosen with one tap;
//  - a city's stays: Jabama's villas, suites and hotels, priced for the nights and rooms needed;
//  - cities by name (Persian or English, an airport code) or on the map.
// Tickets: travelClient.ts (buses from the phone, the rest via /api/travel); every answer is kept on the
// phone (keep.ts) so a plan opens instantly and offline.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtNum, getLocale, t } from "@/lib/i18n";
import { formatDistance, type LatLng } from "@/lib/geo";
import {
  bookUrl, CITIES, cityByKey, cityHas, COMPARE, DAY_PART_KEYS, DAY_PARTS, filterStays, filterTrips, findCities, hotelLinks, isoDay, MODE_KEYS, MODES, nearestCity, STAY_KINDS, STAY_SORT_KEYS, STAY_SORTS,
  tourLink, TRAVEL_SITES, TRIP_SORT_KEYS, TRIP_SORTS, tripFacets, type City, type DayPart, type Mode, type Stay, type StayKind, type StaySort, type Trip, type TripSort,
} from "@/lib/travel";
import {
  billOf, cheapestTrip, cleanPlan, compareWays, driveOf, legsOf, MAX_NIGHTS, MAX_STOPS, MAX_TRAVELLERS, newPlan, roomsFor, stopDays, tripDays, WAYS, type Leg, type LegPick, type Plan, type StayPick, type Way,
} from "@/lib/travel/plan";
import { iranTime } from "@/lib/flights";
import { api } from "./client";
import { searchTrips, type TripAnswer } from "./travelClient";
import { fresh, keep, kept } from "./keep";
import { Sheet } from "./ui";
import { Chip, FilterBar, FilterGroup, FilterPanel, Meta, SearchField } from "./Filters";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false, loading: () => <div className="tp-map tp-map-wait" /> });

const STORE = "sq-trip";
const DAYS_AHEAD = 30;
const TRIPS_FRESH_MS = 15 * 60_000;
const STAYS_FRESH_MS = 6 * 3600_000;
const PANEL = "travel-filters";

const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
const clock = (s: string) => fmtDate(iranTime(s), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" });
const span = (min?: number) => (min == null ? "" : min < 60 ? t("{m} min", { m: fmtNum(min) }) : min % 60 ? t("{h} h {m} min", { h: fmtNum(Math.floor(min / 60)), m: fmtNum(min % 60) }) : t("{h} h", { h: fmtNum(min / 60) }));
const day = (iso: string) => fmtDate(`${iso}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const cityName = (c: City | string | null) => {
  const x = typeof c === "string" ? cityByKey(c) : c;
  return x ? (getLocale() === "fa" ? x.fa : x.en) : "";
};
const legKey = (l: Leg) => `${l.from}>${l.to}@${l.date}`;
const stayKey = (city: string, arrive: string) => `${city}@${arrive}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Saved = { plan: Plan; legs: Record<string, LegPick>; stays: Record<string, StayPick> };
type View = { kind: "plan" } | { kind: "leg"; key: string } | { kind: "stay"; i: number } | { kind: "city"; for: "home" | "add" | number };
type Answer = { data: TripAnswer | null; loading: boolean; savedAt: number; err?: string };

function load(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Saved> | null;
    const plan = cleanPlan(raw?.plan);
    return plan ? { plan, legs: raw?.legs ?? {}, stays: raw?.stays ?? {} } : null;
  } catch {
    return null;
  }
}

export function Travel({ at, onClose, initialTo }: { at: LatLng | null; onClose: () => void; initialTo?: string }) {
  const here = useMemo(() => nearestCity(at), [at]);
  const [saved, setSaved] = useState<Saved>(() => {
    const s = typeof window === "undefined" ? null : load();
    const home = here?.key ?? s?.plan.home ?? "tehran";
    // Opened on a city (its pin on the map, a product search): a trip there from here, two nights.
    if (initialTo && cityByKey(initialTo) && initialTo !== home) return { plan: { ...newPlan(home), stops: [{ city: initialTo, nights: 2 }] }, legs: {}, stays: {} };
    return s ?? { plan: newPlan(home), legs: {}, stays: {} };
  });
  const { plan } = saved;
  const [view, setView] = useState<View>(() => (initialTo && plan.stops.length ? { kind: "leg", key: legKey(legsOf(plan)[0]) } : plan.stops.length ? { kind: "plan" } : { kind: "city", for: "add" }));

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
    } catch {}
  }, [saved]);

  const legs = useMemo(() => legsOf(plan), [plan]);
  const days = useMemo(() => stopDays(plan), [plan]);

  // ---- every leg's tickets and every city's stays, fetched as the plan takes shape (kept on the phone)
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [stays, setStays] = useState<Record<string, Stay[] | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const l of legs) {
      const k = legKey(l);
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      const mine = kept<TripAnswer>(`trips:${l.from}|${l.to}|${l.date}`);
      const has = fresh(mine, TRIPS_FRESH_MS);
      setAnswers((a) => ({ ...a, [k]: { data: mine?.data ?? null, loading: !has, savedAt: mine?.at ?? 0 } }));
      if (has) continue;
      searchTrips(l.from, l.to, l.date, [...MODE_KEYS])
        .then((r) => {
          const keepOld = !r.trips.length && r.failed.length && mine?.data.trips.length;
          if (r.trips.length) keep(`trips:${l.from}|${l.to}|${l.date}`, r);
          setAnswers((a) => ({ ...a, [k]: keepOld ? { ...a[k], loading: false } : { data: r, loading: false, savedAt: 0 } }));
        })
        .catch((e: Error) => setAnswers((a) => ({ ...a, [k]: { ...a[k], loading: false, err: e.message } })));
    }
  }, [legs]);
  useEffect(() => {
    for (const s of plan.stops) {
      if (s.nights <= 0 || s.city in stays) continue;
      const mine = kept<Stay[]>(`stays:${s.city}`);
      setStays((v) => ({ ...v, [s.city]: mine?.data ?? null }));
      if (fresh(mine, STAYS_FRESH_MS)) continue;
      api<{ stays: Stay[] }>(`/api/travel?stays=${encodeURIComponent(s.city)}`).then(
        (r) => {
          if (r.stays.length) keep(`stays:${s.city}`, r.stays);
          setStays((v) => ({ ...v, [s.city]: r.stays.length || !mine?.data.length ? r.stays : mine.data }));
        },
        () => setStays((v) => ({ ...v, [s.city]: v[s.city] ?? [] })),
      );
    }
  }, [plan.stops]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- what's chosen, by leg and stay (keys survive edits that don't change them)
  const legPicks = useMemo(() => Object.fromEntries(legs.map((l) => [l.i, saved.legs[legKey(l)]])), [legs, saved.legs]);
  const stayPicks = useMemo(() => Object.fromEntries(plan.stops.map((s, i) => [i, saved.stays[stayKey(s.city, days[i].arrive)]])), [plan.stops, days, saved.stays]);
  const bill = useMemo(() => billOf(plan, legPicks, stayPicks), [plan, legPicks, stayPicks]);

  const setPlan = (f: (p: Plan) => Plan) => setSaved((s) => ({ ...s, plan: f(s.plan) }));
  const pickLeg = (l: Leg, pick: LegPick | null) => setSaved((s) => ({ ...s, legs: { ...s.legs, [legKey(l)]: pick ?? undefined } as Record<string, LegPick> }));
  const pickStay = (i: number, pick: StayPick | null) => setSaved((s) => ({ ...s, stays: { ...s.stays, [stayKey(plan.stops[i].city, days[i].arrive)]: pick ?? undefined } as Record<string, StayPick> }));
  /** Moving a leg's day: the first leg moves the whole trip; a later one changes the nights before it. */
  const setLegDate = (l: Leg, date: string) =>
    setPlan((p) => {
      if (l.date === p.start && l.from === p.home) return { ...p, start: date };
      const ds = stopDays(p), j = p.stops.findIndex((s, n) => s.city === l.from && ds[n].leave === l.date);
      if (j < 0) return p;
      const nights = p.stops[j].nights + daysBetween(l.date, date);
      return nights < 0 || nights > MAX_NIGHTS ? p : { ...p, stops: p.stops.map((s, n) => (n === j ? { ...s, nights } : s)) };
    });
  /** Cheapest everywhere: every open leg its cheapest ticket (or the car where none), every open stay its cheapest place. */
  const fillCheapest = () =>
    setSaved((s) => {
      const nl = { ...s.legs }, ns = { ...s.stays };
      for (const l of legs) {
        if (nl[legKey(l)]) continue;
        const trip = cheapestTrip(answers[legKey(l)]?.data?.trips ?? [], plan.travellers);
        if (trip) nl[legKey(l)] = { way: trip.mode, trip };
        else if (answers[legKey(l)] && !answers[legKey(l)].loading && driveOf(cityByKey(l.from), cityByKey(l.to))) nl[legKey(l)] = { way: "car" };
      }
      plan.stops.forEach((st, i) => {
        const k = stayKey(st.city, days[i].arrive);
        if (ns[k] || st.nights <= 0) return;
        const best = (stays[st.city] ?? []).filter((x) => x.price > 0 && (!x.minNights || x.minNights <= st.nights)).reduce<Stay | null>((a, b) => (!a || b.price * roomsFor(b, plan.travellers) < a.price * roomsFor(a, plan.travellers) ? b : a), null);
        if (best) ns[k] = { stay: best };
      });
      return { ...s, legs: nl, stays: ns };
    });

  // ---- the screens
  if (view.kind === "city") {
    const exclude = view.for === "home" ? null : plan.stops.at(-1)?.city ?? plan.home;
    return (
      <CityPicker
        title={view.for === "home" ? t("Where from?") : view.for === "add" ? t("Add a city") : t("Change city")}
        here={here}
        exclude={exclude ? cityByKey(exclude) : null}
        route={[plan.home, ...plan.stops.map((s) => s.city)]}
        onPick={(c) => {
          if (view.for === "home") setPlan((p) => ({ ...p, home: c.key }));
          else if (view.for === "add") setPlan((p) => ({ ...p, stops: [...p.stops, { city: c.key, nights: p.stops.length ? 1 : 2 }].slice(0, MAX_STOPS) }));
          else setPlan((p) => ({ ...p, stops: p.stops.map((s, n) => (n === view.for ? { ...s, city: c.key } : s)) }));
          setView({ kind: "plan" });
        }}
        onClose={() => (plan.stops.length ? setView({ kind: "plan" }) : onClose())}
      />
    );
  }
  if (view.kind === "leg") {
    const l = legs.find((x) => legKey(x) === view.key);
    if (l)
      return (
        <LegView
          leg={l}
          plan={plan}
          answer={answers[legKey(l)]}
          picked={legPicks[l.i]}
          minDate={l.i === 0 ? isoDay(Date.now(), 0) : days[plan.stops.findIndex((s, n) => s.city === l.from && days[n].leave === l.date)]?.arrive ?? isoDay(Date.now(), 0)}
          onDate={(d) => {
            setLegDate(l, d);
            setView({ kind: "leg", key: legKey({ ...l, date: d }) });
          }}
          onPick={(p) => (pickLeg(l, p), setView({ kind: "plan" }))}
          onBack={() => setView({ kind: "plan" })}
          onClose={onClose}
        />
      );
  }
  if (view.kind === "stay" && plan.stops[view.i]) {
    const i = view.i, s = plan.stops[i];
    return <StayView city={cityByKey(s.city)!} nights={s.nights} travellers={plan.travellers} from={days[i].arrive} stays={stays[s.city] ?? null} picked={stayPicks[i]?.stay} onPick={(st) => (pickStay(i, st ? { stay: st } : null), setView({ kind: "plan" }))} onBack={() => setView({ kind: "plan" })} onClose={onClose} />;
  }

  // ---- the plan
  const startDays = Array.from({ length: DAYS_AHEAD }, (_, n) => isoDay(Date.now(), n));
  const last = plan.stops.at(-1);
  const open = bill.open.legs + bill.open.stays;
  return (
    <Sheet title={t("Trip planner")} onClose={onClose} tall>
      <div className="tp">
        <div className="tp-controls">
          <label className="tp-ctl">
            <span>{t("Leaving")}</span>
            <select value={plan.start} onChange={(e) => setPlan((p) => ({ ...p, start: e.target.value }))}>
              {startDays.map((d, n) => <option key={d} value={d}>{n === 0 ? t("Today") : n === 1 ? t("Tomorrow") : day(d)}</option>)}
            </select>
          </label>
          <div className="tp-ctl">
            <span>{t("Travellers")}</span>
            <Stepper value={plan.travellers} min={1} max={MAX_TRAVELLERS} onChange={(n) => setPlan((p) => ({ ...p, travellers: n }))} label={t("Travellers")} />
          </div>
          <button type="button" className={`tp-ctl tp-toggle${plan.back ? " on" : ""}`} aria-pressed={plan.back} onClick={() => setPlan((p) => ({ ...p, back: !p.back }))}>
            <span>{t("Round trip")}</span>
            <i aria-hidden />
          </button>
        </div>

        <ol className="tp-line">
          <li className="tp-node home">
            <span className="tp-dot" aria-hidden>📍</span>
            <button type="button" className="tp-city" onClick={() => setView({ kind: "city", for: "home" })}>
              <b dir="auto">{cityName(plan.home)}</b>
              <small>{t("Start · {day}", { day: day(plan.start) })}</small>
            </button>
          </li>
          {plan.stops.map((s, i) => {
            const leg = legs.find((l) => l.to === s.city && l.date === days[i].arrive);
            return (
              <StopBlock
                key={`${i}${s.city}`}
                leg={leg}
                answer={leg ? answers[legKey(leg)] : undefined}
                pick={leg ? legPicks[leg.i] : undefined}
                travellers={plan.travellers}
                stop={s}
                when={days[i]}
                stay={stayPicks[i]?.stay}
                stays={stays[s.city]}
                onLeg={() => leg && setView({ kind: "leg", key: legKey(leg) })}
                onStay={() => setView({ kind: "stay", i })}
                onCity={() => setView({ kind: "city", for: i })}
                onNights={(n) => setPlan((p) => ({ ...p, stops: p.stops.map((x, k) => (k === i ? { ...x, nights: n } : x)) }))}
                onRemove={() => setPlan((p) => ({ ...p, stops: p.stops.filter((_, k) => k !== i) }))}
              />
            );
          })}
          {plan.stops.length < MAX_STOPS && (
            <li className="tp-node add">
              <span className="tp-dot" aria-hidden>＋</span>
              <button type="button" className="tp-add" onClick={() => setView({ kind: "city", for: "add" })}>
                {plan.stops.length ? t("Add another city") : t("Where to?")}
              </button>
            </li>
          )}
          {plan.back && last && last.city !== plan.home && (() => {
            const leg = legs.at(-1)!;
            return (
              <>
                <LegRow leg={leg} answer={answers[legKey(leg)]} pick={legPicks[leg.i]} travellers={plan.travellers} onOpen={() => setView({ kind: "leg", key: legKey(leg) })} />
                <li className="tp-node home">
                  <span className="tp-dot" aria-hidden>🏠</span>
                  <div className="tp-city static">
                    <b dir="auto">{cityName(plan.home)}</b>
                    <small>{t("Back · {day}", { day: day(leg.date) })}</small>
                  </div>
                </li>
              </>
            );
          })()}
        </ol>

        {legs.length > 0 && (
          <p className="tp-sum small muted">
            {t("{legs} legs · {nights} nights · {people}", { legs: fmtNum(legs.length), nights: fmtNum(tripDays(plan)), people: t("{n} travellers", { n: fmtNum(plan.travellers) }) })}
          </p>
        )}
      </div>

      {legs.length > 0 && (
        <div className="tp-bill" role="status">
          <div className="grow">
            <b>{bill.total ? toman(bill.total) : t("Nothing chosen yet")}</b>
            <small>
              {bill.total > 0 && plan.travellers > 1 ? `${t("{n} per person", { n: toman(bill.perPerson) })} · ` : ""}
              {open ? t("{n} still to choose", { n: fmtNum(open) }) : t("Everything chosen")}
            </small>
            {bill.total > 0 && (
              <Meta className="tp-bill-parts" parts={[bill.tickets > 0 && `🎫 ${fmtNum(bill.tickets)}`, bill.fuel > 0 && `⛽ ${fmtNum(bill.fuel)}`, bill.stays > 0 && `🏨 ${fmtNum(bill.stays)}`]} />
            )}
          </div>
          {open > 0 && (
            <button type="button" className="btn small tp-fill" onClick={fillCheapest}>
              {t("Cheapest everywhere")}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** − n +, at least 44 px each. */
function Stepper({ value, min, max, onChange, label, unit }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; unit?: (n: number) => string }) {
  return (
    <div className="tp-step" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t("Less")}>−</button>
      <output aria-live="polite">{unit ? unit(value) : fmtNum(value)}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t("More")}>+</button>
    </div>
  );
}

/** A leg on the timeline: what was chosen (way, times, price for everyone), or the best on offer. */
function LegRow({ leg, answer, pick, travellers, onOpen }: { leg: Leg; answer?: Answer; pick?: LegPick; travellers: number; onOpen: () => void }) {
  const from = cityByKey(leg.from), to = cityByKey(leg.to);
  const best = cheapestTrip(answer?.data?.trips ?? [], travellers);
  const drive = driveOf(from, to, travellers);
  let body;
  if (pick?.way === "car" && drive) body = (<><b>{WAYS.car.emoji} {t("Own car")}</b><small>{t("{km} km · {time} · fuel {fuel}", { km: fmtNum(drive.km), time: span(drive.minutes), fuel: toman(drive.fuel) })}</small></>);
  else if (pick && pick.way !== "car") body = (<><b>{WAYS[pick.way].emoji} {clock(pick.trip.depart)}{pick.trip.arrive ? ` → ${clock(pick.trip.arrive)}` : ""} · <bdi>{pick.trip.company}</bdi></b><small>{toman(pick.trip.price * travellers)}{travellers > 1 ? ` · ${t("{n} each", { n: fmtNum(pick.trip.price) })}` : ""}</small></>);
  else body = (<><b className="tp-choose">{t("Choose how to get there")}</b><small>{answer?.loading ? t("Looking for tickets…") : best ? t("from {price} · {way}", { price: toman(best.price), way: t(WAYS[best.mode].label) }) : drive ? t("No tickets that day — drive {km} km", { km: fmtNum(drive.km) }) : t("No tickets that day")}</small></>);
  return (
    <li className={`tp-leg${pick ? " set" : ""}`}>
      <button type="button" className="tp-leg-btn" onClick={onOpen}>
        <span className="tp-leg-day">{day(leg.date)}</span>
        <span className="tp-leg-body">{body}</span>
        <span className="tp-go" aria-hidden>›</span>
      </button>
    </li>
  );
}

function StopBlock({ leg, answer, pick, travellers, stop, when, stay, stays, onLeg, onStay, onCity, onNights, onRemove }: {
  leg?: Leg; answer?: Answer; pick?: LegPick; travellers: number; stop: { city: string; nights: number }; when: { arrive: string; leave: string }; stay?: Stay; stays?: Stay[] | null;
  onLeg: () => void; onStay: () => void; onCity: () => void; onNights: (n: number) => void; onRemove: () => void;
}) {
  const cheapest = (stays ?? []).reduce<number>((m, s) => (s.price > 0 && (!m || s.price < m) ? s.price : m), 0);
  return (
    <>
      {leg && <LegRow leg={leg} answer={answer} pick={pick} travellers={travellers} onOpen={onLeg} />}
      <li className="tp-node stop">
        <span className="tp-dot" aria-hidden>🏙️</span>
        <div className="tp-stop">
          <div className="tp-stop-head">
            <button type="button" className="tp-city" onClick={onCity}>
              <b dir="auto">{cityName(stop.city)}</b>
              <small>{stop.nights ? t("{from} → {to}", { from: day(when.arrive), to: day(when.leave) }) : t("Passing through · {day}", { day: day(when.arrive) })}</small>
            </button>
            <button type="button" className="tp-x" onClick={onRemove} aria-label={t("Remove {city}", { city: cityName(stop.city) })}>✕</button>
          </div>
          <div className="tp-stop-row">
            <Stepper value={stop.nights} min={0} max={MAX_NIGHTS} onChange={onNights} label={t("Nights")} unit={(n) => t("{n} nights", { n: fmtNum(n) })} />
          </div>
          {stop.nights > 0 && (
            <button type="button" className={`tp-stay${stay ? " set" : ""}`} onClick={onStay}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {stay?.photo ? <img src={stay.photo} alt="" loading="lazy" /> : <span className="tp-stay-ic" aria-hidden>🏨</span>}
              <span className="grow">
                <b dir="auto">{stay ? stay.name : t("Choose a place to stay")}</b>
                <small>
                  {stay
                    ? t("{n} toman × {nights} nights × {rooms}", { n: fmtNum(stay.price), nights: fmtNum(stop.nights), rooms: fmtNum(roomsFor(stay, travellers)) })
                    : stays === null || stays === undefined
                      ? t("Looking for places…")
                      : cheapest
                        ? t("from {price} a night · {n} places", { price: toman(cheapest), n: fmtNum(stays.length) })
                        : t("No places to stay listed here yet")}
                </small>
              </span>
              <span className="tp-go" aria-hidden>›</span>
            </button>
          )}
        </div>
      </li>
    </>
  );
}

// ---------------------------------------------------------------- one leg: every way, every ticket
function LegView({ leg, plan, answer, picked, minDate, onDate, onPick, onBack, onClose }: { leg: Leg; plan: Plan; answer?: Answer; picked?: LegPick; minDate: string; onDate: (d: string) => void; onPick: (p: LegPick | null) => void; onBack: () => void; onClose: () => void }) {
  const from = cityByKey(leg.from)!, to = cityByKey(leg.to)!;
  const trips = useMemo(() => answer?.data?.trips ?? [], [answer]);
  const none = answer?.data?.none ?? [];
  const ways = useMemo(() => compareWays(trips, from, to, plan.travellers, none), [trips, from, to, plan.travellers, none]);
  const firstWay = (picked?.way ?? ways.filter((w) => w.way !== "car" && w.n).sort((a, b) => (a.cheapest?.price ?? 0) - (b.cheapest?.price ?? 0))[0]?.way ?? "bus") as Way;
  const [way, setWay] = useState<Way>(firstWay);
  useEffect(() => {
    if (!picked && answer?.data) setWay(firstWay);
  }, [answer?.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sort, setSort] = useState<TripSort>("cheap");
  const [parts, setParts] = useState<DayPart[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [max, setMax] = useState(0);
  const [refundable, setRefundable] = useState(false);
  const [direct, setDirect] = useState(false);
  const [words, setWords] = useState("");
  const [open, setOpen] = useState(false);
  const mode = way === "car" ? null : way;
  const modeTrips = useMemo(() => trips.filter((x) => x.mode === mode), [trips, mode]);
  const shown = useMemo(() => (mode ? filterTrips(trips, { modes: [mode], parts, companies, max, refundable, seatsOnly: true, direct, q: words, sort }).filter((x) => x.seats == null || x.seats >= plan.travellers) : []), [trips, mode, parts, companies, max, refundable, direct, words, sort, plan.travellers]);
  const facets = useMemo(() => tripFacets(modeTrips), [modeTrips]);
  const caps = useMemo(() => priceCaps(modeTrips.map((x) => x.price)), [modeTrips]);
  const nFilters = parts.length + companies.length + (max ? 1 : 0) + (refundable ? 1 : 0) + (direct ? 1 : 0);
  const clear = () => (setParts([]), setCompanies([]), setMax(0), setRefundable(false), setDirect(false));
  const dates = Array.from({ length: 21 }, (_, n) => addDays(minDate, n));
  const drive = driveOf(from, to, plan.travellers);
  const pickedId = picked && picked.way !== "car" ? picked.trip.id : null;
  // The chosen day's chip in view (it can sit past the screen's edge).
  const daysRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the chips scroll (scrollIntoView would move the sheet and the page too).
    const box = daysRef.current, on = box?.querySelector<HTMLElement>(".on");
    if (!box || !on) return;
    const a = box.getBoundingClientRect(), b = on.getBoundingClientRect();
    box.scrollLeft += b.left + b.width / 2 - (a.left + a.width / 2);
  }, [leg.date]);

  return (
    <Sheet title={`${cityName(from)} → ${cityName(to)}`} onBack={onBack} onClose={onClose} tall>
      <div className="tv-days" role="tablist" aria-label={t("Day")} ref={daysRef}>
        {dates.map((d) => (
          <button key={d} role="tab" aria-selected={d === leg.date} className={d === leg.date ? "on" : ""} onClick={() => d !== leg.date && onDate(d)}>{day(d)}</button>
        ))}
      </div>

      <div className="tp-ways" role="tablist" aria-label={t("How")}>
        {ways.map((w) => (
          <button key={w.way} role="tab" aria-selected={way === w.way} className={`tp-way${way === w.way ? " on" : ""}`} disabled={w.none || (w.way !== "car" && !answer?.loading && !w.n)} onClick={() => setWay(w.way)}>
            <span className="tp-way-ic" aria-hidden>{WAYS[w.way].emoji}</span>
            <b>{t(WAYS[w.way].label)}</b>
            {w.way === "car" ? (
              w.drive ? (<><small>{toman(w.drive.fuel)}</small><small className="muted">⏱ {span(w.drive.minutes)}</small></>) : <small className="muted">{t("No route")}</small>
            ) : w.none ? (
              <small className="muted">{t("No route")}</small>
            ) : answer?.loading && !w.n ? (
              <small className="muted tp-pulse">{t("Looking…")}</small>
            ) : !w.n ? (
              <small className="muted">{t("None that day")}</small>
            ) : (
              <>
                <small>{t("from {price}", { price: fmtNum(w.cheapest!.price) })}</small>
                <small className="muted">{w.fastest?.minutes != null ? `⏱ ${span(w.fastest.minutes)}` : t("{n} options", { n: fmtNum(w.n) })}</small>
              </>
            )}
          </button>
        ))}
      </div>

      {way === "car" ? (
        drive ? (
          <div className="tp-drive">
            <Meta parts={[`🛣️ ${t("{km} km", { km: fmtNum(drive.km) })}`, `⏱ ${span(drive.minutes)}`, `⛽ ${t("{n} litres", { n: fmtNum(drive.litres * drive.cars) })}`, drive.cars > 1 && t("{n} cars", { n: fmtNum(drive.cars) })]} />
            <p className="small muted">{t("Fuel at {price} a litre; tolls and food not counted. Road distance is estimated.", { price: toman(3000) })}</p>
            <div className="row">
              <button type="button" className={`btn grow${picked?.way === "car" ? " green" : ""}`} onClick={() => onPick({ way: "car" })}>{picked?.way === "car" ? t("Chosen ✓") : t("Drive · {fuel}", { fuel: toman(drive.fuel) })}</button>
              <a className="btn ghost" href={`https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`} target="_blank" rel="noreferrer noopener">{t("Route")} ↗</a>
            </div>
          </div>
        ) : (
          <p className="muted small tv-empty">{t("No route")}</p>
        )
      ) : (
        <>
          <div className="tp-tools">
            <SearchField value={words} onChange={setWords} placeholder={t("Airline, company, train number…")} />
            <FilterBar count={nFilters} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
              <select className="fx-sort" value={sort} onChange={(e) => setSort(e.target.value as TripSort)} aria-label={t("Sort")}>
                {TRIP_SORT_KEYS.map((k) => <option key={k} value={k}>{t(TRIP_SORTS[k])}</option>)}
              </select>
              {DAY_PART_KEYS.map((p) => <Chip key={p} on={parts.includes(p)} emoji={DAY_PARTS[p].emoji} label={t(DAY_PARTS[p].label)} onClick={() => setParts((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))} />)}
            </FilterBar>
          </div>
          <FilterPanel id={PANEL} open={open} onClear={nFilters ? clear : undefined} onDone={() => setOpen(false)} results={t("Show {n} results", { n: fmtNum(shown.length) })}>
            <FilterGroup title={t("Time of day")}>
              {DAY_PART_KEYS.map((p) => <Chip key={p} on={parts.includes(p)} emoji={DAY_PARTS[p].emoji} label={t(DAY_PARTS[p].label)} onClick={() => setParts((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))} />)}
            </FilterGroup>
            {caps.length > 0 && (
              <FilterGroup title={t("Price")}>
                <Chip on={!max} label={t("Any price")} onClick={() => setMax(0)} />
                {caps.map((c) => <Chip key={c} on={max === c} label={t("Under {n}", { n: toman(c) })} onClick={() => setMax(c)} />)}
              </FilterGroup>
            )}
            <FilterGroup title={t("Ticket")}>
              <Chip on={refundable} label={t("Refundable")} onClick={() => setRefundable(!refundable)} />
              {mode === "flight" && <Chip on={direct} label={t("Direct only")} onClick={() => setDirect(!direct)} />}
            </FilterGroup>
            {facets.companies.length > 1 && (
              <FilterGroup title={t("Company")}>
                {facets.companies.slice(0, 30).map((c) => <Chip key={c.name} on={companies.includes(c.name)} label={c.name} n={c.n} onClick={() => setCompanies((v) => (v.includes(c.name) ? v.filter((x) => x !== c.name) : [...v, c.name]))} />)}
              </FilterGroup>
            )}
          </FilterPanel>

          {answer?.err && <p className="small tv-err">{answer.err}</p>}
          {answer?.loading && !trips.length && <TripSkeleton />}
          {!answer?.loading && !shown.length && <p className="muted small tv-empty">{modeTrips.length ? t("Nothing matches — loosen a filter") : t("No tickets that day — try another day")}</p>}
          <div className="tv-list" aria-busy={!!answer?.loading}>
            {shown.slice(0, 120).map((x) => <TripRow key={x.id} trip={x} travellers={plan.travellers} chosen={x.id === pickedId} onChoose={() => onPick(x.id === pickedId ? null : { way: x.mode, trip: x })} />)}
          </div>
          <div className="tv-compare-sites">
            <span className="small muted">{t("Compare on")}</span>
            {COMPARE[mode!].map((s) => (
              <a key={s} className="chip small" href={bookUrl(s, mode!, { from, to, date: leg.date })} target="_blank" rel="noreferrer noopener" style={{ ["--site" as string]: TRAVEL_SITES[s].color }}>{t(TRAVEL_SITES[s].name)} ↗</a>
            ))}
            <a className="chip small" href={tourLink(to)} target="_blank" rel="noreferrer noopener">🧳 {t("Tours to {city}", { city: cityName(to) })} ↗</a>
          </div>
          {answer?.data?.failed.length ? <p className="tiny muted">{t("Some sites didn't answer: {list}", { list: answer.data.failed.map((f) => t(TRAVEL_SITES[f.split(":")[0] as keyof typeof TRAVEL_SITES]?.name ?? f)).join("، ") })}</p> : null}
        </>
      )}
    </Sheet>
  );
}

/** Three round price caps from the list's spread (a quarter, half, three quarters of it under each). */
function priceCaps(prices: number[]) {
  const ps = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (ps.length < 4) return [];
  const nice = (n: number) => {
    const mag = 10 ** Math.floor(Math.log10(n));
    return Math.round(([1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => s * mag >= n) ?? 10) * mag);
  };
  return [...new Set([0.25, 0.5, 0.75].map((q) => nice(ps[Math.floor(ps.length * q)])))];
}

function TripRow({ trip: x, travellers, chosen, onChoose }: { trip: Trip; travellers: number; chosen: boolean; onChoose: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <article className={`tv-trip${chosen ? " chosen" : ""}`}>
      <button className="tv-trip-main" onClick={() => setMore(!more)} aria-expanded={more}>
        <div className="tv-times">
          <b>{clock(x.depart)}</b>
          <span className="tv-line" aria-hidden><i>{MODES[x.mode].emoji}</i></span>
          <b>{x.arrive ? clock(x.arrive) : "—"}</b>
          <small className="muted">{span(x.minutes)}</small>
        </div>
        <div className="tv-who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {x.logo ? <img src={x.logo} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} /> : <span aria-hidden>{MODES[x.mode].emoji}</span>}
          <div className="grow">
            <b dir="auto">{x.company}</b>
            <Meta parts={[x.number && `${x.mode === "train" ? t("Train") : ""} ${x.number}`.trim(), x.klass, x.charter && t("Charter")]} />
          </div>
          <div className="tv-price">
            {x.was && <s className="tiny muted">{fmtNum(x.was)}</s>}
            <b>{toman(x.price)}</b>
            <small className={(x.seats ?? 9) < 5 ? "tv-few" : "muted"}>{x.seats != null ? t("{n} seats", { n: fmtNum(x.seats) }) : ""}</small>
          </div>
        </div>
      </button>
      {more && (
        <div className="tv-more small">
          <Meta parts={[x.fromPlace && `🛫 ${x.fromPlace}`, x.toPlace && `🛬 ${x.toPlace}`]} />
          <Meta parts={[x.vehicle && (x.mode === "train" ? t("{n}-bed compartment", { n: x.vehicle }) : x.vehicle), x.refundable === true && t("Refundable"), x.refundable === false && t("Non-refundable"), ...(x.features ?? [])]} />
        </div>
      )}
      <div className="tv-offers">
        <button type="button" className={`btn small tp-choose-btn${chosen ? " green" : ""}`} onClick={onChoose}>
          {chosen ? t("Chosen ✓") : travellers > 1 ? t("Choose · {n}", { n: toman(x.price * travellers) }) : t("Choose")}
        </button>
        {x.offers.map((o, i) => (
          <a key={o.source} className={`tv-offer ${i === 0 ? "best" : ""}`} href={o.url} target="_blank" rel="noreferrer noopener" style={{ ["--site" as string]: TRAVEL_SITES[o.source].color }}>
            {t(TRAVEL_SITES[o.source].name)} · {fmtNum(o.price)} ↗
          </a>
        ))}
      </div>
    </article>
  );
}

function TripSkeleton() {
  return (
    <div className="tv-list" aria-hidden>
      {[0, 1, 2, 3].map((i) => <div key={i} className="tv-trip tv-skel" />)}
    </div>
  );
}

// ---------------------------------------------------------------- a city's stays
function StayView({ city, nights, travellers, from, stays, picked, onPick, onBack, onClose }: { city: City; nights: number; travellers: number; from: string; stays: Stay[] | null; picked?: Stay; onPick: (s: Stay | null) => void; onBack: () => void; onClose: () => void }) {
  const [kinds, setKinds] = useState<StayKind[]>([]);
  const [instant, setInstant] = useState(false);
  const [max, setMax] = useState(0);
  const [sort, setSort] = useState<StaySort>("cheap");
  const [words, setWords] = useState("");
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => filterStays(stays ?? [], { kinds, guests: travellers > 2 ? travellers : 0, instant, max, q: words, sort }).filter((s) => !s.minNights || s.minNights <= nights), [stays, kinds, travellers, instant, max, words, sort, nights]);
  const caps = useMemo(() => priceCaps((stays ?? []).map((s) => s.price)), [stays]);
  const nFilters = kinds.length + (instant ? 1 : 0) + (max ? 1 : 0);
  return (
    <Sheet title={t("Stay in {city}", { city: cityName(city) })} onBack={onBack} onClose={onClose} tall>
      <p className="small muted tp-sub">{t("{nights} nights from {day} · {people}", { nights: fmtNum(nights), day: day(from), people: t("{n} travellers", { n: fmtNum(travellers) }) })}</p>
      <div className="tp-tools">
        <SearchField value={words} onChange={setWords} placeholder={t("Name of the place")} />
        <FilterBar count={nFilters} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
          <select className="fx-sort" value={sort} onChange={(e) => setSort(e.target.value as StaySort)} aria-label={t("Sort")}>
            {STAY_SORT_KEYS.map((k) => <option key={k} value={k}>{t(STAY_SORTS[k])}</option>)}
          </select>
          {(Object.keys(STAY_KINDS) as StayKind[]).filter((k) => stays?.some((s) => s.kind === k)).map((k) => <Chip key={k} on={kinds.includes(k)} emoji={STAY_KINDS[k].emoji} label={t(STAY_KINDS[k].label)} onClick={() => setKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))} />)}
        </FilterBar>
      </div>
      <FilterPanel id={PANEL} open={open} onClear={nFilters ? () => (setKinds([]), setInstant(false), setMax(0)) : undefined} onDone={() => setOpen(false)} results={t("Show {n} results", { n: fmtNum(shown.length) })}>
        <FilterGroup title={t("Kind")}>
          {(Object.keys(STAY_KINDS) as StayKind[]).filter((k) => stays?.some((s) => s.kind === k)).map((k) => <Chip key={k} on={kinds.includes(k)} emoji={STAY_KINDS[k].emoji} label={t(STAY_KINDS[k].label)} onClick={() => setKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))} />)}
        </FilterGroup>
        {caps.length > 0 && (
          <FilterGroup title={t("Price a night")}>
            <Chip on={!max} label={t("Any price")} onClick={() => setMax(0)} />
            {caps.map((c) => <Chip key={c} on={max === c} label={t("Under {n}", { n: toman(c) })} onClick={() => setMax(c)} />)}
          </FilterGroup>
        )}
        <FilterGroup title={t("Booking")}>
          <Chip on={instant} emoji="⚡" label={t("Instant booking")} onClick={() => setInstant(!instant)} />
        </FilterGroup>
      </FilterPanel>

      {!stays && <TripSkeleton />}
      {stays && !shown.length && <p className="muted small tv-empty">{stays.length ? t("Nothing matches — loosen a filter") : t("No places to stay listed here yet")}</p>}
      <div className="tv-stays">
        {shown.slice(0, 90).map((s) => {
          const rooms = roomsFor(s, travellers), chosen = picked?.id === s.id;
          return (
            <article key={s.id} className={`tv-stay${chosen ? " chosen" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photo} alt="" loading="lazy" />
              <div className="tv-stay-body">
                <b dir="auto">{s.name}</b>
                <Meta parts={[`${STAY_KINDS[s.kind].emoji} ${t(STAY_KINDS[s.kind].label)}`, s.rating && `★ ${fmtNum(s.rating)}${s.reviews ? ` (${fmtNum(s.reviews)})` : ""}`, s.capacity && t("{n} guests", { n: fmtNum(s.capacity) }), s.dist != null && formatDistance(s.dist), s.instant && `⚡ ${t("Instant")}`]} />
                <div className="tv-price">
                  <b>{toman(s.price)}</b> <small className="muted">{t("a night")}</small>
                  <small className="muted">{t("{n} for your stay", { n: toman(s.price * nights * rooms) })}{rooms > 1 ? ` · ${t("{n} units", { n: fmtNum(rooms) })}` : ""}</small>
                </div>
                <div className="row">
                  <button type="button" className={`btn small grow${chosen ? " green" : ""}`} onClick={() => onPick(chosen ? null : s)}>{chosen ? t("Chosen ✓") : t("Choose")}</button>
                  <a className="btn small ghost" href={s.url} target="_blank" rel="noreferrer noopener">{t("Jabama")} ↗</a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="tv-compare-sites">
        <span className="small muted">{t("More hotels on")}</span>
        {hotelLinks(city).map((l) => (
          <a key={l.site} className="chip small" href={l.url} target="_blank" rel="noreferrer noopener" style={{ ["--site" as string]: TRAVEL_SITES[l.site].color }}>{t(TRAVEL_SITES[l.site].name)} ↗</a>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- picking a city: by name or on the map
function CityPicker({ title, here, exclude, route, onPick, onClose }: { title: string; here: City | null; exclude: City | null; route: string[]; onPick: (c: City) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [map, setMap] = useState(false);
  const list = useMemo(() => findCities(q, 40).filter((c) => c.key !== exclude?.key && (q || c.key !== here?.key)), [q, exclude?.key, here?.key]);
  const ways = (c: City) => MODE_KEYS.filter((m: Mode) => cityHas(c, m)).map((m) => MODES[m].emoji).join(" ");
  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="fx-seg tp-seg" role="tablist" aria-label={title}>
        <button type="button" role="tab" aria-selected={!map} className={!map ? "on" : ""} onClick={() => setMap(false)}>{t("List")}</button>
        <button type="button" role="tab" aria-selected={map} className={map ? "on" : ""} onClick={() => setMap(true)}>{t("Map")}</button>
      </div>
      {map ? (
        <>
          <CityMap route={route} here={here?.key ?? null} onPick={(c) => c.key !== exclude?.key && onPick(c)} />
          <p className="tiny muted">{t("Tap a city to pick it · gold: popular · blue: in your trip")}</p>
        </>
      ) : (
        <>
          <SearchField value={q} onChange={setQ} placeholder={t("City, province or airport code")} />
          {!q && here && here.key !== exclude?.key && (
            <button className="tv-pick near" onClick={() => onPick(here)}>
              <span aria-hidden>📍</span>
              <b className="grow" dir="auto">{cityName(here)} <small className="muted">· {t("Near you")}</small></b>
              <span className="tv-ways">{ways(here)}</span>
            </button>
          )}
          {!q && <p className="tiny muted tv-pick-head">{t("Popular")}</p>}
          <div className="tv-picks">
            {list.map((c) => (
              <button key={c.key} className="tv-pick" onClick={() => onPick(c)}>
                <b className="grow" dir="auto">{cityName(c)} {c.province && <small className="muted">· {c.province}</small>}</b>
                <span className="tv-ways" title={ways(c)}>{ways(c)}</span>
              </button>
            ))}
            {!list.length && <p className="muted small">{t("No city by that name")}</p>}
          </div>
          {!q && <p className="tiny muted">{t("{n} cities with tickets", { n: fmtNum(CITIES.length) })}</p>}
        </>
      )}
    </Sheet>
  );
}
