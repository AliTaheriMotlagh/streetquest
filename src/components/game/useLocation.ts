"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { distanceM } from "@/lib/geo";
import { type LatLng } from "./client";

export type GeoError = "insecure" | "unsupported" | "denied" | "unavailable" | "timeout";
export type GeoState = {
  pos: LatLng | null;
  accuracy: number | null;
  /** Direction of travel in degrees (0 = north), null when standing still. */
  heading: number | null;
  /** Metres per second (smoothed). */
  speed: number;
  error: GeoError | null;
  simulated: boolean;
  retry: () => void;
  /** Make sure the server has our latest position before a location-checked action. */
  flush: () => Promise<void>;
};

/**
 * Tracks the device GPS and streams it to the server. When `simPos` is set
 * (test mode), that position is used and flagged as simulated.
 *
 * Strategy: a fast coarse fix (wifi/cell) first so the map appears quickly, then
 * a high-accuracy watch. If high accuracy fails (tunnels, indoors, laptops) we fall
 * back to low accuracy and keep retrying high accuracy in the background.
 *
 * Filtering for real streets and cars:
 *  - a poor fix (wide accuracy) is ignored while a recent good one exists
 *  - impossible jumps (GPS glitches) are dropped
 *  - tiny moves inside the accuracy circle while stopped are ignored (no jitter)
 *  - heading comes from the GPS when moving, else from the last two fixes
 */
export type FireReport = { hp: number; maxHp: number; hits: { by: string; emoji: string; dmg: number }[]; downed: { by: string; coins: number } | null; protectedReason?: string };

type Fix = { lat: number; lng: number; acc: number; at: number };

export function useLocation(simPos: LatLng | null, onFire?: (f: FireReport) => void): GeoState {
  const fireCb = useRef(onFire);
  fireCb.current = onFire;
  const [gps, setGps] = useState<{ pos: LatLng | null; accuracy: number | null; heading: number | null; speed: number; error: GeoError | null }>({ pos: null, accuracy: null, heading: null, speed: 0, error: null });
  const [attempt, setAttempt] = useState(0);
  const lastFix = useRef<Fix | null>(null);
  const lastGood = useRef<Fix | null>(null);

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
    let upgrade: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const ok = (p: GeolocationPosition) => {
      if (cancelled) return;
      const now = Date.now();
      const fix: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy || 50, at: now };
      const prev = lastFix.current;
      const good = lastGood.current;
      // A wide cell/wifi fix right after a good GPS fix is noise — skip it.
      if (good && fix.acc > Math.max(100, good.acc * 4) && now - good.at < 30_000) return;
      if (prev) {
        const d = distanceM(prev, fix);
        const dt = Math.max(0.5, (now - prev.at) / 1000);
        // Faster than ~300 km/h between fixes and not explained by accuracy: a glitch.
        if (d > 200 + fix.acc + prev.acc && d / dt > 85) return;
      }
      const rawSpeed = p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed : prev ? distanceM(prev, fix) / Math.max(0.5, (now - prev.at) / 1000) : 0;
      // Standing still: ignore jitter inside the accuracy circle.
      if (prev && rawSpeed < 0.8 && distanceM(prev, fix) < Math.max(4, Math.min(fix.acc, 30) * 0.6) && now - prev.at < 60_000) {
        setGps((g) => (g.error ? { ...g, error: null } : g.speed > 0.3 ? { ...g, speed: g.speed * 0.5 } : g));
        return;
      }
      let heading: number | null = p.coords.heading != null && !Number.isNaN(p.coords.heading) && rawSpeed > 1 ? p.coords.heading : null;
      if (heading == null && prev && distanceM(prev, fix) > 8) heading = bearing(prev, fix);
      lastFix.current = fix;
      if (fix.acc <= 50) lastGood.current = fix;
      setGps((g) => ({
        pos: { lat: fix.lat, lng: fix.lng },
        accuracy: fix.acc,
        heading: heading ?? (rawSpeed > 1 ? g.heading : null),
        speed: g.speed * 0.4 + rawSpeed * 0.6,
        error: null,
      }));
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
      if (upgrade) clearTimeout(upgrade);
      watchId = geo.watchPosition(
        ok,
        (e) => {
          const err = fail(e);
          if (highAccuracy && err !== "denied") watch(false); // degrade gracefully…
        },
        { enableHighAccuracy: highAccuracy, maximumAge: highAccuracy ? 1000 : 15_000, timeout: highAccuracy ? 20_000 : 30_000 },
      );
      // …and climb back to GPS-grade accuracy once we're out of the tunnel.
      if (!highAccuracy) upgrade = setTimeout(() => !cancelled && watch(true), 30_000);
    };

    setGps((g) => ({ ...g, error: null }));
    geo.getCurrentPosition(ok, () => {}, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
    watch(true);

    // Phones pause GPS in the background; restart cleanly when the game is back on screen.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) watch(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (upgrade) clearTimeout(upgrade);
      if (watchId !== null) geo.clearWatch(watchId);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const pos = simPos ?? gps.pos;
  const simulated = !!simPos;
  const accuracy = simulated ? 5 : gps.accuracy;

  // Report position to the server: on movement (throttled) plus a heartbeat.
  const sent = useRef<{ lat: number; lng: number; sim: boolean; at: number } | null>(null);
  const latest = useRef<{ pos: LatLng | null; sim: boolean; acc: number | null }>({ pos: null, sim: false, acc: null });
  latest.current = { pos, sim: simulated, acc: accuracy };
  const sending = useRef<Promise<void> | null>(null);

  const send = useCallback(async () => {
    const { pos: p, sim, acc } = latest.current;
    if (!p) return;
    // One request at a time: in a car, fixes arrive faster than a slow network answers.
    if (sending.current) return sending.current;
    sending.current = (async () => {
      const res = await fetch("/api/loc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: p.lat, lng: p.lng, sim, acc: acc ?? undefined }) }).catch(() => null);
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
    })().finally(() => {
      sending.current = null;
    });
    return sending.current;
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
    if (sending.current) await sending.current;
    if (p && (!last || last.lat !== p.lat || last.lng !== p.lng || last.sim !== sim || Date.now() - last.at > 60_000)) await send();
  }, [send]);

  return { pos, accuracy, heading: simulated ? null : gps.heading, speed: simulated ? 0 : gps.speed, error: simulated ? null : gps.error, simulated, retry, flush };
}

function bearing(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/** Keep the screen on while moving (driving/walking with the map open). */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!on || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let stop = false;
    const get = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock!.request("screen").then((l) => {
        if (stop) l.release().catch(() => {});
        else lock = l;
      }).catch(() => {});
    };
    get();
    document.addEventListener("visibilitychange", get);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", get);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
