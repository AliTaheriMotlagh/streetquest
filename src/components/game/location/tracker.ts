// The one place that talks to navigator.geolocation. A tiny observable store: React
// reads it with useSyncExternalStore, and the map marker subscribes directly so it can
// animate without re-rendering the map.
//
// Robustness, because phones are hostile to long-running GPS:
//  - one high-accuracy watch with no timeout (Chrome fires TIMEOUT errors whenever the
//    GPS is quiet; tearing the watch down on those is what used to freeze the marker)
//  - a quick coarse fix first so the map appears fast
//  - a watchdog: quiet for a while → probe; probe fails → restart the watch
//  - restart when the page comes back (visibility, bfcache, focus, back online)
//  - the Permissions API: once location is allowed in settings, resume by itself
//  - paused while a simulated/home position overrides it (saves battery)
import type { LatLng } from "@/lib/geo";
import { FixFilter, type Fix } from "./filter";

export type GeoError = "insecure" | "unsupported" | "denied" | "unavailable" | "timeout";
export type LocationSnapshot = {
  pos: LatLng | null;
  accuracy: number | null;
  /** Direction of travel in degrees (0 = north), null when standing still. */
  heading: number | null;
  /** Metres per second (smoothed). */
  speed: number;
  error: GeoError | null;
  /** Position comes from test mode / play from home, not the GPS. */
  simulated: boolean;
  /** GPS stopped answering: we're showing the last known spot. */
  stale: boolean;
  /** Only kilometre-wide fixes for a while: "Precise location" is probably off. */
  approximate: boolean;
  /** When the position last changed (ms epoch). */
  at: number;
};

const QUIET_MS = 15_000; // no fix for this long → probe the GPS
const STALE_MS = 30_000; // …and for this long → tell the player
const RESTART_GAP_MS = 10_000;
const AWAY_MS = 5_000; // backgrounded longer than this → restart the watch on return
const APPROX_M = 1_000; // iOS / Android "approximate location" fixes are 1–10 km wide
const APPROX_MS = 15_000; // …and nothing better for this long

type Listener = () => void;

class LocationTracker {
  private snap: LocationSnapshot = { pos: null, accuracy: null, heading: null, speed: 0, error: null, simulated: false, stale: false, approximate: false, at: 0 };
  private listeners = new Set<Listener>();
  private filter = new FixFilter();
  private gps: Fix | null = null;
  private override: LatLng | null = null;
  private watchId: number | null = null;
  private lastRawAt = 0;
  private coarseSince = 0; // first of an unbroken run of km-wide fixes
  private lastStartAt = 0;
  private hiddenAt = 0;
  private probing = false;
  private denied = false;
  private teardown: (() => void) | null = null;

  getSnapshot = () => this.snap;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    if (this.listeners.size === 1) this.activate();
    return () => {
      this.listeners.delete(l);
      if (!this.listeners.size) this.deactivate();
    };
  };

  /** Test mode / play from home: drive the position by hand (null = back to GPS). */
  setOverride(p: LatLng | null) {
    const was = this.override;
    if (was === p || (was && p && was.lat === p.lat && was.lng === p.lng)) return;
    this.override = p;
    if (p) this.stopWatch();
    else {
      this.filter.resume(); // we were elsewhere: the next real fix wins
      if (this.listeners.size) this.startWatch(true);
    }
    this.publish();
  }

  /** "Retry" button: forget the error and ask again (also re-prompts where browsers allow). */
  retry() {
    this.denied = false;
    this.filter.resume();
    this.set({ error: null });
    if (!this.override) this.startWatch(true);
  }

  // ------------------------------------------------------------------ lifecycle
  private activate() {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) return this.set({ error: "insecure" });
    if (!("geolocation" in navigator)) return this.set({ error: "unsupported" });

    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        this.hiddenAt = Date.now();
        return;
      }
      // Phones suspend GPS in the background and don't always resume the old watch.
      if (Date.now() - this.hiddenAt > AWAY_MS) {
        this.filter.resume(); // we may have travelled: trust the next fix
        this.startWatch(true);
      }
    };
    const onPageShow = (e: PageTransitionEvent) => e.persisted && this.startWatch(true);
    const onOnline = () => this.snap.stale && this.startWatch(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    const dog = setInterval(() => this.watchdog(), 5_000);

    // When the player flips location on in site settings, resume without a reload.
    let perm: PermissionStatus | null = null;
    const onPerm = () => {
      if (perm?.state === "granted" && (this.denied || this.snap.error)) this.retry();
      if (perm?.state === "denied") this.fail("denied");
    };
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        perm = p;
        p.addEventListener("change", onPerm);
      })
      .catch(() => {});

    this.teardown = () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
      clearInterval(dog);
      perm?.removeEventListener("change", onPerm);
    };

    if (!this.override) {
      // Fast coarse fix (wifi/cell, or a recent cached one) so the map shows up quickly.
      navigator.geolocation.getCurrentPosition(this.onPosition, () => {}, { enableHighAccuracy: false, maximumAge: 120_000, timeout: 8_000 });
      this.startWatch(false);
    }
  }

  private deactivate() {
    this.stopWatch();
    this.teardown?.();
    this.teardown = null;
  }

  private startWatch(force: boolean) {
    if (this.override || this.denied || typeof navigator === "undefined" || !navigator.geolocation) return;
    if (this.watchId !== null && !force) return;
    const now = Date.now();
    if (this.watchId !== null && now - this.lastStartAt < 1_000) return; // debounce event storms
    this.stopWatch();
    this.lastStartAt = now;
    this.watchId = navigator.geolocation.watchPosition(this.onPosition, this.onError, { enableHighAccuracy: true, maximumAge: 0 });
  }

  private stopWatch() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  /** Quiet GPS: ask once directly. If that fails too, restart the watch. */
  private watchdog() {
    if (this.override || this.denied || this.watchId === null || document.visibilityState !== "visible") return;
    const now = Date.now();
    const quiet = now - Math.max(this.lastRawAt, this.lastStartAt);
    if (this.gps && now - this.lastRawAt > STALE_MS && !this.snap.stale) this.set({ stale: true });
    this.checkApproximate();
    if (quiet < QUIET_MS || this.probing) return;
    this.probing = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.probing = false;
        this.onPosition(p);
      },
      (e) => {
        this.probing = false;
        this.onError(e);
        if (!this.denied && Date.now() - this.lastStartAt > RESTART_GAP_MS) this.startWatch(true);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 10_000 },
    );
  }

  // ------------------------------------------------------------------ fixes
  private onPosition = (p: GeolocationPosition) => {
    this.lastRawAt = Date.now();
    this.denied = false;
    const c = p.coords;
    this.coarseSince = c.accuracy >= APPROX_M ? this.coarseSince || this.lastRawAt : 0;
    this.checkApproximate();
    // The fix's own time: a cached fix from a minute ago must not look like a teleport.
    const at = p.timestamp > 0 ? Math.min(this.lastRawAt, p.timestamp) : this.lastRawAt;
    const fix = this.filter.push({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, speed: c.speed, heading: c.heading, at });
    if (fix) this.gps = fix;
    // Even a filtered-out fix proves the GPS is alive.
    if (fix || this.snap.stale || this.snap.error) this.publish();
  };

  private checkApproximate() {
    const approximate = !this.override && this.coarseSince > 0 && Date.now() - this.coarseSince > APPROX_MS;
    if (approximate !== this.snap.approximate) this.set({ approximate });
  }

  private onError = (e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) return this.fail("denied");
    // Transient: the watch keeps running. Only surface it if we have nothing to show.
    if (!this.gps) this.set({ error: e.code === e.TIMEOUT ? "timeout" : "unavailable" });
    if (e.code === e.POSITION_UNAVAILABLE && this.watchId !== null && Date.now() - this.lastStartAt > RESTART_GAP_MS) setTimeout(() => this.startWatch(true), 3_000);
  };

  private fail(error: GeoError) {
    if (error === "denied") {
      this.denied = true;
      this.stopWatch();
    }
    this.set({ error });
  }

  // ------------------------------------------------------------------ publishing
  private publish() {
    const o = this.override;
    const g = this.gps;
    if (o) {
      this.set({ pos: o, accuracy: 5, heading: null, speed: 0, simulated: true, stale: false, approximate: false, error: null, at: Date.now() });
      return;
    }
    const stale = !!g && Date.now() - this.lastRawAt > STALE_MS;
    if (!g) return this.set({ pos: null, accuracy: null, heading: null, speed: 0, simulated: false, stale: false, error: this.denied ? "denied" : this.snap.simulated ? null : this.snap.error });
    const moved = !this.snap.pos || this.snap.simulated || this.snap.pos.lat !== g.lat || this.snap.pos.lng !== g.lng;
    this.set({
      pos: moved ? { lat: g.lat, lng: g.lng } : this.snap.pos,
      accuracy: g.acc,
      heading: g.heading,
      speed: g.speed,
      simulated: false,
      stale,
      error: this.denied ? "denied" : null,
      at: moved ? g.at : this.snap.at,
    });
  }

  /** Immutable update; listeners only hear about real changes. */
  private set(patch: Partial<LocationSnapshot>) {
    const prev = this.snap;
    let changed = false;
    for (const k in patch) if (patch[k as keyof LocationSnapshot] !== prev[k as keyof LocationSnapshot]) changed = true;
    if (!changed) return;
    this.snap = { ...prev, ...patch };
    this.listeners.forEach((l) => l());
  }
}

/** One GPS per page. */
export const locationTracker = new LocationTracker();
