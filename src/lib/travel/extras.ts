// The trip planner's extras (pure; tests/travelExtras.test.ts):
//  - cities near a stop worth adding (within a few hours' drive, the nearest first);
//  - your own steps (lib/travel/steps.ts) join the final list;
//  - the final list: every thing to reserve in date order (Jalali dates), with its price for everyone,
//    the site and the link to book it, and the total — to share or keep as a text file.
import { distanceM } from "../geo";
import { CITIES, cityByKey, jalaliIso, type City } from "./index";
import { billOf, driveOf, legsOf, roomsFor, stopDays, type LegPick, type Plan, type StayPick } from "./plan";

// ---------------------------------------------------------------- nearby cities
export type NearbyCity = { city: City; km: number; minutes: number };
/** Up to `n` cities within `maxKm` by road of `key`, nearest first, leaving out those already in the trip. */
export function nearbyCities(key: string, skip: Iterable<string> = [], n = 4, maxKm = 300): NearbyCity[] {
  const c = cityByKey(key);
  if (c?.lat == null || c.lng == null) return [];
  const out = new Set([key, ...skip]);
  return CITIES.filter((x) => x.lat != null && x.lng != null && !out.has(x.key))
    .map((x) => ({ x, crow: distanceM({ lat: c.lat!, lng: c.lng! }, { lat: x.lat!, lng: x.lng! }) }))
    .filter((y) => y.crow > 15_000)
    .sort((a, b) => a.crow - b.crow)
    .slice(0, n * 3)
    .map(({ x }) => ({ x, d: driveOf(c, x)! }))
    .filter(({ d }) => d.km <= maxKm)
    .slice(0, n)
    .map(({ x, d }) => ({ city: x, km: d.km, minutes: d.minutes }));
}

// ---------------------------------------------------------------- the final list
export type ToBook = {
  kind: "ticket" | "car" | "stay" | "act" | "step";
  /** The day it starts (yyyy-mm-dd) and the same day in the Jalali calendar ("1405/08/29"). */
  date: string;
  jalali: string;
  /** City keys: a leg's ends, or the city it's in. */
  from?: string;
  to?: string;
  city?: string;
  /** What it is (a company, a stay's name, a step's title). */
  title: string;
  /** For everyone, toman (0 = not priced). */
  price: number;
  site?: string;
  url?: string;
  /** Nights (a stay), people (an outing or step). */
  n?: number;
};

const jalaliSlash = (iso: string) => jalaliIso(iso).replace(/-/g, "/");

/**
 * Everything to reserve, in date order: each chosen ticket (its site and link) or the car's fuel, each chosen
 * stay for its nights and rooms, each outing and step. `open` counts legs and stops with nothing chosen.
 */
export function checklist(p: Plan, legPicks: Record<number, LegPick | undefined>, stayPicks: Record<number, StayPick | undefined>): { items: ToBook[]; total: number; open: number } {
  const items: ToBook[] = [];
  for (const l of legsOf(p)) {
    const pick = legPicks[l.i];
    if (!pick) continue;
    const base = { date: l.date, jalali: jalaliSlash(l.date), from: l.from, to: l.to };
    if (pick.way === "car") items.push({ kind: "car", ...base, title: "", price: driveOf(cityByKey(l.from), cityByKey(l.to), p.travellers, !!p.quota)?.fuel ?? 0 });
    else {
      const best = pick.trip.offers[0];
      items.push({ kind: "ticket", ...base, title: pick.trip.company, price: pick.trip.price * p.travellers, ...(best ? { site: best.source, url: best.url } : {}), n: p.travellers });
    }
  }
  const days = stopDays(p);
  p.stops.forEach((s, i) => {
    const pick = stayPicks[i];
    if (!pick || s.nights <= 0) return;
    const st = pick.stay;
    items.push({ kind: "stay", date: days[i].arrive, jalali: jalaliSlash(days[i].arrive), city: s.city, title: st.name, price: st.price * s.nights * roomsFor(st, p.travellers), site: st.source, url: st.url, n: s.nights });
  });
  const where = new Set(p.stops.map((s) => s.city));
  p.stops.forEach((s, i) => {
    for (const a of p.acts ?? []) if (a.city === s.city && where.has(a.city) && p.stops.findIndex((x) => x.city === a.city) === i) items.push({ kind: "act", date: days[i].arrive, jalali: jalaliSlash(days[i].arrive), city: a.city, title: a.title, price: a.price * a.people, n: a.people });
  });
  for (const s of p.steps ?? []) items.push({ kind: "step", date: s.date, jalali: jalaliSlash(s.date), ...(s.city ? { city: s.city } : {}), title: s.title, price: s.price * s.people, site: s.site, url: s.url, n: s.people });
  const order: Record<ToBook["kind"], number> = { ticket: 0, car: 0, stay: 1, act: 2, step: 3 };
  items.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
  const bill = billOf(p, legPicks, stayPicks);
  return { items, total: items.reduce((sum, x) => sum + x.price, 0), open: bill.open.legs + bill.open.stays };
}
