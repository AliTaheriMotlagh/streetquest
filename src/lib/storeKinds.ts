// What a storefront in the 3D city looks like, by what it sells (pure; tests/storeKinds.test.ts).
// The sources name stores in different vocabularies — OpenStreetMap classes, our place
// categories (PlaceCat), Snappfood vendor types, and the shop's own Persian name — so
// `storeKind` folds all of them into ~12 visual kinds, and STORE_LOOK says how each is dressed:
// awning colours, window glow, the few cheap props, and what moves (steam, neon, a cross).
import { dayClock, openState, type Week } from "./localData";
import type { PlaceCat } from "./places";

export const STORE_KINDS = ["restaurant", "fastfood", "cafe", "bakery", "sweets", "market", "produce", "butcher", "pharmacy", "fashion", "tech", "general"] as const;
export type StoreKind = (typeof STORE_KINDS)[number];
export type Prop = "crates" | "menu" | "neon" | "cross" | "steam" | "rack" | "screen";

export type StoreLook = {
  emoji: string;
  /** Awning stripe colour (the other stripe is white-ish) and the sign's two background colours. */
  awning: string;
  sign: [string, string];
  /** Light through the display window (warm for food, cold for tech, green for the chemist). */
  glow: string;
  props: Prop[];
  /** The place category the store lookup is asked with. */
  cat: PlaceCat;
};

export const STORE_LOOK: Record<StoreKind, StoreLook> = {
  restaurant: { emoji: "🍽️", awning: "#b3261e", sign: ["#7a1a14", "#3d0b08"], glow: "#ffb45c", props: ["menu", "steam"], cat: "restaurant" },
  fastfood: { emoji: "🍔", awning: "#e8a200", sign: ["#c0392b", "#7b1d14"], glow: "#ffd05a", props: ["menu", "steam"], cat: "burger" },
  cafe: { emoji: "☕", awning: "#6b4a2f", sign: ["#3b2a1c", "#1d130b"], glow: "#ffc98a", props: ["neon", "menu"], cat: "cafe" },
  bakery: { emoji: "🥖", awning: "#c98a3a", sign: ["#8a5a22", "#4b300f"], glow: "#ffd9a0", props: ["steam", "crates"], cat: "bakery" },
  sweets: { emoji: "🍰", awning: "#d6598c", sign: ["#a83279", "#5e1a43"], glow: "#ffc4de", props: ["neon"], cat: "bakery" },
  market: { emoji: "🛒", awning: "#2e9e44", sign: ["#1f7a34", "#0f4219"], glow: "#eaffd0", props: ["crates"], cat: "grocery" },
  produce: { emoji: "🍎", awning: "#4caf50", sign: ["#2d8a3a", "#17491e"], glow: "#fff1b8", props: ["crates"], cat: "grocery" },
  butcher: { emoji: "🥩", awning: "#a61e1e", sign: ["#8b1a1a", "#470d0d"], glow: "#ffd0c0", props: [], cat: "grocery" },
  pharmacy: { emoji: "⚕️", awning: "#1e9e6a", sign: ["#14804f", "#0a4429"], glow: "#d8fff0", props: ["cross"], cat: "pharmacy" },
  fashion: { emoji: "👗", awning: "#7d3c98", sign: ["#232323", "#0c0c0c"], glow: "#ffe6f2", props: ["rack"], cat: "fashion" },
  tech: { emoji: "📱", awning: "#2c6fbb", sign: ["#16202e", "#070b11"], glow: "#8fd8ff", props: ["screen"], cat: "tech" },
  general: { emoji: "🏪", awning: "#5f6b78", sign: ["#3d4b59", "#222b33"], glow: "#fff0cf", props: [], cat: "shop" },
};

/** Persian / English words in a store's own name that say what it is (they sharpen a vague class). */
const NAME_HINTS: [RegExp, StoreKind][] = [
  [/داروخانه|pharm/i, "pharmacy"],
  [/نانوایی|بیکری|bakery|boulang/i, "bakery"],
  [/شیرینی|قنادی|آجیل|بستنی|شکلات|sweet|candy|ice ?cream|dessert/i, "sweets"],
  [/قصابی|گوشت|مرغ|ماهی|پروتئین|butcher|meat/i, "butcher"],
  [/میوه|سبزی|تره ?بار|صیفی|fruit|veg/i, "produce"],
  [/سوپر|هایپر|بقالی|مارکت|اتکا|رفاه|شهروند|market|grocery/i, "market"],
  [/کافه|کافی|قهوه|coffee|cafe|café/i, "cafe"],
  [/فست ?فود|برگر|پیتزا|ساندویچ|ساندویج|سیب ?زمینی|burger|pizza|sandwich|fast ?food|kfc|hotdog/i, "fastfood"],
  [/رستوران|چلو|کبابی|سرای|restaurant|grill|kitchen/i, "restaurant"],
  [/پوشاک|لباس|کفش|مانتو|بوتیک|پارچه|زیورآلات|طلا|جواهر|کیف|fashion|boutique|shoes|cloth/i, "fashion"],
  [/موبایل|لوازم خانگی|کامپیوتر|لپ ?تاپ|دیجیتال|الکترونیک|ارتباطات|mobile|phone|digital|electronic|computer/i, "tech"],
];

/** Classes from OpenStreetMap, our PlaceCat, and Snappfood vendor kinds → a kind. */
const CLASS_KIND: [RegExp, StoreKind][] = [
  [/^(pharmacy|chemist|medical_supply|optician|clinic|doctors|dentist|hospital)$/, "pharmacy"],
  [/^(fast_food|burger|pizza|food_court|kebab)$/, "fastfood"],
  [/^(restaurant|bar|pub|food|deli)$/, "restaurant"],
  [/^(cafe|coffee|caffe)$/, "cafe"],
  [/^(bakery)$/, "bakery"],
  [/^(confectionery|pastry|ice_cream|icecream|juice|chocolate|sweets|nuts)$/, "sweets"],
  [/^(butcher|seafood)$/, "butcher"],
  [/^(greengrocer|fruit|vegetable|farm)$/, "produce"],
  [/^(supermarket|convenience|grocery|general|kiosk|dairy|beverages|market|mall|department_store)$/, "market"],
  [/^(clothes|clothing_store|shoes|boutique|jewelry|bag|fabric|tailor|fashion|watches)$/, "fashion"],
  [/^(mobile_phone|electronics|computer|telecommunication|hifi|appliance|tech)$/, "tech"],
];

/** The visual kind of a store from its class (any of the vocabularies) and/or its name. A specific class beats the name; the name sharpens a vague one. */
export function storeKind(cls = "", name = ""): StoreKind {
  const c = cls.toLowerCase();
  const byClass = CLASS_KIND.find(([re]) => re.test(c))?.[1];
  // "restaurant" / "grocery" / unknown are vague: a name like "Pizza Roma" or "نانوایی سنگکی" says more.
  const vague = !byClass || byClass === "restaurant" || byClass === "market";
  if (!vague) return byClass;
  const byName = NAME_HINTS.find(([re]) => re.test(name))?.[1];
  return byName ?? byClass ?? "general";
}

/** Typical opening hours when the real ones aren't known (minutes after midnight; ends past 1440 run into the next day). */
const HOURS: Record<StoreKind, [number, number]> = {
  restaurant: [660, 1410], fastfood: [660, 1500], cafe: [540, 1410], bakery: [360, 1260], sweets: [540, 1320], market: [480, 1380],
  produce: [480, 1320], butcher: [420, 1200], pharmacy: [480, 1320], fashion: [600, 1290], tech: [600, 1260], general: [540, 1260],
};
const FRIDAY_SHUT = new Set<StoreKind>(["butcher", "fashion", "tech", "general", "produce"]);
/** A week (Saturday first) of the kind's typical hours. */
export function defaultWeek(kind: StoreKind): Week {
  const h = HOURS[kind];
  return Array.from({ length: 7 }, (_, d) => (d === 6 && FRIDAY_SHUT.has(kind) ? [] : [[h[0], h[1]] as [number, number]]));
}

/** Open right now: by the store's real week when it has one, else the kind's typical hours. */
export function storeOpen(kind: StoreKind, week: Week | null | undefined, at: Date, zone = "Asia/Tehran"): boolean {
  return openState(week ?? defaultWeek(kind), at, zone).open;
}

/** Minutes after midnight in Tehran. */
export const tehranMinutes = (at: Date) => dayClock(at, "Asia/Tehran").min;

/** How much detail a sign gets at this distance: only the near ones carry text; far ones are a coloured bar. */
export const SIGN_TEXT_M = 80;
export const signDetail = (d: number): "text" | "bar" | "none" => (d <= SIGN_TEXT_M ? "text" : d <= 170 ? "bar" : "none");

/** The most storefronts at once, by quality tier ("lite" is the phone budget): signs, dressed fronts (awning, window, props), steam puffs. */
export function storefrontCap(tier: "lite" | "low" | "medium" | "high" | "ultra"): { signs: number; dressed: number; steam: number } {
  if (tier === "lite") return { signs: 24, dressed: 8, steam: 0 };
  if (tier === "low") return { signs: 36, dressed: 12, steam: 4 };
  if (tier === "medium") return { signs: 56, dressed: 24, steam: 8 };
  return { signs: 64, dressed: 40, steam: 14 };
}

/** The first few priced menu lines (one from each section in turn), for the in-world panel. */
export function menuHighlights(sections: { items: { title: string; price: number; priceNow: number }[] }[], n = 3): { title: string; price: number }[] {
  const out: { title: string; price: number }[] = [];
  for (let i = 0; out.length < n && i < 8; i++)
    for (const s of sections) {
      const it = s.items[i];
      if (it && (it.priceNow || it.price) > 0 && out.length < n) out.push({ title: it.title, price: it.priceNow || it.price });
    }
  return out;
}

/** Neon level for a store (seeded by its slot) at time t: steady, with the odd stutter. */
export function neonFlicker(seed: number, t: number): number {
  const k = Math.sin(t * 1.3 + seed * 7.1) * Math.sin(t * 9.7 + seed * 3.3);
  return k > 0.93 ? 0.35 : 1;
}
