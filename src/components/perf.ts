"use client";
// Graphics level for the device. Low-RAM and low-core phones (most budget Android)
// get "lite": no looping marker animations, fewer kept map tiles, a lower 3D
// resolution. The player can force either mode; "auto" decides from the hardware.
// The choice is mirrored as a class on <html> so CSS can follow it.

export type PerfMode = "auto" | "lite" | "full";

const KEY = "sq_perf";
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

const autoLite = typeof window !== "undefined" && weakDevice();

export const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
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

if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "lite" || saved === "full") mode = saved;
  } catch {}
  apply();
}
