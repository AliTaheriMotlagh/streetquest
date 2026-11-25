// Travel (pure; tests/travel.test.ts): getting from one Iranian city to another and where to stay.
//  - cities: every place a ticket can be bought to — train stations (Raja ids, positions), bus cities
//    (8-digit ids, provinces) and airports (IATA) — merged by name (hubs.generated.json);
//  - trips: flights, trains and buses read from Alibaba and MrBilit, one list: the same flight (or
//    train) sold by both is one row with each site's price, cheapest first ("also on");
//  - stays: villas, suites, hotels and apartments from Jabama, with Alibaba's and Booking.ir's hotel
//    pages to compare;
//  - filter (mode, price, time of day, company, seats, refundable, duration, direct) and sort
//    (cheapest, earliest, latest, fastest, most seats; stays by price, rating, distance, size);
//  - each row books on its own site (Jalali dates for Alibaba).
// Every price here is TOMAN (the sites send rials).
import { distanceM, type LatLng } from "../geo";
import { msg } from "../i18n";
import HUBS from "./hubs.generated.json";

export type Mode = "flight" | "train" | "bus";
export type TripSource = "alibaba" | "mrbilit";
export const MODES: Record<Mode, { emoji: string; label: string }> = {
  flight: { emoji: "✈️", label: msg("Flights") },
  train: { emoji: "🚆", label: msg("Trains") },
  bus: { emoji: "🚌", label: msg("Buses") },
};
export const MODE_KEYS = Object.keys(MODES) as [Mode, ...Mode[]];

/** The ticket and stay sites: those the game reads, and those it links to for comparing. */
export const TRAVEL_SITES = {
  alibaba: { name: msg("Alibaba"), color: "#fdb713", reads: true },
  mrbilit: { name: msg("MrBilit"), color: "#0f6dd6", reads: true },
  jabama: { name: msg("Jabama"), color: "#ff7a00", reads: true },
  flytoday: { name: msg("Flytoday"), color: "#1b5bd8", reads: false },
  raja: { name: msg("Raja (railways)"), color: "#0a7a3d", reads: false },
  payaneh: { name: msg("Payaneh"), color: "#e3262f", reads: false },
  bookingir: { name: msg("Booking.ir"), color: "#2a62a8", reads: false },
} as const;
export type TravelSite = keyof typeof TRAVEL_SITES;

// ---------------------------------------------------------------- cities
export type City = {
  /** Unique: its English name in lower case ("tehran"). */
  key: string;
  fa: string;
  en: string;
  province: string;
  lat?: number;
  lng?: number;
  /** Its airport's IATA code (THR). */
  iata?: string;
  airport?: string;
  /** Its train station's Raja id (Tehran 1, Mashhad 191). */
  train?: number;
  /** Its bus city id (Tehran 11320000). */
  bus?: number;
};

/** Persian names as the sites write them differently: Arabic ي/ك, half-spaces, "بندر عباس"/"بندرعباس". */
export const normFa = (s: string) =>
  s
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d\s\-_.]/g, "")
    .replace(/^استان/, "")
    .trim()
    .toLowerCase();

/** Alibaba's airport list misspells a few English names (and calls Kermanshah "Kerman"). */
const EN_FIX: Record<string, string> = { MHD: "Mashhad", AWZ: "Ahvaz", KSH: "Kermanshah", SYJ: "Sirjan", YES: "Yasuj", OMH: "Urmia", IMQ: "Maku", AFZ: "Sabzevar", PFQ: "Parsabad" };
type Hubs = { stations: [number, string, string, number, number][]; busCities: [number, string, string, string][]; airports: [string, string, string, number | null, number | null, string][] };
function buildCities(h: Hubs): City[] {
  const by = new Map<string, City>();
  const get = (fa: string, en: string) => {
    const k = normFa(fa);
    let c = by.get(k);
    if (!c) by.set(k, (c = { key: en.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || k, fa: fa.trim(), en: en.trim(), province: "" }));
    return c;
  };
  // Airports first (their English names are the cleanest), then stations (positions), then bus cities.
  for (const [iata, fa, en, lat, lng, name] of h.airports) {
    const c = get(fa, EN_FIX[iata] ?? en);
    Object.assign(c, { iata, airport: name || undefined });
    if (lat != null && lng != null) Object.assign(c, { lat, lng });
  }
  // A station listed at another station's exact spot is a placeholder (Sahand, by Tabriz, "at" Tehran): no position.
  const spots = new Map<string, number>();
  for (const [id, , , lat, lng] of h.stations) spots.set(`${lat},${lng}`, Math.min(id, spots.get(`${lat},${lng}`) ?? id));
  for (const [id, fa, en, lat, lng] of h.stations) {
    const c = get(fa, en.replace(/^./, (x) => x.toUpperCase()));
    const real = spots.get(`${lat},${lng}`) === id;
    Object.assign(c, { train: id, lat: c.lat ?? (real ? lat : undefined), lng: c.lng ?? (real ? lng : undefined) });
  }
  for (const [id, fa0, en0, prov] of h.busCities) {
    // "تهران - همه پایانه‌ها" is the city; "تهران - پایانه جنوب" one of its terminals (not a city).
    const all = /همه\s*پایانه/.test(fa0);
    if (!all && /پایانه/.test(fa0)) continue;
    const fa = fa0.replace(/\s*-\s*همه\s*پایانه.*$/, ""), en = en0.replace(/\s*-\s*All Terminals.*$/i, "");
    Object.assign(get(fa, en), { bus: id, province: prov.replace(/^استان\s*/, "") });
  }
  // Keys stay unique even when two towns share an English name.
  const seen = new Map<string, number>();
  const out = [...by.values()].map((c) => {
    const n = seen.get(c.key) ?? 0;
    seen.set(c.key, n + 1);
    return n ? { ...c, key: `${c.key}-${n + 1}` } : c;
  });
  return out.sort((a, b) => a.fa.localeCompare(b.fa, "fa"));
}
export const CITIES: City[] = buildCities(HUBS as unknown as Hubs);
const BY_KEY = new Map(CITIES.map((c) => [c.key, c]));
export const cityByKey = (k: string) => BY_KEY.get(k) ?? null;
/** Cities a mode reaches. */
export const cityHas = (c: City, m: Mode) => (m === "flight" ? !!c.iata : m === "train" ? c.train != null : c.bus != null);

/** The big cities first in the picker (most travelled). */
export const POPULAR = ["tehran", "mashhad", "isfahan", "shiraz", "tabriz", "kish", "yazd", "ahvaz", "rasht", "bandar-abbas", "kerman", "qom", "sari", "gorgan", "qeshm"];

/** Cities whose Persian or English name (or province, or airport code) answers what was typed, best first. */
export function findCities(q: string, limit = 12): City[] {
  const fa = normFa(q), en = q.trim().toLowerCase();
  if (!fa) return POPULAR.map(cityByKey).filter((c): c is City => !!c).slice(0, limit);
  const score = (c: City) => {
    const f = normFa(c.fa), e = c.en.toLowerCase();
    if (f === fa || e === en || c.iata?.toLowerCase() === en) return 0;
    if (f.startsWith(fa) || e.startsWith(en)) return 1;
    if (f.includes(fa) || e.includes(en)) return 2;
    if (normFa(c.province).includes(fa)) return 3;
    return -1;
  };
  return CITIES.map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || POPULAR.indexOf(b.c.key) - POPULAR.indexOf(a.c.key) || a.c.fa.length - b.c.fa.length)
    .slice(0, limit)
    .map((x) => x.c);
}

/** The city a point is in (or nearest to), among those with a known position. */
export function nearestCity(at: LatLng | null | undefined): City | null {
  if (!at) return null;
  let best: City | null = null, bestD = Infinity;
  for (const c of CITIES) {
    if (c.lat == null || c.lng == null) continue;
    const d = distanceM(at, { lat: c.lat, lng: c.lng });
    if (d < bestD) (best = c), (bestD = d);
  }
  return bestD < 150_000 ? best : null;
}

// ---------------------------------------------------------------- dates
/** Gregorian → Jalali (the sites' Persian calendar): 2026-11-20 → [1405, 8, 29]. */
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-20" → "1405-08-29". */
export function jalaliIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [jy, jm, jd] = toJalali(y, m, d);
  return `${jy}-${pad(jm)}-${pad(jd)}`;
}
/** A YYYY-MM-DD this many days from `now` in Iran (the sites' calendar day). */
export const isoDay = (now: number, plusDays = 0) => new Date(now + 3.5 * 3600_000 + plusDays * 86_400_000).toISOString().slice(0, 10);
export const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// ---------------------------------------------------------------- trips
export type Offer = { source: TripSource; price: number; url: string };
export type Trip = {
  /** `<mode>:<what makes it the same trip on every site>`. */
  id: string;
  mode: Mode;
  from: string;
  to: string;
  /** Station / airport / terminal names when the site gives them. */
  fromPlace?: string;
  toPlace?: string;
  /** Local times ("2026-11-20T08:00:00"). */
  depart: string;
  arrive?: string;
  minutes?: number;
  /** `minutes` is an estimate (buses: the sites give no arrival time) — shown as "about". */
  about?: boolean;
  /** The cheapest price on any site (toman). */
  price: number;
  /** Its price before a discount. */
  was?: number;
  seats?: number;
  company: string;
  logo?: string;
  /** Flight / train number. */
  number?: string;
  /** Economy, business, a wagon or a bus type. */
  klass?: string;
  vehicle?: string;
  refundable?: boolean;
  charter?: boolean;
  stops?: number;
  features?: string[];
  /** Every site that sells it, cheapest first (the first is where the price is from). */
  offers: Offer[];
};

const toman = (rial: number | null | undefined) => (rial && rial > 0 ? Math.round(rial / 10) : 0);
const minutesBetween = (a?: string, b?: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : undefined);
const local = (s?: string | null) => (s ? s.replace(/([+-]\d\d:\d\d|Z)$/, "").slice(0, 19) : "");
const hhmm = (s: string) => {
  const m = s.match(/^(\d+):(\d+)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const tidy = (s?: string | null) => (s ?? "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

export type Route = { from: City; to: City; date: string };

/** Where to buy it on each site. */
export function bookUrl(site: TravelSite, mode: Mode, r: Route): string {
  const j = jalaliIso(r.date);
  if (site === "alibaba") {
    if (mode === "flight") return `https://www.alibaba.ir/flights/${r.from.iata}-${r.to.iata}?adult=1&child=0&infant=0&departing=${j}`;
    if (mode === "train") return `https://www.alibaba.ir/train/${r.from.iata ?? r.from.key.toUpperCase().slice(0, 3)}-${r.to.iata ?? r.to.key.toUpperCase().slice(0, 3)}?adult=1&child=0&infant=0&departing=${j}&ticketType=Family&isExclusive=false`;
    return `https://www.alibaba.ir/bus/${r.from.bus}-${r.to.bus}?departing=${j}`;
  }
  if (site === "mrbilit") return mode === "flight" ? `https://mrbilit.com/flights/${r.from.iata}-${r.to.iata}?departureDate=${r.date}&adultCount=1` : mode === "train" ? `https://mrbilit.com/trains/${r.from.key}-${r.to.key}?departureDate=${r.date}&adultCount=1` : "https://mrbilit.com/bus";
  if (site === "flytoday") return `https://www.flytoday.ir/flight/search?departure=${r.from.iata},1&arrival=${r.to.iata},1&departureDate=${r.date}&adt=1&chd=0&inf=0&cabin=1&isDomestic=true`;
  if (site === "raja") return "https://www.raja.ir/";
  if (site === "payaneh") return "https://payaneh.ir/";
  return "https://www.alibaba.ir/";
}
/** The sites to compare a mode on that the game doesn't read itself. */
export const COMPARE: Record<Mode, TravelSite[]> = { flight: ["flytoday"], train: ["raja"], bus: ["payaneh"] };

type AliFlight = { airlineCode?: string; flightNumber?: string; leaveDateTime?: string; arrivalDateTime?: string; aircraft?: string; priceAdult?: number; originalPrice?: number | null; seat?: number; classTypeName?: string; isCharter?: boolean; isRefundable?: boolean; maxAllowedBaggage?: number; terminal?: string; origin?: string; destination?: string };
type AliFlightRes = { result?: { departing?: AliFlight[] } };
export function fromAlibabaFlights(json: unknown, r: Route): Trip[] {
  const list = (json as AliFlightRes)?.result?.departing ?? [];
  return list
    .filter((f) => f.leaveDateTime && f.priceAdult)
    .map((f) => ({
      id: `flight:${f.airlineCode}${f.flightNumber}:${local(f.leaveDateTime)}:${f.classTypeName === "اکونومی" ? "Y" : tidy(f.classTypeName)}`,
      mode: "flight" as const,
      from: r.from.key,
      to: r.to.key,
      fromPlace: f.terminal ? `${r.from.airport ?? r.from.fa} · T${f.terminal}` : r.from.airport,
      toPlace: r.to.airport,
      depart: local(f.leaveDateTime),
      arrive: local(f.arrivalDateTime),
      minutes: minutesBetween(f.leaveDateTime, f.arrivalDateTime),
      price: toman(f.priceAdult),
      was: f.originalPrice && f.originalPrice > (f.priceAdult ?? 0) ? toman(f.originalPrice) : undefined,
      seats: f.seat,
      company: AIRLINES[f.airlineCode ?? ""] ?? f.airlineCode ?? "",
      logo: f.airlineCode ? `https://static.mrbilit.com/img/AirlineLogos/svg/${f.airlineCode}.svg` : undefined,
      number: `${f.airlineCode ?? ""}${f.flightNumber ?? ""}`,
      klass: tidy(f.classTypeName),
      vehicle: f.aircraft,
      refundable: f.isRefundable,
      charter: f.isCharter,
      stops: 0,
      features: f.maxAllowedBaggage ? [`🧳 ${f.maxAllowedBaggage} kg`] : [],
      offers: [{ source: "alibaba" as const, price: toman(f.priceAdult), url: bookUrl("alibaba", "flight", r) }],
    }));
}

/** Airlines by IATA code, as Iranians call them (MrBilit's list fills in the rest). */
export const AIRLINES: Record<string, string> = {
  IR: "ایران‌ایر", W5: "ماهان", EP: "آسمان", B9: "ایران‌ایرتور", ZV: "زاگرس", QB: "قشم‌ایر", I3: "آتا", HH: "تابان", JI: "معراج", NV: "کارون", Y9: "کیش‌ایر", IV: "کاسپین", VR: "وارش", PA: "پارس‌ایر", SR: "سپهران", PY: "پویا", FP: "فلای پرشیا", RV: "آوا", RZ: "یزد ایرویز",
};

type MbLeg = { FlightNumber?: string; OriginAirport?: string; DestinationAirport?: string; AirlineCode?: string; Airline?: { PersianTitle?: string; Logo?: string }; AirCraft?: { PersianTitle?: string }; DepartureTime?: string; ArrivalTime?: string; DepartureTerminal?: string; Stops?: number };
type MbFlight = { Id?: string; Segments?: { Legs?: MbLeg[] }[]; Prices?: { Capacity?: number; CabinClass?: string; CabinClassDisplayName?: string; Baggage?: number; FareRules?: string; PassengerFares?: { PaxType?: string; TotalFare?: number; Discount?: number }[] }[]; IsCharter?: boolean; Refundable?: boolean };
type MbFlightRes = { Flights?: MbFlight[] };
const CABIN: Record<string, string> = { Economy: "Y", Business: "C", PremiumEconomy: "W", First: "F" };
export function fromMrbilitFlights(json: unknown, r: Route): Trip[] {
  const out: Trip[] = [];
  for (const f of (json as MbFlightRes)?.Flights ?? []) {
    const legs = f.Segments?.flatMap((s) => s.Legs ?? []) ?? [];
    const a = legs[0], z = legs[legs.length - 1];
    if (!a?.DepartureTime) continue;
    for (const p of f.Prices ?? []) {
      const adult = p.PassengerFares?.find((x) => x.PaxType === "ADL");
      if (!adult?.TotalFare) continue;
      const code = a.AirlineCode ?? "";
      out.push({
        id: `flight:${code}${a.FlightNumber}:${local(a.DepartureTime)}:${CABIN[p.CabinClass ?? ""] ?? tidy(p.CabinClassDisplayName)}`,
        mode: "flight",
        from: r.from.key,
        to: r.to.key,
        fromPlace: a.DepartureTerminal ? `${a.OriginAirport ?? r.from.fa} · T${a.DepartureTerminal}` : a.OriginAirport,
        toPlace: z.DestinationAirport,
        depart: local(a.DepartureTime),
        arrive: local(z.ArrivalTime),
        minutes: minutesBetween(a.DepartureTime, z.ArrivalTime),
        price: toman(adult.TotalFare),
        was: adult.Discount ? toman(adult.TotalFare + adult.Discount) : undefined,
        seats: p.Capacity,
        company: a.Airline?.PersianTitle || AIRLINES[code] || code,
        logo: a.Airline?.Logo,
        number: `${code}${a.FlightNumber ?? ""}`,
        klass: tidy(p.CabinClassDisplayName),
        vehicle: a.AirCraft?.PersianTitle,
        charter: f.IsCharter,
        stops: Math.max(0, legs.length - 1) + (a.Stops ?? 0),
        features: p.Baggage ? [`🧳 ${p.Baggage} kg`] : [],
        offers: [{ source: "mrbilit", price: toman(adult.TotalFare), url: bookUrl("mrbilit", "flight", r) }],
      });
    }
  }
  return out;
}

type AliTrain = { trainNumber?: number; wagonName?: string; departureDateTime?: string; arrivalDateTime?: string; seat?: number; cost?: number; fullPrice?: number; isCompartment?: boolean; compartmentCapacity?: number; hasAirCondition?: boolean; hasMedia?: boolean; companyName?: string; hasFreeFood?: boolean; nonRefundable?: boolean };
export function fromAlibabaTrains(json: unknown, r: Route): Trip[] {
  const list = (json as { departing?: AliTrain[]; result?: { departing?: AliTrain[] } })?.departing ?? (json as { result?: { departing?: AliTrain[] } })?.result?.departing ?? [];
  return list
    .filter((x) => x.departureDateTime && x.cost)
    .map((x) => trainTrip(r, "alibaba", {
      number: String(x.trainNumber ?? ""), depart: local(x.departureDateTime), arrive: local(x.arrivalDateTime), price: x.cost!, was: x.fullPrice, seats: x.seat, wagon: x.wagonName, company: x.companyName,
      compartment: x.isCompartment ? x.compartmentCapacity : undefined, features: [x.hasAirCondition && "❄️", x.hasMedia && "📺", x.hasFreeFood && "🍱"].filter(Boolean) as string[], refundable: x.nonRefundable === false ? true : x.nonRefundable ? false : undefined,
    }));
}
type MbTrain = { TrainNumber?: number; DepartureTime?: string; ArrivalTime?: string; CorporationName?: string; ProviderName?: string; Cancellable?: boolean; Prices?: { Classes?: { Price?: number; Discount?: number; Capacity?: number; WagonName?: string; CompartmentType?: string; IsCompartment?: boolean; CompartmentCapacity?: number; AirConditioning?: boolean; Media?: boolean; Features?: string[]; IsAvailable?: boolean }[] }[] };
export function fromMrbilitTrains(json: unknown, r: Route): Trip[] {
  const out: Trip[] = [];
  for (const x of (json as { Trains?: MbTrain[] })?.Trains ?? [])
    for (const p of x.Prices ?? [])
      for (const c of p.Classes ?? []) {
        if (!x.DepartureTime || !c.Price || c.IsAvailable === false) continue;
        out.push(trainTrip(r, "mrbilit", {
          number: String(x.TrainNumber ?? ""), depart: local(x.DepartureTime), arrive: local(x.ArrivalTime), price: c.Price, was: c.Discount ? c.Price + c.Discount : undefined, seats: c.Capacity, wagon: c.WagonName, company: x.CorporationName,
          compartment: c.IsCompartment ? c.CompartmentCapacity : undefined, features: [c.AirConditioning && "❄️", c.Media && "📺", ...(c.Features ?? [])].filter(Boolean) as string[], refundable: x.Cancellable,
        }));
      }
  return out;
}
/** The same train on two sites: same number, same minute, same kind of wagon (its stars and compartment size). */
const wagonKey = (w?: string, comp?: number) => `${(w ?? "").match(/\d/)?.[0] ?? ""}${comp ?? 0}`;
function trainTrip(r: Route, source: TripSource, x: { number: string; depart: string; arrive?: string; price: number; was?: number; seats?: number; wagon?: string; company?: string; compartment?: number; features: string[]; refundable?: boolean }): Trip {
  return {
    id: `train:${x.number}:${x.depart}:${wagonKey(x.wagon, x.compartment)}`,
    mode: "train",
    from: r.from.key,
    to: r.to.key,
    fromPlace: r.from.fa,
    toPlace: r.to.fa,
    depart: x.depart,
    arrive: x.arrive,
    minutes: minutesBetween(x.depart, x.arrive),
    price: toman(x.price),
    was: x.was && x.was > x.price ? toman(x.was) : undefined,
    seats: x.seats,
    company: tidy(x.company),
    number: x.number,
    // "4 ستاره غزال" → "غزال ★4": a leading digit next to the train number reads as one number.
    klass: tidy(x.wagon).replace(/^(\d)\s*ستاره\s*(.*)$/, (_m, n: string, rest: string) => `${rest} ★${n}`.trim()),
    vehicle: x.compartment ? `${x.compartment}` : undefined,
    refundable: x.refundable,
    stops: 0,
    features: [...new Set(x.features)],
    offers: [{ source, price: toman(x.price), url: bookUrl(source, "train", r) }],
  };
}

type AliBus = { proposalId?: string; companyName?: string; departureDateTime?: string; price?: number; beforeDiscountPrice?: number; availableSeats?: number; busType?: string; orginTerminal?: string | null; destinationTerminal?: string | null; isRefundable?: boolean; distance?: number; logoPath?: string; rate?: number };
/** Intercity buses average about this, stops and terminals included (km/h). */
export const BUS_KMH = 70;
/** Roads wind: about this much longer than the straight line (plan.ts ROAD_FACTOR; that file imports this one). */
const WINDING = 1.3;

/** A bus ride's length in minutes (rounded to 5), from the road distance the site gives, else from the
 *  cities' positions; undefined when neither is known. The sites list departures only, never arrivals. */
export function busMinutes(roadKm: number | null | undefined, from?: { lat?: number | null; lng?: number | null } | null, to?: { lat?: number | null; lng?: number | null } | null): number | undefined {
  let km = roadKm && roadKm > 0 ? roadKm : 0;
  if (!km && from?.lat != null && from.lng != null && to?.lat != null && to.lng != null) km = (distanceM({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) / 1000) * WINDING;
  if (!km) return undefined;
  return Math.max(5, Math.round(((km / BUS_KMH) * 60) / 5) * 5);
}

export function fromAlibabaBuses(json: unknown, r: Route): Trip[] {
  const list = (json as { result?: { availableList?: AliBus[] } })?.result?.availableList ?? [];
  return list
    .filter((b) => b.departureDateTime && b.price)
    .map((b) => ({
      id: `bus:${tidy(b.companyName)}:${local(b.departureDateTime)}:${tidy(b.busType)}`,
      mode: "bus" as const,
      from: r.from.key,
      to: r.to.key,
      fromPlace: tidy(b.orginTerminal) || r.from.fa,
      toPlace: tidy(b.destinationTerminal) || r.to.fa,
      depart: local(b.departureDateTime),
      minutes: busMinutes(b.distance, r.from, r.to),
      about: true,
      price: toman(b.price),
      was: b.beforeDiscountPrice && b.beforeDiscountPrice > (b.price ?? 0) ? toman(b.beforeDiscountPrice) : undefined,
      seats: b.availableSeats,
      company: tidy(b.companyName),
      logo: b.logoPath || undefined,
      klass: tidy(b.busType),
      refundable: b.isRefundable,
      stops: 0,
      features: b.distance ? [`${Math.round(b.distance)} km`] : [],
      offers: [{ source: "alibaba" as const, price: toman(b.price), url: bookUrl("alibaba", "bus", r) }],
    }));
}

/** One row per trip: offers from several sites joined (cheapest first; the row takes the cheapest's price). */
export function mergeTrips(lists: Trip[][]): Trip[] {
  const by = new Map<string, Trip>();
  for (const t of lists.flat()) {
    const had = by.get(t.id);
    if (!had) {
      by.set(t.id, { ...t, offers: [...t.offers] });
      continue;
    }
    for (const o of t.offers) {
      const same = had.offers.find((x) => x.source === o.source);
      if (!same) had.offers.push(o);
      else if (o.price < same.price) same.price = o.price;
    }
    had.offers.sort((a, b) => a.price - b.price);
    const best = had.offers[0].price;
    if (best < had.price) had.price = best;
    // Fill in what one site knew and the other didn't.
    had.seats = Math.max(had.seats ?? 0, t.seats ?? 0) || undefined;
    had.arrive ||= t.arrive;
    had.minutes ??= t.minutes;
    had.logo ||= t.logo;
    had.vehicle ||= t.vehicle;
    had.refundable ??= t.refundable;
    had.features = [...new Set([...(had.features ?? []), ...(t.features ?? [])])];
  }
  return [...by.values()];
}

export type DayPart = "night" | "morning" | "noon" | "evening";
export const DAY_PARTS: Record<DayPart, { emoji: string; label: string; from: number; to: number }> = {
  night: { emoji: "🌙", label: msg("Night (0–6)"), from: 0, to: 6 },
  morning: { emoji: "🌅", label: msg("Morning (6–12)"), from: 6, to: 12 },
  noon: { emoji: "☀️", label: msg("Afternoon (12–18)"), from: 12, to: 18 },
  evening: { emoji: "🌆", label: msg("Evening (18–24)"), from: 18, to: 24 },
};
export const DAY_PART_KEYS = Object.keys(DAY_PARTS) as DayPart[];
export const dayPartOf = (iso: string): DayPart => {
  const h = Number(iso.slice(11, 13));
  return h < 6 ? "night" : h < 12 ? "morning" : h < 18 ? "noon" : "evening";
};

export type TripSort = "cheap" | "early" | "late" | "fast" | "seats";
export const TRIP_SORTS: Record<TripSort, string> = { cheap: msg("Cheapest first"), early: msg("Earliest first"), late: msg("Latest first"), fast: msg("Fastest first"), seats: msg("Most seats left") };
export const TRIP_SORT_KEYS = Object.keys(TRIP_SORTS) as [TripSort, ...TripSort[]];
export type TripFilter = { modes?: Mode[]; min?: number; max?: number; parts?: DayPart[]; companies?: string[]; seatsOnly?: boolean; refundable?: boolean; direct?: boolean; maxMinutes?: number; q?: string; sort?: TripSort };

/** The trips asked for, in the order asked. Words match the company, number, class or station. */
export function filterTrips(trips: Trip[], f: TripFilter = {}): Trip[] {
  const q = f.q ? normFa(f.q) : "";
  const list = trips.filter(
    (t) =>
      (!f.modes?.length || f.modes.includes(t.mode)) &&
      (!f.min || t.price >= f.min) &&
      (!f.max || t.price <= f.max) &&
      (!f.parts?.length || f.parts.includes(dayPartOf(t.depart))) &&
      (!f.companies?.length || f.companies.includes(t.company)) &&
      (!f.seatsOnly || (t.seats ?? 1) > 0) &&
      (!f.refundable || t.refundable === true) &&
      (!f.direct || !t.stops) &&
      (!f.maxMinutes || (t.minutes ?? 0) <= f.maxMinutes) &&
      (!q || normFa(`${t.company} ${t.number ?? ""} ${t.klass ?? ""} ${t.fromPlace ?? ""} ${t.toPlace ?? ""} ${t.vehicle ?? ""}`).includes(q)),
  );
  const sort = f.sort ?? "cheap";
  const by: Record<TripSort, (a: Trip, b: Trip) => number> = {
    cheap: (a, b) => a.price - b.price || a.depart.localeCompare(b.depart),
    early: (a, b) => a.depart.localeCompare(b.depart) || a.price - b.price,
    late: (a, b) => b.depart.localeCompare(a.depart) || a.price - b.price,
    fast: (a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9) || a.price - b.price,
    seats: (a, b) => (b.seats ?? 0) - (a.seats ?? 0) || a.price - b.price,
  };
  return list.sort(by[sort]);
}

/** What the filters can offer for these trips: companies (most trips first), price range, cheapest per mode. */
export function tripFacets(trips: Trip[]) {
  const companies = new Map<string, number>();
  const cheapest: Partial<Record<Mode, number>> = {};
  let lo = Infinity, hi = 0;
  for (const t of trips) {
    companies.set(t.company, (companies.get(t.company) ?? 0) + 1);
    cheapest[t.mode] = Math.min(cheapest[t.mode] ?? Infinity, t.price);
    lo = Math.min(lo, t.price);
    hi = Math.max(hi, t.price);
  }
  return { companies: [...companies].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })), cheapest, min: Number.isFinite(lo) ? lo : 0, max: hi };
}

// ---------------------------------------------------------------- stays
export type StayKind = "hotel" | "villa" | "suite" | "apartment" | "ecolodge" | "room" | "hostel";
export const STAY_KINDS: Record<StayKind, { emoji: string; label: string }> = {
  hotel: { emoji: "🏨", label: msg("Hotels") },
  villa: { emoji: "🏡", label: msg("Villas") },
  suite: { emoji: "🛏️", label: msg("Suites") },
  apartment: { emoji: "🏢", label: msg("Apartments") },
  ecolodge: { emoji: "🛖", label: msg("Eco-lodges") },
  room: { emoji: "🚪", label: msg("Rooms") },
  hostel: { emoji: "🎒", label: msg("Hostels & inns") },
};
export type Stay = { id: string; source: "jabama"; name: string; kind: StayKind; city: string; lat?: number; lng?: number; dist?: number; price: number; was?: number; rating?: number; reviews?: number; capacity?: number; bedrooms?: number; photo: string; photos: string[]; url: string; verified?: boolean; instant?: boolean; minNights?: number; stars?: number; amenities?: Amenity[] };
/** What a place to stay offers, as the filters and the card show it (Jabama's names folded into these). */
export type Amenity = "pool" | "parking" | "wifi" | "breakfast" | "restaurant" | "gym" | "spa" | "elevator" | "kitchen" | "aircon" | "pets";
export const AMENITIES: Record<Amenity, { emoji: string; label: string }> = {
  pool: { emoji: "🏊", label: msg("Pool") },
  parking: { emoji: "🅿️", label: msg("Parking") },
  wifi: { emoji: "📶", label: msg("Wi-Fi") },
  breakfast: { emoji: "🥐", label: msg("Breakfast") },
  restaurant: { emoji: "🍽️", label: msg("Restaurant") },
  gym: { emoji: "🏋️", label: msg("Gym") },
  spa: { emoji: "💆", label: msg("Spa & sauna") },
  elevator: { emoji: "🛗", label: msg("Lift") },
  kitchen: { emoji: "🍳", label: msg("Kitchen") },
  aircon: { emoji: "❄️", label: msg("Air conditioning") },
  pets: { emoji: "🐾", label: msg("Pets allowed") },
};
const AMENITY_WORDS: [RegExp, Amenity][] = [
  [/pool|استخر/i, "pool"], [/parking|پارکینگ/i, "parking"], [/wi-?fi|internet|اینترنت|وای ?فای/i, "wifi"], [/breakfast|صبحانه/i, "breakfast"],
  [/restaurant|رستوران/i, "restaurant"], [/gym|fitness|باشگاه|بدنسازی/i, "gym"], [/spa|sauna|jacuzzi|massage|سونا|جکوزی|ماساژ/i, "spa"],
  [/elevator|lift|آسانسور/i, "elevator"], [/kitchen|آشپزخانه/i, "kitchen"], [/air ?condition|cooler|کولر|اسپلیت/i, "aircon"], [/pet|حیوان/i, "pets"],
];
/** Jabama's amenity names (English or Persian) → ours, each once. */
export function amenitiesOf(names: string[]): Amenity[] {
  const out = new Set<Amenity>();
  for (const n of names) for (const [re, a] of AMENITY_WORDS) if (re.test(n)) out.add(a);
  return (Object.keys(AMENITIES) as Amenity[]).filter((a) => out.has(a));
}

const KIND_OF: Record<string, StayKind> = {
  hotel: "hotel", hotelapartment: "hotel", hotel_apartment: "hotel", boutique: "hotel", apartment: "apartment", complex: "apartment", villa: "villa", cottage: "villa", suite: "suite",
  ecotourism: "ecolodge", boomgardi: "ecolodge", traditional: "ecolodge", room: "room", personalRoom: "room", inn: "hostel", hostel: "hostel", guesthouse: "hostel",
};
type JbItem = { id?: string; code?: number; name?: string; type?: string; placeType?: string; image?: string; images?: string[]; location?: { city?: string; geo?: { lat?: number; long?: number } }; price?: { perNight?: number | null; mainPrice?: number; discountedPrice?: number; discountPercent?: number }; min_price?: number; rate_review?: { score?: number; count?: number } | null; capacity?: { base?: number; extra?: number }; accommodationMetrics?: { bedroomsCount?: number }; verified?: boolean; reservation_type?: string; min_night?: number; kind?: string; star?: number; amenities?: { name?: string }[] };
/** Jabama's villas/suites (kind "accommodation", `city-<key>`) and hotels (kind "hotel", `hotels-<key>`).
 *  Hotels have no page of their own the game can link (they're Alibaba's), so they open the city's hotel list. */
export function fromJabama(json: unknown, here?: LatLng | null, cityKey?: string): Stay[] {
  const items = (json as { result?: { items?: JbItem[] } })?.result?.items ?? [];
  return items
    .filter((i) => (i.kind === "accommodation" || i.kind === "hotel") && i.name && (i.price?.discountedPrice || i.price?.perNight || i.min_price))
    .map((i) => {
      const lat = i.location?.geo?.lat, lng = i.location?.geo?.long;
      const now = i.price?.discountedPrice || i.price?.perNight || i.min_price || 0;
      const hotel = i.kind === "hotel";
      const type = i.type || i.placeType || (hotel ? "hotel" : "");
      const amen = amenitiesOf((i.amenities ?? []).map((a) => a.name ?? ""));
      return {
        id: `jabama:${i.code || i.id}`,
        source: "jabama" as const,
        name: i.name!.replace(/^(رزرو|اجاره)\s+/, ""),
        kind: KIND_OF[type] ?? KIND_OF[i.placeType ?? ""] ?? (hotel ? "hotel" : "suite"),
        city: i.location?.city ?? "",
        lat,
        lng,
        dist: here && lat != null && lng != null ? Math.round(distanceM(here, { lat, lng })) : undefined,
        price: toman(now),
        was: i.price?.mainPrice && i.price.mainPrice > now ? toman(i.price.mainPrice) : undefined,
        rating: i.rate_review?.score ? Math.round(i.rate_review.score * 10) / 10 : undefined,
        reviews: i.rate_review?.count || undefined,
        capacity: (i.capacity?.base ?? 0) + (i.capacity?.extra ?? 0) || undefined,
        bedrooms: i.accommodationMetrics?.bedroomsCount || undefined,
        photo: i.image ?? i.images?.[0] ?? "",
        photos: (i.images ?? []).slice(0, 8),
        url: hotel ? `https://www.jabama.com/hotels-${cityKey ?? ""}` : `https://www.jabama.com/stay/${type || "suite"}-${i.code}`,
        verified: i.verified,
        instant: i.reservation_type === "instant",
        minNights: i.min_night || undefined,
        stars: i.star && i.star > 0 ? Math.round(i.star) : undefined,
        amenities: amen.length ? amen : undefined,
      };
    });
}

export type StaySort = "cheap" | "dear" | "rating" | "near" | "big" | "stars";
export const STAY_SORTS: Record<StaySort, string> = { cheap: msg("Cheapest first"), dear: msg("Most expensive first"), rating: msg("Best rated"), near: msg("Nearest first"), big: msg("Most guests"), stars: msg("Most stars") };
export const STAY_SORT_KEYS = Object.keys(STAY_SORTS) as [StaySort, ...StaySort[]];
export type StayFilter = { kinds?: StayKind[]; max?: number; min?: number; guests?: number; instant?: boolean; minRating?: number; minStars?: number; amenities?: Amenity[]; q?: string; sort?: StaySort };
export function filterStays(stays: Stay[], f: StayFilter = {}): Stay[] {
  const q = f.q ? normFa(f.q) : "";
  const list = stays.filter(
    (s) =>
      (!f.kinds?.length || f.kinds.includes(s.kind)) &&
      (!f.min || s.price >= f.min) &&
      (!f.max || s.price <= f.max) &&
      (!f.guests || (s.capacity ?? 0) >= f.guests) &&
      (!f.instant || s.instant) &&
      (!f.minRating || (s.rating ?? 0) >= f.minRating) &&
      (!f.minStars || (s.stars ?? 0) >= f.minStars) &&
      (!f.amenities?.length || f.amenities.every((a) => s.amenities?.includes(a))) &&
      (!q || normFa(s.name).includes(q)),
  );
  const by: Record<StaySort, (a: Stay, b: Stay) => number> = {
    cheap: (a, b) => a.price - b.price,
    dear: (a, b) => b.price - a.price,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0),
    near: (a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity),
    big: (a, b) => (b.capacity ?? 0) - (a.capacity ?? 0) || a.price - b.price,
    stars: (a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.rating ?? 0) - (a.rating ?? 0) || a.price - b.price,
  };
  return list.sort(by[f.sort ?? "cheap"]);
}
/** Hotel pages of a city on the sites the game doesn't read (to compare). */
export const hotelLinks = (c: City) => [
  { site: "alibaba" as TravelSite, url: `https://www.alibaba.ir/hotel/ir-${c.key}` },
  { site: "bookingir" as TravelSite, url: "https://www.booking.ir/" },
  { site: "jabama" as TravelSite, url: `https://www.jabama.com/city-${c.key}` },
];
export const tourLink = (c: City) => `https://www.alibaba.ir/tour/iran-${c.key}`;

// ---------------------------------------------------------------- the map's travel hubs (game/TravelLayer.tsx)
/** From which map zoom each kind of hub is shown: airports with the whole country in view, then stations, then bus terminals. */
export const HUB_ZOOM = { air: 4, rail: 6, bus: 8, names: 7 } as const;
/** What a city's pin shows at a zoom: its ways in (✈️ 🚆 🚌, only those shown at that zoom), or nothing. */
export function hubGlyphs(c: Pick<City, "iata" | "train" | "bus" | "lat">, zoom: number): string[] {
  if (c.lat == null) return [];
  const out: string[] = [];
  if (c.iata && zoom >= HUB_ZOOM.air) out.push("✈️");
  if (c.train != null && zoom >= HUB_ZOOM.rail) out.push("🚆");
  if (c.bus != null && zoom >= HUB_ZOOM.bus) out.push("🚌");
  return out;
}
