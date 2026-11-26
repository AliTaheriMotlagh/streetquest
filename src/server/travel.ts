// Travel data (rules: lib/travel, lib/flights.ts). Every answer is cached in ExtCache per route and
// day (tickets 20 min, stays 3 h, live planes 10 s, the schedule 30 min), so players looking at the
// same trip share one request, and each site keeps its own gentle pace (lib/pace.ts). Each site can
// go through the Iran relay or be switched off (lib/relayUrl.ts):
//
//   ALIBABA_URL / MRBILIT_FLIGHT_URL / MRBILIT_TRAIN_URL / JABAMA_URL / JABAMA_EVENTS_URL / ADSB_URL / JAJIGA_URL = "off" | <base>
//
// A site that fails is named in `failed`; the others still answer.
import { siteBase } from "@/lib/relayUrl";
import { distanceM, type LatLng } from "@/lib/geo";
import {
  CITIES, cityByKey, cityHas, fromAlibabaBuses, fromAlibabaFlights, fromAlibabaTrains, fromJabama, fromMrbilitFlights, fromMrbilitTrains, mergeTrips, type City, type Mode, type Route, type Stay, type Trip,
} from "@/lib/travel";
import { fromAdsb, iranTime, mergePlanes, scheduledPlane, type Plane, type Scheduled } from "@/lib/flights";
import { cached, getJson, getText } from "./localData";
import { ndjsonStream } from "@/lib/ndjson";
import { compareLinks, mergeOffers, readable, type SourceOffer, type SourceQuery, type SourceSite } from "@/lib/travel/sources";
import { fromJabamaEvents, jabamaCity, type Experience } from "@/lib/travel/experiences";

const MIN = 60_000;
const TICKETS_TTL = 20 * MIN;
const STAYS_TTL = 3 * 60 * MIN;
/** Bookable experiences change slowly (a new session a day): an hour. */
const EXPERIENCES_TTL = 60 * MIN;
const PLANES_TTL = 10_000;
const SCHEDULE_TTL = 30 * MIN;
/** Alibaba answers a search with an id; its results are read this long after (ms) and once more if empty. */
const ALIBABA_POLL_MS = Number(process.env.ALIBABA_POLL_MS ?? 2500);

const base = {
  alibaba: () => siteBase("alibaba", process.env.ALIBABA_URL, "https://ws.alibaba.ir/api"),
  mrbilitFlight: () => siteBase("mrbilit", process.env.MRBILIT_FLIGHT_URL, "https://flight.atighgasht.com/api"),
  mrbilitTrain: () => siteBase("mrbilit", process.env.MRBILIT_TRAIN_URL, "https://train.atighgasht.com/TrainService/api"),
  jabama: () => siteBase("jabama", process.env.JABAMA_URL, "https://gw.jabama.com/api"),
  jabamaEvents: () => siteBase("jabama", process.env.JABAMA_EVENTS_URL, "https://api.jabama.events"),
  adsb: () => siteBase("adsb", process.env.ADSB_URL, "https://api.adsb.lol/v2"),
  jajiga: () => siteBase("jajiga", process.env.JAJIGA_URL, "https://www.jajiga.com"),
};
/** Where each readable source site is fetched from (its own origin, or the relay / off). */
const SOURCE_BASE: Partial<Record<SourceSite, { origin: string; base: () => string | null }>> = { jajiga: { origin: "https://www.jajiga.com", base: base.jajiga } };
const OFFERS_TTL = 60 * MIN;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Alibaba's two-step searches: POST (or GET) the search, then read the results by its id. */
async function alibabaTwoStep(start: () => Promise<{ result?: { requestId?: string } } | null>, read: (id: string) => string): Promise<unknown | null> {
  const s = await start();
  const id = s?.result?.requestId;
  if (!id) return null;
  for (let i = 0; i < 2; i++) {
    await sleep(ALIBABA_POLL_MS);
    const r = await getJson<{ result?: { departing?: unknown[]; isCompleted?: boolean } }>(read(id));
    if (r && (r.result?.departing?.length || r.result?.isCompleted !== false || i === 1)) return r;
  }
  return null;
}

type Source = { site: string; run: () => Promise<Trip[] | null> };
function sources(mode: Mode, r: Route): Source[] {
  const a = base.alibaba(), mf = base.mrbilitFlight(), mt = base.mrbilitTrain();
  const out: Source[] = [];
  if (mode === "flight" && r.from.iata && r.to.iata) {
    if (a)
      out.push({
        site: "alibaba",
        run: async () => {
          const j = await alibabaTwoStep(
            () => getJson(`${a}/v1/flights/domestic/available`, { infant: 0, child: 0, adult: 1, departureDate: r.date, origin: r.from.iata, destination: r.to.iata, flightClass: "economy", userVariant: "WEB_DESKTOP_DOMESTIC_FLIGHTS" }),
            (id) => `${a}/v1/flights/domestic/available/${id}`,
          );
          return j ? fromAlibabaFlights(j, r) : null;
        },
      });
    if (mf) out.push({ site: "mrbilit", run: async () => { const j = await getJson(`${mf}/Flights`, { AdultCount: 1, ChildCount: 0, InfantCount: 0, CabinClass: "All", Routes: [{ OriginCode: r.from.iata, DestinationCode: r.to.iata, DepartureDate: r.date }] }); return j ? fromMrbilitFlights(j, r) : null; } }); // prettier-ignore
  }
  if (mode === "train" && r.from.train != null && r.to.train != null) {
    if (mt) out.push({ site: "mrbilit", run: async () => { const j = await getJson(`${mt}/GetAvailable/v2?from=${r.from.train}&to=${r.to.train}&date=${r.date}&adultCount=1&childCount=0&infantCount=0&exclusive=false&availableStatus=Both`); return j ? fromMrbilitTrains(j, r) : null; } }); // prettier-ignore
    // Alibaba knows the big stations by their city's airport code.
    if (a && r.from.iata && r.to.iata)
      out.push({
        site: "alibaba",
        run: async () => {
          const j = await alibabaTwoStep(
            () => getJson(`${a}/v2/train/available`, { passengerCount: 1, ticketType: "Family", isExclusiveCompartment: false, departureDate: r.date, origin: r.from.iata, destination: r.to.iata }),
            (id) => `${a}/v1/train/available/${id}`,
          );
          return j ? fromAlibabaTrains(j, r) : null;
        },
      });
  }
  if (mode === "bus" && r.from.bus && r.to.bus && a)
    out.push({ site: "alibaba", run: async () => { const j = await getJson(`${a}/v2/bus/available?orginCityCode=${r.from.bus}&destinationCityCode=${r.to.bus}&requestDate=${r.date}&passengerCount=1`); return j ? fromAlibabaBuses(j, r) : null; } }); // prettier-ignore
  return out;
}

export type TripAnswer = { trips: Trip[]; failed: string[]; /** Modes that don't connect these two cities. */ none: Mode[] };

/** Every flight, train and bus between two cities on a day, each trip once with every site's price. */
export async function tripsBetween(fromKey: string, toKey: string, date: string, modes: Mode[]): Promise<TripAnswer> {
  const from = cityByKey(fromKey), to = cityByKey(toKey);
  if (!from || !to || from.key === to.key) return { trips: [], failed: [], none: modes };
  const r: Route = { from, to, date };
  const failed: string[] = [];
  const none: Mode[] = [];
  const lists = await Promise.all(
    modes.map(async (m) => {
      const src = sources(m, r);
      if (!src.length) return none.push(m), [];
      const got = await Promise.all(
        src.map((s) =>
          cached<Trip[]>(`tr:${m}:${s.site}:${from.key}:${to.key}:${date}`, TICKETS_TTL, s.run)
            .catch(() => null)
            .then((x) => (x ?? (failed.push(`${s.site}:${m}`), []))),
        ),
      );
      return got.flat();
    }),
  );
  return { trips: mergeTrips(lists), failed, none };
}

/**
 * Each page of a city's places to stay, as its own promise (Jabama's villas, suites and flats are its
 * `city-<key>` list; its hotels a separate `hotels-<key>` list (Alibaba's) the first never contains — a
 * few pages each, 40 a page), nearest to `here` when given. Null: the city or the site is unknown.
 */
function stayPages(cityKey: string, here?: LatLng | null): Promise<Stay[] | null>[] | null {
  const c = cityByKey(cityKey), root = base.jabama();
  if (!c || !root) return null;
  const lists = [
    ...[1, 2, 3].map((page) => ({ key: `jb:city:${c.key}:${page}`, url: `${root}/v4/keyword/city-${c.key}?allowEmptyCity=true&hasUnitRoom=true&platform=desktop`, page })),
    ...[1, 2].map((page) => ({ key: `jb:hotels:${c.key}:${page}`, url: `${root}/v4/keyword/hotels-${c.key}?allowEmptyCity=true&platform=desktop`, page })),
  ];
  const near = here ?? (c.lat != null ? { lat: c.lat, lng: c.lng! } : null);
  return lists.map((l) =>
    cached<unknown>(l.key, STAYS_TTL, () => getJson(l.url, { "page-number": l.page, "page-size": 40 }))
      .catch(() => null)
      .then((p) => (p ? fromJabama(p, near, c.key) : null)),
  );
}

/** Places to stay in a city (Jabama's list, its own order), nearest to `here` measured when given. */
export async function staysIn(cityKey: string, here?: LatLng | null): Promise<{ stays: Stay[]; failed: boolean }> {
  const pages = stayPages(cityKey, here);
  if (!pages) return { stays: [], failed: !base.jabama() };
  const got = await Promise.all(pages);
  return { stays: uniqueStays(got.flatMap((p) => p ?? [])), failed: got.every((p) => !p) };
}

/** One place once (a hotel can be on two pages), first seen first. */
export const uniqueStays = (list: Stay[], seen = new Set<string>()) => list.filter((s) => !seen.has(s.id) && !!seen.add(s.id));

/**
 * The same as staysIn, streamed (lib/ndjson.ts): a `{ stays }` line as each page answers — only places
 * not sent yet — then `{ done: true, failed }`. The phone fills the list as the pages come.
 */
export function streamStays(cityKey: string, here?: LatLng | null): ReadableStream<Uint8Array> {
  const pages = stayPages(cityKey, here) ?? [];
  const seen = new Set<string>();
  let any = false;
  return ndjsonStream(
    pages.map((p) => p.then((list) => ((any ||= !!list), { stays: uniqueStays(list ?? [], seen) }))),
    () => ({ done: true, failed: !any }),
  );
}

/**
 * Things to book in a city (Jabama Events — lib/travel/experiences.ts): tours, walks, workshops, shows, with their
 * price a person, next date and reviews; two pages (40), cached an hour. `covered`: the site has the city at all.
 */
export async function experiencesIn(cityKey: string): Promise<{ experiences: Experience[]; covered: boolean; failed: boolean }> {
  const slug = jabamaCity(cityKey), root = base.jabamaEvents();
  if (!slug || !root) return { experiences: [], covered: !!slug, failed: !!slug && !root };
  const first = await cached<unknown>(`je:${slug}:1`, EXPERIENCES_TTL, () => getJson(`${root}/events?city=${slug}`)).catch(() => null);
  const cursor = (first as { nextCursor?: unknown } | null)?.nextCursor;
  const second = typeof cursor === "string" && cursor
    ? await cached<unknown>(`je:${slug}:2`, EXPERIENCES_TTL, () => getJson(`${root}/events?city=${slug}&cursor=${encodeURIComponent(cursor)}`)).catch(() => null)
    : null;
  const seen = new Set<string>();
  const experiences = [first, second].flatMap((p) => fromJabamaEvents(p)).filter((e) => !seen.has(e.id) && !!seen.add(e.id));
  return { experiences, covered: true, failed: !first };
}

/**
 * Offers from the other sites that serve their data openly (lib/travel/sources.ts — today Jajiga's stays),
 * merged cheapest first, and every site's page for the query to compare on. Each site's page is cached an
 * hour; one that fails is named in `failed`.
 */
export async function offersFor(q: SourceQuery): Promise<{ offers: SourceOffer[]; links: ReturnType<typeof compareLinks>; failed: SourceSite[] }> {
  const failed: SourceSite[] = [];
  const key = q.vertical === "ticket" ? `${q.mode}:${q.route.from.key}:${q.route.to.key}:${q.route.date}` : q.city.key;
  const lists = await Promise.all(
    readable(q).map(async (a) => {
      const src = SOURCE_BASE[a.site], url = a.read!.url(q)!;
      const root = src ? src.base() : null;
      if (src && !root) return [];
      const at = src && root ? root + url.slice(src.origin.length) : url;
      const got = await cached<SourceOffer[]>(`src:${a.site}:${q.vertical}:${key}`, OFFERS_TTL, async () => {
        const body = await getText(at);
        const list = body ? a.read!.parse(body, q, Date.now()) : null;
        return list?.length ? list : null;
      }).catch(() => null);
      if (!got) failed.push(a.site);
      return got ?? [];
    }),
  );
  return { offers: mergeOffers(lists), links: compareLinks(q), failed };
}

// ---------------------------------------------------------------- planes
/** Planes this far round a point are listed (m). */
export const PLANES_RADIUS_M = 150_000;
const PLANES_CELL = 0.5;
/** Destinations of the scheduled flights shown round an Iranian airport (both ways). */
const HUB_AIRPORTS = ["tehran", "mashhad", "shiraz", "isfahan", "kish", "tabriz", "ahvaz", "bandar-abbas"];

function nearestAirport(at: LatLng): City | null {
  let best: City | null = null, bestD = Infinity;
  for (const c of CITIES)
    if (c.iata && c.lat != null) {
      const d = distanceM(at, { lat: c.lat, lng: c.lng! });
      if (d < bestD) (best = c), (bestD = d);
    }
  return bestD < PLANES_RADIUS_M ? best : null;
}

async function liveAround(at: LatLng): Promise<Plane[]> {
  const root = base.adsb();
  if (!root) return [];
  const cy = Math.round(at.lat / PLANES_CELL) * PLANES_CELL, cx = Math.round(at.lng / PLANES_CELL) * PLANES_CELL;
  const json = await cached<unknown>(`adsb:${cy}:${cx}`, PLANES_TTL, () => getJson(`${root}/point/${cy.toFixed(2)}/${cx.toFixed(2)}/${Math.round(PLANES_RADIUS_M / 1852)}`)).catch(() => null);
  return json ? fromAdsb(json, Date.now()) : [];
}

/** Today's flights from and to the nearest airport (both ways to each hub), as the schedule says. */
async function scheduleAround(at: LatLng, now: number): Promise<Scheduled[]> {
  const home = nearestAirport(at);
  if (!home || !base.mrbilitFlight()) return [];
  const date = new Date(now + 3.5 * 3600_000).toISOString().slice(0, 10);
  const others = HUB_AIRPORTS.map(cityByKey).filter((c): c is City => !!c && c.key !== home.key && cityHas(c, "flight") && c.lat != null);
  const routes = others.flatMap((o) => [{ from: home, to: o }, { from: o, to: home }]);
  const lists = await Promise.all(
    routes.map(({ from, to }) =>
      cached<Trip[]>(`tr:flight:mrbilit:${from.key}:${to.key}:${date}`, SCHEDULE_TTL, () => sources("flight", { from, to, date }).find((s) => s.site === "mrbilit")!.run())
        .catch(() => null)
        .then((trips) => ({ from, to, trips: trips ?? [] })),
    ),
  );
  const seen = new Set<string>();
  const out: Scheduled[] = [];
  for (const { from, to, trips } of lists)
    for (const t of trips) {
      const key = `${t.number}@${t.depart}`;
      if (seen.has(key) || !t.arrive) continue;
      seen.add(key);
      out.push({ number: t.number ?? "", airline: t.company, type: t.vehicle, from: from.iata!, to: to.iata!, fromAt: { lat: from.lat!, lng: from.lng! }, toAt: { lat: to.lat!, lng: to.lng! }, depart: iranTime(t.depart), arrive: iranTime(t.arrive) });
    }
  return out;
}

/** Planes in the sky round a point now: live where receivers hear them, the timetable's elsewhere. */
export async function planesAround(at: LatLng): Promise<{ planes: Plane[]; live: number; scheduled: number; at: number }> {
  const now = Date.now();
  const [live, sched] = await Promise.all([liveAround(at), scheduleAround(at, now).catch(() => [])]);
  const flying = sched.map((f) => scheduledPlane(f, now)).filter((p): p is Plane => !!p && distanceM(at, p) < PLANES_RADIUS_M * 2);
  const planes = mergePlanes(live, flying);
  return { planes, live: live.length, scheduled: planes.length - live.length, at: now };
}
