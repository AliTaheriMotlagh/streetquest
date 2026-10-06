"use client";
import { useEffect, useRef, useState } from "react";
import { getSocket, type LatLng } from "./client";

export type GeoState = { pos: LatLng | null; accuracy: number | null; error: string | null; simulated: boolean };

/**
 * Tracks the device GPS and streams it to the server. When `simPos` is set
 * (dev/admin "GPS simulator"), that position is used and flagged as simulated.
 */
export function useLocation(simPos: LatLng | null): GeoState {
  const [gps, setGps] = useState<{ pos: LatLng | null; accuracy: number | null; error: string | null }>({ pos: null, accuracy: null, error: null });
  const lastSent = useRef(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGps((g) => ({ ...g, error: "This device has no GPS" }));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setGps({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracy: p.coords.accuracy, error: null }),
      (e) => setGps((g) => ({ ...g, error: e.code === e.PERMISSION_DENIED ? "Location permission denied" : "Waiting for GPS…" })),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const pos = simPos ?? gps.pos;
  const simulated = !!simPos;

  useEffect(() => {
    if (!pos) return;
    const send = () => {
      lastSent.current = Date.now();
      getSocket().emit("loc", { lat: pos.lat, lng: pos.lng, sim: simulated });
    };
    send();
    // Heartbeat so the server's "last known position" stays fresh while standing still.
    const t = setInterval(send, 20_000);
    return () => clearInterval(t);
  }, [pos?.lat, pos?.lng, simulated]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pos, accuracy: simulated ? 5 : gps.accuracy, error: simulated ? null : gps.error, simulated };
}
