// A shop's products as a list (pure; tests/listEngine.test.ts): what Market's shop page searches, sorts and
// filters, declared for the shared list engine (lib/listEngine.ts).
import { msg } from "./i18n";
import type { ListSpec } from "./listEngine";

/** The fields of a product the list needs (server/shops.ts productView has them all). */
export type ListedProduct = { title: string; description?: string | null; priceNow: number; deal: number; stock: number; sold: number; kind?: string };

export type ProductSort = "new" | "cheap" | "dear" | "deal" | "popular";
export type ProductChip = "sale" | "inStock";

export const PRODUCT_SORTS: Record<ProductSort, string> = {
  new: msg("Newest"),
  cheap: msg("Cheapest"),
  dear: msg("Most expensive"),
  deal: msg("Biggest discount"),
  popular: msg("Best selling"),
};
export const PRODUCT_SORT_KEYS = Object.keys(PRODUCT_SORTS) as [ProductSort, ...ProductSort[]];
export const PRODUCT_CHIPS: Record<ProductChip, { label: string; emoji: string }> = {
  sale: { label: msg("On sale"), emoji: "🔥" },
  inStock: { label: msg("In stock"), emoji: "✅" },
};
export const PRODUCT_CHIP_KEYS = Object.keys(PRODUCT_CHIPS) as ProductChip[];
/** A shop shows its search box from this many products. */
export const SEARCH_FROM = 6;

/** The shop's products, newest first as they come from the server; sold out last whatever the sort. */
export const PRODUCT_LIST: ListSpec<ListedProduct, ProductSort, ProductChip> = {
  text: (p) => `${p.title} ${p.description ?? ""} ${p.kind ?? ""}`,
  sorts: {
    new: () => 0,
    cheap: (a, b) => a.priceNow - b.priceNow,
    dear: (a, b) => b.priceNow - a.priceNow,
    deal: (a, b) => b.deal - a.deal,
    popular: (a, b) => b.sold - a.sold,
  },
  filters: { sale: (p) => p.deal > 0, inStock: (p) => p.stock > 0 },
  price: (p) => p.priceNow,
  lead: (a, b) => Number(b.stock > 0) - Number(a.stock > 0),
};
