"use client";
// The player's touch / pad control preferences: look sensitivity and a left-handed layout.
// Kept in localStorage and in memory (the frame loop reads it every frame, so it never hits storage).
import { useSyncExternalStore } from "react";
import { clampSens } from "@/lib/input/touch";

export type TouchPrefs = { /** Look sensitivity multiplier. */ look: number; /** Mirror the sides: stick on the right, look and buttons on the left. */ left: boolean };
const KEY = "sq_touch_prefs";
const DEFAULT: TouchPrefs = { look: 1, left: false };
let cache: TouchPrefs | null = null;
const subs = new Set<() => void>();

export function loadTouchPrefs(): TouchPrefs {
  if (cache) return cache;
  let p = DEFAULT;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") p = { look: clampSens(Number(raw.look ?? 1)), left: !!raw.left };
  } catch {}
  return (cache = p);
}

export function saveTouchPrefs(patch: Partial<TouchPrefs>) {
  const p = { ...loadTouchPrefs(), ...patch };
  p.look = clampSens(p.look);
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  subs.forEach((f) => f());
}

export function useTouchPrefs(): TouchPrefs {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    loadTouchPrefs,
    () => DEFAULT,
  );
}

/** A short haptic tick on touch devices that have one (Android; iOS Safari ignores it). */
export const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};
