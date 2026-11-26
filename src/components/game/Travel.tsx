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
import { S } from "@/lib/settings";
import {
  bookUrl, CITIES, cityByKey, cityHas, COMPARE, POPULAR, DAY_PART_KEYS, DAY_PARTS, filterStays, filterTrips, findCities, hotelLinks, isoDay, AMENITIES, MODE_KEYS, MODES, nearestCity, STAY_KINDS, STAY_SORT_KEYS, STAY_SORTS,
  tourLink, TRAVEL_SITES, TRIP_SORT_KEYS, TRIP_SORTS, tripFacets, type City, type DayPart, type Mode, type Amenity, type Stay, type StayKind, type StaySort, type Trip, type TripSort,
} from "@/lib/travel";
import {
  billOf, cheapestTrip, cleanPlan, compareWays, driveOf, itinerary, legsOf, MAX_NIGHTS, MAX_STOPS, MAX_TRAVELLERS, newPlan, roomsFor, stopDays, tripDays, WAYS, type Leg, type LegPick, type Plan, type StayPick, type Way,
} from "@/lib/travel/plan";
import { iranTime } from "@/lib/flights";
import { api } from "./client";
import { searchTrips, type TripAnswer } from "./travelClient";
import { fresh, keep, kept } from "./keep";
import { Sheet } from "./ui";
import { useUrlParam } from "../useUrlParam";
import { AdSlot } from "../AdSlot";
import { bool, listOf, num, oneOf, text } from "@/lib/urlState";
import { Chip, FilterBar, FilterGroup, FilterPanel, Meta, SearchField, SortMenu } from "./Filters";
import { ACT_KINDS, activitiesIn, activityUrl, MOOD_KEYS, MOODS, moodOf, type ActKind, type Mood } from "@/lib/travel/activities";
import type { ActPick } from "@/lib/travel/plan";
import { cityExperiencesUrl, experienceUrl, jabamaCity, matchExperience, type Experience } from "@/lib/travel/experiences";
import { LeaveLink } from "./LeaveGuard";
import { Gallery } from "./Gallery";
import { createPortal } from "react-dom";
import { pushBack } from "./backStack";
import { cellOf, cheapestDay, nextAvailable, shortToman, windowDays, type DayCell } from "@/lib/travel/calendar";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false, loading: () => <div className="tp-map tp-map-wait" /> });

const STORE = "sq-trip";
const DAYS_AHEAD = 30;
const TRIPS_FRESH_MS = 15 * 60_000;
const STAYS_FRESH_MS = 6 * 3600_000;
/** Kept stays' key (v2: hotels joined the list — older copies have none). */
const STAYS_KEPT = "stays2:";
const STAYS_PAGE = 30;
const PANEL = "travel-filters";

const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
/** A price in a few characters for tight spots: 1.9M, 850K (toman). */
const short = (n: number) => (n >= 1e6 ? t("{n}M", { n: fmtNum(Math.round(n / 1e5) / 10) }) : t("{n}K", { n: fmtNum(Math.round(n / 1000)) }));
const clock = (s: string) => fmtDate(iranTime(s), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" });
/** A trip's length; "about …" when it's an estimate (buses: no arrival time on the sites). */
const tripSpan = (x: { minutes?: number; about?: boolean }) => (x.minutes == null ? "" : x.about ? t("about {time}", { time: span(x.minutes) }) : span(x.minutes));
const span = (min?: number) => (min == null ? "" : min < 60 ? t("{m} min", { m: fmtNum(min) }) : min % 60 ? t("{h} h {m} min", { h: fmtNum(Math.floor(min / 60)), m: fmtNum(min % 60) }) : t("{h} h", { h: fmtNum(min / 60) }));
const day = (iso: string) => fmtDate(`${iso}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const cityName = (c: City | string | null) => {
  const x = typeof c === "string" ? cityByKey(c) : c;
  return x ? (getLocale() === "fa" ? x.fa : x.en).replace(/_/g, " ") : "";
};
/** From → to, pointing the way the line reads (right to left in Persian). */
const arrow = () => (getLocale() === "fa" ? "←" : "→");
const legKey = (l: Leg) => `${l.from}>${l.to}@${l.date}`;
const stayKey = (city: string, arrive: string) => `${city}@${arrive}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Saved = { plan: Plan; legs: Record<string, LegPick>; stays: Record<string, StayPick> };
type View = { kind: "plan" } | { kind: "leg"; key: string } | { kind: "stay"; i: number } | { kind: "acts"; i: number } | { kind: "city"; for: "home" | "add" | number };
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
      const mine = kept<Stay[]>(`${STAYS_KEPT}${s.city}`);
      setStays((v) => ({ ...v, [s.city]: mine?.data ?? null }));
      if (fresh(mine, STAYS_FRESH_MS)) continue;
      void loadStays(s.city).then((r) => setStays((v) => ({ ...v, [s.city]: r })));
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
        first={view.for === "add" && !plan.stops.length}
        from={plan.home}
        onFrom={() => setView({ kind: "city", for: "home" })}
        title={view.for === "home" ? t("Where from?") : view.for === "add" ? (plan.stops.length ? t("Add a city") : t("Trip planner")) : t("Change city")}
        here={here}
        exclude={exclude ? cityByKey(exclude) : null}
        route={[plan.home, ...plan.stops.map((s) => s.city)]}
        onPick={(c) => {
          if (view.for === "home") setPlan((p) => ({ ...p, home: c.key }));
          else if (view.for === "add") setPlan((p) => ({ ...p, stops: [...p.stops, { city: c.key, nights: p.stops.length ? 1 : 2 }].slice(0, MAX_STOPS) }));
          else setPlan((p) => ({ ...p, stops: p.stops.map((s, n) => (n === view.for ? { ...s, city: c.key } : s)) }));
          // A new "from" before anywhere's picked: back to choosing where to.
          setView(view.for === "home" && !plan.stops.length ? { kind: "city", for: "add" } : { kind: "plan" });
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
  if (view.kind === "acts" && plan.stops[view.i]) {
    const s = plan.stops[view.i];
    return (
      <ActsView
        city={s.city}
        travellers={plan.travellers}
        picked={(plan.acts ?? []).filter((a) => a.city === s.city)}
        onChange={(list) => setPlan((p) => ({ ...p, acts: [...(p.acts ?? []).filter((a) => a.city !== s.city), ...list] }))}
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
          {Object.values(legPicks).some((p) => p?.way === "car") && (
            <button type="button" className={`tp-ctl tp-toggle${plan.quota ? " on" : ""}`} aria-pressed={!!plan.quota} onClick={() => setPlan((p) => ({ ...p, quota: !p.quota }))} title={t("Off: every litre at {n} toman, the price beyond the quota", { n: fmtNum(S.fuelToman) })}>
              <span>⛽ {t("My fuel card still has quota")}</span>
              <i aria-hidden />
            </button>
          )}
        </div>

        {legs.length > 0 && (
          <TripGlance plan={plan} legs={legs} days={days} answers={answers} legPicks={legPicks} stayPicks={stayPicks} bill={bill} onLeg={(l) => setView({ kind: "leg", key: legKey(l) })} onStay={(i) => setView({ kind: "stay", i })} />
        )}

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
                quota={plan.quota}
                stop={s}
                when={days[i]}
                stay={stayPicks[i]?.stay}
                stays={stays[s.city]}
                onLeg={() => leg && setView({ kind: "leg", key: legKey(leg) })}
                onStay={() => setView({ kind: "stay", i })}
                acts={(plan.acts ?? []).filter((a) => a.city === s.city)}
                onActs={() => setView({ kind: "acts", i })}
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
                <LegRow leg={leg} answer={answers[legKey(leg)]} pick={legPicks[leg.i]} travellers={plan.travellers} quota={plan.quota} onOpen={() => setView({ kind: "leg", key: legKey(leg) })} />
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
              <Meta className="tp-bill-parts" parts={[bill.tickets > 0 && `🎫 ${fmtNum(bill.tickets)}`, bill.fuel > 0 && `⛽ ${fmtNum(bill.fuel)}`, bill.stays > 0 && `🏨 ${fmtNum(bill.stays)}`, bill.acts > 0 && `🎟️ ${fmtNum(bill.acts)}`]} />
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

// ---------------------------------------------------------------- the trip at a glance
/** A leg's way, time and price for everyone: the one chosen, else the cheapest on offer (faded). */
function legLook(l: Leg, pick: LegPick | undefined, answer: Answer | undefined, travellers: number, quota = false) {
  const drive = driveOf(cityByKey(l.from), cityByKey(l.to), travellers, quota);
  if (pick?.way === "car") return { set: true, emoji: WAYS.car.emoji, minutes: drive?.minutes, price: drive?.fuel ?? 0, depart: undefined as string | undefined };
  if (pick) return { set: true, emoji: WAYS[pick.way].emoji, minutes: pick.trip.minutes, about: pick.trip.about, price: pick.trip.price * travellers, depart: pick.trip.depart };
  const best = cheapestTrip(answer?.data?.trips ?? [], travellers);
  if (best) return { set: false, emoji: WAYS[best.mode].emoji, minutes: best.minutes, about: best.about, price: best.price * travellers, depart: undefined };
  return { set: false, emoji: drive ? WAYS.car.emoji : "❔", minutes: drive?.minutes, price: drive?.fuel ?? 0, depart: undefined };
}

/**
 * The whole trip in one look: the route as a line (each city with its dates, nights and stay; each
 * leg with how, how long and how much — solid once chosen, dashed while open), the cost split into
 * tickets / fuel / stays, then the trip day by day or on the map. Every piece opens its own screen.
 */
function TripGlance({ plan, legs, days, answers, legPicks, stayPicks, bill, onLeg, onStay }: {
  plan: Plan; legs: Leg[]; days: { arrive: string; leave: string }[]; answers: Record<string, Answer>; legPicks: Record<number, LegPick | undefined>; stayPicks: Record<number, StayPick | undefined>;
  bill: ReturnType<typeof billOf>; onLeg: (l: Leg) => void; onStay: (i: number) => void;
}) {
  const [tab, setTab] = useState<"line" | "days" | "map">("line");
  const diary = useMemo(() => itinerary(plan, legPicks, stayPicks), [plan, legPicks, stayPicks]);
  const parts = [
    { k: "tickets", n: bill.tickets, label: t("Tickets"), emoji: "🎫" },
    { k: "fuel", n: bill.fuel, label: t("Fuel"), emoji: "⛽" },
    { k: "stays", n: bill.stays, label: t("Stays"), emoji: "🏨" },
  ].filter((x) => x.n > 0);
  const seg = (l: Leg) => {
    const x = legLook(l, legPicks[l.i], answers[legKey(l)], plan.travellers, !!plan.quota);
    return (
      <li key={`seg${l.i}`} className={`tg-seg${x.set ? " set" : ""}`}>
        <button type="button" onClick={() => onLeg(l)} aria-label={`${cityName(l.from)} ${arrow()} ${cityName(l.to)}`}>
          <span className="tg-way" aria-hidden>{x.emoji}</span>
          <small>{x.minutes ? tripSpan(x) : x.set ? "" : t("Choose")}</small>
          {x.price > 0 && <small className="tg-cost">{x.set ? "" : "~"}{short(x.price)}</small>}
        </button>
      </li>
    );
  };
  const city = (key: string, sub: string, extra?: React.ReactNode, cls = "") => (
    <li className={`tg-city ${cls}`}>
      <span className="tg-dot" aria-hidden />
      <b dir="auto">{cityName(key)}</b>
      <small>{sub}</small>
      {extra}
    </li>
  );
  return (
    <section className="tg" aria-label={t("Your trip at a glance")}>
      <div className="fx-seg tg-tabs" role="tablist" aria-label={t("Your trip at a glance")}>
        {([["line", t("Route")], ["days", t("Day by day")], ["map", t("Map")]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "line" && (
        <ol className="tg-line">
          {city(plan.home, day(plan.start), null, "home")}
          {plan.stops.map((s, i) => {
            const l = legs.find((x) => x.to === s.city && x.date === days[i].arrive);
            const stay = stayPicks[i]?.stay;
            return [
              l && seg(l),
              <li key={`c${i}`} className={`tg-city${s.nights && !stay ? " open" : ""}`}>
                <span className="tg-dot" aria-hidden />
                <b dir="auto">{cityName(s.city)}</b>
                <small>{s.nights ? `${day(days[i].arrive)}` : t("Passing through")}</small>
                {s.nights > 0 && (
                  <button type="button" className={`tg-nights${stay ? " set" : ""}`} onClick={() => onStay(i)}>
                    🏨 {t("{n} nights", { n: fmtNum(s.nights) })}
                  </button>
                )}
              </li>,
            ];
          })}
          {plan.back && legs.at(-1)?.to === plan.home && [seg(legs.at(-1)!), city(plan.home, day(legs.at(-1)!.date), null, "home end")]}
        </ol>
      )}

      {tab === "days" && (
        <ol className="tg-days">
          {diary.map((d) => (
            <li key={d.date}>
              <div className="tg-day-head">
                <b>{t("Day {n}", { n: fmtNum(d.n) })}</b>
                <small>{day(d.date)}</small>
              </div>
              <ul>
                {d.items.map((it, k) => {
                  if (it.kind === "go") {
                    const x = legLook(it.leg, it.pick, answers[legKey(it.leg)], plan.travellers, !!plan.quota);
                    return (
                      <li key={k} className={`tg-item go${x.set ? " set" : ""}`}>
                        <button type="button" onClick={() => onLeg(it.leg)}>
                          <span aria-hidden>{x.emoji}</span>
                          <span className="grow">
                            <b>{cityName(it.leg.from)} {arrow()} {cityName(it.leg.to)}</b>
                            <small>{x.set ? [x.depart && clock(x.depart), x.minutes && tripSpan(x)].filter(Boolean).join(" · ") : t("Choose how to get there")}</small>
                          </span>
                        </button>
                      </li>
                    );
                  }
                  if (it.kind === "night")
                    return (
                      <li key={k} className={`tg-item night${it.pick ? " set" : ""}`}>
                        <button type="button" onClick={() => onStay(it.stop)}>
                          <span aria-hidden>🌙</span>
                          <span className="grow">
                            <b dir="auto">{it.pick ? it.pick.stay.name : t("Choose a place to stay")}</b>
                            <small>{t("Night {n} of {of} in {city}", { n: fmtNum(it.night), of: fmtNum(it.of), city: cityName(it.city) })}</small>
                          </span>
                        </button>
                      </li>
                    );
                  return (
                    <li key={k} className="tg-item home set">
                      <span aria-hidden>🏠</span>
                      <span className="grow"><b>{t("Home again")}</b></span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {tab === "map" && <CityMap route={[plan.home, ...plan.stops.map((s) => s.city), ...(plan.back ? [plan.home] : [])]} here={plan.home} onPick={() => {}} />}

      {bill.total > 0 && (
        <div className="tg-cost-bar" role="img" aria-label={parts.map((x) => `${x.label} ${toman(x.n)}`).join("، ")}>
          <div className="tg-bar">
            {parts.map((x) => <i key={x.k} className={`tg-${x.k}`} style={{ flexGrow: x.n }} />)}
          </div>
          <div className="tg-legend">
            {parts.map((x) => (
              <span key={x.k} className={`tg-${x.k}`}><i aria-hidden />{x.emoji} {x.label} <b>{fmtNum(Math.round((x.n / bill.total) * 100))}%</b></span>
            ))}
          </div>
        </div>
      )}
    </section>
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
function LegRow({ leg, answer, pick, travellers, quota, onOpen }: { leg: Leg; answer?: Answer; pick?: LegPick; travellers: number; quota?: boolean; onOpen: () => void }) {
  const from = cityByKey(leg.from), to = cityByKey(leg.to);
  const best = cheapestTrip(answer?.data?.trips ?? [], travellers);
  const drive = driveOf(from, to, travellers, !!quota);
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

function StopBlock({ leg, answer, pick, travellers, quota, stop, when, stay, stays, acts, onLeg, onStay, onActs, onCity, onNights, onRemove }: {
  leg?: Leg; answer?: Answer; pick?: LegPick; travellers: number; quota?: boolean; stop: { city: string; nights: number }; when: { arrive: string; leave: string }; stay?: Stay; stays?: Stay[] | null; acts: ActPick[];
  onLeg: () => void; onStay: () => void; onActs: () => void; onCity: () => void; onNights: (n: number) => void; onRemove: () => void;
}) {
  const ideas = activitiesIn(stop.city).length;
  const actsSum = acts.reduce((n, a) => n + a.price * a.people, 0);
  const cheapest = (stays ?? []).reduce<number>((m, s) => (s.price > 0 && (!m || s.price < m) ? s.price : m), 0);
  return (
    <>
      {leg && <LegRow leg={leg} answer={answer} pick={pick} travellers={travellers} quota={quota} onOpen={onLeg} />}
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
              {stay?.photo ? <img src={stay.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.replaceWith(Object.assign(document.createElement("span"), { className: "tp-stay-ic", textContent: "🏨" }))} /> : <span className="tp-stay-ic" aria-hidden>🏨</span>}
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
          {(ideas > 0 || acts.length > 0) && (
            <button type="button" className={`tp-stay tp-acts${acts.length ? " set" : ""}`} onClick={onActs}>
              <span className="tp-stay-ic" aria-hidden>{acts[0]?.emoji || "🎟️"}</span>
              <span className="grow">
                <b>{acts.length ? acts.map((a) => a.title).join(" · ") : t("Things to do")}</b>
                <small>{acts.length ? t("{n} outings · {price}", { n: fmtNum(acts.length), price: toman(actsSum) }) : t("{n} ideas — diving, tours, tickets…", { n: fmtNum(ideas) })}</small>
              </span>
              <span className="tp-go" aria-hidden>›</span>
            </button>
          )}
        </div>
      </li>
    </>
  );
}

// ---------------------------------------------------------------- things to do in a city
/**
 * What to do there (lib/travel/activities.ts): pick outings, each with its price a person (a
 * rough figure from the list — change it to what you're quoted) and how many of you go; they're
 * counted in the trip's bill. Where Jabama Events sells it (lib/travel/experiences.ts) the outing links to that very
 * experience — its real price a person, its next date — and the city's other bookable tours, walks and workshops can
 * be added too; elsewhere "Find it" searches for who runs it now (all through the leave dialog).
 */
function ActsView({ city, travellers, picked, onChange, onBack, onClose }: { city: string; travellers: number; picked: ActPick[]; onChange: (l: ActPick[]) => void; onBack: () => void; onClose: () => void }) {
  const all = activitiesIn(city);
  const [kind, setKind] = useState<ActKind | null>(null);
  // What can really be booked there (null: still asking, or the site doesn't have the city).
  const slug = jabamaCity(city);
  const [ex, setEx] = useState<Experience[] | null>(null);
  const [moreEx, setMoreEx] = useState(false);
  useEffect(() => {
    if (!slug) return;
    let live = true;
    api<{ experiences: Experience[] }>(`/api/travel?experiences=${encodeURIComponent(city)}`)
      .then((r) => live && setEx(r.experiences ?? []))
      .catch(() => live && setEx([]));
    return () => void (live = false);
  }, [city, slug]);
  const faName = cityByKey(city)?.fa;
  const matchOf = useMemo(() => new Map(all.map((a) => [a.id, ex ? matchExperience(a, ex, faName) : null])), [all, ex, faName]);
  // The bookable ones no outing in the list already stands for.
  const extra = useMemo(() => {
    const used = new Set([...matchOf.values()].filter(Boolean).map((e) => e!.id));
    return (ex ?? []).filter((e) => !used.has(e.id));
  }, [ex, matchOf]);
  const nextOf = (e: Experience) => (e.next ? t("next: {day}", { day: fmtDate(e.next, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Tehran" }) }) : null);
  const flipEx = (e: Experience) => {
    const id = `jx:${e.id}`;
    onChange(picked.find((p) => p.id === id) ? picked.filter((p) => p.id !== id) : [...picked, { id, city, title: e.title, emoji: "🎟️", price: e.price, people: travellers }]);
  };
  const kinds = [...new Set(all.map((a) => a.kind))];
  const shown = kind ? all.filter((a) => a.kind === kind) : all;
  const has = (id: string) => picked.find((p) => p.id === id);
  // (Added with the bookable one's real price when there is one, the rough figure otherwise.)
  const flip = (a: (typeof all)[number]) => (has(a.id) ? onChange(picked.filter((p) => p.id !== a.id)) : onChange([...picked, { id: a.id, city, title: t(a.title), emoji: a.emoji, price: matchOf.get(a.id)?.price || a.price, people: travellers }]));
  const edit = (id: string, f: Partial<ActPick>) => onChange(picked.map((p) => (p.id === id ? { ...p, ...f } : p)));
  const sum = picked.reduce((n, a) => n + a.price * a.people, 0);
  return (
    <Sheet title={t("Things to do in {city}", { city: cityName(city) })} onBack={onBack} onClose={onClose} tall>
      <div className="fx-chips">
        <Chip label={t("All")} on={!kind} onClick={() => setKind(null)} />
        {kinds.map((k) => <Chip key={k} emoji={ACT_KINDS[k].emoji} label={t(ACT_KINDS[k].label)} on={kind === k} onClick={() => setKind(kind === k ? null : k)} />)}
      </div>
      <ul className="ta-list">
        {shown.map((a) => {
          const p = has(a.id), m = matchOf.get(a.id);
          return (
            <li key={a.id} className={`ta-item${p ? " on" : ""}`}>
              <button type="button" className="ta-main" onClick={() => flip(a)} aria-pressed={!!p}>
                <span className="ta-emoji" aria-hidden>{a.emoji}</span>
                <span className="grow">
                  <b dir="auto">{t(a.title)}</b>
                  <small>
                    {m
                      ? [m.price ? t("{price} a person", { price: toman(m.price) }) : t("Free"), nextOf(m), m.rating ? `★ ${fmtNum(m.rating)}` : null].filter(Boolean).join(" · ")
                      : [a.price ? t("about {price} a person", { price: toman(a.price) }) : t("Free"), t("{n} h", { n: fmtNum(a.hours) }), t(ACT_KINDS[a.kind].label)].join(" · ")}
                  </small>
                  {m && <span className="ta-bookable">🎟️ {t("Bookable online")}</span>}
                </span>
                <span className="ta-check" aria-hidden>{p ? "✓" : "＋"}</span>
              </button>
              {p && (
                <div className="ta-edit">
                  <label>
                    <span>{t("Price a person")}</span>
                    <input className="input" inputMode="numeric" value={p.price ? fmtNum(p.price) : ""} placeholder="0" onChange={(e) => edit(a.id, { price: Number(e.target.value.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) || 0 })} />
                  </label>
                  <div className="ta-people">
                    <span>{t("People")}</span>
                    <Stepper value={p.people} min={1} max={MAX_TRAVELLERS} onChange={(n) => edit(a.id, { people: n })} label={t("People")} />
                  </div>
                  {m ? (
                    <LeaveLink className="btn small" href={experienceUrl(m)} site={t("Jabama Events")}>{t("Book it ↗")}</LeaveLink>
                  ) : slug ? (
                    <LeaveLink className="link-btn small" href={cityExperiencesUrl(slug)} site={t("Jabama Events")}>{t("What's bookable in {city} ↗", { city: cityName(city) })}</LeaveLink>
                  ) : (
                    <LeaveLink className="link-btn small" href={activityUrl(a)} site={t("Google")}>{t("Find who runs it ↗")}</LeaveLink>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {slug && ex == null && <p className="tiny muted">{t("Looking for what can be booked in {city}…", { city: cityName(city) })}</p>}
      {extra.length > 0 && (
        <>
          <h3 className="ta-head">🎟️ {t("Book online in {city}", { city: cityName(city) })}</h3>
          <ul className="ta-list">
            {(moreEx ? extra : extra.slice(0, 6)).map((e) => {
              const p = has(`jx:${e.id}`);
              return (
                <li key={e.id} className={`ta-item${p ? " on" : ""}`}>
                  <button type="button" className="ta-main" onClick={() => flipEx(e)} aria-pressed={!!p}>
                    {e.image ? <img className="ta-emoji ta-img" src={`${e.image}?x-img=v1/resize,w_160/optimize,q_70`} alt="" loading="lazy" /> : <span className="ta-emoji" aria-hidden>🎟️</span>}
                    <span className="grow">
                      <b dir="auto">{e.title}</b>
                      <small>{[e.price ? t("{price} a person", { price: toman(e.price) }) : t("Free"), e.duration || null, nextOf(e), e.rating ? `★ ${fmtNum(e.rating)} (${fmtNum(e.reviews)})` : null].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="ta-check" aria-hidden>{p ? "✓" : "＋"}</span>
                  </button>
                  {p && (
                    <div className="ta-edit">
                      <div className="ta-people">
                        <span>{t("People")}</span>
                        <Stepper value={p.people} min={1} max={MAX_TRAVELLERS} onChange={(n) => edit(p.id, { people: n })} label={t("People")} />
                      </div>
                      <LeaveLink className="btn small" href={experienceUrl(e)} site={t("Jabama Events")}>{t("Book it ↗")}</LeaveLink>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {!moreEx && extra.length > 6 && <button type="button" className="link-btn small" onClick={() => setMoreEx(true)}>{t("Show {n} more", { n: fmtNum(extra.length - 6) })}</button>}
          <p className="tiny muted">{t("Booked and paid on Jabama Events, where you pick the date — prices are a person, in toman.")}</p>
        </>
      )}
      <p className="tiny muted">{t("Prices are rough estimates to plan with — change them to what you're quoted.")}</p>
      {picked.length > 0 && (
        <div className="tp-bill" role="status">
          <div className="grow">
            <b>{toman(sum)}</b>
            <small>{t("{n} outings in {city}", { n: fmtNum(picked.length), city: cityName(city) })}</small>
          </div>
          <button type="button" className="btn small" onClick={onBack}>{t("Done")}</button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Each day's cheapest ticket per way for the strip (lib/travel/calendar.ts): the chosen day from its answer,
 * the three days either side searched ahead two at a time through the same searches and phone cache as the
 * list (so tapping one of them opens at once). Days already kept fresh on the phone aren't asked again.
 */
function useDayCells(leg: Leg, dates: string[], travellers: number, answer?: Answer): Record<string, DayCell | undefined> {
  const [ahead, setAhead] = useState<Record<string, Trip[]>>({});
  const route = `${leg.from}|${leg.to}`;
  useEffect(() => setAhead({}), [route]);
  useEffect(() => {
    let gone = false;
    const want = windowDays(leg.date, dates[0], dates[dates.length - 1]).filter((d) => d !== leg.date);
    const queue = [...want];
    const one = async (): Promise<void> => {
      const d = queue.shift();
      if (!d || gone) return;
      const key = `trips:${route}|${d}`;
      const mine = kept<TripAnswer>(key);
      let trips = mine?.data.trips ?? null;
      if (!fresh(mine, TRIPS_FRESH_MS)) {
        const r = await searchTrips(leg.from, leg.to, d, [...MODE_KEYS]).catch(() => null);
        if (r?.trips.length) keep(key, r);
        trips = r ? (r.trips.length || !trips ? r.trips : trips) : trips;
      }
      if (!gone && trips) setAhead((a) => ({ ...a, [d]: trips! }));
      return one();
    };
    // Two at a time: the sites get a gentle pace, the strip fills from the chosen day outwards.
    void Promise.all([one(), one()]);
    return () => void (gone = true);
  }, [route, leg.date, dates]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const out: Record<string, DayCell | undefined> = {};
    for (const [d, trips] of Object.entries(ahead)) out[d] = cellOf(trips, travellers);
    if (answer?.data && !answer.loading) out[leg.date] = cellOf(answer.data.trips, travellers);
    return out;
  }, [ahead, answer, leg.date, travellers]);
}

// ---------------------------------------------------------------- one leg: every way, every ticket
function LegView({ leg, plan, answer, picked, minDate, onDate, onPick, onBack, onClose }: { leg: Leg; plan: Plan; answer?: Answer; picked?: LegPick; minDate: string; onDate: (d: string) => void; onPick: (p: LegPick | null) => void; onBack: () => void; onClose: () => void }) {
  const from = cityByKey(leg.from)!, to = cityByKey(leg.to)!;
  const trips = useMemo(() => answer?.data?.trips ?? [], [answer]);
  const none = answer?.data?.none ?? [];
  const ways = useMemo(() => compareWays(trips, from, to, plan.travellers, none, !!plan.quota), [trips, from, to, plan.travellers, none, plan.quota]);
  const firstWay = (picked?.way ?? ways.filter((w) => w.way !== "car" && w.n).sort((a, b) => (a.cheapest?.price ?? 0) - (b.cheapest?.price ?? 0))[0]?.way ?? "bus") as Way;
  const [way, setWay] = useState<Way>(firstWay);
  useEffect(() => {
    if (!picked && answer?.data) setWay(firstWay);
  }, [answer?.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Filters live in the address (lib/urlState.ts): a filtered list can be shared, reloaded, gone back to.
  const [sort, setSort] = useUrlParam<TripSort>("ts", "cheap", oneOf(TRIP_SORT_KEYS, "cheap"));
  const [parts, setParts] = useUrlParam<DayPart[]>("tp", [], listOf(DAY_PART_KEYS));
  const [companies, setCompanies] = useUrlParam<string[]>("tc", [], listOf());
  const [max, setMax] = useUrlParam("tmax", 0, num());
  const [refundable, setRefundable] = useUrlParam("tref", false, bool);
  const [direct, setDirect] = useUrlParam("tdir", false, bool);
  const [words, setWords] = useUrlParam("tq", "", text());
  const [open, setOpen] = useState(false);
  const mode = way === "car" ? null : way;
  const modeTrips = useMemo(() => trips.filter((x) => x.mode === mode), [trips, mode]);
  const shown = useMemo(() => (mode ? filterTrips(trips, { modes: [mode], parts, companies, max, refundable, seatsOnly: true, direct, q: words, sort }).filter((x) => x.seats == null || x.seats >= plan.travellers) : []), [trips, mode, parts, companies, max, refundable, direct, words, sort, plan.travellers]);
  const facets = useMemo(() => tripFacets(modeTrips), [modeTrips]);
  const caps = useMemo(() => priceCaps(modeTrips.map((x) => x.price)), [modeTrips]);
  const nFilters = parts.length + companies.length + (max ? 1 : 0) + (refundable ? 1 : 0) + (direct ? 1 : 0);
  const clear = () => (setParts([]), setCompanies([]), setMax(0), setRefundable(false), setDirect(false));
  const dates = useMemo(() => Array.from({ length: 21 }, (_, n) => addDays(minDate, n)), [minDate]);
  const cells = useDayCells(leg, dates, plan.travellers, answer);
  const cheapDay = mode ? cheapestDay(cells, dates, mode) : null;
  const nextDay = mode && !answer?.loading && !cells[leg.date]?.[mode]?.n ? nextAvailable(cells, dates, mode, leg.date) : null;
  const drive = driveOf(from, to, plan.travellers, !!plan.quota);
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
    <Sheet title={`${cityName(from)} ${arrow()} ${cityName(to)}`} onBack={onBack} onClose={onClose} tall>
      <div className="tv-days" role="tablist" aria-label={t("Day")} ref={daysRef}>
        {dates.map((d) => {
          const c = cells[d], m = mode ? c?.[mode] : undefined, sh = m ? shortToman(m.min) : null;
          // Known and empty for this way: greyed (still tappable — the sites may have added seats since).
          const empty = !!mode && !!c && !m?.n;
          return (
            <button key={d} role="tab" aria-selected={d === leg.date} className={`${d === leg.date ? "on" : ""}${empty ? " none" : ""}${d === cheapDay ? " cheap" : ""}`} onClick={() => d !== leg.date && onDate(d)}>
              <span>{day(d)}</span>
              {mode && <small>{sh ? (sh.unit ? t(sh.unit === "M" ? "{n}M" : "{n}K", { n: fmtNum(sh.n) }) : fmtNum(sh.n)) : empty ? "—" : "·"}</small>}
            </button>
          );
        })}
      </div>
      {nextDay && (
        <button type="button" className="btn small ghost tv-next-day" onClick={() => onDate(nextDay)}>
          {t("Next day with tickets: {day}", { day: day(nextDay) })} →
        </button>
      )}

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
                <small className="muted">{w.fastest?.minutes != null ? `⏱ ${tripSpan(w.fastest)}` : t("{n} options", { n: fmtNum(w.n) })}</small>
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
              <SortMenu value={sort} onChange={setSort} options={TRIP_SORT_KEYS.map((k) => ({ key: k, label: t(TRIP_SORTS[k]) }))} />
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
    <article className={`tv-trip${chosen ? " chosen" : ""}`} data-leave-title={`${MODES[x.mode].emoji} ${x.company} · ${clock(x.depart)}`} data-leave-photo={x.logo || undefined} data-leave-price={toman(x.price)}>
      <button className="tv-trip-main" onClick={() => setMore(!more)} aria-expanded={more}>
        <div className="tv-times">
          <b>{clock(x.depart)}</b>
          <span className="tv-line" aria-hidden><i>{MODES[x.mode].emoji}</i></span>
          {x.arrive ? <b>{clock(x.arrive)}</b> : <span />}
          <small className="muted">{tripSpan(x)}</small>
        </div>
        <div className="tv-who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="tv-logo" aria-hidden>
            {[...x.company.replace(/^(شرکت|تعاونی|هواپیمایی)\s+/, "")][0] ?? MODES[x.mode].emoji}
            {/* The site's logo over the company's first letter, once it has actually loaded (some are blank or blocked). */}
            {x.logo && <img src={x.logo} alt="" loading="lazy" onLoad={(e) => e.currentTarget.naturalWidth > 1 && e.currentTarget.classList.add("ok")} onError={(e) => e.currentTarget.remove()} />}
          </span>
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
/** A city's places to stay, kept on the phone for a few hours (Jabama's villas and suites and its hotels). */
export async function loadStays(city: string): Promise<Stay[]> {
  const mine = kept<Stay[]>(`${STAYS_KEPT}${city}`);
  if (fresh(mine, STAYS_FRESH_MS)) return mine!.data;
  try {
    const r = await api<{ stays: Stay[] }>(`/api/travel?stays=${encodeURIComponent(city)}`);
    if (r.stays.length) keep(`${STAYS_KEPT}${city}`, r.stays);
    return r.stays.length || !mine?.data.length ? r.stays : mine.data;
  } catch {
    return mine?.data ?? [];
  }
}

const flip = <T,>(l: T[], x: T) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);
const starRow = (n: number) => "★".repeat(n);

/**
 * A place to stay, its own page: every photo (Gallery, full screen on a tap), the stars and the
 * guests' score, every amenity, how many it sleeps, the bill for your nights and rooms, where it
 * is, and Choose / open it on Jabama (through the leave dialog). Back returns to the same list.
 */
function StayPage({ s, nights, travellers, chosen, onPick, onClose }: { s: Stay; nights: number; travellers: number; chosen: boolean; onPick?: () => void; onClose: () => void }) {
  const rooms = roomsFor(s, travellers);
  useEffect(() => pushBack(onClose), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pp" role="dialog" aria-modal="true" aria-label={s.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pp-card sp" data-leave-title={s.name} data-leave-photo={s.photo || undefined} data-leave-price={`${toman(s.price)} ${t("a night")}`}>
        <header className="pp-bar">
          <button type="button" className="pp-icon" onClick={onClose} aria-label={t("Back")}>‹</button>
          <span className="pp-src">{t(STAY_KINDS[s.kind].label)}</span>
        </header>
        <div className="pp-scroll">
          <Gallery photos={[s.photo, ...(s.photos ?? [])]} alt={s.name} ratio="4 / 3" fallback={<span aria-hidden>{STAY_KINDS[s.kind].emoji}</span>} />
          <div className="pp-main">
            <h3 dir="auto">{s.name}</h3>
            <div className="sp-score">
              {s.stars ? <span className="tv-stars">{starRow(s.stars)}</span> : null}
              {s.rating ? <span className="tv-score">{fmtNum(s.rating)}</span> : null}
              {s.reviews ? <span className="small muted">{t("{n} reviews", { n: fmtNum(s.reviews) })}</span> : null}
              {s.verified && <span className="small">✔️ {t("Verified")}</span>}
              {s.instant && <span className="small">⚡ {t("Instant")}</span>}
            </div>
            <div className="sp-bill">
              <div>
                {s.was ? <s className="small muted">{fmtNum(s.was)}</s> : null}
                <b>{toman(s.price)}</b> <small className="muted">{t("a night")}</small>
              </div>
              <div className="small">{t("{n} toman × {nights} nights × {rooms}", { n: fmtNum(s.price), nights: fmtNum(nights), rooms: fmtNum(rooms) })}</div>
              <b className="sp-total">{t("{n} for your stay", { n: toman(s.price * nights * rooms) })}</b>
              {s.minNights ? <div className="small muted">{t("At least {n} nights", { n: fmtNum(s.minNights) })}</div> : null}
            </div>
            <ul className="pp-meta">
              {s.capacity ? <li>👥 {t("{n} guests", { n: fmtNum(s.capacity) })}</li> : null}
              {s.bedrooms ? <li>🛏️ {t("{n} bedrooms", { n: fmtNum(s.bedrooms) })}</li> : null}
              {s.dist != null && <li>📍 {t("{d} from the centre", { d: formatDistance(s.dist) })}</li>}
            </ul>
            {s.amenities?.length ? (
              <section className="pp-desc">
                <h4>{t("Amenities")}</h4>
                <ul className="sp-amen">
                  {s.amenities.map((a) => <li key={a}><span aria-hidden>{AMENITIES[a].emoji}</span> {t(AMENITIES[a].label)}</li>)}
                </ul>
              </section>
            ) : null}
            {s.lat != null && s.lng != null && (
              <a className="btn small ghost" href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noreferrer noopener">🗺️ {t("Where it is")} ↗</a>
            )}
          </div>
        </div>
        <footer className="pp-foot sp-foot">
          {onPick && <button type="button" className={`btn grow${chosen ? " green" : ""}`} onClick={() => (onPick(), onClose())}>{chosen ? t("Chosen ✓") : t("Choose")}</button>}
          <a className="pp-go grow" href={s.url} target="_blank" rel="noopener noreferrer">{t("Jabama")} ↗</a>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function StayCard({ s, nights, travellers, chosen, onPick }: { s: Stay; nights: number; travellers: number; chosen: boolean; onPick?: () => void }) {
  const [page, setPage] = useState(false);
  const rooms = roomsFor(s, travellers);
  return (
    <article className={`tv-stay${chosen ? " chosen" : ""}`} data-leave-title={s.name} data-leave-photo={s.photo || undefined} data-leave-price={`${toman(s.price)} ${t("a night")}`}>
      <div className="tv-stay-pic">
        {/* Every photo the listing has, to swipe through (some are gone from the site's CDN: they drop out; none left, the kind's icon). */}
        <Gallery
          photos={[s.photo, ...(s.photos ?? [])]}
          alt={s.name}
          ratio="16 / 9"
          fallback={<span aria-hidden>{STAY_KINDS[s.kind].emoji}</span>}
          badge={
            <>
              <span className="tv-stay-kind">{STAY_KINDS[s.kind].emoji} {t(STAY_KINDS[s.kind].label)}</span>
              {s.was ? <span className="tv-stay-off">−{fmtNum(Math.round((1 - s.price / s.was) * 100))}%</span> : null}
            </>
          }
        />
      </div>
      {page && <StayPage s={s} nights={nights} travellers={travellers} chosen={chosen} onPick={onPick} onClose={() => setPage(false)} />}
      <div className="tv-stay-body">
        <button type="button" className="tv-stay-open" onClick={() => setPage(true)}>
          <b dir="auto">{s.name}</b>
          <span className="small muted">{t("Photos, amenities and the bill")} ›</span>
        </button>
        {s.stars ? <span className="tv-stars" aria-label={t("{n} stars", { n: fmtNum(s.stars) })}>{starRow(s.stars)}</span> : null}
        <Meta parts={[s.rating && <span className="tv-score">{fmtNum(s.rating)}</span>, s.reviews && t("{n} reviews", { n: fmtNum(s.reviews) }), s.capacity && t("{n} guests", { n: fmtNum(s.capacity) }), s.dist != null && formatDistance(s.dist), s.instant && `⚡ ${t("Instant")}`]} />
        {s.amenities?.length ? (
          <span className="tv-amen" aria-label={s.amenities.map((a) => t(AMENITIES[a].label)).join("، ")}>
            {s.amenities.slice(0, 6).map((a) => <i key={a} title={t(AMENITIES[a].label)}>{AMENITIES[a].emoji}</i>)}
          </span>
        ) : null}
        <div className="tv-price">
          {s.was ? <s className="tiny muted">{fmtNum(s.was)}</s> : null}
          <span><b>{toman(s.price)}</b> <small className="muted">{t("a night")}</small></span>
          <small className="muted">{t("{n} for your stay", { n: toman(s.price * nights * rooms) })}{rooms > 1 ? ` · ${t("{n} units", { n: fmtNum(rooms) })}` : ""}</small>
        </div>
        <div className="row tv-stay-act">
          {onPick && <button type="button" className={`btn small grow${chosen ? " green" : ""}`} onClick={onPick}>{chosen ? t("Chosen ✓") : t("Choose")}</button>}
          <a className={`btn small${onPick ? " ghost" : " grow"}`} href={s.url} target="_blank" rel="noreferrer noopener">{t("Jabama")} ↗</a>
        </div>
      </div>
    </article>
  );
}

function StayView({ city, nights, travellers, from, stays, picked, onPick, onBack, onClose, form, title }: {
  city: City; nights: number; travellers: number; from: string; stays: Stay[] | null; picked?: Stay;
  /** Choosing one for the trip (the planner); without it the cards only link to the site (Hotels). */
  onPick?: (s: Stay | null) => void; onBack?: () => void; onClose: () => void;
  /** The search form over the list (Hotels: city, dates, guests). */
  form?: React.ReactNode; title?: string;
}) {
  const [kinds, setKinds] = useUrlParam<StayKind[]>("sk", [], listOf(Object.keys(STAY_KINDS) as StayKind[]));
  const [instant, setInstant] = useUrlParam("sin", false, bool);
  const [max, setMax] = useUrlParam("smax", 0, num());
  const [minStars, setMinStars] = useUrlParam("sst", 0, num(0, 5));
  const [minRating, setMinRating] = useUrlParam("srt", 0, num(0, 10));
  const [amen, setAmen] = useUrlParam<Amenity[]>("sa", [], listOf(Object.keys(AMENITIES) as Amenity[]));
  const [sort, setSort] = useUrlParam<StaySort>("ss", "cheap", oneOf(STAY_SORT_KEYS, "cheap"));
  const [words, setWords] = useUrlParam("sq", "", text());
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(STAYS_PAGE);
  const filter = { kinds, guests: travellers > 2 ? travellers : 0, instant, max, minStars, minRating, amenities: amen, q: words, sort };
  const shown = useMemo(() => filterStays(stays ?? [], filter).filter((s) => !s.minNights || s.minNights <= nights), [stays, nights, JSON.stringify(filter)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMore(STAYS_PAGE), [shown]);
  const caps = useMemo(() => priceCaps((stays ?? []).map((s) => s.price)), [stays]);
  const has = useMemo(() => {
    const all = stays ?? [];
    return {
      kinds: (Object.keys(STAY_KINDS) as StayKind[]).map((k) => [k, all.filter((s) => s.kind === k).length] as const).filter(([, n]) => n > 0),
      amen: (Object.keys(AMENITIES) as Amenity[]).filter((a) => all.some((s) => s.amenities?.includes(a))),
      stars: all.some((s) => s.stars),
      rated: all.some((s) => s.rating),
    };
  }, [stays]);
  const nFilters = kinds.length + (instant ? 1 : 0) + (max ? 1 : 0) + (minStars ? 1 : 0) + (minRating ? 1 : 0) + amen.length;
  const clear = () => (setKinds([]), setInstant(false), setMax(0), setMinStars(0), setMinRating(0), setAmen([]));
  const kindChip = (k: StayKind, n?: number) => <Chip key={k} on={kinds.includes(k)} emoji={STAY_KINDS[k].emoji} label={t(STAY_KINDS[k].label)} n={n} onClick={() => setKinds((v) => flip(v, k))} />;
  return (
    <Sheet title={title ?? t("Stay in {city}", { city: cityName(city) })} onBack={onBack} onClose={onClose} tall>
      {form ?? <p className="small muted tp-sub">{t("{nights} nights from {day} · {people}", { nights: fmtNum(nights), day: day(from), people: t("{n} travellers", { n: fmtNum(travellers) }) })}</p>}
      <div className="tp-tools">
        <SearchField value={words} onChange={setWords} placeholder={t("Name of the place")} />
        <FilterBar count={nFilters} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
          <SortMenu value={sort} onChange={setSort} options={STAY_SORT_KEYS.filter((k) => k !== "stars" || has.stars).map((k) => ({ key: k, label: t(STAY_SORTS[k]) }))} />
          {has.kinds.map(([k]) => kindChip(k))}
        </FilterBar>
      </div>
      <FilterPanel id={PANEL} open={open} onClear={nFilters ? clear : undefined} onDone={() => setOpen(false)} results={t("Show {n} results", { n: fmtNum(shown.length) })}>
        <FilterGroup title={t("Kind")}>{has.kinds.map(([k, n]) => kindChip(k, n))}</FilterGroup>
        {caps.length > 0 && (
          <FilterGroup title={t("Price a night")}>
            <Chip on={!max} label={t("Any price")} onClick={() => setMax(0)} />
            {caps.map((c) => <Chip key={c} on={max === c} label={t("Under {n}", { n: toman(c) })} onClick={() => setMax(c)} />)}
          </FilterGroup>
        )}
        {has.stars && (
          <FilterGroup title={t("Hotel stars")}>
            {[3, 4, 5].map((n) => <Chip key={n} on={minStars === n} label={n === 5 ? starRow(5) : `${starRow(n)}+`} onClick={() => setMinStars(minStars === n ? 0 : n)} />)}
          </FilterGroup>
        )}
        {has.rated && (
          <FilterGroup title={t("Guest rating")}>
            {[4, 4.5].map((r) => <Chip key={r} on={minRating === r} label={`★ ${fmtNum(r)}+`} onClick={() => setMinRating(minRating === r ? 0 : r)} />)}
          </FilterGroup>
        )}
        {has.amen.length > 0 && (
          <FilterGroup title={t("Has")}>
            {has.amen.map((a) => <Chip key={a} on={amen.includes(a)} emoji={AMENITIES[a].emoji} label={t(AMENITIES[a].label)} onClick={() => setAmen((v) => flip(v, a))} />)}
          </FilterGroup>
        )}
        <FilterGroup title={t("Booking")}>
          <Chip on={instant} emoji="⚡" label={t("Instant booking")} onClick={() => setInstant(!instant)} />
        </FilterGroup>
      </FilterPanel>

      {stays && <p className="fx-status" aria-live="polite">{t("{n} places to stay", { n: fmtNum(shown.length) })}</p>}
      {!stays && <TripSkeleton />}
      {stays && !shown.length && (
        <div className="fx-empty">
          <span className="em">🏨</span>
          {stays.length ? t("Nothing matches — loosen a filter") : t("No places to stay listed here yet")}
          {nFilters > 0 && <button type="button" className="btn small ghost" onClick={clear}>{t("Clear all")}</button>}
        </div>
      )}
      <div className="tv-stays">
        {shown.slice(0, more).map((s) => (
          <StayCard key={s.id} s={s} nights={nights} travellers={travellers} chosen={picked?.id === s.id} onPick={onPick && (() => onPick(picked?.id === s.id ? null : s))} />
        ))}
      </div>
      {shown.length > more && <button type="button" className="btn small ghost fx-more" onClick={() => setMore(more + STAYS_PAGE)}>{t("Show more")} ({fmtNum(shown.length - more)})</button>}
      {shown.length > 0 && <AdSlot />}
      <div className="tv-compare-sites">
        <span className="small muted">{t("More hotels on")}</span>
        {hotelLinks(city).map((l) => (
          <a key={l.site} className="chip small" href={l.url} target="_blank" rel="noreferrer noopener" style={{ ["--site" as string]: TRAVEL_SITES[l.site].color }}>{t(TRAVEL_SITES[l.site].name)} ↗</a>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- hotels on their own (the List view)
/** Hotels and stays in any city — where, when, how many nights, how many people — without a trip. */
export function HotelFinder({ at }: { at: LatLng | null }) {
  const here = useMemo(() => nearestCity(at), [at]);
  const [city, setCity] = useState(() => here?.key ?? "tehran");
  const [from, setFrom] = useState(() => isoDay(Date.now(), 0));
  const [nights, setNights] = useState(2);
  const [guests, setGuests] = useState(2);
  const [picking, setPicking] = useState(false);
  const [stays, setStays] = useState<Stay[] | null>(null);
  useEffect(() => {
    let live = true;
    setStays(null);
    loadStays(city).then((r) => live && setStays(r));
    return () => void (live = false);
  }, [city]);
  const c = cityByKey(city);
  if (picking || !c) return <CityPicker title={t("Which city?")} here={here} exclude={null} route={[city]} onPick={(x) => (setCity(x.key), setPicking(false))} onClose={() => setPicking(false)} />;
  const days = Array.from({ length: DAYS_AHEAD }, (_, n) => isoDay(Date.now(), n));
  const form = (
    <div className="hf-form">
      <button type="button" className="hf-field hf-city" onClick={() => setPicking(true)}>
        <span>{t("City")}</span>
        <b dir="auto">{cityName(c)}</b>
      </button>
      <label className="hf-field">
        <span>{t("Check-in")}</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {days.map((d, n) => <option key={d} value={d}>{n === 0 ? t("Today") : n === 1 ? t("Tomorrow") : day(d)}</option>)}
        </select>
      </label>
      <div className="hf-field">
        <span>{t("Nights")}</span>
        <Stepper value={nights} min={1} max={MAX_NIGHTS} onChange={setNights} label={t("Nights")} />
      </div>
      <div className="hf-field">
        <span>{t("Guests")}</span>
        <Stepper value={guests} min={1} max={MAX_TRAVELLERS} onChange={setGuests} label={t("Guests")} />
      </div>
      <p className="hf-out small muted">{t("Check-out {day}", { day: day(addDays(from, nights)) })}</p>
    </div>
  );
  return <StayView title={t("Hotels & stays in {city}", { city: cityName(c) })} city={c} nights={nights} travellers={guests} from={from} stays={stays} form={form} onClose={() => {}} />;
}

// ---------------------------------------------------------------- picking a city: by name or on the map
function CityPicker({ title, here, exclude, route, onPick, onClose, first, from, onFrom }: { title: string; here: City | null; exclude: City | null; route: string[]; onPick: (c: City) => void; onClose: () => void; /** The planner's first page (nowhere picked yet): the destination home. */ first?: boolean; from?: string; onFrom?: () => void }) {
  const [q, setQ] = useState("");
  const [map, setMap] = useState(false);
  const list = useMemo(() => findCities(q, 40).filter((c) => c.key !== exclude?.key && (q || c.key !== here?.key)), [q, exclude?.key, here?.key]);
  const ways = (c: City) => MODE_KEYS.filter((m: Mode) => cityHas(c, m)).map((m) => MODES[m].emoji).join(" ");
  if (first) return <TravelHome title={title} here={here} exclude={exclude} route={route} onPick={onPick} onClose={onClose} from={from} onFrom={onFrom} ways={ways} />;
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

// ---------------------------------------------------------------- the planner's first page
/**
 * Where to next? The trip planner's front page: a hero with where you'd leave from (tap to change),
 * a search, the map of every city with tickets right there (tap one), trips by mood (sea, history,
 * the green north, desert, pilgrimage) and destination cards — each with its ways in and how many
 * things there are to do.
 */
function TravelHome({ title, here, exclude, route, onPick, onClose, from, onFrom, ways }: { title: string; here: City | null; exclude: City | null; route: string[]; onPick: (c: City) => void; onClose: () => void; from?: string; onFrom?: () => void; ways: (c: City) => string }) {
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const found = useMemo(() => (q ? findCities(q, 24).filter((c) => c.key !== exclude?.key) : []), [q, exclude?.key]);
  const picks = useMemo(() => {
    const keys = mood ? MOODS[mood].cities : POPULAR;
    return keys.map((k) => cityByKey(k)).filter((c): c is City => !!c && c.key !== exclude?.key && c.key !== from);
  }, [mood, exclude?.key, from]);
  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="th">
        <header className="th-hero">
          <span className="th-plane" aria-hidden>✈️</span>
          <h3>{t("Where to next?")}</h3>
          <p>{t("Tickets, places to stay and things to do — the whole trip, priced for everyone.")}</p>
          {from && (
            <button type="button" className="th-from" onClick={onFrom}>
              <span aria-hidden>📍</span> {t("From {city}", { city: cityName(from) })} <span aria-hidden>▾</span>
            </button>
          )}
        </header>
        <SearchField value={q} onChange={setQ} placeholder={t("City, province or airport code")} />
        {q ? (
          <div className="tv-picks">
            {found.map((c) => (
              <button key={c.key} className="tv-pick" onClick={() => onPick(c)}>
                <b className="grow" dir="auto">{cityName(c)} {c.province && <small className="muted">· {c.province}</small>}</b>
                <span className="tv-ways">{ways(c)}</span>
              </button>
            ))}
            {!found.length && <p className="muted small">{t("No city by that name")}</p>}
          </div>
        ) : (
          <>
            <div className="th-map">
              <CityMap route={route} here={here?.key ?? null} onPick={(c) => c.key !== exclude?.key && onPick(c)} />
              <span className="th-map-hint">{t("Tap a city on the map")}</span>
            </div>
            <div className="fx-chips th-moods" role="group" aria-label={t("Trips by mood")}>
              <Chip label={t("Popular")} emoji="⭐" on={!mood} onClick={() => setMood(null)} />
              {MOOD_KEYS.map((m) => <Chip key={m} emoji={MOODS[m].emoji} label={t(MOODS[m].label)} on={mood === m} onClick={() => setMood(mood === m ? null : m)} />)}
            </div>
            {here && here.key !== exclude?.key && here.key !== from && !mood && (
              <button className="tv-pick near" onClick={() => onPick(here)}>
                <span aria-hidden>📍</span>
                <b className="grow" dir="auto">{cityName(here)} <small className="muted">· {t("Near you")}</small></b>
                <span className="tv-ways">{ways(here)}</span>
              </button>
            )}
            <div className="th-cards">
              {picks.map((c) => {
                const m = moodOf(c.key), n = activitiesIn(c.key).length;
                return (
                  <button key={c.key} type="button" className="th-card" onClick={() => onPick(c)} style={{ "--tint": m ? MOODS[m].tint : "#5aa9ff" } as React.CSSProperties}>
                    <span className="th-card-art" aria-hidden>{m ? MOODS[m].emoji : "🏙️"}</span>
                    <b dir="auto">{cityName(c)}</b>
                    <small dir="auto">{c.province || (m ? t(MOODS[m].label) : "")}</small>
                    <span className="th-card-foot">
                      <span className="tv-ways">{ways(c)}</span>
                      {n > 0 && <span className="th-card-n">{t("{n} things to do", { n: fmtNum(n) })}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="tiny muted">{t("{n} cities with tickets", { n: fmtNum(CITIES.length) })}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
