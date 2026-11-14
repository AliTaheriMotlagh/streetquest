"use client";
// The map's travel layer: airports ✈️ and train stations 🚆 as pins (from zoom 7 / 10; a tap shows its
// name and opens the travel planner to or from it), and the planes in the sky — live ADS-B where
// receivers hear them, today's timetable placed by the clock elsewhere (lib/flights.ts) — moving
// smoothly between updates, each turned to its heading. A tap on a plane says who, what, how high.
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import { CITIES, type City } from "@/lib/travel";
import { advance, type Plane } from "@/lib/flights";
import { api } from "./client";
import { openTravel } from "./Filters";

const PLANES_EVERY_MS = 15_000;
const MOVE_EVERY_MS = 1000;
const PLANES_MAX = 80;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hubIcon = (glyph: string, cls: string) => L.divIcon({ className: `tv-hub ${cls}`, html: `<span>${glyph}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
const planeIcon = (p: Plane) =>
  L.divIcon({
    className: `tv-plane ${p.source}`,
    html: `<span style="transform:rotate(${Math.round(p.track - 45)}deg)">✈</span><b>${esc(p.call)}</b>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

function planeCard(p: Plane) {
  const km = (p.speed * 3.6).toFixed(0);
  return `<div class="tv-pop" dir="auto"><b>${esc(p.call)}</b>${p.airline ? ` · ${esc(p.airline)}` : ""}<br/>${[p.type, p.reg].filter(Boolean).map((x) => esc(x!)).join(" · ")}<br/>${p.from && p.to ? `${p.from} → ${p.to}<br/>` : ""}${esc(t("{m} m high · {k} km/h", { m: fmtNum(Math.round(p.alt)), k: fmtNum(Number(km)) }))}<br/><small>${esc(p.source === "live" ? t("Live position (ADS-B)") : t("Where the timetable puts it"))}</small></div>`;
}

export function TravelLayer({ planes: showPlanes = true }: { planes?: boolean }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [center, setCenter] = useState(map.getCenter());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), moveend: () => setCenter(map.getCenter()) });

  // ---- hubs: airports from zoom 7, stations from zoom 10
  const hubs = useMemo(() => CITIES.filter((c) => c.lat != null && (c.iata || c.train != null)), []);
  useEffect(() => {
    if (zoom < 7) return;
    const layer = L.layerGroup().addTo(map);
    const fa = getLocale() === "fa";
    const b = map.getBounds().pad(0.3);
    for (const c of hubs) {
      const air = !!c.iata, train = c.train != null && zoom >= 10;
      if ((!air && !train) || !b.contains([c.lat!, c.lng!])) continue;
      const name = fa ? c.fa : c.en;
      const m = L.marker([c.lat!, c.lng!], { icon: hubIcon(air ? "✈️" : "🚆", air ? "air" : "rail"), keyboard: true, title: name, zIndexOffset: -200 });
      m.bindPopup(() => hubPopup(c, name), { className: "tv-popup" });
      layer.addLayer(m);
    }
    return () => void layer.remove();
  }, [map, hubs, zoom >= 10, zoom >= 7, center.lat.toFixed(1), center.lng.toFixed(1)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- planes: asked for every 15 s round the map's centre, moved on every second
  const planes = useRef(new Map<string, { p: Plane; m: L.Marker }>());
  const layer = useRef<L.LayerGroup | null>(null);
  const want = showPlanes && zoom >= 6;
  const cell = `${center.lat.toFixed(0)},${center.lng.toFixed(0)}`;
  useEffect(() => {
    if (!want) return;
    const g = (layer.current = L.layerGroup().addTo(map));
    const all = planes.current;
    let stop = false;
    const load = () => {
      const c = map.getCenter();
      api<{ planes: Plane[] }>(`/api/flights?lat=${c.lat.toFixed(2)}&lng=${c.lng.toFixed(2)}`).then(
        (r) => {
          if (stop) return;
          const seen = new Set<string>();
          for (const p of r.planes.slice(0, PLANES_MAX)) {
            seen.add(p.id);
            const had = all.get(p.id);
            if (had) {
              had.p = p;
              had.m.setIcon(planeIcon(p));
            } else {
              const m = L.marker([p.lat, p.lng], { icon: planeIcon(p), zIndexOffset: 800 });
              m.bindPopup(() => planeCard(all.get(p.id)?.p ?? p), { className: "tv-popup" });
              g.addLayer(m);
              all.set(p.id, { p, m });
            }
          }
          for (const [id, x] of all) if (!seen.has(id)) (g.removeLayer(x.m), all.delete(id));
        },
        () => {},
      );
    };
    load();
    const poll = setInterval(load, PLANES_EVERY_MS);
    const move = setInterval(() => {
      const now = Date.now();
      for (const x of all.values()) {
        const at = advance(x.p, (now - x.p.at) / 1000);
        x.m.setLatLng([at.lat, at.lng]);
      }
    }, MOVE_EVERY_MS);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(move);
      g.remove();
      all.clear();
    };
  }, [map, want, cell]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function hubPopup(c: City, name: string) {
  const el = document.createElement("div");
  el.className = "tv-pop";
  el.dir = "auto";
  const title = document.createElement("b");
  title.textContent = name;
  el.appendChild(title);
  if (c.airport) {
    const s = document.createElement("div");
    s.className = "small";
    s.textContent = `${c.airport}${c.iata ? ` (${c.iata})` : ""}`;
    el.appendChild(s);
  }
  const go = document.createElement("button");
  go.className = "btn small";
  go.textContent = t("Tickets & hotels in {city}", { city: name });
  go.onclick = () => openTravel(c.key);
  el.appendChild(go);
  return el;
}
