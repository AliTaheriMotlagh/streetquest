"use client";
// The map's Transit layer (lib/transit/*): the metro of the city you're looking at (its lines and
// stations ship with the app, loaded when first needed), the bus stops round the view
// (/api/transit?stops), and in Istanbul its buses live (/api/transit?buses, every 20 s).
import { useEffect, useRef, useState } from "react";
import { distanceM, type LatLng } from "@/lib/geo";
import type { LiveBus } from "@/lib/transit/iett";
import { cityAt, type BusLine, type BusStop, type City, type Network } from "@/lib/transit/network";
import { api } from "./client";

const METRO: Record<City, () => Promise<Network>> = {
  tehran: () => import("@/data/transit/tehran-metro.json").then((m) => m.default as unknown as Network),
  istanbul: () => import("@/data/transit/istanbul-metro.json").then((m) => m.default as unknown as Network),
};
const loaded = new Map<City, Promise<Network>>();
/** A city's metro (downloaded once per visit). */
export function metroOf(city: City): Promise<Network> {
  let p = loaded.get(city);
  if (!p) {
    p = METRO[city]();
    p.catch(() => loaded.delete(city));
    loaded.set(city, p);
  }
  return p;
}

/** Stops are fetched again this far from the last fetch. */
const STOPS_REFETCH_M = 400;
const BUS_POLL_MS = 20_000;

export type TransitData = { city: City | null; metro: Network | null; stops: BusStop[]; lines: Record<string, BusLine>; buses: LiveBus[]; live: boolean };
const EMPTY: TransitData = { city: null, metro: null, stops: [], lines: {}, buses: [], live: false };

export function useTransit(look: LatLng | null, on: boolean): TransitData {
  const [d, setD] = useState<TransitData>(EMPTY);
  const city = look ? cityAt(look) : null;
  const stopsAt = useRef<LatLng | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    if (!on || !city) return void setD((x) => (x.city ? EMPTY : x));
    let live = true;
    metroOf(city)
      .then((metro) => live && setD((x) => ({ ...x, city, metro })))
      .catch(() => {});
    return () => void (live = false);
  }, [on, city]);

  useEffect(() => {
    if (!on || !city || !look) return;
    const last = stopsAt.current;
    if (last && distanceM(last, look) < STOPS_REFETCH_M) return;
    stopsAt.current = look;
    api<{ stops: BusStop[]; lines: Record<string, BusLine> }>(`/api/transit?stops=1&lat=${look.lat.toFixed(4)}&lng=${look.lng.toFixed(4)}`)
      .then((r) => setD((x) => ({ ...x, stops: r.stops, lines: { ...x.lines, ...r.lines } })))
      .catch(() => (stopsAt.current = null));
  }, [on, city, look]);

  useEffect(() => {
    if (!on || city !== "istanbul") return;
    let live = true;
    const poll = () => {
      const at = lookRef.current;
      if (!at || document.hidden) return;
      api<{ live: boolean; buses: LiveBus[] }>(`/api/transit?buses=1&lat=${at.lat.toFixed(4)}&lng=${at.lng.toFixed(4)}`)
        .then((r) => live && setD((x) => ({ ...x, buses: r.buses, live: r.live })))
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, BUS_POLL_MS);
    return () => (live = false, clearInterval(t));
  }, [on, city]);

  return d;
}
