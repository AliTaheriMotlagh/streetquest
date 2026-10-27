// Real places (pure — client and server): what kind of place an OpenStreetMap feature
// is, and the missions the city hands out there. A burger delivery starts at a real
// burger joint and ends at another real address; a coffee run starts at a real café.
//
// Missions are deterministic per place and 30-minute window (like spawns), so everyone
// sees the same jobs, nothing is stored, and the server rebuilds a mission from its id
// to check a claim: "p:<bucket>:<cell>:<placeId>".
import { distanceM, hashStr, rng, type LatLng } from "./geo";
import { msg } from "./i18n";
import { S } from "./settings";
import { tomanFor } from "./money";

export type PlaceCat =
  | "burger" | "pizza" | "restaurant" | "cafe" | "bakery" | "icecream" | "bar"
  | "grocery" | "pharmacy" | "fuel" | "gym" | "park" | "fashion" | "tech" | "books" | "cinema" | "bank" | "shop";

/** A named real place, from OpenStreetMap or a business that registered in the game. */
export type Place = { id: string; name: string; cat: PlaceCat; lat: number; lng: number; brand?: string };

export const PLACE_CATS: Record<PlaceCat, { emoji: string; label: string; color: string }> = {
  burger: { emoji: "🍔", label: msg("Burgers & fast food"), color: "#ff9f1c" },
  pizza: { emoji: "🍕", label: msg("Pizza"), color: "#ff6b3d" },
  restaurant: { emoji: "🍲", label: msg("Restaurant"), color: "#ff7a59" },
  cafe: { emoji: "☕", label: msg("Café"), color: "#c08457" },
  bakery: { emoji: "🍰", label: msg("Bakery & sweets"), color: "#ff8fab" },
  icecream: { emoji: "🍦", label: msg("Ice cream"), color: "#7dd3fc" },
  bar: { emoji: "🥤", label: msg("Bar & juice"), color: "#a78bfa" },
  grocery: { emoji: "🛒", label: msg("Grocery"), color: "#4ade80" },
  pharmacy: { emoji: "🩹", label: msg("Pharmacy"), color: "#34d399" },
  fuel: { emoji: "⛽", label: msg("Fuel station"), color: "#fbbf24" },
  gym: { emoji: "💪", label: msg("Gym & sports"), color: "#f87171" },
  park: { emoji: "🌳", label: msg("Park"), color: "#22c55e" },
  fashion: { emoji: "👕", label: msg("Clothes & shoes"), color: "#f472b6" },
  tech: { emoji: "📱", label: msg("Phones & electronics"), color: "#60a5fa" },
  books: { emoji: "📚", label: msg("Books & library"), color: "#a3a3ff" },
  cinema: { emoji: "🎬", label: msg("Cinema"), color: "#e879f9" },
  bank: { emoji: "🏦", label: msg("Bank"), color: "#facc15" },
  shop: { emoji: "🏪", label: msg("Shop"), color: "#63b3f2" },
};
export const PLACE_CAT_KEYS = Object.keys(PLACE_CATS) as [PlaceCat, ...PlaceCat[]];
export const isPlaceCat = (v: unknown): v is PlaceCat => typeof v === "string" && v in PLACE_CATS;

/** OpenStreetMap tags → our category (null: not a place we use). */
export function catOfTags(tags: Record<string, string | undefined>): PlaceCat | null {
  const a = tags.amenity, sh = tags.shop, le = tags.leisure, cu = (tags.cuisine ?? "").toLowerCase();
  if (a === "fast_food" || a === "restaurant") {
    if (/pizza/.test(cu)) return "pizza";
    if (/burger/.test(cu)) return "burger";
    if (/ice_cream|frozen_yogurt/.test(cu)) return "icecream";
    if (/donut|bakery|cake|pastry|dessert|crepe|waffle/.test(cu)) return "bakery";
    if (/coffee|tea|bubble_tea|juice/.test(cu)) return "cafe";
    // Fast food with no cuisine is usually burgers; anything else (chicken, kebab, sandwiches…) is a meal to go.
    return a === "fast_food" && !cu ? "burger" : "restaurant";
  }
  if (a === "cafe") return "cafe";
  if (a === "ice_cream" || sh === "ice_cream") return "icecream";
  if (a === "bar" || a === "pub" || a === "biergarten" || sh === "beverages") return "bar";
  if (a === "pharmacy" || sh === "chemist" || sh === "medical_supply") return "pharmacy";
  if (a === "fuel") return "fuel";
  if (a === "bank") return "bank";
  if (a === "cinema" || a === "theatre") return "cinema";
  if (a === "library" || sh === "books" || sh === "stationery") return "books";
  if (le === "fitness_centre" || le === "sports_centre" || sh === "sports") return "gym";
  if (le === "park" || le === "garden") return "park";
  if (sh === "bakery" || sh === "pastry" || sh === "confectionery" || sh === "chocolate") return "bakery";
  if (sh === "supermarket" || sh === "convenience" || sh === "greengrocer" || sh === "butcher" || sh === "deli" || sh === "general") return "grocery";
  if (sh === "clothes" || sh === "shoes" || sh === "fashion" || sh === "boutique" || sh === "jewelry" || sh === "bag") return "fashion";
  if (sh === "electronics" || sh === "mobile_phone" || sh === "computer") return "tech";
  if (sh) return "shop";
  return null;
}

// ---------------------------------------------------------------- missions at real places
export const PLACE_BUCKET_MS = 30 * 60 * 1000;
export const placeBucket = (now = Date.now()) => Math.floor(now / PLACE_BUCKET_MS);

/** deliver: pick up here, drop off at `dest` against the clock. visit: check in here. */
export type PlaceMissionKind = "deliver" | "visit";

export type PlaceMission = {
  id: string;
  kind: PlaceMissionKind;
  place: Place;
  dest: (LatLng & { name: string }) | null;
  title: string; // translatable template, with {place} / {dest}
  brief: string;
  emoji: string;
  item: string | null; // catalog item handed over on completion
  distanceM: number;
  timeLimitS: number;
  rewardXp: number;
  rewardCoins: number;
  expiresAt: number;
};

type Template = { kind: PlaceMissionKind; title: string; brief: string; item?: string };

// Written like the jobs a real courier, neighbour or regular would get.
const TEMPLATES: Record<PlaceCat, Template[]> = {
  burger: [
    { kind: "deliver", title: msg("Burger delivery"), brief: msg("An order is ready at {place}. Bring it to {dest} while it's still hot."), item: "burger" },
    { kind: "deliver", title: msg("Late-night cravings"), brief: msg("Someone at {dest} ordered from {place}. Pick it up and don't eat the fries."), item: "burger" },
  ],
  pizza: [{ kind: "deliver", title: msg("Pizza run"), brief: msg("Two large pizzas are waiting at {place}. Deliver them to {dest} — 30 minutes or it's free."), item: "pizza" }],
  restaurant: [
    { kind: "deliver", title: msg("Takeaway order"), brief: msg("{place} needs a driver: take a dinner order to {dest}."), item: "stew" },
    { kind: "visit", title: msg("Table for one"), brief: msg("Eat at {place} and leave a review for the city.") },
  ],
  cafe: [
    { kind: "deliver", title: msg("Coffee run"), brief: msg("Grab the crew's coffees at {place} and bring them to {dest} before they go cold."), item: "coffee" },
    { kind: "visit", title: msg("Morning espresso"), brief: msg("Start the day right — check in at {place}."), item: "coffee" },
  ],
  bakery: [{ kind: "deliver", title: msg("Birthday cake"), brief: msg("Collect the birthday cake from {place} and get it to {dest} in one piece."), item: "cake" }],
  icecream: [{ kind: "deliver", title: msg("Melting fast"), brief: msg("Ice cream from {place} for the kids at {dest}. Hurry, it's melting!"), item: "icecream" }],
  bar: [{ kind: "visit", title: msg("Meet the regulars"), brief: msg("The crew hangs out at {place}. Swing by and say hi.") }],
  grocery: [
    { kind: "deliver", title: msg("Grocery haul"), brief: msg("A neighbour at {dest} can't get out today. Pick up their groceries at {place}."), item: "groceries" },
    { kind: "visit", title: msg("Fresh supplies"), brief: msg("Stock up at {place} for the week.") },
  ],
  pharmacy: [{ kind: "deliver", title: msg("Urgent medicine"), brief: msg("A prescription is ready at {place}. Rush it to {dest} — someone is waiting."), item: "medkit" }],
  fuel: [{ kind: "visit", title: msg("Fill the tank"), brief: msg("Pull into {place} and refuel before the next job.") }],
  gym: [{ kind: "visit", title: msg("Leg day"), brief: msg("Check in at {place} and get a workout in.") }],
  park: [
    { kind: "visit", title: msg("Picnic in the park"), brief: msg("The sun's out. Meet friends at {place}.") },
    { kind: "visit", title: msg("Fresh air"), brief: msg("Take a lap around {place} and clear your head.") },
  ],
  fashion: [{ kind: "deliver", title: msg("Fashion courier"), brief: msg("A customer at {dest} ordered from {place}. Deliver the parcel without creasing it.") }],
  tech: [{ kind: "deliver", title: msg("Repair pickup"), brief: msg("A fixed phone is ready at {place}. Its owner is waiting at {dest}.") }],
  books: [{ kind: "visit", title: msg("Return the books"), brief: msg("Drop overdue books back at {place} before the fine doubles.") }],
  cinema: [{ kind: "visit", title: msg("Movie night"), brief: msg("Your friends saved you a seat at {place}. Don't be late.") }],
  bank: [{ kind: "deliver", title: msg("Cash in transit"), brief: msg("Move a sealed cash bag from {place} to {dest}. Stay alert."), item: "cash" }],
  shop: [{ kind: "deliver", title: msg("Parcel pickup"), brief: msg("A parcel is waiting at {place}. Take it to {dest}.") }],
};

const pick = <T,>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];

/** A store with no believable drop-off nearby still has something to do: drop in. */
const VISIT: Template = { kind: "visit", title: msg("Drop in"), brief: msg("Check in at {place} and see what's new.") };

/** Toman a store mission pays this player. */
export const placeToman = (kind: PlaceMissionKind, home: boolean) => tomanFor(kind === "deliver" ? S.placeDeliverToman : S.placeVisitToman, home);

/** The default drop-off when no real place is close enough: a customer's door nearby. */
export const CUSTOMER_DOOR = msg("a customer's door");

/**
 * Missions for the given places in one window. `places` are the cell's places;
 * destinations come from `pool` (the cell and its neighbours) so they're real too.
 */
export function placeMissions(cell: string, places: Place[], pool: Place[], bucket = placeBucket()): PlaceMission[] {
  const out: PlaceMission[] = [];
  const expiresAt = (bucket + 1) * PLACE_BUCKET_MS;
  const share = Math.max(0, Math.min(1, S.placeMissionShare));
  for (const p of places) {
    const rand = rng(hashStr(`${bucket}|${p.id}`));
    if (rand() > share) continue;
    let tpl = pick(TEMPLATES[p.cat] ?? TEMPLATES.shop, rand());
    let dest: PlaceMission["dest"] = null;
    let d = 0;
    if (tpl.kind === "deliver") {
      // A real place 150–900 m away (not the same kind of shop), picked by the seed.
      const options = pool.filter((q) => q.id !== p.id && q.cat !== p.cat).map((q) => ({ q, d: distanceM(p, q) })).filter((x) => x.d >= 150 && x.d <= 900);
      if (options.length) {
        options.sort((a, b) => (a.q.id < b.q.id ? -1 : 1));
        const o = pick(options, rand());
        dest = { lat: o.q.lat, lng: o.q.lng, name: o.q.name };
        d = o.d;
      } else tpl = VISIT; // no believable drop-off: a check-in instead
    }
    const cfg = PLACE_CATS[p.cat];
    const rewardXp = Math.round(tpl.kind === "deliver" ? 40 + d * 0.35 : 45);
    const rewardCoins = 0; // store missions pay toman (placeToman)
    out.push({
      id: `p:${bucket}:${cell}:${p.id}`,
      kind: tpl.kind,
      place: p,
      dest,
      title: tpl.title,
      brief: tpl.brief,
      emoji: cfg.emoji,
      item: tpl.item ?? null,
      distanceM: Math.round(d),
      // Walking pace with slack; drivers make it easily, which is the point of a car.
      timeLimitS: tpl.kind === "deliver" ? Math.round((d / 1.4) * 1.6 + 120) : 0,
      rewardXp,
      rewardCoins,
      expiresAt,
    });
  }
  return out;
}

export const parsePlaceMissionId = (id: string) => {
  const m = /^p:(\d+):(-?\d+_-?\d+):([\w:-]{1,40})$/.exec(id);
  return m ? { bucket: Number(m[1]), cell: m[2], placeId: m[3] } : null;
};

// ---------------------------------------------------------------- food where food is sold
/** Items that only make sense at a matching real place, and which place sells them. */
export const FOOD_AT: Record<string, PlaceCat[]> = {
  burger: ["burger", "restaurant"],
  donut: ["bakery", "cafe"],
  pizza: ["pizza"],
  coffee: ["cafe"],
  cake: ["bakery"],
  icecream: ["icecream"],
  stew: ["restaurant"],
  groceries: ["grocery"],
  medkit: ["pharmacy"],
};
/** The item a food spawn becomes at a given kind of place. */
const ITEM_AT: Partial<Record<PlaceCat, string>> = { burger: "burger", restaurant: "stew", pizza: "pizza", cafe: "coffee", bakery: "cake", icecream: "icecream", grocery: "groceries", pharmacy: "medkit" };

type FoodSpawn = { id: string; kind: string; lat: number; lng: number; cell: string; item?: { key: string } };

/**
 * Put food where food is sold: a 🍔 on the map sits on a real burger joint, a ☕ on a
 * real café. Spawns of food items in a cell with real place data move onto a fitting
 * place; if the cell has none, the food becomes cash instead. Cells without data yet
 * keep their spawns as they are. Pure and deterministic, so /api/claim agrees.
 */
export function realizeSpawns<T extends FoodSpawn>(spawns: T[], placesByCell: Map<string, Place[]>, swap: (s: T, itemKey: string) => T): (T & { place?: Pick<Place, "id" | "name" | "cat"> })[] {
  const used = new Set<string>();
  return spawns.map((s) => {
    if (s.kind !== "item" || !s.item || !FOOD_AT[s.item.key]) return s;
    const places = placesByCell.get(s.cell);
    if (!places) return s;
    const food = places.filter((p) => ITEM_AT[p.cat] && !used.has(p.id));
    if (!food.length) return swap(s, "cash");
    const p = food[hashStr(s.id) % food.length];
    used.add(p.id);
    return { ...swap(s, ITEM_AT[p.cat]!), lat: p.lat, lng: p.lng, place: { id: p.id, name: p.name, cat: p.cat } };
  });
}
