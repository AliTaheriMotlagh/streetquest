// Pure GPS fix filter: no browser APIs, so it's cheap to reason about and test.
//
// Pipeline for each raw fix:
//  1. coarse gate   — a wide wifi/cell fix right after a good GPS one is noise
//  2. outlier gate  — impossible jumps are dropped, but only a few times in a row:
//                     if the "jumps" keep agreeing with each other, the old anchor was
//                     the bad one and we re-anchor (otherwise one bad fix freezes you)
//  3. Kalman        — constant-velocity model (position + velocity per axis, in local
//                     metres). Because it knows how fast and which way you're going it
//                     can average away noise *without* trailing behind a walker or a
//                     car; the chip's Doppler speed + heading, when given, feed it too
//  4. still gate    — standing still, the shown position doesn't wander inside the
//                     noise (it still moves once the estimate clearly leaves it)
import type { LatLng } from "@/lib/geo";

export type RawFix = { lat: number; lng: number; acc: number; speed: number | null; heading: number | null; at: number };
export type Fix = { lat: number; lng: number; acc: number; speed: number; heading: number | null; at: number };

const COARSE_WINDOW_MS = 20_000;
const MAX_SPEED_MS = 70; // ~250 km/h: faster than that (beyond accuracy) is a glitch
const OUTLIER_STREAK = 3; // this many agreeing "glitches" in a row → they're real
const OUTLIER_MAX_MS = 8_000; // …or glitches for this long
const MOVING_MS = 0.7;
const HEADING_MS = 1; // below this the direction of travel is just noise
const ZUPT_VAR = 0.25; // (m/s)²
const GAP_RESET_MS = 120_000; // no fix for this long → don't extrapolate, start over

const M_PER_DEG = 111_320;
const rad = (d: number) => (d * Math.PI) / 180;

/** One axis of a constant-velocity Kalman filter: state [p, v], covariance [[a, b], [b, c]]. */
type Axis = { p: number; v: number; a: number; b: number; c: number };

const predict = (s: Axis, dt: number, q: number) => {
  // White-noise acceleration with spectral density q.
  const dt2 = dt * dt;
  s.p += s.v * dt;
  const a = s.a + 2 * dt * s.b + dt2 * s.c + (q * dt2 * dt) / 3;
  const b = s.b + dt * s.c + (q * dt2) / 2;
  s.a = a;
  s.b = b;
  s.c += q * dt;
};
const measurePos = (s: Axis, z: number, r: number) => {
  const k0 = s.a / (s.a + r);
  const k1 = s.b / (s.a + r);
  const y = z - s.p;
  s.p += k0 * y;
  s.v += k1 * y;
  s.c -= k1 * s.b;
  s.b -= k0 * s.b;
  s.a -= k0 * s.a;
};
const measureVel = (s: Axis, z: number, r: number) => {
  const k0 = s.b / (s.c + r);
  const k1 = s.c / (s.c + r);
  const y = z - s.v;
  s.p += k0 * y;
  s.v += k1 * y;
  s.a -= k0 * s.b;
  s.b -= k1 * s.b;
  s.c -= k1 * s.c;
};

const dist = (a: LatLng, b: LatLng) => {
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const dx = (b.lng - a.lng) * M_PER_DEG * Math.cos(rad((a.lat + b.lat) / 2));
  return Math.hypot(dx, dy);
};

export class FixFilter {
  private anchor: RawFix | null = null; // last accepted raw fix
  private good: RawFix | null = null; // last accepted fix with GPS-grade accuracy
  private outliers: RawFix[] = [];
  // Kalman state in metres east (x) / north (y) of `ref`.
  private ref: LatLng | null = null;
  private x: Axis | null = null;
  private y: Axis | null = null;
  private at = 0;
  private shown: LatLng | null = null;
  private still = false;
  private heading: number | null = null;
  /** Some Android chips report speed 0 while moving: only trust a 0 from one that has reported motion. */
  private chipMoves = false;
  private chipDoubt = 0;

  /** Forget the anchor (e.g. after the app was in the background): the next fix is trusted. */
  resume() {
    this.anchor = null;
    this.outliers = [];
    this.x = this.y = null;
    this.shown = null;
    this.still = false;
  }

  /** Returns the new smoothed fix, or null when this one should be ignored. */
  push(raw: RawFix): Fix | null {
    if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
    if (this.anchor && raw.at <= this.anchor.at) return null; // late cached fix: older than what we have
    const acc = raw.acc > 0 ? raw.acc : 50;
    raw = { ...raw, acc };

    const good = this.good;
    if (good && acc > Math.max(100, good.acc * 4) && raw.at - good.at < COARSE_WINDOW_MS) return null;

    const prev = this.anchor;
    if (prev) {
      const d = dist(prev, raw);
      const dt = Math.max(0.5, (raw.at - prev.at) / 1000);
      if (d > 100 + acc + prev.acc && d / dt > MAX_SPEED_MS) {
        const first = this.outliers[0];
        const agrees = !first || dist(first, raw) < 100 + acc + first.acc + MAX_SPEED_MS * ((raw.at - first.at) / 1000);
        this.outliers = agrees ? [...this.outliers, raw] : [raw];
        const streak = this.outliers.length >= OUTLIER_STREAK || raw.at - this.outliers[0].at >= OUTLIER_MAX_MS;
        if (!streak) return null;
        // The "glitches" are consistent: the anchor was the outlier. Start over from here.
        this.resume();
      }
    }
    this.outliers = [];
    if (this.anchor && raw.at - this.anchor.at > GAP_RESET_MS) this.resume();
    this.anchor = raw;
    if (acc <= 50) this.good = raw;
    return this.track(raw);
  }

  private track(raw: RawFix): Fix {
    // Position accuracy is a ~68% radius; per axis that's about acc / 1.5.
    const r = (raw.acc / 1.5) ** 2;
    const chipSpeed = raw.speed != null && Number.isFinite(raw.speed) && raw.speed >= 0 ? raw.speed : null;
    const chipHeading = chipSpeed != null && chipSpeed >= HEADING_MS && raw.heading != null && Number.isFinite(raw.heading) ? raw.heading : null;

    if (!this.x || !this.y || !this.ref) {
      this.ref = { lat: raw.lat, lng: raw.lng };
      // Unknown velocity: wide enough for anything from standing to driving.
      this.x = { p: 0, v: 0, a: r, b: 0, c: 100 };
      this.y = { p: 0, v: 0, a: r, b: 0, c: 100 };
    } else {
      const dt = Math.max(0, (raw.at - this.at) / 1000);
      // How sharply speed and direction may change: gentle on foot, more in a car.
      const v = Math.hypot(this.x.v, this.y.v);
      const q = (0.7 + 0.2 * v) ** 2;
      predict(this.x, dt, q);
      predict(this.y, dt, q);
    }
    this.at = raw.at;

    const ref = this.ref;
    const kx = M_PER_DEG * Math.cos(rad(ref.lat));
    const zx = (raw.lng - ref.lng) * kx;
    const zy = (raw.lat - ref.lat) * M_PER_DEG;
    // How surprising is this fix? (squared, in standard deviations; ~9 = 99%)
    const surprise = (zx - this.x.p) ** 2 / (this.x.a + r) + (zy - this.y.p) ** 2 / (this.y.a + r);
    measurePos(this.x, zx, r);
    measurePos(this.y, zy, r);
    // Doppler velocity from the chip is far better than anything we can derive.
    if (chipSpeed != null && chipSpeed >= HEADING_MS) {
      this.chipMoves = true;
      this.chipDoubt = 0;
    }
    if (chipHeading != null && chipSpeed != null) {
      const rv = (0.3 + 0.05 * chipSpeed) ** 2;
      measureVel(this.x, chipSpeed * Math.sin(rad(chipHeading)), rv);
      measureVel(this.y, chipSpeed * Math.cos(rad(chipHeading)), rv);
    } else if (chipSpeed != null && chipSpeed < 0.3 && this.chipMoves) {
      // The chip says we've stopped. If the fixes keep disagreeing, it's one of those
      // chips that says 0 while moving: stop believing its zeros.
      this.chipDoubt = surprise > 4 ? this.chipDoubt + 1 : Math.max(0, this.chipDoubt - 1);
      if (this.chipDoubt >= 2) this.chipMoves = false;
      else {
        measureVel(this.x, 0, ZUPT_VAR);
        measureVel(this.y, 0, ZUPT_VAR);
      }
    }

    // Velocity read off noisy positions is itself noisy: standing in a ±15 m fix it
    // easily says 1–2 m/s. Only call it movement when it clearly beats its own
    // uncertainty, or the chip says so.
    const v = Math.hypot(this.x.v, this.y.v);
    const sigmaV = Math.sqrt((this.x.c + this.y.c) / 2);
    const moving = (chipSpeed != null && this.chipMoves && chipSpeed >= MOVING_MS) || v >= Math.max(MOVING_MS, (this.still ? 2.5 : 1.5) * sigmaV);
    this.still = !moving;
    const speed = moving ? Math.max(v, chipSpeed ?? 0) : 0;
    if (chipHeading != null) this.heading = chipHeading;
    else if (moving && v >= HEADING_MS) this.heading = ((Math.atan2(this.x.v, this.y.v) * 180) / Math.PI + 360) % 360;
    else if (!moving) this.heading = null;

    const est = { lat: ref.lat + this.y.p / M_PER_DEG, lng: ref.lng + this.x.p / kx };
    // The flat-metre frame is only exact near its origin: re-centre it as we travel.
    if (Math.hypot(this.x.p, this.y.p) > 1_000) {
      this.ref = est;
      this.x.p = this.y.p = 0;
    }
    // Standing still: keep the dot put until the estimate clearly leaves its spot.
    const hold = this.still && this.shown && dist(this.shown, est) < Math.max(3, Math.min(raw.acc, 30) * 0.8);
    if (!hold) this.shown = est;
    const at = this.shown!;
    return { lat: at.lat, lng: at.lng, acc: raw.acc, speed, heading: this.heading, at: raw.at };
  }
}
