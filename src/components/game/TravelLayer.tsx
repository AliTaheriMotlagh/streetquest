"use client";
// The map's travel layer: airports ✈️, train stations 🚆 and bus terminals 🚌 as pins (airports with the
// whole country in view, the rest as you zoom in — lib/travel hubGlyphs; a tap shows its
// name and opens the travel planner to or from it), and the planes in the sky — live ADS-B where
// receivers hear them, today's timetable placed by the clock elsewhere (lib/flights.ts) — moving
// smoothly between updates, each turned to its heading. A tap on a plane says who, what, how high.
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import { fmtNum, getLocale, t } from "@/lib/i18n";
import { CITIES, HUB_ZOOM, hubGlyphs, type City } from "@/lib/travel";
import { advance, type Plane } from "@/lib/flights";
import { cleanPlan, type LegPick } from "@/lib/travel/plan";
import { tripRoutes } from "@/lib/travel/routes";
import { api } from "./client";
import { openTravel } from "./Filters";

const PLANES_EVERY_MS = 15_000;
const MOVE_EVERY_MS = 1000;
const PLANES_MAX = 80;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** A city's travel pin: its ways in side by side (✈️🚆🚌) and, zoomed in, its name (or its airport code). */
const hubIcon = (glyphs: string[], label: string, cls: string) =>
  L.divIcon({
    className: `tv-hub ${cls}${glyphs.length > 1 ? " multi" : ""}`,
    html: `<span>${glyphs.join("")}</span>${label ? `<b>${esc(label)}</b>` : ""}`,
    // (the pin's circle centred on the city; .small pins are 18 px)
    iconSize: cls.includes("small") ? [18, 18] : [24 + (glyphs.length - 1) * 16, 24],
    iconAnchor: cls.includes("small") ? [9, 9] : [12 + (glyphs.length - 1) * 8, 12],
  });
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

  // ---- hubs (lib/travel hubGlyphs): airports with the whole country in view, stations and bus
  // terminals as you zoom in — one pin per city with every way in, its name once there's room.
  // Bigger hubs first (more ways in), so when pins would overlap the busier city keeps its pin.
  const hubs = useMemo(() => CITIES.filter((c) => c.lat != null && (c.iata || c.train != null || c.bus != null)).sort((a, b) => hubGlyphs(b, 20).length - hubGlyphs(a, 20).length), []);
  const level = Math.floor(zoom);
  useEffect(() => {
    if (level < HUB_ZOOM.air) return;
    const layer = L.layerGroup().addTo(map);
    const fa = getLocale() === "fa";
    const b = map.getBounds().pad(0.3);
    // Pins closer than this on screen give way (the whole country at once would be a pile otherwise).
    const gap = level < HUB_ZOOM.rail ? 22 : level < HUB_ZOOM.names ? 30 : 44;
    const placed: L.Point[] = [];
    for (const c of hubs) {
      const glyphs = hubGlyphs(c, level);
      if (!glyphs.length || !b.contains([c.lat!, c.lng!])) continue;
      const pt = map.latLngToContainerPoint([c.lat!, c.lng!]);
      if (placed.some((q) => q.distanceTo(pt) < gap)) continue;
      placed.push(pt);
      const name = (fa ? c.fa : c.en).replace(/_/g, " ");
      const label = level >= HUB_ZOOM.names ? name : c.iata && level >= HUB_ZOOM.rail ? c.iata : "";
      const m = L.marker([c.lat!, c.lng!], { icon: hubIcon(glyphs, label, `${c.iata ? "air" : glyphs[0] === "🚆" ? "rail" : "bus"}${level < HUB_ZOOM.rail ? " small" : ""}`), keyboard: true, title: name, zIndexOffset: c.iata ? -100 : -200 });
      m.bindPopup(() => hubPopup(c, name), { className: "tv-popup" });
      layer.addLayer(m);
    }
    return () => void layer.remove();
  }, [map, hubs, level, center.lat.toFixed(1), center.lng.toFixed(1)]); // eslint-disable-line react-hooks/exhaustive-deps

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

// ---------------------------------------------------------------- the rail network
/**
 * Every railway over the map (OpenRailwayMap's open overlay, no key): the lines a train trip
 * would take, from the whole country down to a city. Street-level zooms leave it to the metro layer.
 */
export function RailLayer() {
  const map = useMap();
  useEffect(() => {
    const layer = L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
      subdomains: "abc",
      minZoom: 4,
      maxZoom: 14,
      maxNativeZoom: 16,
      opacity: 0.75,
      zIndex: 4,
      className: "tv-rail-tiles",
      attribution: 'Rail: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA)',
    });
    layer.addTo(map);
    return () => void layer.remove();
  }, [map]);
  return null;
}

// ---------------------------------------------------------------- your trip across the map
const TRIP_KEY = "sq-trip";
const WAY_STYLE: Record<string, { color: string; dash?: string; emoji: string }> = {
  flight: { color: "#5aa9ff", dash: "2 8", emoji: "✈️" },
  train: { color: "#f0c05a", emoji: "🚆" },
  bus: { color: "#5bd38c", dash: "10 6", emoji: "🚌" },
  car: { color: "#c9ced8", dash: "4 6", emoji: "🚗" },
};

/** The trip planner's legs (kept on this phone) as routes: the way chosen for each, faint where none is yet. */
export function TripRoutes() {
  const map = useMap();
  const [stamp, setStamp] = useState(0);
  // The plan can change in the planner while the map is open: look again when the page gets focus or storage changes.
  useEffect(() => {
    const again = () => setStamp((n) => n + 1);
    addEventListener("storage", again);
    addEventListener("focus", again);
    const id = setInterval(again, 5000);
    return () => (removeEventListener("storage", again), removeEventListener("focus", again), clearInterval(id));
  }, []);
  const raw = typeof window === "undefined" ? null : (() => {
    try {
      return localStorage.getItem(TRIP_KEY);
    } catch {
      return null;
    }
  })();
  useEffect(() => {
    if (!raw) return;
    let saved: { plan?: unknown; legs?: Record<string, LegPick> } | null = null;
    try {
      saved = JSON.parse(raw);
    } catch {
      return;
    }
    const plan = cleanPlan(saved?.plan);
    if (!plan || !plan.stops.length) return;
    const g = L.layerGroup().addTo(map);
    for (const r of tripRoutes(plan, saved?.legs ?? {})) {
      const st = r.way ? WAY_STYLE[r.way] : { color: "#ffffff", dash: "3 9", emoji: "❔" };
      L.polyline(r.points, { color: "#0b0e14", weight: 7, opacity: r.way ? 0.45 : 0.2, interactive: false }).addTo(g);
      L.polyline(r.points, { color: st.color, weight: 4, opacity: r.way ? 0.95 : 0.55, dashArray: st.dash, lineCap: "round", interactive: false }).addTo(g);
      const m = L.marker(r.mid, { icon: L.divIcon({ className: `tv-route-ic${r.way ? "" : " open"}`, html: `<span>${st.emoji}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: true, title: `${cityNameOf(r.from)} → ${cityNameOf(r.to)}` });
      m.on("click", () => openTravel(r.to));
      g.addLayer(m);
    }
    return () => void g.remove();
  }, [map, raw, stamp]);
  return null;
}
const cityNameOf = (k: string) => {
  const c = CITIES.find((x) => x.key === k);
  return c ? (getLocale() === "fa" ? c.fa : c.en).replace(/_/g, " ") : k;
};
