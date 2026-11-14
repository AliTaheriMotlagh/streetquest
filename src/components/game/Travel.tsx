"use client";
// The travel planner: from here to any city in Iran — every flight, train and bus that day from
// Alibaba and MrBilit in one list (the same trip on both sites is one row with both prices), the
// villas, suites and hotels at the other end from Jabama, and the other sites (Flytoday, Raja,
// Payaneh, Booking.ir, Alibaba's hotels and tours) one tap away to compare.
//  - pick where from (the nearest city to start), where to (search in Persian or English, or the
//    popular cities), and the day (the next two weeks, Persian calendar in Persian);
//  - "All" compares the three ways at a glance (cheapest and fastest of each), then the list;
//  - narrow it: time of day, price cap, company, refundable, seats left, direct; sort it by price,
//    time, duration or seats;
//  - stays: kind, guests, instant booking, rating, price; sorted by price, rating, distance or size.
// Rules and parsing: lib/travel; data: travelClient.ts — the phone asks what sites let it (buses),
// /api/travel the rest (cached per route and day on the server, through the Iran relay).
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtNum, fmtWhen, getLocale, t } from "@/lib/i18n";
import { formatDistance, type LatLng } from "@/lib/geo";
import {
  CITIES, cityByKey, cityHas, COMPARE, DAY_PART_KEYS, DAY_PARTS, filterStays, filterTrips, findCities, hotelLinks, isoDay, MODE_KEYS, MODES, nearestCity, STAY_KINDS, STAY_SORT_KEYS, STAY_SORTS,
  bookUrl, tourLink, TRAVEL_SITES, TRIP_SORT_KEYS, TRIP_SORTS, tripFacets, type City, type DayPart, type Mode, type Stay, type StayKind, type StaySort, type Trip, type TripSort,
} from "@/lib/travel";
import { iranTime } from "@/lib/flights";
import { api } from "./client";
import { searchTrips, type TripAnswer } from "./travelClient";
import { fresh, keep, kept } from "./keep";
import { Sheet } from "./ui";
import { Chip, FilterBar, FilterGroup, FilterPanel, Meta, SearchField } from "./Filters";

type Tab = "all" | Mode | "stays";
const PANEL = "travel-filters";
const DAYS_AHEAD = 14;
const LAST = "sq-travel";
/** The phone's copy of a route's tickets is used as is for this long, stays for longer. */
const TRIPS_FRESH_MS = 15 * 60_000;
const STAYS_FRESH_MS = 6 * 3600_000;

const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
/** "2026-11-21T07:00:00" (Iran time) → "07:00" in the player's digits. */
const clock = (s: string) => fmtDate(iranTime(s), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" });
const span = (min?: number) => (min == null ? "" : min < 60 ? t("{m} min", { m: fmtNum(min) }) : min % 60 ? t("{h} h {m} min", { h: fmtNum(Math.floor(min / 60)), m: fmtNum(min % 60) }) : t("{h} h", { h: fmtNum(min / 60) }));
const dayLabel = (iso: string, i: number) => (i === 0 ? t("Today") : i === 1 ? t("Tomorrow") : fmtDate(`${iso}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));
/** A city in the player's language: Persian names in Persian, English ones otherwise. */
const cityName = (c: City | null) => (c ? (getLocale() === "fa" ? c.fa : c.en) : "");

export function Travel({ at, onClose, initialTo }: { at: LatLng | null; onClose: () => void; initialTo?: string }) {
  const here = useMemo(() => nearestCity(at), [at]);
  const [from, setFrom] = useState<City | null>(here);
  const [to, setTo] = useState<City | null>(initialTo ? cityByKey(initialTo) : null);
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => isoDay(Date.now(), i)), []);
  const [date, setDate] = useState(days[1]);
  const [tab, setTab] = useState<Tab>("all");
  const [pick, setPick] = useState<"from" | "to" | null>(initialTo ? null : "to");
  const [answer, setAnswer] = useState<TripAnswer | null>(null);
  const [stays, setStays] = useState<Stay[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** When the trips on screen were saved on this phone (0: just fetched). */
  const [savedAt, setSavedAt] = useState(0);
  const [err, setErr] = useState("");
  // Trip filters
  const [sort, setSort] = useState<TripSort>("cheap");
  const [parts, setParts] = useState<DayPart[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [max, setMax] = useState(0);
  const [refundable, setRefundable] = useState(false);
  const [seatsOnly, setSeatsOnly] = useState(true);
  const [direct, setDirect] = useState(false);
  const [words, setWords] = useState("");
  // Stay filters
  const [kinds, setKinds] = useState<StayKind[]>([]);
  const [guests, setGuests] = useState(0);
  const [instant, setInstant] = useState(false);
  const [stayMax, setStayMax] = useState(0);
  const [staySort, setStaySort] = useState<StaySort>("cheap");
  const [open, setOpen] = useState(false);
  const asked = useRef("");

  // The last trip looked at comes back (where from / to), unless the map opened this on a city.
  useEffect(() => {
    if (initialTo) return;
    try {
      const last = JSON.parse(localStorage.getItem(LAST) ?? "null") as { from?: string; to?: string } | null;
      if (last?.to && cityByKey(last.to)) (setTo(cityByKey(last.to)), setPick(null));
      if (last?.from && cityByKey(last.from) && !here) setFrom(cityByKey(last.from));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!from || !to || from.key === to.key) return;
    try {
      localStorage.setItem(LAST, JSON.stringify({ from: from.key, to: to.key }));
    } catch {}
    const key = `${from.key}|${to.key}|${date}`;
    asked.current = key;
    setErr("");
    // The phone's own copy first (offline too); asked again only when it's older than TRIPS_FRESH_MS.
    const mine = kept<TripAnswer>(`trips:${key}`);
    setAnswer(mine?.data ?? null);
    setSavedAt(mine?.at ?? 0);
    if (fresh(mine, TRIPS_FRESH_MS)) return setLoading(false);
    setLoading(true);
    // Bus searches run on this phone, the rest on the server (travelClient.ts).
    searchTrips(from.key, to.key, date, [...MODE_KEYS])
      .then((r) => {
        if (asked.current !== key) return;
        // An answer with nothing because every site failed doesn't replace a copy that had trips.
        if (!r.trips.length && r.failed.length && mine?.data.trips.length) return;
        setAnswer(r);
        setSavedAt(0);
        if (r.trips.length) keep(`trips:${key}`, r);
      })
      .catch((e: Error) => asked.current === key && !mine && setErr(e.message))
      .finally(() => asked.current === key && setLoading(false));
  }, [from?.key, to?.key, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!to) return;
    const mine = kept<Stay[]>(`stays:${to.key}`);
    setStays(mine?.data ?? null);
    if (fresh(mine, STAYS_FRESH_MS)) return;
    const p = new URLSearchParams({ stays: to.key, ...(at && here?.key === to.key ? { lat: at.lat.toFixed(4), lng: at.lng.toFixed(4) } : {}) });
    api<{ stays: Stay[] }>(`/api/travel?${p}`).then(
      (r) => {
        if (!r.stays.length && mine?.data.length) return;
        setStays(r.stays);
        if (r.stays.length) keep(`stays:${to.key}`, r.stays);
      },
      () => setStays((s) => s ?? []),
    );
  }, [to?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const trips = answer?.trips ?? [];
  const facets = useMemo(() => tripFacets(trips), [trips]);
  const modeTrips = (m: Mode) => trips.filter((x) => x.mode === m);
  const shown = useMemo(
    () => filterTrips(trips, { modes: tab === "all" || tab === "stays" ? undefined : [tab], parts, companies, max, refundable, seatsOnly, direct, q: words, sort }),
    [trips, tab, parts, companies, max, refundable, seatsOnly, direct, words, sort],
  );
  const shownStays = useMemo(() => filterStays(stays ?? [], { kinds, guests, instant, max: stayMax, q: words, sort: staySort }), [stays, kinds, guests, instant, stayMax, words, staySort]);
  const nFilters = tab === "stays" ? kinds.length + (guests ? 1 : 0) + (instant ? 1 : 0) + (stayMax ? 1 : 0) : parts.length + companies.length + (max ? 1 : 0) + (refundable ? 1 : 0) + (direct ? 1 : 0) + (seatsOnly ? 0 : 1);
  const clear = () => (tab === "stays" ? (setKinds([]), setGuests(0), setInstant(false), setStayMax(0)) : (setParts([]), setCompanies([]), setMax(0), setRefundable(false), setDirect(false), setSeatsOnly(true)));
  const priceCaps = useMemo(() => {
    const ps = (tab === "stays" ? (stays ?? []).map((s) => s.price) : (tab === "all" ? trips : modeTrips(tab)).map((x) => x.price)).filter((p) => p > 0).sort((a, b) => a - b);
    if (ps.length < 4) return [];
    const nice = (n: number) => {
      const mag = 10 ** Math.floor(Math.log10(n));
      return Math.round(([1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => s * mag >= n) ?? 10) * mag);
    };
    return [...new Set([0.25, 0.5, 0.75].map((q) => nice(ps[Math.floor(ps.length * q)])))];
  }, [tab, trips, stays]); // eslint-disable-line react-hooks/exhaustive-deps

  const swap = () => (setFrom(to), setTo(from));

  if (pick) return <CityPicker title={pick === "from" ? t("Where from?") : t("Where to?")} here={here} exclude={pick === "from" ? to : from} onPick={(c) => (pick === "from" ? setFrom(c) : setTo(c), setPick(null))} onClose={() => (to && from ? setPick(null) : onClose())} />;

  return (
    <Sheet title={t("Travel")} onClose={onClose} tall>
      <div className="tv-route">
        <button className="tv-city" onClick={() => setPick("from")}>
          <small>{t("From")}</small>
          <b dir="auto">{from ? cityName(from) : t("Pick a city")}</b>
        </button>
        <button className="tv-swap" onClick={swap} aria-label={t("Swap")} disabled={!from || !to}>⇄</button>
        <button className="tv-city" onClick={() => setPick("to")}>
          <small>{t("To")}</small>
          <b dir="auto">{to ? cityName(to) : t("Pick a city")}</b>
        </button>
      </div>

      <div className="tv-days" role="tablist" aria-label={t("Day")}>
        {days.map((d, i) => (
          <button key={d} role="tab" aria-selected={d === date} className={d === date ? "on" : ""} onClick={() => setDate(d)}>{dayLabel(d, i)}</button>
        ))}
      </div>

      <div className="tv-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>{t("All")}</button>
        {MODE_KEYS.map((m) => (
          <button key={m} role="tab" aria-selected={tab === m} className={tab === m ? "on" : ""} onClick={() => setTab(m)} disabled={!!answer?.none.includes(m)}>
            {MODES[m].emoji} {t(MODES[m].label)} {answer && !answer.none.includes(m) && <small>{fmtNum(modeTrips(m).length)}</small>}
          </button>
        ))}
        <button role="tab" aria-selected={tab === "stays"} className={tab === "stays" ? "on" : ""} onClick={() => setTab("stays")}>🏨 {t("Stays")} {stays && <small>{fmtNum(stays.length)}</small>}</button>
      </div>

      <SearchField value={words} onChange={setWords} placeholder={tab === "stays" ? t("Name of the place") : t("Airline, company, train number…")} />
      <FilterBar count={nFilters} open={open} onToggle={() => setOpen(!open)} panelId={PANEL}>
        <select className="fx-sort" value={tab === "stays" ? staySort : sort} onChange={(e) => (tab === "stays" ? setStaySort(e.target.value as StaySort) : setSort(e.target.value as TripSort))} aria-label={t("Sort")}>
          {tab === "stays" ? STAY_SORT_KEYS.map((k) => <option key={k} value={k}>{t(STAY_SORTS[k])}</option>) : TRIP_SORT_KEYS.map((k) => <option key={k} value={k}>{t(TRIP_SORTS[k])}</option>)}
        </select>
        {tab === "stays"
          ? (Object.keys(STAY_KINDS) as StayKind[]).filter((k) => stays?.some((s) => s.kind === k)).map((k) => <Chip key={k} on={kinds.includes(k)} emoji={STAY_KINDS[k].emoji} label={t(STAY_KINDS[k].label)} onClick={() => setKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))} />)
          : DAY_PART_KEYS.map((p) => <Chip key={p} on={parts.includes(p)} emoji={DAY_PARTS[p].emoji} label={t(DAY_PARTS[p].label)} onClick={() => setParts((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))} />)}
      </FilterBar>
      <FilterPanel id={PANEL} open={open} onClear={nFilters ? clear : undefined} onDone={() => setOpen(false)} results={t("Show {n} results", { n: fmtNum(tab === "stays" ? shownStays.length : shown.length) })}>
        {priceCaps.length > 0 && (
          <FilterGroup title={tab === "stays" ? t("Price a night") : t("Price")}>
            <Chip on={!(tab === "stays" ? stayMax : max)} label={t("Any price")} onClick={() => (tab === "stays" ? setStayMax(0) : setMax(0))} />
            {priceCaps.map((c) => <Chip key={c} on={(tab === "stays" ? stayMax : max) === c} label={t("Under {n}", { n: toman(c) })} onClick={() => (tab === "stays" ? setStayMax(c) : setMax(c))} />)}
          </FilterGroup>
        )}
        {tab === "stays" ? (
          <>
            <FilterGroup title={t("Guests")}>
              {[0, 2, 4, 6, 10].map((g) => <Chip key={g} on={guests === g} label={g ? t("{n}+ guests", { n: fmtNum(g) }) : t("Any")} onClick={() => setGuests(g)} />)}
            </FilterGroup>
            <FilterGroup title={t("Booking")}>
              <Chip on={instant} emoji="⚡" label={t("Instant booking")} onClick={() => setInstant(!instant)} />
            </FilterGroup>
          </>
        ) : (
          <>
            <FilterGroup title={t("Ticket")}>
              <Chip on={seatsOnly} label={t("Seats left")} onClick={() => setSeatsOnly(!seatsOnly)} />
              <Chip on={refundable} label={t("Refundable")} onClick={() => setRefundable(!refundable)} />
              <Chip on={direct} label={t("Direct only")} onClick={() => setDirect(!direct)} />
            </FilterGroup>
            {facets.companies.length > 1 && (
              <FilterGroup title={t("Company")}>
                {facets.companies.filter((c) => tab === "all" || trips.some((x) => x.mode === tab && x.company === c.name)).slice(0, 24).map((c) => (
                  <Chip key={c.name} on={companies.includes(c.name)} label={c.name} n={c.n} onClick={() => setCompanies((v) => (v.includes(c.name) ? v.filter((x) => x !== c.name) : [...v, c.name]))} />
                ))}
              </FilterGroup>
            )}
          </>
        )}
      </FilterPanel>

      {!to ? null : tab === "stays" ? (
        <StaysList stays={stays} shown={shownStays} city={to} />
      ) : (
        <>
          {err && <p className="small tv-err">{err}</p>}
          {savedAt > 0 && <p className="tiny muted tv-saved">{loading ? t("Saved {when} — updating…", { when: fmtWhen(savedAt) }) : t("Saved {when}", { when: fmtWhen(savedAt) })}</p>}
          {tab === "all" && answer && <Compare trips={trips} none={answer.none} onPick={setTab} />}
          {loading && !answer && <TripSkeleton />}
          {answer && !shown.length && !loading && <p className="muted small tv-empty">{trips.length ? t("Nothing matches — loosen a filter") : t("No tickets that day — try another day")}</p>}
          <div className="tv-list" aria-busy={loading}>
            {shown.slice(0, 120).map((x) => <TripRow key={x.id} trip={x} />)}
          </div>
          {from && to && answer && (
            <div className="tv-compare-sites">
              <span className="small muted">{t("Compare on")}</span>
              {(tab === "all" ? MODE_KEYS : [tab]).flatMap((m) => COMPARE[m].map((s) => ({ m, s }))).map(({ m, s }) => (
                <a key={`${m}${s}`} className="chip small" href={bookUrl(s, m, { from, to, date })} target="_blank" rel="noreferrer noopener" style={{ ["--site" as string]: TRAVEL_SITES[s].color }}>
                  {MODES[m].emoji} {t(TRAVEL_SITES[s].name)} ↗
                </a>
              ))}
              <a className="chip small" href={tourLink(to)} target="_blank" rel="noreferrer noopener">🧳 {t("Tours to {city}", { city: cityName(to) })} ↗</a>
            </div>
          )}
          {answer?.failed.length ? <p className="tiny muted">{t("Some sites didn't answer: {list}", { list: answer.failed.map((f) => t(TRAVEL_SITES[f.split(":")[0] as keyof typeof TRAVEL_SITES]?.name ?? f)).join("، ") })}</p> : null}
        </>
      )}
    </Sheet>
  );
}

/** The three ways side by side: cheapest and fastest of each, and how many there are. */
function Compare({ trips, none, onPick }: { trips: Trip[]; none: Mode[]; onPick: (m: Mode) => void }) {
  return (
    <div className="tv-modes">
      {MODE_KEYS.map((m) => {
        const list = trips.filter((x) => x.mode === m && (x.seats ?? 1) > 0);
        const cheap = list.reduce<Trip | null>((a, b) => (!a || b.price < a.price ? b : a), null);
        const fast = list.reduce<Trip | null>((a, b) => (b.minutes != null && (!a || (a.minutes ?? 1e9) > b.minutes) ? b : a), null);
        return (
          <button key={m} className="tv-mode" disabled={none.includes(m) || !list.length} onClick={() => onPick(m)}>
            <span className="tv-mode-ic" aria-hidden>{MODES[m].emoji}</span>
            <b>{t(MODES[m].label)}</b>
            {none.includes(m) ? (
              <small className="muted">{t("No route")}</small>
            ) : !list.length ? (
              <small className="muted">{t("None that day")}</small>
            ) : (
              <>
                <small>{t("from {price}", { price: toman(cheap!.price) })}</small>
                {fast?.minutes != null && <small className="muted">⏱ {span(fast.minutes)}</small>}
                <small className="muted">{t("{n} options", { n: fmtNum(list.length) })}</small>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TripRow({ trip: x }: { trip: Trip }) {
  const [more, setMore] = useState(false);
  const full = x.seats === 0;
  return (
    <article className={`tv-trip ${full ? "full" : ""}`}>
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
            <small className={full ? "tv-full" : (x.seats ?? 9) < 5 ? "tv-few" : "muted"}>{full ? t("Full") : x.seats != null ? t("{n} seats", { n: fmtNum(x.seats) }) : ""}</small>
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

function StaysList({ stays, shown, city }: { stays: Stay[] | null; shown: Stay[]; city: City }) {
  if (!stays) return <TripSkeleton />;
  return (
    <>
      {!shown.length && <p className="muted small tv-empty">{stays.length ? t("Nothing matches — loosen a filter") : t("No places to stay listed here yet")}</p>}
      <div className="tv-stays">
        {shown.slice(0, 90).map((s) => (
          <a key={s.id} className="tv-stay" href={s.url} target="_blank" rel="noreferrer noopener">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.photo} alt="" loading="lazy" />
            <div className="tv-stay-body">
              <b dir="auto">{s.name}</b>
              <Meta parts={[`${STAY_KINDS[s.kind].emoji} ${t(STAY_KINDS[s.kind].label)}`, s.rating && `★ ${fmtNum(s.rating)}${s.reviews ? ` (${fmtNum(s.reviews)})` : ""}`, s.capacity && t("{n} guests", { n: fmtNum(s.capacity) }), s.dist != null && formatDistance(s.dist), s.instant && `⚡ ${t("Instant")}`]} />
              <div className="tv-price">
                {s.was && <s className="tiny muted">{fmtNum(s.was)}</s>}
                <b>{toman(s.price)}</b> <small className="muted">{t("a night")}</small>
              </div>
            </div>
          </a>
        ))}
      </div>
      <div className="tv-compare-sites">
        <span className="small muted">{t("More hotels on")}</span>
        {hotelLinks(city).map((l) => (
          <a key={l.site} className="chip small" href={l.url} target="_blank" rel="noreferrer noopener" style={{ ["--site" as string]: TRAVEL_SITES[l.site].color }}>{t(TRAVEL_SITES[l.site].name)} ↗</a>
        ))}
      </div>
    </>
  );
}

/** Pick a city: search in Persian or English (or an airport code), or tap a popular one. */
function CityPicker({ title, here, exclude, onPick, onClose }: { title: string; here: City | null; exclude: City | null; onPick: (c: City) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  // With nothing typed, "near you" is its own row above the popular ones (not listed twice).
  const list = useMemo(() => findCities(q, 40).filter((c) => c.key !== exclude?.key && (q || c.key !== here?.key)), [q, exclude?.key, here?.key]);
  const ways = (c: City) => MODE_KEYS.filter((m) => cityHas(c, m)).map((m) => MODES[m].emoji).join(" ");
  return (
    <Sheet title={title} onClose={onClose} tall>
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
    </Sheet>
  );
}
