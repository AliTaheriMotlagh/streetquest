"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type LatLng } from "./client";

export type GeoError = "insecure" | "unsupported" | "denied" | "unavailable" | "timeout";
export type GeoState = {
  pos: LatLng | null;
  accuracy: number | null;
  error: GeoError | null;
  simulated: boolean;
  retry: () => void;
  /** Make sure the server has our latest position before a location-checked action. */
  flush: () => Promise<void>;
};

/**
 * Tracks the device GPS and streams it to the server. When `simPos` is set
 * (dev/admin "GPS simulator"), that position is used and flagged as simulated.
 *
 * Strategy: a fast coarse fix (wifi/cell) first so the map appears quickly, then
 * a high-accuracy watch. If high accuracy keeps failing (common on laptops and
 * indoors) we fall back to a low-accuracy watch instead of hanging forever.
 */
export type FireReport = { hp: number; maxHp: number; hits: { by: string; emoji: string; dmg: number }[]; downed: { by: string; coins: number } | null; protectedReason?: string };

export function useLocation(simPos: LatLng | null, onFire?: (f: FireReport) => void): GeoState {
  const fireCb = useRef(onFire);
  fireCb.current = onFire;
  const [gps, setGps] = useState<{ pos: LatLng | null; accuracy: number | null; error: GeoError | null }>({ pos: null, accuracy: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const hasFix = useRef(false);

  useEffect(() => {
    // Browsers only expose GPS on https:// or localhost.
    if (!window.isSecureContext) {
      setGps((g) => ({ ...g, error: "insecure" }));
      return;
    }
    if (!("geolocation" in navigator)) {
      setGps((g) => ({ ...g, error: "unsupported" }));
      return;
    }
    const geo = navigator.geolocation;
    let watchId: number | null = null;
    let cancelled = false;

    const ok = (p: GeolocationPosition) => {
      if (cancelled) return;
      hasFix.current = true;
      setGps({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracy: p.coords.accuracy, error: null });
    };
    const fail = (e: GeolocationPositionError) => {
      if (cancelled) return;
      const error: GeoError = e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable";
      // Keep showing the last good position on transient errors.
      setGps((g) => ({ ...g, error: g.pos && error !== "denied" ? null : error }));
      return error;
    };
    const watch = (highAccuracy: boolean) => {
      if (watchId !== null) geo.clearWatch(watchId);
      watchId = geo.watchPosition(ok, (e) => {
        const err = fail(e);
        if (highAccuracy && err !== "denied") watch(false); // degrade gracefully
      }, { enableHighAccuracy: highAccuracy, maximumAge: highAccuracy ? 3000 : 30_000, timeout: highAccuracy ? 15_000 : 30_000 });
    };

    setGps((g) => ({ ...g, error: null }));
    geo.getCurrentPosition(ok, () => {}, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
    watch(true);

    return () => {
      cancelled = true;
      if (watchId !== null) geo.clearWatch(watchId);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const pos = simPos ?? gps.pos;
  const simulated = !!simPos;

  // Report position to the server: on movement (throttled) plus a heartbeat.
  const sent = useRef<{ lat: number; lng: number; sim: boolean; at: number } | null>(null);
  const latest = useRef<{ pos: LatLng | null; sim: boolean }>({ pos: null, sim: false });
  latest.current = { pos, sim: simulated };

  const send = useCallback(async () => {
    const { pos: p, sim } = latest.current;
    if (!p) return;
    const res = await fetch("/api/loc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: p.lat, lng: p.lng, sim }) }).catch(() => null);
    // Only count it as delivered if the server accepted it (a brand-new guest's first
    // ping can land before their account exists); otherwise flush() will resend.
    if (res?.ok) {
      sent.current = { ...p, sim, at: Date.now() };
      // Tower defense: the server says whether hostile towers/guards shot at us.
      const data = await res.json().catch(() => null);
      if (data?.fire) fireCb.current?.(data.fire);
      // While under fire, report more often so damage (and escaping) feel immediate.
      if (data?.fire?.hits?.length) setTimeout(() => sendRef.current?.(), 3000);
    }
  }, []);

  const sendRef = useRef<(() => Promise<void>) | null>(null);
  sendRef.current = send;

  useEffect(() => {
    if (!pos) return;
    const last = sent.current;
    const moved = !last || last.sim !== simulated || Math.abs(last.lat - pos.lat) > 1e-5 || Math.abs(last.lng - pos.lng) > 1e-5;
    const t = setTimeout(send, moved && (!last || Date.now() - last.at > 3000) ? 0 : 3000);
    const hb = setInterval(send, 20_000);
    return () => {
      clearTimeout(t);
      clearInterval(hb);
    };
  }, [pos?.lat, pos?.lng, simulated, send]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    const { pos: p, sim } = latest.current;
    const last = sent.current;
    if (p && (!last || last.lat !== p.lat || last.lng !== p.lng || last.sim !== sim || Date.now() - last.at > 60_000)) await send();
  }, [send]);

  return { pos, accuracy: simulated ? 5 : gps.accuracy, error: simulated ? null : gps.error, simulated, retry, flush };
}
