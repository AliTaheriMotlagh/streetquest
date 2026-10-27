"use client";
// Graphics level for the device. Low-RAM and low-core phones (most budget Android)
// get "lite": no looping marker animations, no tile filters, fewer kept map tiles, a
// lower 3D resolution. The player can force either mode; "auto" decides from the
// hardware, and from the frame rate when the hardware hints aren't there.
// The choice is mirrored as a class on <html> so CSS can follow it.

export type PerfMode = "auto" | "lite" | "full";

const KEY = "sq_perf";
/** Set once "auto" has measured this phone as too slow, so the next visit starts lite. */
const SLOW_KEY = "sq_perf_slow";
const listeners = new Set<() => void>();
let mode: PerfMode = "auto";

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** Hardware hints: ≤ 4 GB RAM (Chrome/Android only reports this), ≤ 4 cores, or Data Saver on. */
function weakDevice() {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Nav;
  if (n.deviceMemory != null && n.deviceMemory <= 4) return true;
  if (n.hardwareConcurrency != null && n.hardwareConcurrency <= 4) return true;
  return !!n.connection?.saveData;
}

let autoLite = typeof window !== "undefined" && weakDevice();

/**
 * A phone or tablet. Some Android browsers (stylus phones, desktop-site mode, a few
 * vendor browsers) report a fine primary pointer, so any touch input counts.
 */
export const isTouch = () =>
  typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(any-pointer: coarse)").matches || navigator.maxTouchPoints > 0);
export const isLite = () => (mode === "auto" ? autoLite : mode === "lite");
export const perfMode = () => mode;
export const autoIsLite = () => autoLite;

function apply() {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("lite", isLite());
}

export function setPerfMode(m: PerfMode) {
  mode = m;
  try {
    if (m === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, m);
  } catch {}
  apply();
  listeners.forEach((l) => l());
}

export function onPerfChange(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Watch the frame rate for a few seconds once the map has settled. Browsers that hide
 * RAM (Samsung Internet, Firefox) on an octa-core budget phone pass the hardware check
 * yet still can't keep up; if most frames are slow, "auto" switches to lite for good.
 */
export function probeFrameRate() {
  if (typeof window === "undefined" || autoLite || mode !== "auto") return () => {};
  let raf = 0, last = 0, frames = 0, slow = 0;
  const tick = (now: number) => {
    if (document.visibilityState === "hidden") return void (raf = 0);
    if (last) {
      frames++;
      if (now - last > 40) slow++;
    }
    last = now;
    if (frames < 150) return void (raf = requestAnimationFrame(tick));
    raf = 0;
    if (slow / frames > 0.3) {
      autoLite = true;
      try {
        localStorage.setItem(SLOW_KEY, "1");
      } catch {}
      apply();
      listeners.forEach((l) => l());
    }
  };
  // Tiles and markers loading in make the first seconds janky on every phone.
  const start = setTimeout(() => (raf = requestAnimationFrame(tick)), 6000);
  return () => {
    clearTimeout(start);
    if (raf) cancelAnimationFrame(raf);
  };
}

if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "lite" || saved === "full") mode = saved;
    if (localStorage.getItem(SLOW_KEY)) autoLite = true;
  } catch {}
  apply();
}
