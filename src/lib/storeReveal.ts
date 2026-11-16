// A store showing itself off as you come up to it (pure; tests/storeReveal.test.ts) — drive/storefronts.ts draws it:
//  - the first time you're near a store (REVEAL_M) its sign "ignites" like neon switching on: a few stutters, a surge
//    brighter than normal, then it settles (ignition);
//  - its window shows what's inside: the store's own photo once its card is read, else an interior drawn for its
//    trade (WINDOW_SCENE);
//  - a store with a discount hangs a turning gold medal by its sign with the percentage (dealPercent).
import type { StoreKind } from "./storeKinds";

/** Within this far (m) a store you haven't seen yet lights up for you. */
export const REVEAL_M = 16;
/** How long the ignition lasts (s). */
export const REVEAL_S = 1.8;

/**
 * The sign's light (× its normal level) `t` s after the store noticed you: off-on stutters for the first third of a
 * second, a surge to about 2.6×, easing back to 1. Before 0 and after REVEAL_S: 1.
 */
export function ignition(t: number): number {
  if (!(t >= 0) || t >= REVEAL_S) return 1;
  // Stutters: on, off, on, off, on — the tube catching.
  if (t < 0.36) return [0.15, 1.6, 0.1, 2, 0.2, 2.4][Math.min(5, Math.floor(t / 0.06))];
  // The surge, then settling (smooth, ends exactly at 1).
  const k = (t - 0.36) / (REVEAL_S - 0.36);
  return 1 + 1.6 * (1 - k) * (1 - k);
}

/** A store's best discount (%): its listed deal (Takhfifan) or the biggest cut on its menu; null under 5 %. */
export function dealPercent(info: { deal?: number; menuSections?: { items: { price: number; priceNow: number }[] }[] } | undefined): number | null {
  if (!info) return null;
  let best = info.deal && Number.isFinite(info.deal) ? info.deal : 0;
  for (const s of info.menuSections ?? [])
    for (const it of s.items) if (it.price > 0 && it.priceNow > 0 && it.priceNow < it.price) best = Math.max(best, ((it.price - it.priceNow) / it.price) * 100);
  const p = Math.round(Math.min(90, best));
  return p >= 5 ? p : null;
}

/**
 * What a store's window shows when it has no photo: its trade's interior, as layers the canvas draws — the back
 * wall, what stands on the shelves or the counter, and the light. Colours are what the goods look like.
 */
export type WindowScene = { wall: string; floor: string; goods: "loaves" | "cakes" | "fruit" | "packs" | "meat" | "medicine" | "clothes" | "phones" | "cafe" | "tables" | "desks"; colors: string[]; lamps: "pendant" | "strip" | "spot" };
export const WINDOW_SCENE: Record<StoreKind, WindowScene> = {
  bakery: { wall: "#7a4b22", floor: "#3b2412", goods: "loaves", colors: ["#d9a05b", "#c88a43", "#e6b877", "#b9772f"], lamps: "pendant" },
  sweets: { wall: "#f3d9e4", floor: "#a8738a", goods: "cakes", colors: ["#f7a8c8", "#7a4a2a", "#fff3e0", "#e85a8a", "#f4c542", "#9ad1a0"], lamps: "spot" },
  produce: { wall: "#486b34", floor: "#2c3a20", goods: "fruit", colors: ["#e0412b", "#f08a1e", "#5cb83a", "#e8c42a", "#b3262b", "#7cc242"], lamps: "strip" },
  market: { wall: "#e9efe4", floor: "#8b9584", goods: "packs", colors: ["#e63946", "#1d70b8", "#f4a261", "#2a9d8f", "#ffd166", "#8338ec", "#ef476f"], lamps: "strip" },
  general: { wall: "#e6e1d6", floor: "#857f72", goods: "packs", colors: ["#c0392b", "#2980b9", "#f39c12", "#27ae60", "#8e44ad"], lamps: "strip" },
  butcher: { wall: "#f1f1ee", floor: "#9c3b33", goods: "meat", colors: ["#b3262b", "#8f1d22", "#d0473f", "#f2d7c9"], lamps: "strip" },
  pharmacy: { wall: "#f4f8f6", floor: "#9fb3aa", goods: "medicine", colors: ["#2a9d8f", "#e76f51", "#457b9d", "#f4a261", "#ffffff", "#e63946"], lamps: "strip" },
  fashion: { wall: "#2b2a33", floor: "#14131a", goods: "clothes", colors: ["#e63946", "#f1faee", "#a8dadc", "#457b9d", "#e9c46a", "#264653", "#d4a373"], lamps: "spot" },
  tech: { wall: "#14181f", floor: "#0a0d12", goods: "phones", colors: ["#4cc9f0", "#7209b7", "#f72585", "#4361ee", "#80ffdb"], lamps: "strip" },
  cafe: { wall: "#5a3e2b", floor: "#2b1d13", goods: "cafe", colors: ["#f5ebe0", "#c8a27a", "#3d8b3d", "#d4a373"], lamps: "pendant" },
  restaurant: { wall: "#7a2b1c", floor: "#3a140c", goods: "tables", colors: ["#f5ebe0", "#c9a24a", "#e9d8a6"], lamps: "pendant" },
  fastfood: { wall: "#c0392b", floor: "#4a120c", goods: "tables", colors: ["#ffd166", "#ffffff", "#f4a261"], lamps: "strip" },
};
/** Not a shop (a bank, an office, a clinic — lib/storeKinds.ts isShop): a counter with its screens, not goods. */
export const OFFICE_SCENE: WindowScene = { wall: "#d9dde3", floor: "#7d838c", goods: "desks", colors: ["#4cc9f0", "#90e0ef", "#caf0f8"], lamps: "strip" };
