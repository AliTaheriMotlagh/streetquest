"use client";
// Picking a city on a map (the travel planner, Travel.tsx): every city with tickets as a dot, the
// big ones named, the cities already in the trip ringed and joined in order. Tap a dot to pick it.
// Loaded on demand (next/dynamic, no SSR): Leaflet only comes when someone opens the map.
import { useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import { getLocale } from "@/lib/i18n";
import { CITIES, POPULAR, type City } from "@/lib/travel";
import { SERVED_DEFAULT_TILES as DEFAULT_TILES } from "./mapStyles";

const name = (c: City) => (getLocale() === "fa" ? c.fa : c.en);
const IRAN: [number, number] = [32.4, 53.7];

export default function CityMap({ route, here, onPick }: { route: string[]; here: string | null; onPick: (c: City) => void }) {
  const cities = useMemo(() => CITIES.filter((c) => c.lat != null && c.lng != null), []);
  const popular = useMemo(() => new Set(POPULAR), []);
  const inTrip = useMemo(() => new Set(route), [route]);
  const line = useMemo(
    () =>
      route
        .map((k) => cities.find((c) => c.key === k))
        .filter((c): c is City => !!c)
        .map((c) => [c.lat!, c.lng!] as [number, number]),
    [route, cities],
  );
  return (
    <div className="tp-map" data-no-drag>
      <MapContainer center={IRAN} zoom={5} minZoom={4} maxZoom={10} zoomControl={false} preferCanvas style={{ width: "100%", height: "100%" }} attributionControl={false}>
        <TileLayer url={DEFAULT_TILES.url} subdomains={DEFAULT_TILES.subdomains ?? "abc"} />
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#4cb8ff", weight: 3, dashArray: "6 8", opacity: 0.9 }} interactive={false} />}
        {cities.map((c) => {
          const on = inTrip.has(c.key), big = popular.has(c.key) || c.key === here;
          return (
            <CircleMarker
              key={c.key}
              center={[c.lat!, c.lng!]}
              radius={on ? 9 : big ? 7 : 5}
              pathOptions={{ color: on ? "#4cb8ff" : "#ffffff", weight: on ? 3 : 1.5, fillColor: c.key === here ? "#5bd38c" : on ? "#4cb8ff" : big ? "#f0c05a" : "#9aa4b8", fillOpacity: 0.95 }}
              eventHandlers={{ click: () => onPick(c) }}
            >
              <Tooltip direction="top" offset={[0, -6]} permanent={big || on} className="tp-map-label">
                {name(c)}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
