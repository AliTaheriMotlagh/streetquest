// What other sites know about a real store (pure — client and server): its Snappfood menu
// or catalog, its Torob listings, its Divar ad. The fetching and caching is in
// server/localData.ts; this file has the shapes, the link parsing and the name matching.
import { msg } from "./i18n";
import type { PlaceCat } from "./places";

/** A Snappfood vendor on the map: restaurants, cafés, bakeries, supermarkets… */
export type Vendor = {
  code: string;
  title: string;
  kind: VendorKind;
  lat: number;
  lng: number;
  rating: number;
  logo: string;
  url: string;
  open: boolean;
  about: string;
};
export type MenuItem = { id: string; title: string; about: string; price: number; priceNow: number; photo: string };
export type MenuSection = { title: string; items: MenuItem[] };
export type Menu = { vendor: Vendor; cover: string; address: string; sections: MenuSection[]; fetchedAt: string };
export type TorobItem = { title: string; price: number; shop: string; photo: string; url: string };
export type StoreLink = { kind: "snappfood" | "torob" | "divar" | "website" | "phone"; url: string; label: string };
export type StoreData = { menu: Menu | null; torob: TorobItem[]; torobQuery: string; links: StoreLink[] };

/** Snappfood's vendor types, grouped the way the map filter shows them. */
export type VendorKind = "food" | "cafe" | "sweets" | "market";
export const VENDOR_KINDS: Record<VendorKind, { emoji: string; label: string; cat: PlaceCat }> = {
  food: { emoji: "🍽️", label: msg("Restaurants"), cat: "restaurant" },
  cafe: { emoji: "☕", label: msg("Cafés"), cat: "cafe" },
  sweets: { emoji: "🍰", label: msg("Bakeries & sweets"), cat: "bakery" },
  market: { emoji: "🛒", label: msg("Supermarkets & shops"), cat: "grocery" },
};
export const VENDOR_KIND_KEYS = Object.keys(VENDOR_KINDS) as VendorKind[];
export function vendorKind(type: string): VendorKind {
  const t = type.toUpperCase();
  if (t === "CAFFE" || t === "CAFE") return "cafe";
  if (t === "CONFECTIONERY" || t === "BAKERY" || t === "ICE_CREAM" || t === "JUICE") return "sweets";
  if (t === "RESTAURANT" || t === "") return "food";
  return "market";
}

/** Places (and Market shop categories) whose catalog is a menu rather than products on Torob. */
const FOOD: string[] = ["burger", "pizza", "restaurant", "cafe", "bakery", "icecream", "bar", "food"] satisfies (PlaceCat | "food")[];
export const isFoodCat = (cat: string) => FOOD.includes(cat);

/** Rial (what Snappfood quotes) → toman (what the game and Torob show). */
export const rialToToman = (rial: number) => Math.round(rial / 10);

// ---------------------------------------------------------------- owner links
const SNAPP_CODE = /^[0-9a-z]{6}$/;
/** A Snappfood vendor code from what an owner pasted: the menu link, or the 6-letter code itself. */
export function snappfoodCode(v: string): string | null {
  const s = v.trim();
  if (SNAPP_CODE.test(s)) return s;
  const m = /snappfood\.ir\/.*?\/menu\/([0-9a-z]{6})(?:[/?#]|$)/i.exec(s) ?? /snappfood\.ir\/.*?[/-]([0-9a-z]{6})(?:[/?#]|$)/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}
/** Only real links to the site in question are kept (an owner can't point players elsewhere). */
const onHost = (v: string, host: string) => {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && (u.hostname === host || u.hostname.endsWith(`.${host}`)) ? u.toString() : null;
  } catch {
    return null;
  }
};
export const torobLink = (v: string) => onHost(v, "torob.com");
export const divarLink = (v: string) => onHost(v, "divar.ir");
/** Empty, or a link the store card can use: the field validators for owner forms. */
export const LINK_CHECKS = {
  snappfood: (v: string) => !v.trim() || !!snappfoodCode(v),
  torob: (v: string) => !v.trim() || !!torobLink(v),
  divar: (v: string) => !v.trim() || !!divarLink(v),
};

// ---------------------------------------------------------------- name matching
/** Words that say what a place is rather than which one ("Restaurant", "Café", "branch"). */
const FILLER = new Set(
  "رستوران کافه کافی شاپ فست فود فستفود پیتزا پیتزای برگر شیرینی سرای فروشگاه سوپرمارکت سوپر مارکت هایپر شعبه نان قنادی کترینگ تهیه غذای غذا کالا مارکت شاپ گالری مرکز فروشگاهی و restaurant cafe café coffee shop fast food pizza burger bakery market supermarket store the branch".split(" "),
);
/** Persian/Arabic letter variants, digits and punctuation folded so names compare. */
export function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ً-ْ‌‏‎]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
const words = (s: string) => normName(s).split(" ").filter((w) => w.length > 1 && !FILLER.has(w));
/** 0…1: how much two store names share once the "Restaurant"/"Café" words are gone. */
export function nameScore(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return 0;
  const ys = new Set(y);
  const common = x.filter((w) => ys.has(w) || y.some((v) => v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v)))).length;
  return common / Math.min(x.length, y.length);
}
