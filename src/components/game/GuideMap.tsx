"use client";
// A destination guide's map (the trip planner's GuideView, Travel.tsx): every guide place (lib/travel/guide.ts)
// as a dot in its kind's colour, the picked one ringed and brought into view. Tap a dot to pick it.
// Loaded on demand (next/dynamic, no SSR), like CityMap.
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { getLocale } from "@/lib/i18n";
import { GUIDE_KINDS, guideName, type Guide, type GuidePlace } from "@/lib/travel/guide";
import { DEFAULT_TILES } from "./mapStyles";

function FlyTo({ to }: { to: GuidePlace | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [to, map]);
  return null;
}

export default function GuideMap({ guide, places, picked, onPick }: { guide: Guide; places: GuidePlace[]; picked: string | null; onPick: (id: string) => void }) {
  const locale = getLocale();
  const on = places.find((p) => p.id === picked) ?? null;
  return (
    <div className="tp-map gd-map" data-no-drag>
      <MapContainer center={[guide.centre.lat, guide.centre.lng]} zoom={guide.zoom} minZoom={10} maxZoom={18} zoomControl={false} preferCanvas style={{ width: "100%", height: "100%" }} attributionControl={false}>
        <TileLayer url={DEFAULT_TILES.url} subdomains={DEFAULT_TILES.subdomains ?? "abc"} />
        {places.map((p) => {
          const sel = p.id === picked;
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={sel ? 10 : 7}
              pathOptions={{ color: sel ? "#ffffff" : "#1b2230", weight: sel ? 3 : 1.5, fillColor: GUIDE_KINDS[p.kind].color, fillOpacity: 0.95 }}
              eventHandlers={{ click: () => onPick(p.id) }}
            >
              <Tooltip direction="top" offset={[0, -6]} permanent={sel}>{`${GUIDE_KINDS[p.kind].emoji} ${guideName(p, locale)}`}</Tooltip>
            </CircleMarker>
          );
        })}
        <FlyTo to={on} />
      </MapContainer>
    </div>
  );
}
