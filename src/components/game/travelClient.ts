"use client";
// Where the travel planner's searches run. A player's own phone is in Iran on an Iranian connection, so
// what a site lets a browser ask (CORS) is asked from the phone itself: no load on our server or the
// Iran relay, and every player has their own rate with the site. Checked from a production origin in
// Chrome (2026-11-15):
//  - Alibaba's bus search (GET) answers any origin            → asked from the phone;
//  - Alibaba's flight/train searches (POST JSON), MrBilit (only its own and localhost origins), Jabama
//    and adsb.lol refuse other sites' pages                   → asked by our server (through the relay
//    where RELAY_FOR names them, server/travel.ts).
// A phone call that fails (offline, the site changed its rules) falls back to the server for that mode.
// NEXT_PUBLIC_TRAVEL_DIRECT="off" sends everything through the server.
import { cityByKey, fromAlibabaBuses, mergeTrips, type Mode, type Route, type Trip } from "@/lib/travel";
import { api } from "./client";

export type TripAnswer = { trips: Trip[]; failed: string[]; none: Mode[] };

const DIRECT_ON = process.env.NEXT_PUBLIC_TRAVEL_DIRECT !== "off";
const TIMEOUT_MS = 15_000;
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; trips: Trip[] }>();

/** The modes this phone can search itself (each with how). */
const ON_DEVICE: Partial<Record<Mode, (r: Route) => Promise<Trip[] | null>>> = {
  bus: async (r) => {
    if (!r.from.bus || !r.to.bus) return [];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://ws.alibaba.ir/api/v2/bus/available?orginCityCode=${r.from.bus}&destinationCityCode=${r.to.bus}&requestDate=${r.date}&passengerCount=1`, { signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
      return res.ok ? fromAlibabaBuses(await res.json(), r) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Every trip between two cities on a day: what the phone can ask itself, the rest from the server. */
export async function searchTrips(fromKey: string, toKey: string, date: string, modes: Mode[]): Promise<TripAnswer> {
  const from = cityByKey(fromKey), to = cityByKey(toKey);
  if (!from || !to) return { trips: [], failed: [], none: modes };
  const r: Route = { from, to, date };
  const device = DIRECT_ON ? modes.filter((m) => ON_DEVICE[m]) : [];
  const server = modes.filter((m) => !device.includes(m));
  const ask = (ms: Mode[]) => (ms.length ? api<TripAnswer>(`/api/travel?trips=1&from=${from.key}&to=${to.key}&date=${date}&modes=${ms.join(",")}`) : Promise.resolve<TripAnswer>({ trips: [], failed: [], none: [] }));

  const onPhone = Promise.all(
    device.map(async (m) => {
      const key = `${m}|${from.key}|${to.key}|${date}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return { m, trips: hit.trips };
      const trips = await ON_DEVICE[m]!(r);
      if (trips) cache.set(key, { at: Date.now(), trips });
      return { m, trips };
    }),
  );
  const [fromServer, phone] = await Promise.all([ask(server), onPhone]);
  // What the phone couldn't get, the server gets (through the relay when it's set up).
  const retry = phone.filter((p) => !p.trips).map((p) => p.m);
  const second = retry.length ? await ask(retry).catch(() => ({ trips: [], failed: retry.map((m) => `alibaba:${m}`), none: [] }) as TripAnswer) : null;
  const none = [...fromServer.none, ...(second?.none ?? []), ...phone.filter((p) => p.trips && !p.trips.length && !cityHasRoute(r, p.m)).map((p) => p.m)];
  return {
    trips: mergeTrips([fromServer.trips, ...phone.map((p) => p.trips ?? []), second?.trips ?? []]),
    failed: [...fromServer.failed, ...(second?.failed ?? [])],
    none,
  };
}

/** A bus route exists only between two bus cities. */
const cityHasRoute = (r: Route, m: Mode) => (m === "bus" ? !!(r.from.bus && r.to.bus) : true);
