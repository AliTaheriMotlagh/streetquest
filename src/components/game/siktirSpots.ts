"use client";
// The Siktir marks around a spot, for the 2D map's layer (SiktirLayer.tsx) — no Leaflet here, so the
// game shell (Game.tsx) can use it while the map itself only loads in the browser.
import { useEffect, useRef, useState } from "react";
import { distanceM } from "@/lib/geo";
import type { SiktirSpot } from "@/lib/siktir";
import { api, type LatLng } from "./client";
import { SIKTIR_EVENT } from "./Siktir";

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
