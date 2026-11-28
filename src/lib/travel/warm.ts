// What the server loads ahead every hour so the first player to ask gets an instant answer (pure;
// tests/travelWarm.test.ts): tickets on the busiest routes for today and the next two days (Iran's date), and
// the places to stay and things to book in the cities people travel to most. server/travel.ts warmTravel runs
// it one search at a time, spaced out, so it never bursts at a site.
import { cityByKey, POPULAR } from "./index";

/** Routes searched ahead: Tehran both ways to these, and a few busy routes between other cities. */
export const WARM_FROM_TEHRAN = ["mashhad", "kish", "shiraz", "isfahan", "tabriz", "ahvaz", "bandar-abbas", "qeshm", "yazd", "rasht", "kerman"];
export const WARM_OTHER: [string, string][] = [["mashhad", "shiraz"], ["mashhad", "isfahan"], ["shiraz", "kish"], ["isfahan", "kish"], ["mashhad", "kish"]];
/** Days ahead searched (0 = today in Iran). */
export const WARM_DAYS = 3;

/** Iran's calendar day (YYYY-MM-DD) `days` after `now` (Iran is UTC+3:30 all year since 2022). */
export const iranDay = (now: number, days = 0) => new Date(now + 3.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

export type WarmSearch = { from: string; to: string; date: string };

/** Every route-day to search, the soonest day first (so a run cut short still covers today). */
export function warmSearches(now: number, days = WARM_DAYS): WarmSearch[] {
  const pairs: [string, string][] = [
    ...WARM_FROM_TEHRAN.flatMap((c): [string, string][] => [["tehran", c], [c, "tehran"]]),
    ...WARM_OTHER.flatMap(([a, b]): [string, string][] => [[a, b], [b, a]]),
  ].filter(([a, b]) => cityByKey(a) && cityByKey(b));
  const out: WarmSearch[] = [];
  for (let d = 0; d < days; d++) for (const [from, to] of pairs) out.push({ from, to, date: iranDay(now, d) });
  return out;
}

/** Cities whose stays and bookable experiences are loaded ahead (the planner's popular list). */
export const warmCities = () => POPULAR.filter((c) => !!cityByKey(c));
