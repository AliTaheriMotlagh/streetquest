// The travel planner's day strip with prices (pure; tests/tripCalendar.test.ts). A leg's strip shows,
// under each day, the cheapest ticket that day for the way picked (flight, train or bus), greys a day
// with none, marks the cheapest day, and offers "next available" when the chosen day is empty. The
// days around the chosen one are searched ahead, two at a time (components/game/Travel.tsx), through the
// same per-day searches and caches as the list — so tapping a neighbouring day is instant.
import type { Mode, Trip } from "./index";

/** One day's tickets per way: the cheapest (toman, for `travellers` seats) and how many trips. */
export type DayCell = Partial<Record<Mode, { min: number; n: number }>>;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The days to search ahead around `center`: `before` and `after` it, never before `minDate` (today or the
 * leg's earliest day) nor past `lastDate`, nearest first so the strip fills from the chosen day outwards.
 */
export function windowDays(center: string, minDate: string, lastDate: string, before = 3, after = 3): string[] {
  const out: string[] = [];
  for (let k = 0; k <= Math.max(before, after); k++)
    for (const d of k ? [addDays(center, k), addDays(center, -k)] : [center]) {
      const off = Math.round((Date.parse(d) - Date.parse(center)) / 86_400_000);
      if (off > after || -off > before || d < minDate || d > lastDate) continue;
      out.push(d);
    }
  return out;
}

/** A day's trips → the cheapest bookable one per way (enough seats for everyone travelling). */
export function cellOf(trips: Trip[], travellers = 1): DayCell {
  const out: DayCell = {};
  for (const x of trips) {
    if (x.seats != null && x.seats < travellers) continue;
    const c = out[x.mode];
    if (!c) out[x.mode] = { min: x.price, n: 1 };
    else (c.min = Math.min(c.min, x.price)), c.n++;
  }
  return out;
}

/** The first day after `from` (in `days` order) with a ticket for `mode`, or null when none is known yet. */
export function nextAvailable(cells: Record<string, DayCell | undefined>, days: string[], mode: Mode, from: string): string | null {
  for (const d of days) if (d > from && cells[d]?.[mode]?.n) return d;
  return null;
}

/** The cheapest known day for `mode` (only when at least two days are known, else there's nothing to compare). */
export function cheapestDay(cells: Record<string, DayCell | undefined>, days: string[], mode: Mode): string | null {
  let best: string | null = null, known = 0;
  for (const d of days) {
    const c = cells[d]?.[mode];
    if (!c?.n) continue;
    known++;
    if (!best || c.min < cells[best]![mode]!.min) best = d;
  }
  return known >= 2 ? best : null;
}

/** A price short enough for a chip under the day: 1,250,000 → 1.25 "M", 870,000 → 870 "K" (the unit is translated). */
export function shortToman(n: number): { n: number; unit: "M" | "K" | "" } {
  if (n >= 1_000_000) return { n: +(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2), unit: "M" };
  if (n >= 1000) return { n: Math.round(n / 1000), unit: "K" };
  return { n: Math.round(n), unit: "" };
}
