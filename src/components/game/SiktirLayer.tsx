"use client";
// Siktir on the 2D map: the marked spots (a layer), and the long press that starts a mark.
import { useEffect, useRef, useState } from "react";
import { Marker, useMap } from "react-leaflet";
import { fmtNum } from "@/lib/i18n";
import { distanceM } from "@/lib/geo";
import type { SiktirSpot } from "@/lib/siktir";
import { api, type LatLng, type Selected } from "./client";
import { esc, icon } from "./mapIcons";
import { SIKTIR_EVENT } from "./Siktir";

/** The same thumbs-down as the card button, as marker HTML. */
const THUMB = `<svg class="sk-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;

export function SiktirLayer({ spots, onSelect }: { spots: SiktirSpot[]; onSelect: (s: Selected) => void }) {
  return (
    <>
      {spots.map((s) => (
        <Marker
          key={s.key}
          position={[s.lat, s.lng]}
          zIndexOffset={150}
          icon={icon(`${THUMB}${s.count > 1 ? `<span class="cl-n">${fmtNum(s.count)}</span>` : ""}${s.name ? `<span class="nm">${esc(s.name)}</span>` : ""}`, "place siktir", 30)}
          eventHandlers={{ click: () => onSelect({ type: "siktir", data: s }) }}
        />
      ))}
    </>
  );
}

const HOLD_MS = 650;
const MOVE_PX = 10;

/** Press and hold anywhere on the map (not on a marker) → `onLongPress` with the spot; right-click does the same on a desktop. */
export function LongPress({ onLongPress }: { onLongPress: (p: LatLng) => void }) {
  const map = useMap();
  const cb = useRef(onLongPress);
  cb.current = onLongPress;
  useEffect(() => {
    const el = map.getContainer();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start = { x: 0, y: 0 };
    const at = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      const ll = map.containerPointToLatLng([x - r.left, y - r.top]);
      return { lat: ll.lat, lng: ll.lng };
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.target as HTMLElement).closest(".leaflet-marker-icon, .leaflet-control, button, a")) return;
      cancel();
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        cb.current(at(start.x, start.y));
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) cancel();
    };
    const menu = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".leaflet-marker-icon, .leaflet-control")) return;
      e.preventDefault();
      cancel();
      cb.current(at(e.clientX, e.clientY));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", menu);
    map.on("zoomstart movestart", cancel);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", cancel);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("contextmenu", menu);
      map.off("zoomstart movestart", cancel);
    };
  }, [map]);
  return null;
}

const REFETCH_M = 1500;
const BOX_DEG = 0.08;
/** The marked spots around `look` while the layer is on; reloads when it moves, every 5 minutes, and after a mark. */
export function useSiktirSpots(on: boolean, look: LatLng | null): SiktirSpot[] {
  const [spots, setSpots] = useState<SiktirSpot[]>([]);
  const last = useRef<{ pos: LatLng; at: number } | null>(null);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const f = () => ((last.current = null), setBump((n) => n + 1));
    window.addEventListener(SIKTIR_EVENT, f);
    return () => window.removeEventListener(SIKTIR_EVENT, f);
  }, []);
  const stamp = Math.floor(Date.now() / 300_000);
  useEffect(() => {
    if (!on || !look) return;
    const l = last.current;
    if (l && distanceM(l.pos, look) < REFETCH_M && Date.now() - l.at < 300_000) return;
    last.current = { pos: look, at: Date.now() };
    api<{ spots: SiktirSpot[] }>(`/api/siktir?minLat=${(look.lat - BOX_DEG).toFixed(4)}&maxLat=${(look.lat + BOX_DEG).toFixed(4)}&minLng=${(look.lng - BOX_DEG).toFixed(4)}&maxLng=${(look.lng + BOX_DEG).toFixed(4)}`)
      .then((r) => setSpots(r.spots))
      .catch(() => (last.current = null));
  }, [on, look?.lat, look?.lng, bump, stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  return spots;
}
