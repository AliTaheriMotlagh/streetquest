// Getting ready for a trip (pure; tests/travelGuide.test.ts): a "before you go" checklist built from the plan —
// papers, money, what to pack, what to book and what to know there. Every trip gets the basics; the rest comes
// from what the plan holds: a flight or a ticket, your own car, a seaside stop, the hot months in the south,
// diving, and what's special about the destination (Kish: a free zone with its own beaches and shopping).
// What's ticked off is kept in the plan (Plan.prep, the items' ids), so it survives a reload.
import { msg } from "../i18n";
import { cityByKey } from "./index";
import { MOODS } from "./activities";
import { legsOf, stopDays, type LegPick, type Plan } from "./plan";

export type PrepGroup = "papers" | "money" | "pack" | "before" | "there";
export const PREP_GROUPS: Record<PrepGroup, { emoji: string; label: string }> = {
  papers: { emoji: "🪪", label: msg("Papers") },
  money: { emoji: "💳", label: msg("Money") },
  pack: { emoji: "🎒", label: msg("To pack") },
  before: { emoji: "📅", label: msg("Before you leave") },
  there: { emoji: "📍", label: msg("When you're there") },
};
export const PREP_GROUP_KEYS = Object.keys(PREP_GROUPS) as [PrepGroup, ...PrepGroup[]];

export type PrepItem = { id: string; group: PrepGroup; emoji: string; text: string };

const I = (id: string, group: PrepGroup, emoji: string, text: string): PrepItem => ({ id, group, emoji, text });

const BASICS: PrepItem[] = [
  I("id-card", "papers", "🪪", msg("National ID card (or passport)")),
  I("cards", "money", "💳", msg("A bank card and a little cash")),
  I("charger", "pack", "🔌", msg("Phone charger and a power bank")),
  I("meds", "pack", "💊", msg("Your medicines and a small first-aid kit")),
  I("weather", "before", "🌤️", msg("Check the weather the day before")),
  I("tell", "before", "📲", msg("Share your plan with someone at home")),
];
const TICKET: PrepItem[] = [I("tickets-offline", "papers", "🎫", msg("Tickets and bookings saved on the phone (offline)"))];
const FLIGHT: PrepItem[] = [
  I("airport-early", "before", "🛫", msg("Be at the airport 2 hours before take-off")),
  I("baggage", "pack", "🧳", msg("Check your baggage allowance (often 20 kg on domestic flights)")),
];
const CAR: PrepItem[] = [
  I("car-check", "before", "🔧", msg("Car check: tyres, oil, coolant, spare wheel")),
  I("car-papers", "papers", "🚗", msg("Driving licence, car card and insurance")),
  I("fuel-card", "money", "⛽", msg("Fuel card")),
];
const SEA: PrepItem[] = [
  I("swim", "pack", "🩱", msg("Swimsuit and a quick-dry towel")),
  I("sun", "pack", "🧴", msg("Sunscreen, hat and sunglasses")),
  I("sandals", "pack", "🩴", msg("Sandals or water shoes")),
];
const HEAT: PrepItem[] = [I("heat", "there", "🥵", msg("Very hot and humid: light clothes, lots of water, no midday sun"))];
const DIVE: PrepItem[] = [I("no-fly-dive", "there", "🤿", msg("Don't fly within 24 hours of diving — dive early in the trip"))];
const STAY: PrepItem[] = [I("check-in", "before", "🏨", msg("Note each stay's check-in time and address"))];

/** What's special about a destination. */
const PLACE: Record<string, PrepItem[]> = {
  kish: [
    I("kish-visa", "papers", "🛂", msg("From abroad: Kish is a free zone — most passports need no visa (check the current rules)")),
    I("kish-beaches", "there", "🏖️", msg("Beaches are separate for men and women — check before you swim")),
    I("kish-shopping", "money", "🛍️", msg("Duty-free shopping: check how much you may take back to the mainland")),
    I("kish-around", "there", "🚲", msg("Get around by taxi, a rented car or a bike — a coastal path circles the island")),
    I("kish-book-fun", "before", "🎟️", msg("Book diving, parasailing and the snow park a day ahead in the busy season")),
  ],
};
/** Driving to an island: the car crosses by ferry. */
const ISLAND_CAR: Record<string, PrepItem[]> = {
  kish: [I("kish-car-ferry", "before", "⛴️", msg("Your car crosses to Kish by ferry: book the car ferry and bring the car's papers"))],
};

const SEA_CITIES = new Set(MOODS.sea.cities);
/** Reached by air (or a ferry): no road. */
const ISLANDS = new Set(["kish", "qeshm"]);
/** The south's hot, humid months (May–October). */
const HOT_MONTHS = new Set([5, 6, 7, 8, 9, 10]);
const SOUTH_LAT = 30.5;

/**
 * The checklist for a plan, basics first, then by what the trip holds — each item once, in PREP_GROUP_KEYS order.
 * `legPicks` (by leg index) says how each leg goes; a leg not chosen yet to an island counts as a flight.
 */
export function prepFor(p: Plan, legPicks: Record<number, LegPick | undefined> = {}): PrepItem[] {
  const out: PrepItem[] = [...BASICS];
  const legs = legsOf(p);
  const ways = legs.map((l) => legPicks[l.i]?.way ?? (ISLANDS.has(l.to) ? "flight" : null));
  if (ways.some((w) => w && w !== "car")) out.push(...TICKET);
  if (ways.includes("flight")) out.push(...FLIGHT);
  if (ways.includes("car")) out.push(...CAR);
  legs.forEach((l, i) => ways[i] === "car" && out.push(...(ISLAND_CAR[l.to] ?? [])));
  if (p.stops.some((s) => s.nights > 0)) out.push(...STAY);
  if (p.stops.some((s) => SEA_CITIES.has(s.city))) out.push(...SEA);
  const days = stopDays(p);
  const hot = p.stops.some((s, i) => {
    const c = cityByKey(s.city);
    return c?.lat != null && c.lat < SOUTH_LAT && HOT_MONTHS.has(Number(days[i]?.arrive.slice(5, 7)));
  });
  if (hot) out.push(...HEAT);
  if ((p.acts ?? []).some((a) => a.id.endsWith(":dive"))) out.push(...DIVE);
  for (const s of p.stops) out.push(...(PLACE[s.city] ?? []));
  const seen = new Set<string>();
  const once = out.filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  return PREP_GROUP_KEYS.flatMap((g) => once.filter((x) => x.group === g));
}

/** How many of the list are ticked off. */
export const prepDone = (items: PrepItem[], done: readonly string[] = []) => items.filter((x) => done.includes(x.id)).length;
