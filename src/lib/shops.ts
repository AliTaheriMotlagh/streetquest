// Player shops: the rules both sides share (pure — safe on client and server).
// A shop is open for a paid period (S.shopDays) and can be renewed; products cost
// coins, optionally with a discount that may end at a set time. The buyer's coins
// are held until the seller hands the order over.
import { msg } from "./i18n";
import { S } from "./settings";

export const SHOP_CATEGORIES = [
  { key: "food", emoji: "🍔", label: msg("Food & drinks") },
  { key: "fashion", emoji: "👕", label: msg("Clothes & shoes") },
  { key: "tech", emoji: "📱", label: msg("Phones & gadgets") },
  { key: "home", emoji: "🛋️", label: msg("Home & kitchen") },
  { key: "beauty", emoji: "💄", label: msg("Beauty & care") },
  { key: "books", emoji: "📚", label: msg("Books & stationery") },
  { key: "handmade", emoji: "🧶", label: msg("Handmade & art") },
  { key: "kids", emoji: "🧸", label: msg("Kids & toys") },
  { key: "sports", emoji: "⚽", label: msg("Sports & outdoors") },
  { key: "services", emoji: "🛠️", label: msg("Services") },
  { key: "other", emoji: "🏪", label: msg("Everything else") },
] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number]["key"];
export const SHOP_CATEGORY_KEYS = SHOP_CATEGORIES.map((c) => c.key) as [ShopCategory, ...ShopCategory[]];
export const categoryOf = (key: string) => SHOP_CATEGORIES.find((c) => c.key === key) ?? SHOP_CATEGORIES[SHOP_CATEGORIES.length - 1];

/** Signs a seller can hang over the door. */
export const SHOP_EMOJIS = ["🏪", "🛍️", "🍔", "☕", "🍰", "🥙", "👕", "👟", "💍", "📱", "💻", "🎮", "📚", "🎨", "🧶", "💐", "🧸", "⚽", "🛠️", "🐾"];

export const SHOP_LIMITS = { name: 40, tagline: 80, about: 600, address: 120, title: 70, description: 1000, note: 200, qty: 20 } as const;
/** Most discount a product can carry, in percent. */
export const MAX_DISCOUNT = 90;
/** Renewals can't stack more than this far ahead (in periods). */
export const MAX_PREPAID_PERIODS = 3;
/** Owners hear their shop is about to close this long before. */
export const SHOP_WARN_MS = 3 * 86_400_000;

type Priced = { price: number; discountPct: number; discountUntil: Date | string | number | null };

/** Is the product's discount running at `now`? */
export const discountLive = (p: Priced, now = Date.now()) => p.discountPct > 0 && (p.discountUntil == null || new Date(p.discountUntil).getTime() > now);

/** What a buyer pays per item right now. Never less than 1 coin. */
export const priceNow = (p: Priced, now = Date.now()) => (discountLive(p, now) ? Math.max(1, Math.round((p.price * (100 - p.discountPct)) / 100)) : p.price);

/** The market's cut of a sale (the seller gets the rest). */
export const shopFee = (total: number) => Math.floor((total * S.shopFeePct) / 100);

/** Milliseconds in one opening period. */
export const shopPeriodMs = () => S.shopDays * 86_400_000;

/** Days left, rounded up (0 when closed). */
export const daysLeft = (expiresAt: Date | string | number, now = Date.now()) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000));
