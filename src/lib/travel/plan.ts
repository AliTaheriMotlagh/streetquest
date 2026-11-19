// A whole trip (pure; tests/travelPlan.test.ts): from a home city through any number of cities —
// so many nights in each — and back, or not. Each leg goes its own way (a flight there, the train
// on, a bus back, or your own car), each city has its own stay, and the plan adds it all up for
// everyone travelling: tickets, nights and fuel, the total and per person.
//
//   plan  = { home, stops: [{ city, nights }…], back, travellers, start }
//   legs  = home → stop 1 → stop 2 … (→ home): each leg's day follows from the nights before it
//   picks = per leg: a ticket (a Trip from lib/travel) or "car"; per stop: a stay
import { distanceM } from "../geo";
import { msg } from "../i18n";
import { S } from "../settings";
import { cityByKey, isoDay, type City, type Mode, type Stay, type Trip } from "./index";

/** How a leg is travelled: a ticket (flight, train, bus) or your own car. */
export type Way = Mode | "car";
export const WAYS: Record<Way, { emoji: string; label: string }> = {
  flight: { emoji: "✈️", label: msg("Flight") },
  train: { emoji: "🚆", label: msg("Train") },
  bus: { emoji: "🚌", label: msg("Bus") },
  car: { emoji: "🚗", label: msg("Own car") },
};
export const WAY_KEYS = Object.keys(WAYS) as [Way, ...Way[]];

export type Stop = { city: string; nights: number };
export type Plan = {
  /** Where the trip starts (a city key). */
  home: string;
  stops: Stop[];
  /** Back home at the end. */
  back: boolean;
  travellers: number;
  /** The first leg's day (yyyy-mm-dd). */
  start: string;
  /** Things to do on the way (lib/travel/activities.ts), each with its price a person and how many go. */
  acts?: ActPick[];
  /** "My fuel card still has quota": the car's petrol at the cheaper tiers first (fuelCost). */
  quota?: boolean;
};
/** An outing added to the trip: the price a person (toman, editable — the list's is an estimate) and how many of you go. */
export type ActPick = { id: string; city: string; title: string; emoji: string; price: number; people: number };
export type Leg = { i: number; from: string; to: string; date: string };

/** What was chosen for a leg: the ticket (its price is per person), or the car. */
export type LegPick = { way: "car" } | { way: Mode; trip: Trip };
/** What was chosen for a stop's nights (price a night, for the place). */
export type StayPick = { stay: Stay };

export const MAX_STOPS = 8;
export const MAX_NIGHTS = 30;
export const MAX_TRAVELLERS = 9;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A new plan: from home, nowhere yet, starting tomorrow (Iran time). */
export const newPlan = (home: string, now = Date.now()): Plan => ({ home, stops: [], back: true, travellers: 1, start: isoDay(now, 1) });

/** The legs, in order, each on its day: you leave a city the morning after your last night there. */
export function legsOf(p: Plan): Leg[] {
  const out: Leg[] = [];
  let at = p.home, day = p.start;
  for (const s of p.stops) {
    if (s.city !== at) out.push({ i: out.length, from: at, to: s.city, date: day });
    day = addDays(day, Math.max(0, s.nights));
    at = s.city;
  }
  if (p.back && p.stops.length && at !== p.home) out.push({ i: out.length, from: at, to: p.home, date: day });
  return out;
}

/** The day you arrive at each stop and the day you leave it (yyyy-mm-dd). */
export function stopDays(p: Plan): { arrive: string; leave: string }[] {
  let day = p.start;
  return p.stops.map((s) => {
    const arrive = day;
    day = addDays(day, Math.max(0, s.nights));
    return { arrive, leave: day };
  });
}

/** Days from the first leg to the last. */
export const tripDays = (p: Plan) => p.stops.reduce((n, s) => n + Math.max(0, s.nights), 0);

// ---------------------------------------------------------------- driving there yourself
/** Roads wind: a road trip is about this much longer than the straight line. */
export const ROAD_FACTOR = 1.3;
/** Average speed on intercity roads with a stop or two (km/h). */
export const ROAD_KMH = 80;
/** A family car on the highway (litres per 100 km). */
export const CAR_L_PER_100KM = 8;
export type FuelPrices = { quotaToman: number; quotaLitres: number; tier2Toman: number; tier2Litres: number; toman: number };
/** Today's petrol prices (Admin → Game settings → Travel planner). */
export const fuelPrices = (): FuelPrices => ({ quotaToman: S.fuelQuotaToman, quotaLitres: S.fuelQuotaLitres, tier2Toman: S.fuelTier2Toman, tier2Litres: S.fuelTier2Litres, toman: S.fuelToman });

/**
 * One car's petrol in toman. A trip is extra driving, so by default every litre is at the price beyond the quota;
 * with quota left the first litres are at the quota price, the next at the second tier, the rest beyond.
 */
export function fuelCost(litres: number, quota = false, f: FuelPrices = fuelPrices()): number {
  if (!quota) return litres * f.toman;
  const a = Math.min(litres, f.quotaLitres), b = Math.min(litres - a, f.tier2Litres);
  return a * f.quotaToman + b * f.tier2Toman + (litres - a - b) * f.toman;
}
/** People per car. */
export const CAR_SEATS = 4;

export type Drive = { km: number; minutes: number; litres: number; fuel: number; cars: number };

/** Driving a leg yourself: road distance, time, petrol and its cost for every car needed (null: a city without a position). */
export function driveOf(from: City | null, to: City | null, travellers = 1, quota = false): Drive | null {
  if (from?.lat == null || from.lng == null || to?.lat == null || to.lng == null) return null;
  const km = Math.round((distanceM({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) / 1000) * ROAD_FACTOR);
  const cars = Math.max(1, Math.ceil(travellers / CAR_SEATS));
  const litres = Math.round((km * CAR_L_PER_100KM) / 100);
  return { km, minutes: Math.round((km / ROAD_KMH) * 60), litres, fuel: fuelCost(litres, quota) * cars, cars };
}

// ---------------------------------------------------------------- the bill
export type Bill = {
  tickets: number;
  fuel: number;
  stays: number;
  /** Outings (activities). */
  acts: number;
  total: number;
  perPerson: number;
  /** Legs and stops with nothing chosen yet. */
  open: { legs: number; stays: number };
};

/** Everything added up for everyone: tickets × travellers, fuel per car, each stay × its nights. */
export function billOf(p: Plan, legPicks: Record<number, LegPick | undefined>, stayPicks: Record<number, StayPick | undefined>): Bill {
  const legs = legsOf(p);
  let tickets = 0, fuel = 0, stays = 0, openLegs = 0, openStays = 0;
  for (const l of legs) {
    const pick = legPicks[l.i];
    if (!pick) openLegs++;
    else if (pick.way === "car") fuel += driveOf(cityByKey(l.from), cityByKey(l.to), p.travellers, !!p.quota)?.fuel ?? 0;
    else tickets += pick.trip.price * p.travellers;
  }
  p.stops.forEach((s, i) => {
    if (s.nights <= 0) return;
    const pick = stayPicks[i];
    if (!pick) openStays++;
    else stays += pick.stay.price * s.nights * roomsFor(pick.stay, p.travellers);
  });
  // Outings only count in cities the trip still goes to.
  const where = new Set(p.stops.map((s) => s.city));
  const acts = (p.acts ?? []).reduce((sum, a) => sum + (where.has(a.city) ? Math.max(0, a.price) * Math.max(0, a.people) : 0), 0);
  const total = tickets + fuel + stays + acts;
  return { tickets, fuel, stays, acts, total, perPerson: Math.round(total / Math.max(1, p.travellers)), open: { legs: openLegs, stays: openStays } };
}

/** One thing on a day of the trip: travelling a leg, a night in a city, or home again. */
export type DayItem =
  | { kind: "go"; leg: Leg; pick?: LegPick }
  | { kind: "night"; stop: number; city: string; night: number; of: number; pick?: StayPick }
  | { kind: "home"; city: string };
/** The trip day by day (day 1 = the first leg's day), each day's things in the order they happen. */
export type TripDay = { date: string; n: number; items: DayItem[] };

/** The plan as a diary: which day you travel where (and how, once chosen), which nights you sleep where. */
export function itinerary(p: Plan, legPicks: Record<number, LegPick | undefined> = {}, stayPicks: Record<number, StayPick | undefined> = {}): TripDay[] {
  const legs = legsOf(p), days = stopDays(p);
  const out = new Map<string, DayItem[]>();
  const add = (date: string, it: DayItem) => (out.get(date) ?? out.set(date, []).get(date)!).push(it);
  let li = 0;
  p.stops.forEach((s, i) => {
    const leg = legs[li];
    if (leg && leg.to === s.city && leg.date === days[i].arrive) add(leg.date, { kind: "go", leg, pick: legPicks[legs[li++].i] });
    for (let k = 0; k < s.nights; k++) add(addDays(days[i].arrive, k), { kind: "night", stop: i, city: s.city, night: k + 1, of: s.nights, pick: stayPicks[i] });
  });
  for (; li < legs.length; li++) {
    add(legs[li].date, { kind: "go", leg: legs[li], pick: legPicks[legs[li].i] });
    if (legs[li].to === p.home) add(legs[li].date, { kind: "home", city: p.home });
  }
  const dayN = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${p.start}T12:00:00Z`)) / 86_400_000) + 1;
  return [...out].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, n: dayN(date), items }));
}

/** How many of a place everyone needs (a place for 2 and 5 travelling: 3). */
export const roomsFor = (s: Stay, travellers: number) => Math.max(1, Math.ceil(travellers / Math.max(1, s.capacity ?? 2)));

// ---------------------------------------------------------------- comparing the ways for one leg
export type WayBest = { way: Way; n: number; cheapest?: Trip; fastest?: Trip; drive?: Drive; none?: boolean };

/** Each way side by side for one leg: how many, the cheapest and the fastest (with seats); the car's numbers. */
export function compareWays(trips: Trip[], from: City | null, to: City | null, travellers = 1, none: Mode[] = [], quota = false): WayBest[] {
  return WAY_KEYS.map((way) => {
    if (way === "car") {
      const drive = driveOf(from, to, travellers, quota);
      return { way, n: drive ? 1 : 0, drive: drive ?? undefined, none: !drive };
    }
    const list = trips.filter((x) => x.mode === way && (x.seats == null || x.seats >= travellers));
    const cheapest = list.reduce<Trip | undefined>((a, b) => (!a || b.price < a.price ? b : a), undefined);
    const fastest = list.reduce<Trip | undefined>((a, b) => (b.minutes != null && (!a || (a.minutes ?? 1e9) > b.minutes) ? b : a), undefined);
    return { way, n: list.length, cheapest, fastest, none: none.includes(way) };
  });
}

/** The cheapest ticket for everyone on one leg, any way (or null). */
export const cheapestTrip = (trips: Trip[], travellers = 1) =>
  trips.filter((x) => x.seats == null || x.seats >= travellers).reduce<Trip | null>((a, b) => (!a || b.price < a.price ? b : a), null);

// ---------------------------------------------------------------- keeping it
/** A plan read back from storage or a link: only what makes sense survives. */
export function cleanPlan(v: unknown, now = Date.now()): Plan | null {
  const o = v as Partial<Plan> | null;
  if (!o || typeof o.home !== "string" || !cityByKey(o.home)) return null;
  const stops = (Array.isArray(o.stops) ? o.stops : [])
    .filter((s): s is Stop => !!s && typeof s.city === "string" && !!cityByKey(s.city))
    .slice(0, MAX_STOPS)
    .map((s) => ({ city: s.city, nights: Math.max(0, Math.min(MAX_NIGHTS, Math.round(Number(s.nights) || 0))) }));
  const today = isoDay(now, 0);
  const start = typeof o.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.start) && o.start >= today ? o.start : isoDay(now, 1);
  const acts = (Array.isArray(o.acts) ? o.acts : [])
    .filter((a): a is ActPick => !!a && typeof a.id === "string" && typeof a.city === "string" && typeof a.title === "string")
    .slice(0, 40)
    .map((a) => ({ id: a.id, city: a.city, title: a.title.slice(0, 120), emoji: typeof a.emoji === "string" ? a.emoji.slice(0, 8) : "", price: Math.max(0, Math.min(1e10, Math.round(Number(a.price) || 0))), people: Math.max(1, Math.min(MAX_TRAVELLERS, Math.round(Number(a.people) || 1))) }));
  return { home: o.home, stops, back: o.back !== false, travellers: Math.max(1, Math.min(MAX_TRAVELLERS, Math.round(Number(o.travellers) || 1))), start, ...(acts.length ? { acts } : {}), ...(o.quota === true ? { quota: true } : {}) };
}
