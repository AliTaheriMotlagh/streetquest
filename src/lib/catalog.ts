// Collectible items. `phase` restricts where/when an item can spawn.
// Names and blurbs are English keys, translated where they're shown: t(item.name).
import type { DayPhase } from "./geo";
import { msg } from "./i18n";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export type ItemDef = {
  key: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  value: number; // coin value when sold
  phases?: DayPhase[]; // undefined = any time
  blurb: string;
  food?: number; // hunger restored when eaten
  /** Only from real places (a café's coffee, a pharmacy's medkit) — never a random spawn. */
  placeOnly?: boolean;
};

export const ITEMS: ItemDef[] = [
  { key: "cash", name: msg("Cash Stack"), emoji: "💵", rarity: "common", value: 10, blurb: msg("Crumpled bills. Spend them well.") },
  { key: "donut", name: msg("Glazed Donut"), emoji: "🍩", rarity: "common", value: 5, blurb: msg("Fuel for long runs."), food: 20 },
  { key: "burger", name: msg("Street Burger"), emoji: "🍔", rarity: "common", value: 8, blurb: msg("Greasy. Glorious. Fills you up."), food: 35 },
  { key: "ration", name: msg("Field Ration"), emoji: "🥫", rarity: "rare", value: 15, blurb: msg("Military issue. Keeps forever."), food: 50 },
  { key: "spraycan", name: msg("Spray Can"), emoji: "🎨", rarity: "common", value: 8, blurb: msg("Tag the city.") },
  { key: "keycard", name: msg("Keycard"), emoji: "💳", rarity: "rare", value: 30, blurb: msg("Opens doors you shouldn't.") },
  { key: "compass", name: msg("Old Compass"), emoji: "🧭", rarity: "rare", value: 35, blurb: msg("Always points to trouble.") },
  { key: "skateboard", name: msg("Skateboard"), emoji: "🛹", rarity: "rare", value: 40, phases: ["day", "dawn"], blurb: msg("Daylight cruiser.") },
  { key: "sunstone", name: msg("Sun Stone"), emoji: "☀️", rarity: "epic", value: 90, phases: ["day"], blurb: msg("Only drops at high noon-ish.") },
  { key: "moonshard", name: msg("Moon Shard"), emoji: "🌙", rarity: "epic", value: 100, phases: ["night"], blurb: msg("Glows after dark. Night owls only.") },
  { key: "goldwatch", name: msg("Gold Watch"), emoji: "⌚", rarity: "epic", value: 120, phases: ["dusk", "dawn"], blurb: msg("Golden-hour exclusive.") },
  { key: "diamond", name: msg("Diamond"), emoji: "💎", rarity: "legendary", value: 400, blurb: msg("The big score.") },
  { key: "crown", name: msg("Street Crown"), emoji: "👑", rarity: "legendary", value: 600, phases: ["night"], blurb: msg("Kingpin material.") },
  // From real places: what the burger joint, café or pharmacy around the corner hands you.
  { key: "pizza", name: msg("Pizza Slice"), emoji: "🍕", rarity: "common", value: 9, blurb: msg("From a real pizzeria on your street."), food: 40, placeOnly: true },
  { key: "coffee", name: msg("Fresh Coffee"), emoji: "☕", rarity: "common", value: 6, blurb: msg("Brewed at a real café. Wakes your commander up."), food: 10, placeOnly: true },
  { key: "cake", name: msg("Slice of Cake"), emoji: "🍰", rarity: "common", value: 8, blurb: msg("Straight from the bakery window."), food: 25, placeOnly: true },
  { key: "icecream", name: msg("Ice Cream"), emoji: "🍦", rarity: "common", value: 6, blurb: msg("Eat it before it melts."), food: 15, placeOnly: true },
  { key: "stew", name: msg("Hot Meal"), emoji: "🍲", rarity: "common", value: 10, blurb: msg("A proper dinner from a real restaurant."), food: 50, placeOnly: true },
  { key: "groceries", name: msg("Grocery Bag"), emoji: "🛒", rarity: "common", value: 12, blurb: msg("Bread, fruit and milk from the corner shop."), food: 45, placeOnly: true },
  { key: "medkit", name: msg("Medicine"), emoji: "🩹", rarity: "rare", value: 20, blurb: msg("From the pharmacy. Patches your commander up."), placeOnly: true },
];

export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((i) => [i.key, i])) as Record<string, ItemDef>;

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, rare: 22, epic: 7, legendary: 1 };
export const RARITY_LABEL: Record<Rarity, string> = { common: msg("Common"), rare: msg("Rare"), epic: msg("Epic"), legendary: msg("Legendary") };
export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9ca3af",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24",
};
