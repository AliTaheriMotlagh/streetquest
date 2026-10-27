"use client";
// Admin → Money: tap the map to place money drops. One point drops money on a spot; more
// points draw a street (the drops are laid evenly along it). Active drops are shown too.
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";

type P = { lat: number; lng: number };
const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function Clicks({ onPick }: { onPick: (p: P) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Jump to a spot when the admin asks (e.g. "use my location"). */
function Recenter({ to }: { to: P | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.setView([to.lat, to.lng], Math.max(map.getZoom(), 16));
  }, [map, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function AdminDropMap({ points, existing, center, onPick }: { points: P[]; existing: { points: P[]; active: boolean }[]; center: P | null; onPick: (p: P) => void }) {
  const start = center ?? points[0] ?? existing[0]?.points[0] ?? { lat: 35.6997, lng: 51.338 };
  return (
    <div className="admin-map">
      <MapContainer center={[start.lat, start.lng]} zoom={15} style={{ width: "100%", height: "100%" }} attributionControl={false}>
        <TileLayer url={TILE_URL} maxZoom={19} />
        <Clicks onPick={onPick} />
        <Recenter to={center} />
        {existing.map((d, i) =>
          d.points.map((p, j) => <CircleMarker key={`${i}:${j}`} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: d.active ? "#f0c05a" : "#888", fillOpacity: 0.8, weight: 1 }} />),
        )}
        {points.length > 1 && <Polyline positions={points.map((p) => L.latLng(p.lat, p.lng))} pathOptions={{ color: "#5bd38c", weight: 4, dashArray: "6 6" }} />}
        {points.map((p, i) => <CircleMarker key={i} center={[p.lat, p.lng]} radius={8} pathOptions={{ color: "#5bd38c", fillColor: "#5bd38c", fillOpacity: 1 }} />)}
      </MapContainer>
    </div>
  );
}
