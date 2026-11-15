"use client";
// "Page mode": the List view (list/ListView.tsx) shows the same screens the map opens as sheets —
// the store list, product search, the trip planner, hotels — as a full-screen page like a website.
// Inside <PageMode>:
//  - <Sheet> draws as a page section (no grip, no swipe-to-close, no ✕; ‹ still goes back a step);
//  - <FilterPanel> on a wide screen sits open in the page's sidebar (`dock`) instead of a sheet over
//    everything, so the filters are always beside the results; on a phone it stays a bottom sheet.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PageCtx = { dock: HTMLElement | null; wide: boolean };
const Ctx = createContext<PageCtx | null>(null);

/** Set when this screen is drawn as a page (the List view), null inside the map and the game. */
export const usePage = () => useContext(Ctx);

/** Wide enough for filters beside the results (a tablet held sideways, a laptop). */
export const WIDE_PX = 960;

export function useWide(px = WIDE_PX) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = matchMedia(`(min-width: ${px}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return wide;
}

export function PageMode({ dock, children }: { dock: HTMLElement | null; children: ReactNode }) {
  const wide = useWide();
  return <Ctx.Provider value={{ dock, wide }}>{children}</Ctx.Provider>;
}
