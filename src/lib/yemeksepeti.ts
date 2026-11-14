// Yemeksepeti (Delivery Hero's Turkish food delivery — Istanbul's Snappfood) as the store card
// knows it (pure; tests/yemeksepeti.test.ts). Its vendors join the Snappfood ones in the same
// shapes (lib/localData.ts Vendor / Menu / Review) under a "ys-" code, so the map layer, the
// matching of a map place to its delivery page, the menu tab and the reviews tab work the same
// in Istanbul as in Tehran. Fetching and caching: server/localData.ts.
//
// Its full menu is behind a bot challenge we don't try to pass; what it does publish is every
// review with what that customer ordered (name, description, photo, price in lira). The menu
// tab is those dishes — the ones people actually order, most-ordered first, at their latest
// price — and links to Yemeksepeti for the rest.
import { msg } from "./i18n";
import type { Menu, MenuSection, Review, Vendor, VendorKind } from "./localData";

export const YS_PREFIX = "ys-";
/** Our code for a Yemeksepeti vendor ("ys-x3nw"), and back. */
export const ysCode = (raw: string) => `${YS_PREFIX}${raw.toLowerCase()}`;
export const isYsCode = (code: string) => code.startsWith(YS_PREFIX);
export const ysRaw = (code: string) => code.slice(YS_PREFIX.length);
/** What the API routes accept as a vendor code: Snappfood's six characters, or ys-<Yemeksepeti's>. */
export const VENDOR_CODE = /^(?:[0-9a-z]{6}|ys-[0-9a-z]{3,8})$/;
export const ysUrl = (raw: string) => `https://www.yemeksepeti.com/restaurant/${encodeURIComponent(raw)}`;

export type RawYsVendor = {
  code?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  review_number?: number;
  logo?: string;
  hero_image?: string;
  hero_listing_image?: string;
  web_path?: string;
  redirection_url?: string;
  address?: string;
  customer_phone?: string;
  is_active?: boolean;
  minimum_order_amount?: number;
  minimum_delivery_fee?: number;
  cuisines?: { name?: string; main?: boolean }[];
  metadata?: { is_delivery_available?: boolean; is_temporary_closed?: boolean };
};

/** Coffee shops, patisseries and the rest by their cuisine words (Turkish, as Yemeksepeti writes them). */
export function ysKind(cuisines: string[]): VendorKind {
  const s = cuisines.join(" ").toLocaleLowerCase("tr");
  if (/kahve|coffee|kafe|cafe/.test(s)) return "cafe";
  if (/pasta|tatlı|tatli|dondurma|fırın|firin|börek|borek|baklava|kurabiye|unlu/.test(s)) return "sweets";
  if (/market|şarküteri|sarkuteri|manav|kuruyemiş/.test(s)) return "market";
  return "food";
}

/** A row of Yemeksepeti's vendor list (or its vendor page) → a vendor on the map; null without a name and a place. */
export function vendorOfYs(v: RawYsVendor | null | undefined): Vendor | null {
  if (!v?.code || !v.name || typeof v.latitude !== "number" || typeof v.longitude !== "number") return null;
  const cuisines = (v.cuisines ?? []).map((c) => c.name?.trim() ?? "").filter(Boolean);
  const web = v.web_path || v.redirection_url || "";
  return {
    code: ysCode(v.code),
    title: v.name.trim(),
    kind: ysKind(cuisines),
    lat: v.latitude,
    lng: v.longitude,
    rating: Math.round((v.rating ?? 0) * 10) / 10,
    logo: v.logo ?? "",
    url: /^https:\/\/(www\.)?yemeksepeti\.com\//.test(web) ? web : ysUrl(v.code),
    open: v.is_active !== false && v.metadata?.is_delivery_available !== false && !v.metadata?.is_temporary_closed,
    about: cuisines.slice(0, 4).join(", "),
  };
}

type RawProductVariation = { id?: string; defaultTitle?: string; unitPrice?: number; product?: { id?: string; defaultTitle?: string; description?: string; imageUrls?: string[] } };
export type RawYsReview = {
  uuid?: string;
  createdAt?: string;
  text?: string;
  reviewerName?: string;
  isAnonymous?: boolean;
  ratings?: { topic?: string; score?: number }[];
  replies?: { text?: string }[];
  productVariations?: RawProductVariation[];
};

/** Lira with kuruş (522.5), never a negative or a NaN. */
const lira = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0);
const dishName = (p: RawProductVariation) => (p.product?.defaultTitle || p.defaultTitle || "").trim();

/** Yemeksepeti's reviews → ours: the overall stars, the date (YYYY-MM-DD), what they ordered, the store's answer. */
export function reviewsOfYs(rows: RawYsReview[] | null | undefined): Review[] {
  return (rows ?? []).map((r, i) => {
    const overall = r.ratings?.find((x) => x.topic === "overall")?.score ?? r.ratings?.[0]?.score ?? 5;
    return {
      id: r.uuid ?? String(i),
      who: r.isAnonymous ? "" : (r.reviewerName ?? "").replace(/^\.+/, "").trim().slice(0, 40),
      date: (r.createdAt ?? "").slice(0, 10),
      rate: Math.max(1, Math.min(5, Math.round(overall))),
      text: (r.text ?? "").trim().slice(0, 600),
      foods: (r.productVariations ?? []).map(dishName).filter(Boolean).slice(0, 6),
      reply: (r.replies?.[0]?.text ?? "").trim().slice(0, 600),
    };
  });
}

/**
 * The dishes customers ordered, read off their reviews (newest first): each dish once, at the
 * newest price seen, with how many orders named it; the most-ordered first.
 */
export function dishesOfYs(rows: RawYsReview[] | null | undefined, max = 60): MenuSection[] {
  const seen = new Map<string, { item: MenuSection["items"][number]; n: number; first: number }>();
  let order = 0;
  for (const r of rows ?? []) for (const p of r.productVariations ?? []) {
    const title = dishName(p);
    if (!title) continue;
    const id = String(p.id ?? p.product?.id ?? title);
    const had = seen.get(id);
    if (had) { had.n++; continue; }
    const price = lira(p.unitPrice), img = p.product?.imageUrls?.[0] ?? "";
    seen.set(id, { item: { id, title, about: (p.product?.description ?? "").trim().slice(0, 300), price, priceNow: price, photo: img, image: img }, n: 1, first: order++ });
  }
  const items = [...seen.values()].sort((a, b) => b.n - a.n || a.first - b.first).slice(0, max).map((x) => x.item);
  return items.length ? [{ title: msg("Ordered on Yemeksepeti"), items }] : [];
}

/** A Yemeksepeti vendor and its customers' reviews → the card's menu (prices in lira). */
export function menuOfYs(v: RawYsVendor | null | undefined, reviews: RawYsReview[] | null | undefined, now = new Date()): Menu | null {
  const vendor = vendorOfYs(v);
  if (!vendor || !v) return null;
  return {
    vendor,
    cover: v.hero_image || v.hero_listing_image || "",
    address: (v.address ?? "").trim(),
    sections: dishesOfYs(reviews),
    fetchedAt: now.toISOString(),
    week: null,
    phone: (v.customer_phone ?? "").trim(),
    reviews: v.review_number ?? 0,
    ...(v.minimum_order_amount ? { minOrder: lira(v.minimum_order_amount) } : {}),
    ...(v.minimum_delivery_fee != null ? { deliveryFee: lira(v.minimum_delivery_fee) } : {}),
    source: "yemeksepeti",
    currency: "TRY",
  };
}

/** Getir Yemek (Istanbul's other delivery app) can't be read; a search for the store there is the next best thing. */
export const getirSearch = (name: string) => `https://www.google.com/search?q=${encodeURIComponent(`${name.replace(/\([^)]*\)/g, " ").trim()} getir yemek`)}`;
