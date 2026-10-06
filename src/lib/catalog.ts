// Collectible items. `phase` restricts where/when an item can spawn.
import type { DayPhase } from "./geo";

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

};

export const ITEMS: ItemDef[] = [
  { key: "cash", name: "Cash Stack", emoji: "💵", rarity: "common", value: 10, blurb: "Crumpled bills. Spend them well." },
  { key: "donut", name: "Glazed Donut", emoji: "🍩", rarity: "common", value: 5, blurb: "Fuel for long runs.", food: 20 },
  { key: "burger", name: "Street Burger", emoji: "🍔", rarity: "common", value: 8, blurb: "Greasy. Glorious. Fills you up.", food: 35 },
  { key: "ration", name: "Field Ration", emoji: "🥫", rarity: "rare", value: 15, blurb: "Military issue. Keeps forever.", food: 50 },
  { key: "spraycan", name: "Spray Can", emoji: "🎨", rarity: "common", value: 8, blurb: "Tag the city." },
  { key: "keycard", name: "Keycard", emoji: "💳", rarity: "rare", value: 30, blurb: "Opens doors you shouldn't." },
  { key: "compass", name: "Old Compass", emoji: "🧭", rarity: "rare", value: 35, blurb: "Always points to trouble." },
  { key: "skateboard", name: "Skateboard", emoji: "🛹", rarity: "rare", value: 40, phases: ["day", "dawn"], blurb: "Daylight cruiser." },
  { key: "sunstone", name: "Sun Stone", emoji: "☀️", rarity: "epic", value: 90, phases: ["day"], blurb: "Only drops at high noon-ish." },
  { key: "moonshard", name: "Moon Shard", emoji: "🌙", rarity: "epic", value: 100, phases: ["night"], blurb: "Glows after dark. Night owls only." },
  { key: "goldwatch", name: "Gold Watch", emoji: "⌚", rarity: "epic", value: 120, phases: ["dusk", "dawn"], blurb: "Golden-hour exclusive." },
  { key: "diamond", name: "Diamond", emoji: "💎", rarity: "legendary", value: 400, blurb: "The big score." },
  { key: "crown", name: "Street Crown", emoji: "👑", rarity: "legendary", value: 600, phases: ["night"], blurb: "Kingpin material." },
];

export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((i) => [i.key, i])) as Record<string, ItemDef>;

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 70, rare: 22, epic: 7, legendary: 1 };
export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9ca3af",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24",
};
