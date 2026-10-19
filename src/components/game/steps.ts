"use client";
// Pedometer: counts steps with the phone's accelerometer while the game is open, the
// way phone step counters do — peaks in the acceleration, gated by a walking rhythm so
// shaking the phone or tapping the screen doesn't count. Counted steps are reported in
// batches (the server caps them by cadence); GPS distance on foot fills in on the server
// whenever this sensor isn't counting. A web page can't count while it's closed.
import { useEffect, useState } from "react";
import { api } from "./client";

export type StepStatus = "starting" | "on" | "needs-permission" | "denied" | "unsupported";
type Snapshot = { today: number; total: number; status: StepStatus };

const PENDING_KEY = "sq_steps_pending";
const GRANTED_KEY = "sq_motion_ok";
const REPORT_MS = 10_000;
/** Steps in a row, at a steady rhythm, before any of them count. */
const RHYTHM_STEPS = 7;
/** How far one step's timing may stray from the walker's rhythm (±). */
const RHYTHM_TOL = 0.3;
const MIN_GAP = 250;
const MAX_GAP = 2000;

type MotionPerm = { requestPermission?: () => Promise<"granted" | "denied"> };

class Pedometer {
  status: StepStatus = "starting";
  today = 0;
  total = 0;
  pending = 0;
  private listeners = new Set<(s: Snapshot) => void>();
  private stepListeners = new Set<() => void>();
  private gravity = 0;
  private smooth = 0;
  private prev = 0;
  private rising = false;
  private peakAvg = 2.2;
  private lastPeak = 0;
  private streak: number[] = []; // peak times waiting for a rhythm
  private walking = false;
  private beat = 0; // the walker's step interval (ms) once walking
  private sawMotion = false;
  private started = false;
  private sending = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    try {
      this.pending = Math.max(0, Number(localStorage.getItem(PENDING_KEY)) || 0);
    } catch {}
    const DM = (window as unknown as { DeviceMotionEvent?: MotionPerm }).DeviceMotionEvent;
    if (!DM) this.set("unsupported");
    else if (typeof DM.requestPermission === "function") {
      // iOS: needs a tap. If it was granted before, the next tap anywhere re-arms it.
      this.set("needs-permission");
      let ok = false;
      try {
        ok = localStorage.getItem(GRANTED_KEY) === "1";
      } catch {}
      if (ok) {
        const once = () => {
          document.removeEventListener("pointerup", once, true);
          void this.enable();
        };
        document.addEventListener("pointerup", once, true);
      }
    } else this.listen();
    setInterval(() => void this.report(), REPORT_MS);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void this.report(true));
    void this.refresh();
    setInterval(() => void this.refresh(), 60_000);
  }

  /** Ask for motion access (must run from a tap on iOS). */
  async enable() {
    const DM = (window as unknown as { DeviceMotionEvent?: MotionPerm }).DeviceMotionEvent;
    if (!DM?.requestPermission) return this.listen();
    try {
      const r = await DM.requestPermission();
      if (r === "granted") {
        try {
          localStorage.setItem(GRANTED_KEY, "1");
        } catch {}
        this.listen();
      } else this.set("denied");
    } catch {
      this.set("needs-permission");
    }
  }

  private listen() {
    window.addEventListener("devicemotion", this.onMotion);
    this.set("on");
    // Desktops expose the API but never fire it (or fire it empty).
    setTimeout(() => !this.sawMotion && this.set("unsupported"), 4000);
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    if (!this.sawMotion) {
      this.sawMotion = true;
      if (this.status !== "on") this.set("on");
    }
    const m = Math.hypot(a.x, a.y, a.z);
    // Slow-moving average = gravity; what's left is the bounce of each step.
    this.gravity = this.gravity ? this.gravity + (m - this.gravity) * 0.08 : m;
    this.smooth = this.smooth * 0.55 + (m - this.gravity) * 0.45;
    const v = this.smooth;
    const now = e.timeStamp || performance.now();
    // Let the threshold relax after hard running so a gentle walk is seen again.
    if (now - this.lastPeak > 1200) this.peakAvg = Math.max(1.6, this.peakAvg * 0.995);
    if (v > this.prev) this.rising = true;
    else if (this.rising && v < this.prev) {
      this.rising = false;
      const peak = this.prev;
      const thresh = Math.max(0.9, this.peakAvg * 0.4);
      if (peak > thresh && peak < 25 && now - this.lastPeak > MIN_GAP) this.onPeak(now, peak);
    }
    this.prev = v;
  };

  private onPeak(t: number, amp: number) {
    const gap = t - this.lastPeak;
    this.lastPeak = t;
    this.peakAvg = this.peakAvg * 0.85 + amp * 0.15;
    if (gap > MAX_GAP) {
      this.walking = false;
      this.streak = [t];
      return;
    }
    if (this.walking) {
      // Still in step? Then it counts and the rhythm follows the walker's pace.
      if (Math.abs(gap - this.beat) <= this.beat * RHYTHM_TOL) {
        this.beat = this.beat * 0.8 + gap * 0.2;
        this.count(1);
        return;
      }
      // Out of rhythm: stop counting until a steady rhythm is back.
      this.walking = false;
      this.streak = [t - gap, t];
      return;
    }
    this.streak.push(t);
    if (this.streak.length < RHYTHM_STEPS) return;
    // Steady rhythm? Every gap close to the median gap.
    const gaps = this.streak.slice(1).map((x, i) => x - this.streak[i]);
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    if (gaps.every((g) => Math.abs(g - med) <= med * RHYTHM_TOL)) {
      this.walking = true;
      this.beat = med;
      this.count(this.streak.length);
      this.streak = [];
    } else this.streak.shift();
  }

  private count(n: number) {
    this.pending += n;
    try {
      localStorage.setItem(PENDING_KEY, String(this.pending));
    } catch {}
    this.stepListeners.forEach((l) => l());
    this.emit();
  }

  private async report(leaving = false) {
    if (this.sending || this.pending <= 0) return;
    const n = this.pending;
    this.sending = true;
    try {
      if (leaving) {
        // The page is going away: hand it to the browser, best effort.
        fetch("/api/steps", { method: "POST", body: JSON.stringify({ steps: n }), headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
        this.pending = 0;
      } else {
        const r = await api<{ today: number; total: number }>("/api/steps", { body: { steps: n } });
        this.pending = Math.max(0, this.pending - n);
        this.today = r.today;
        this.total = r.total;
      }
      try {
        localStorage.setItem(PENDING_KEY, String(this.pending));
      } catch {}
      this.emit();
    } catch {
    } finally {
      this.sending = false;
    }
  }

  async refresh() {
    try {
      const r = await api<{ today: number; total: number }>("/api/steps");
      this.today = r.today;
      this.total = r.total;
      this.emit();
    } catch {}
  }

  snapshot(): Snapshot {
    return { today: this.today + this.pending, total: this.total + this.pending, status: this.status };
  }
  private set(s: StepStatus) {
    this.status = s;
    this.emit();
  }
  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }
  subscribe(l: (s: Snapshot) => void) {
    this.listeners.add(l);
    l(this.snapshot());
    return () => void this.listeners.delete(l);
  }
  onStep(l: () => void) {
    this.stepListeners.add(l);
    return () => void this.stepListeners.delete(l);
  }
}

export const pedometer = new Pedometer();

/** Today's steps, lifetime steps and the sensor status; starts the pedometer once. */
export function useSteps() {
  const [s, setS] = useState<Snapshot>({ today: 0, total: 0, status: "starting" });
  useEffect(() => {
    pedometer.start();
    return pedometer.subscribe(setS);
  }, []);
  return { ...s, enable: () => pedometer.enable(), refresh: () => pedometer.refresh() };
}
