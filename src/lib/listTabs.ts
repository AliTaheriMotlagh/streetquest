// The List view's sections (list/ListView.tsx; pure, tests/listTabs.test.ts): stores round you,
// products and prices, the trip planner, hotels and stays. The open one stays on the device, and a
// link can open one: /play?view=list&tab=hotels.
import { msg } from "./i18n";

export type ListTab = "stores" | "products" | "travel" | "hotels";
export const LIST_TABS: { key: ListTab; emoji: string; label: string }[] = [
  { key: "stores", emoji: "🏪", label: msg("Stores") },
  { key: "products", emoji: "🏷️", label: msg("Products & prices") },
  { key: "travel", emoji: "🧳", label: msg("Trips") },
  { key: "hotels", emoji: "🏨", label: msg("Hotels & stays") },
];
export const LIST_TAB_KEY = "sq_list_tab";
export const parseListTab = (v: string | null | undefined): ListTab => (LIST_TABS.some((x) => x.key === v) ? (v as ListTab) : "stores");
