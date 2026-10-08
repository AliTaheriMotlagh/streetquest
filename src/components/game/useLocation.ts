"use client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { LatLng } from "./client";
import { LocationReporter, type FireReport } from "./location/reporter";
import { locationTracker, type GeoError, type LocationSnapshot } from "./location/tracker";

export type { FireReport, GeoError, LocationSnapshot };

export type GeoState = LocationSnapshot & {
  retry: () => void;
  /** Make sure the server has our latest position before a location-checked action. */
  flush: () => Promise<void>;
};

const serverSnapshot = locationTracker.getSnapshot();

/**
 * The player's position for React. GPS tracking and filtering live in
 * location/tracker.ts, server reporting in location/reporter.ts; this hook just wires
 * them up. `override` (test mode / play from home) replaces the GPS while set.
 */
export function useLocation(override: LatLng | null, onFire?: (f: FireReport) => void): GeoState {
  const snap = useSyncExternalStore(locationTracker.subscribe, locationTracker.getSnapshot, () => serverSnapshot);

  useEffect(() => {
    locationTracker.setOverride(override);
  }, [override]);

  const fireCb = useRef(onFire);
  fireCb.current = onFire;
  const reporter = useRef<LocationReporter | null>(null);
  useEffect(() => {
    const r = new LocationReporter(locationTracker.getSnapshot, (f) => fireCb.current?.(f));
    reporter.current = r;
    r.start();
    const unsub = locationTracker.subscribe(() => r.update());
    return () => {
      unsub();
      r.stop();
      reporter.current = null;
    };
  }, []);

  const retry = useCallback(() => locationTracker.retry(), []);
  const flush = useCallback(async () => reporter.current?.flush(), []);
  return { ...snap, retry, flush };
}

/** Subscribe outside React (the map marker animates from this without re-rendering). */
export const subscribeLocation = locationTracker.subscribe;
export const getLocation = locationTracker.getSnapshot;

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
