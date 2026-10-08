// Pure GPS fix filter: no browser APIs, so it's cheap to reason about and test.
//
// Pipeline for each raw fix:
//  1. coarse gate   — a wide wifi/cell fix right after a good GPS one is noise
//  2. outlier gate  — impossible jumps are dropped, but only a few times in a row:
//                     if the "jumps" keep agreeing with each other, the old anchor was
//                     the bad one and we re-anchor (otherwise one bad fix freezes you)
//  3. jitter gate   — standing still, tiny moves inside the accuracy circle are ignored;
//                     the anchor isn't moved, so slow walking still accumulates
//  4. Kalman        — per-axis Kalman with speed-scaled process noise, plus a gain floor
//                     so smoothing never trails a moving player by more than ~LAG_M
import { bearingTo, distanceM, type LatLng } from "@/lib/geo";

export type RawFix = { lat: number; lng: number; acc: number; speed: number | null; heading: number | null; at: number };
export type Fix = { lat: number; lng: number; acc: number; speed: number; heading: number | null; at: number };

const COARSE_WINDOW_MS = 20_000;
const MAX_SPEED_MS = 70; // ~250 km/h: faster than that (beyond accuracy) is a glitch
const OUTLIER_STREAK = 3; // this many agreeing "glitches" in a row → they're real
const OUTLIER_MAX_MS = 8_000; // …or glitches for this long
const MOVING_MS = 0.7;
const HEADING_MIN_M = 8;
const LAG_M = 3;

export class FixFilter {
  private anchor: RawFix | null = null; // last accepted raw fix
  private good: RawFix | null = null; // last accepted fix with GPS-grade accuracy
  private outliers: RawFix[] = [];
  private est: { lat: number; lng: number; variance: number; at: number } | null = null;
  private speed = 0;
  private heading: number | null = null;
  private headingFrom: LatLng | null = null;

  /** Forget the anchor (e.g. after the app was in the background): the next fix is trusted. */
  resume() {
    this.anchor = null;
    this.outliers = [];
    this.est = null;
  }

  /** Returns the new smoothed fix, or null when this one shouldn't move the player. */
  push(raw: RawFix): Fix | null {
    if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
    if (this.anchor && raw.at <= this.anchor.at) return null; // late cached fix: older than what we have
    const acc = raw.acc > 0 ? raw.acc : 50;
    raw = { ...raw, acc };

    const good = this.good;
    if (good && acc > Math.max(100, good.acc * 4) && raw.at - good.at < COARSE_WINDOW_MS) return null;

    const prev = this.anchor;
    const d = prev ? distanceM(prev, raw) : 0;
    const dt = prev ? Math.max(0.5, (raw.at - prev.at) / 1000) : 1;

    if (prev && d > 100 + acc + prev.acc && d / dt > MAX_SPEED_MS) {
      const first = this.outliers[0];
      const agrees = !first || distanceM(first, raw) < 100 + acc + first.acc + MAX_SPEED_MS * ((raw.at - first.at) / 1000);
      this.outliers = agrees ? [...this.outliers, raw] : [raw];
      const streak = this.outliers.length >= OUTLIER_STREAK || raw.at - this.outliers[0].at >= OUTLIER_MAX_MS;
      if (!streak) return null;
      // The "glitches" are consistent: the anchor was the outlier. Start over from here.
      this.resume();
      return this.accept(raw, 0, null);
    }
    this.outliers = [];

    // Speed from the GPS chip, but some Android phones report 0 while moving, so also
    // trust displacement once it clearly exceeds the noise of both fixes.
    const derived = prev && d > Math.max(acc, prev.acc) * 0.5 ? d / dt : 0;
    const gpsSpeed = raw.speed != null && raw.speed >= 0 ? raw.speed : null;
    const rawSpeed = Math.max(gpsSpeed ?? 0, derived);

    if (prev && rawSpeed < MOVING_MS && d < Math.max(3, Math.min(acc, 30) * 0.5) && raw.at - prev.at < 60_000) {
      this.speed *= 0.5;
      return null;
    }
    return this.accept(raw, rawSpeed, prev);
  }

  private accept(raw: RawFix, rawSpeed: number, prev: RawFix | null): Fix {
    this.speed = prev ? this.speed * 0.4 + rawSpeed * 0.6 : rawSpeed;
    const { lat, lng } = this.smooth(raw, rawSpeed);
    this.anchor = raw;
    if (raw.acc <= 50) this.good = raw;

    // Heading: the chip's when moving, else from the track once we've moved enough.
    const here = { lat, lng };
    if (raw.heading != null && Number.isFinite(raw.heading) && this.speed > 1) {
      this.heading = raw.heading;
      this.headingFrom = here;
    } else if (!this.headingFrom) {
      this.headingFrom = here;
    } else if (distanceM(this.headingFrom, here) >= HEADING_MIN_M) {
      this.heading = bearingTo(this.headingFrom, here);
      this.headingFrom = here;
    } else if (this.speed < 1) {
      this.heading = null;
    }
    return { lat, lng, acc: raw.acc, speed: this.speed, heading: this.heading, at: raw.at };
  }

  /** Kalman step. Process noise grows with speed so a car isn't dragged behind. */
  private smooth(raw: RawFix, speed: number) {
    const e = this.est;
    const measVar = raw.acc * raw.acc;
    if (!e) {
      this.est = { lat: raw.lat, lng: raw.lng, variance: measVar, at: raw.at };
      return this.est;
    }
    const dt = Math.max(0, (raw.at - e.at) / 1000);
    const q = Math.max(3, this.speed * 1.5);
    const variance = e.variance + dt * q * q;
    // Steady-state lag is about v·dt·(1−k)/k: keep it under LAG_M while moving, even
    // with a poor fix (otherwise ±40 m accuracy trails a walker by ~18 m).
    const step = speed * dt;
    const k = Math.max(variance / (variance + measVar), speed > 0.5 ? step / (step + LAG_M) : 0);
    this.est = { lat: e.lat + k * (raw.lat - e.lat), lng: e.lng + k * (raw.lng - e.lng), variance: (1 - k) * variance, at: raw.at };
    return this.est;
  }
}
