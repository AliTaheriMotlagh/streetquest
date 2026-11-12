// One tap in the map filter for what you're out for: food, shopping, health, services, fun, just the
// game, or everything. A preset turns the right layers on and narrows the store types and kinds of
// place to that topic. The game's own markers (money, jobs, players) stay on in every preset but
// "Nothing": it's a game first. Pure.
import { msg } from "./i18n";
import { STORE_TYPE_KEYS, type StoreType } from "./stores/directory";
import type { PlaceCat } from "./places";

export type PresetId = "all" | "food" | "shopping" | "health" | "services" | "fun" | "game";
export const PRESETS: { id: PresetId; emoji: string; label: string }[] = [
  { id: "all", emoji: "✨", label: msg("Everything") },
  { id: "food", emoji: "🍽️", label: msg("Food & drink") },
  { id: "shopping", emoji: "🛍️", label: msg("Shopping") },
  { id: "health", emoji: "🩺", label: msg("Health") },
  { id: "services", emoji: "🛠️", label: msg("Services") },
  { id: "fun", emoji: "🎬", label: msg("Going out") },
  { id: "game", emoji: "🎮", label: msg("Just the game") },
];

const GAME = ["money", "jobs", "players", "biz"];
const VENDORS = ["food", "cafe", "sweets", "market"];
const SITES = ["dir-bilbooard", "dir-irangaah", "dir-okala", "dir-netbarg"];
const ALL_KINDS: PlaceCat[] = ["burger", "pizza", "restaurant", "cafe", "bakery", "icecream", "bar", "grocery", "pharmacy", "fuel", "gym", "park", "fashion", "tech", "books", "cinema", "bank", "shop"];

type Topic = { layers: string[]; types: StoreType[]; kinds: PlaceCat[] };
const TOPICS: Record<Exclude<PresetId, "all" | "game">, Topic> = {
  food: { layers: [...VENDORS, "places", "deals", ...SITES], types: ["food", "cafe", "sweets", "bakery", "grocery", "fruit", "butcher"], kinds: ["burger", "pizza", "restaurant", "cafe", "bakery", "icecream", "bar", "grocery"] },
  shopping: { layers: ["market", "places", "torob", "deals", "divar", "dir-sheypoor", ...SITES], types: ["grocery", "clothing", "digital", "home", "gifts", "building", "beauty", "other"], kinds: ["grocery", "fashion", "tech", "books", "shop"] },
  health: { layers: ["places", ...SITES], types: ["doctor", "health", "pharmacy"], kinds: ["pharmacy"] },
  services: { layers: ["places", ...SITES], types: ["services", "auto", "realestate", "finance", "education", "building", "pets"], kinds: ["fuel", "bank"] },
  fun: { layers: ["places", "cinema", "deals", ...SITES], types: ["sport", "hotel", "cafe", "food"], kinds: ["cinema", "gym", "park", "cafe", "bar"] },
};

/** What a preset shows: the layers on (only ones the map has), and the store types / kinds of place hidden. */
export function applyPreset(id: PresetId, allLayers: readonly string[]): { layers: string[]; hiddenTypes: StoreType[]; hiddenKinds: string[] } {
  if (id === "all") return { layers: [...allLayers], hiddenTypes: [], hiddenKinds: [] };
  if (id === "game") return { layers: allLayers.filter((k) => GAME.includes(k)), hiddenTypes: [], hiddenKinds: [] };
  const t = TOPICS[id];
  return {
    layers: allLayers.filter((k) => GAME.includes(k) || t.layers.includes(k)),
    hiddenTypes: STORE_TYPE_KEYS.filter((k) => !t.types.includes(k)),
    hiddenKinds: ALL_KINDS.filter((k) => !t.kinds.includes(k)),
  };
}
/** The preset the current choice is exactly (to light its chip), or null. */
export function currentPreset(layers: readonly string[], hiddenTypes: readonly string[], hiddenKinds: readonly string[], allLayers: readonly string[]): PresetId | null {
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (const p of PRESETS) {
    const want = applyPreset(p.id, allLayers);
    if (same(want.layers, layers) && same(want.hiddenTypes, hiddenTypes) && same(want.hiddenKinds, hiddenKinds)) return p.id;
  }
  return null;
}
